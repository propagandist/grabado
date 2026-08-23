package dev.grabado.ai

import dev.grabado.config.GrabadoProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import tools.jackson.databind.JsonNode

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
 * サイズ検査 -> ハッシュ -> キャッシュ引き -> （miss なら）形の検査 -> レート制限 -> 上流
 * ```
 *
 * - **サイズが先** —— 拒むための計算をいちばん安く済ませる
 * - **キャッシュが形の検査より先** —— 一度通った入力は同じバイト列なら必ず通る。
 *   壊れた入力は上流まで行かないのでキャッシュに入らず、次も同じ 400 になる
 * - **キャッシュに当たったらレート制限を消費しない** —— 費用が発生しない呼び出しを
 *   費用の上限で止める理由が無い（[RateLimiter]）
 *
 * @param source 提案を作る側。**実装が 1 つも無ければ null**（11-2a では main に実装が無い ——
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
     * 設計を見て提案を返す。
     *
     * @param body 送られてきた生バイト（`aiRequestVersion: 1`）
     * @throws AiUnavailableException キー / モデル / 実装のどれかが無い（HTTP 403）
     * @throws AiBadRequestException 入力が壊れている・大きすぎる（HTTP 400）
     * @throws AiRateLimitedException 自分の上限に当たった（HTTP 429）
     * @throws AiUpstreamException 上流の失敗・タイムアウト（HTTP 503）
     */
    fun review(body: ByteArray): List<JsonNode> {
        val upstream = source ?: throw AiUnavailableException()
        if (!properties.ai.hasCredentials()) {
            throw AiUnavailableException()
        }

        AiRequestCheck.checkSize(body, properties.ai)
        val key = SuggestionCache.keyOf(body)
        cache.get(key)?.let { return it }

        val request = AiRequestCheck.parse(body, properties.ai)
        val suggestions = limiter.withPermit { upstream.review(request) }
        cache.put(key, suggestions)
        return suggestions
    }
}

/**
 * AI が使えないデプロイで求められた。HTTP **403**。
 *
 * READONLY / キー未設定 / モデル名未設定 / 実装が無い を**外から区別させない**。
 * どれも「このデプロイでは禁止されている」で、5-3 と同じく「壊れている」と混ぜない。
 */
class AiUnavailableException : RuntimeException("このデプロイでは AI が使えない")

/**
 * 入力が壊れている・大きすぎる。HTTP **400**。
 *
 * ★ **message を body に出さない**（`ApiExceptionHandler`）。入力の断片や上流の事情が
 * 載りうる（org security-baseline §4.5）。message は開発者がログで読むためのもの。
 * 413 ではなく 400 なのは `js/io.ts` の `check()` が 413 を持たないため（5-1c で足した 400 に寄せる）。
 */
class AiBadRequestException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

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
