package io.propagandist.grabado.ai

import io.propagandist.grabado.config.AiProperties
import io.propagandist.grabado.config.GrabadoProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.nio.file.Path
import java.time.Duration

/**
 * **実際に上流を叩く opt-in の統合テスト**（段階11-2b）。
 *
 * `ANTHROPIC_API_KEY` と `GRABADO_IT_AI_MODEL` が両方そろっていなければ丸ごと skip する
 * （`./gradlew test` の既定では走らない）。`PostgresCatalogIntegrationTest` と同じ形で、
 * `GRABADO_IT_*` の命名も揃えてある。
 *
 * ## なぜ opt-in なのか、なぜ必要なのか
 *
 * **実キーと課金が要る。** CI で回すと PR ごとに費用が出る（§11 は API 費用が自社負担）。
 * 一方これが 1 本も無いと、[ReviewSchema] は「Claude はこのスキーマを受け付けるはずだ」という
 * **我々の信念を符号化したもの**でしかない —— 信念が間違っていれば全部緑のまま本番が 400 になる
 * （`PostgresCatalogIntegrationTest` が書いている構図と同じ）。
 *
 * ## 走らせ方
 *
 * ```bash
 * set -a; . ./.env; set +a
 * GRABADO_IT_AI_MODEL=claude-opus-5 server/gradlew -p server test \
 *   --tests '*AnthropicIntegrationTest*' --info | grep 'ai review:'
 * ```
 *
 * 使った量（`ai review: input=… cacheRead=…`）は [AnthropicSuggestionSource] が INFO で出す。
 * **費用の実測はそこから採る**（`CUSTOMIZATIONS.md` の段階11-2b の台帳）。
 */
class AnthropicIntegrationTest {

    private val mapper = JsonMapper()

    @Test
    fun `house 既定から外れた設計に、実際の指摘が返る`() {
        val source = enabledOrSkip()

        val suggestions = source.review(design())

        report(suggestions)
        assertThat(suggestions).describedAs("指摘が 1 件も無いのは、この設計では考えにくい").isNotEmpty()
        for (one in suggestions) {
            assertThat(ReviewSchema.CATEGORIES).contains(one.path("category").asString())
            assertThat(ReviewSchema.SEVERITIES).contains(one.path("severity").asString())
            assertThat(one.path("target").path("table").asString("")).isNotBlank()
            assertThat(one.path("rationale").asString("")).isNotBlank()
            if (one.has("patch")) {
                assertThat(ReviewSchema.OPS)
                    .describedAs("スキーマが op を閉じているので、列挙の外は出てこない")
                    .contains(one.path("patch").path("op").asString())
            }
        }
    }

    @Test
    fun `同じ設計を 2 回送る（prompt caching の効きはログの cacheRead で見る）`() {
        val source = enabledOrSkip()

        val first = source.review(design())
        val second = source.review(design())

        /*
         * 出力そのものは非決定なので一致を要求しない —— 見るのは「2 回とも形が保たれること」。
         * キャッシュが効いたかは INFO ログ（cacheWrite / cacheRead）で読む。
         */
        assertThat(first).isNotEmpty()
        assertThat(second).isNotEmpty()
    }

    @Test
    fun `対応 DB 以外の dialect でも通る（プロファイル名の写しを backend に持たせない）`() {
        val source = enabledOrSkip()

        val suggestions = source.review(mapper.readTree(SQLITE_DESIGN))

        /* DB 非依存の指摘に絞られるだけで、落ちはしない */
        assertThat(suggestions).isNotNull()
    }

    /**
     * 返ってきた提案を人が読める形で出す（`--info` で見える）。
     *
     * **アサーションは形しか見られない。** 中身が製品として意味のある指摘かどうかは
     * 人が読むしかないので、走らせた人が目で確かめられるようにしておく。
     */
    private fun report(suggestions: List<JsonNode>) {
        println("=== 提案 ${suggestions.size} 件 ===")
        for (one in suggestions) {
            val target = one.path("target")
            val column = target.path("column").asString("")
            val patch = if (one.has("patch")) one.path("patch").path("op").asString() else "-"
            println(
                "[${one.path("severity").asString()}] ${one.path("category").asString()} " +
                    "${target.path("table").asString()}${if (column.isEmpty()) "" else ".$column"} patch=$patch",
            )
            println("    ${one.path("rationale").asString()}")
        }
    }

    private fun enabledOrSkip(): AnthropicSuggestionSource {
        val key = System.getenv("ANTHROPIC_API_KEY").orEmpty()
        val model = System.getenv("GRABADO_IT_AI_MODEL").orEmpty()
        assumeTrue(key.isNotBlank() && model.isNotBlank(), "ANTHROPIC_API_KEY と GRABADO_IT_AI_MODEL が要る")

        return AnthropicSuggestionSource(
            GrabadoProperties(
                schemaDir = Path.of("."),
                ai = AiProperties(
                    apiKey = key,
                    model = model,
                    effort = System.getenv("GRABADO_IT_AI_EFFORT").orEmpty(),
                    timeout = Duration.ofSeconds(180),
                ),
            ),
        )
    }

    private fun design(): JsonNode = mapper.readTree(POSTGRES_DESIGN)

    private companion object {
        /**
         * **house 既定から外れた PostgreSQL の設計**（§6.2 / §6.3）。
         *
         * 単数形のテーブル名・INTEGER の主キー・監査列の欠落・`MONEY` と `JSON`・
         * 主キーの無いテーブル・宣言の無い外部キー・`VARCHAR(50)` を入れてある。
         */
        val POSTGRES_DESIGN = """
            {
              "aiRequestVersion": 1,
              "dialect": "postgresql",
              "tables": [
                {
                  "name": "employee",
                  "comment": "従業員",
                  "columns": [
                    { "name": "id", "sqlType": "INTEGER", "nullable": false, "default": "" },
                    { "name": "name", "sqlType": "VARCHAR", "size": "50", "nullable": false, "default": "" },
                    { "name": "salary", "sqlType": "MONEY", "nullable": true, "default": "" },
                    { "name": "team_id", "sqlType": "INTEGER", "nullable": true, "default": "" }
                  ],
                  "keys": [{ "type": "PRIMARY", "name": "employee_pkey", "columns": ["id"] }]
                },
                {
                  "name": "team",
                  "columns": [
                    { "name": "id", "sqlType": "INTEGER", "nullable": false, "default": "" },
                    { "name": "name", "sqlType": "TEXT", "nullable": false, "default": "" },
                    { "name": "meta", "sqlType": "JSON", "nullable": true, "default": "" }
                  ],
                  "keys": []
                }
              ]
            }
        """.trimIndent()

        /** 自社標準を当てない側（DB 非依存の指摘に絞られる）。 */
        val SQLITE_DESIGN = """
            {
              "aiRequestVersion": 1,
              "dialect": "sqlite",
              "tables": [
                {
                  "name": "note",
                  "columns": [
                    { "name": "noteId", "sqlType": "INTEGER", "nullable": false, "default": "" },
                    { "name": "body", "sqlType": "TEXT", "nullable": true, "default": "" }
                  ],
                  "keys": []
                }
              ]
            }
        """.trimIndent()
    }
}
