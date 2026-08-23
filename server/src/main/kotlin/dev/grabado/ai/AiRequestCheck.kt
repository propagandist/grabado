package dev.grabado.ai

import dev.grabado.config.AiProperties
import tools.jackson.core.JacksonException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/**
 * 送られてきたバイト列が `aiRequestVersion: 1` として読めるかを見る（段階11-2a）。
 *
 * 形の正は `docs/ARCHITECTURE.md` §8.2。**設計 JSON でも introspection JSON でもない 3 つ目の
 * 形式**で、座標を持たず、型は id ではなく解決済みの SQL 名。
 *
 * ## data class に写さない
 *
 * 受けるのは [JsonNode] のままで、DTO を作らない。理由は 2 つ:
 *
 * 1. **backend はこの JSON を解釈しない。** 11-2b が上流へ渡すだけで、意味を読むのは
 *    LLM とフロント。型に写すと `aiRequestVersion: 1` の形が Kotlin とフロント（11-3 の
 *    構築器）の 2 か所に生まれる
 * 2. **写すと依存が 1 つ増える。** Kotlin の data class へデシリアライズするには
 *    `jackson-module-kotlin` が要る（`build.gradle.kts` が「要る日に足す」と予約している）——
 *    形の検査に必要なのは版とテーブル数だけなので、そのために依存を足さない
 *
 * ## dialect を 8 本に限定しない
 *
 * 非空の文字列であることだけを見る。プロファイル名の一覧を backend に持たせると
 * `db/<db>/` の写しが Kotlin 側にできる（5-0 の決めたこと 3 と同じ理屈）。ルーブリックの
 * 選択は 11-2b が行い、**知らない dialect は「DB 非依存の指摘」に落ちる**
 * （段階11-0 の決めたこと 4。`postgresql` だけが house 規約のフル判定）。
 */
object AiRequestCheck {

    /** 受け付ける唯一の版（`docs/ARCHITECTURE.md` §8.2）。 */
    const val VERSION: Int = 1

    private val mapper = JsonMapper()

    /**
     * バイト数の上限だけを先に見る（段階11-2a）。
     *
     * **パースの前に呼ぶ。** 巨大な body をパースしてから落とすと、拒むための計算が
     * いちばん高くつく。ハッシュを取る前でもあるので、キャッシュも汚さない。
     *
     * @throws AiBadRequestException 上限超（HTTP 400。`check()` は 413 を持たない）
     */
    fun checkSize(body: ByteArray, limits: AiProperties) {
        if (body.size > limits.maxRequestBytes) {
            throw AiBadRequestException("リクエストが大きすぎる（${body.size} > ${limits.maxRequestBytes}）")
        }
    }

    /**
     * 形を確かめて [JsonNode] にする。
     *
     * 見るのは 4 つだけ —— **JSON として読めるか / 版が [VERSION] か / `dialect` があるか /
     * `tables` が配列で件数が上限内か**。中身（列・キー・参照）には触らない。
     *
     * @throws AiBadRequestException どれかを満たさない（HTTP 400）
     */
    fun parse(body: ByteArray, limits: AiProperties): JsonNode {
        val root = try {
            mapper.readTree(body)
        } catch (e: JacksonException) {
            /* ★ 例外の中身を外に出さない。message には入力の断片が入る（org security-baseline §4.5） */
            throw AiBadRequestException("JSON として読めない", e)
        }

        if (!root.isObject) {
            throw AiBadRequestException("ルートがオブジェクトではない")
        }
        val version = root.path("aiRequestVersion")
        if (!version.isNumber || version.asInt() != VERSION) {
            throw AiBadRequestException("aiRequestVersion が $VERSION ではない")
        }
        if (root.path("dialect").asString("").isBlank()) {
            throw AiBadRequestException("dialect が無い")
        }

        val tables = root.path("tables")
        if (!tables.isArray) {
            throw AiBadRequestException("tables が配列ではない")
        }
        if (tables.size() > limits.maxTables) {
            throw AiBadRequestException("テーブルが多すぎる（${tables.size()} > ${limits.maxTables}）")
        }
        return root
    }
}
