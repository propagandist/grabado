package io.propagandist.grabado.ai

import io.propagandist.grabado.config.GrabadoProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import tools.jackson.databind.JsonNode
import java.io.InputStream

/**
 * AI レビューの入口（段階11-2a）。契約は `docs/ARCHITECTURE.md` §8。
 *
 * ★ **`grabado.readonly=true` のときは Bean ごと存在しない**（`@ConditionalOnProperty`）。
 *   5-3 の `ReadOnlyDesignStore` と 5-7a の `IntrospectionService` に続く 3 つ目で、
 *   **禁止を「禁止したいものの直上」に置く**方針。`AiController` は Bean が無ければ 403 を返す。
 *   副産物として **HTTP なしでテストが書ける**のも同じ。
 *
 * ## 順序に意味がある
 *
 * ```
 * 使えるか -> 読む（上限 + 1 バイトまで）-> サイズ検査 -> ハッシュ -> キャッシュ引き
 *   -> （miss なら）形の検査 -> レート制限 -> 上流
 * ```
 *
 * - **使えるかが先** —— キー・モデル名・実装の有無だけで決まり、body を 1 バイトも要らない。
 *   先に読むと、**AI を使っていないコンテナにも巨大な body がヒープに載る**（#273）
 * - **読むのは上限 + 1 バイトまで** —— それだけ読めば「超えたか」は決まる。全部読んでから
 *   測ると、上限はメモリを守らない（save の `DesignController` と同じ。#215）
 * - **サイズが先** —— 拒むための計算をいちばん安く済ませる
 * - **キャッシュが形の検査より先** —— 一度通った入力は同じバイト列なら必ず通る。
 *   壊れた入力は上流まで行かないのでキャッシュに入らず、次も同じ 400 になる
 * - **キャッシュに当たったらレート制限を消費しない** —— 費用が発生しない呼び出しを
 *   費用の上限で止める理由が無い（[RateLimiter]）
 *
 * @param source 提案を作る側。**実装が 1 つも無ければ null**（11-2b で
 *   [AnthropicSuggestionSource] が入るまでは main に実装が無く、常にそうだった ——
 *   [SuggestionSource] の KDoc）。null なら「使えない」に倒れて 403 になる
 */
@Service
@ConditionalOnProperty(name = ["grabado.readonly"], havingValue = "false", matchIfMissing = true)
class AiReviewService(
    private val properties: GrabadoProperties,
    private val source: SuggestionSource? = null,
) {

    private val cache = SuggestionCache(properties.ai.cacheEntries, properties.ai.cacheTtl)
    private val limiter = RateLimiter(properties.ai.ratePerMinute, properties.ai.maxConcurrent)

    /**
     * 実際に使えるか（`capabilities` が読む）。
     *
     * **キー設定済み ∧ モデル設定済み ∧ 実装がある**。READONLY のときはこの Bean 自体が
     * 無いので、そちらでも false になる。**実装があっても使えないなら false**（5-7a）。
     */
    fun isConfigured(): Boolean = source != null && properties.ai.hasCredentials()

    /**
     * HTTP の入口（#273）。**使えるかを見てから読み、読むのは上限 + 1 バイトまで**（クラス KDoc の順序）。
     *
     * **Content-Length は見ない** —— chunked 転送では付かないので、付いていないときに抜ける
     * 判定になる。実際に読んだ量で決めれば経路によらない（`DesignController` と同じ）。
     *
     * @param input リクエストの body。**閉じるのは呼び手**
     * @throws AiUnavailableException キー / モデル / 実装のどれかが無い（HTTP 403）。**1 バイトも読まない**
     * @see review 読んだあとの検査と例外
     */
    fun review(input: InputStream): List<JsonNode> {
        available()
        return review(input.readNBytes(properties.ai.maxRequestBytes + 1))
    }

    /**
     * 設計を見て提案を返す。
     *
     * @param body 送られてきた生バイト（`aiRequestVersion: 1`）
     * @throws AiUnavailableException キー / モデル / 実装のどれかが無い（HTTP 403）
     * @throws AiTooLargeException body のバイト数が上限を超えた（HTTP 413）
     * @throws AiBadRequestException 入力が壊れている・テーブル数が上限を超えた（HTTP 400）
     * @throws AiRateLimitedException 自分の上限に当たった（HTTP 429）
     * @throws AiUpstreamException 上流の失敗・タイムアウト（HTTP 503）
     */
    fun review(body: ByteArray): List<JsonNode> {
        val upstream = available()

        AiRequestCheck.checkSize(body, properties.ai)
        val key = SuggestionCache.keyOf(body)
        cache.get(key)?.let { return it }

        val request = AiRequestCheck.parse(body, properties.ai)
        val suggestions = limiter.withPermit { upstream.review(request) }
        cache.put(key, suggestions)
        return suggestions
    }

    /** 使えるなら上流を返し、使えなければ 403 相当で落とす。**body を見ない**（[isConfigured] と同じ判定）。 */
    private fun available(): SuggestionSource =
        source?.takeIf { properties.ai.hasCredentials() } ?: throw AiUnavailableException()
}

/**
 * AI が使えないデプロイで求められた。HTTP **403**。
 *
 * READONLY / キー未設定 / モデル名未設定 / 実装が無い を**外から区別させない**。
 * どれも「このデプロイでは禁止されている」で、5-3 と同じく「壊れている」と混ぜない。
 */
class AiUnavailableException : RuntimeException("このデプロイでは AI が使えない")

/**
 * 入力が壊れている・テーブル数が上限を超えた。HTTP **400**。
 *
 * ★ **message を body に出さない**（`ApiExceptionHandler`）。入力の断片や上流の事情が
 * 載りうる（org security-baseline §4.5）。message は開発者がログで読むためのもの。
 *
 * ★ **テーブル数の超過は 413 にしない**（#250）。`maxTables` は「大きすぎる」ではなく
 * 「分割して送るべき」上限で、body が数十バイトでも落ちる —— Content Too Large と呼ぶと
 * 嘘になる。バイト数の超過は [AiTooLargeException]。
 */
class AiBadRequestException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

/**
 * body のバイト数が上限（`grabado.ai.max-request-bytes`）を超えた。HTTP **413**（#250）。
 *
 * save の上限（`DesignTooLargeException`、#215）と**同じ status に揃える** —— 前段に
 * プロキシを置くと、プロキシの上限を超える body は**アプリを通らずに 413 で返る**。
 * アプリが 400 を返すと、同じ「大きすぎる」がどこで切られたかで 400 と 413 に割れる。
 *
 * 11-2a が 400 に寄せていたのは「`js/io.ts` の `check()` が 413 を持たないから」で、
 * **その理由は #215 で消えた**（`check()` と 21 locale の `http413` が入った）。
 */
class AiTooLargeException(message: String) : RuntimeException(message)

/**
 * 自分のレート制限に当たった。HTTP **429**。
 *
 * **503 に倒さない** —— 待てば通るものを故障に見せない（5-3 と同じ理由）。
 * 上流の 429 も 11-2b でここに写す。
 */
class AiRateLimitedException(message: String) : RuntimeException(message)

/**
 * 上流の失敗・タイムアウト。HTTP **503**。
 *
 * `IntrospectionFailedException` と同じ扱いで、**例外の中身を body に出さない** ——
 * API キーやリクエスト内容が上流のエラーに載りうる。
 */
class AiUpstreamException(cause: Throwable) : RuntimeException("上流の AI 呼び出しに失敗した", cause)
