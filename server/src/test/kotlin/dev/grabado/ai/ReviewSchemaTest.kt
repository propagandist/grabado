package dev.grabado.ai

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.nio.file.Files
import java.nio.file.Path

/**
 * structured outputs のスキーマが**フロントの型と同じ語彙**であることを見る（段階11-2b）。
 *
 * ★ **ここが赤くなる形にしておかないと、片方だけ動かせてしまう。** スキーマの `op` と
 *   `js/io/ai/suggestion.ts` の `AiPatch` がずれると「**上流は通すが `applyPatch` が
 *   `patchmalformed` で落とす提案**」が生まれ、しかもテストは全部緑のまま。
 *   `type-mapping.test.ts` が `docs/TYPE-MAPPING.md` を実装と 1 セルずつ突き合わせているのと
 *   同じイディオムで、**手で書いた 2 つ目の写しは必ず腐る**という前提に立っている。
 *
 * もう 1 つ見るのが**スキーマ自身の制約**（`docs/ARCHITECTURE.md` §8.3 / 段階11-0 の決めたこと 1）。
 * Claude の JSON Schema サブセットは全オブジェクトに `additionalProperties: false` を要求し、
 * 数値・文字列長の制約を受け付けない。**違反は上流に投げるまで分からない**ので、ここで見る。
 */
class ReviewSchemaTest {

    private val mapper = JsonMapper()
    private val schema: JsonNode = mapper.readTree(ReviewSchema.JSON)

    /** `js/io/ai/suggestion.ts` の中身（型だけのファイルなので、正規表現で語を抜ける）。 */
    private val suggestionTs: String by lazy {
        val repoRoot = Path.of(
            System.getProperty("grabado.repoRoot")
                ?: error("grabado.repoRoot が未設定（build.gradle.kts の test タスクを見ること）"),
        )
        Files.readString(repoRoot.resolve("js").resolve("io").resolve("ai").resolve("suggestion.ts"))
    }

    /** `export type <name> = "a" | "b" | ...;` から語を抜く。 */
    private fun unionOf(typeName: String): List<String> {
        val body = Regex("export type $typeName =(.*?);", RegexOption.DOT_MATCHES_ALL)
            .find(suggestionTs)
            ?.groupValues
            ?.get(1)
            ?: error("$typeName が js/io/ai/suggestion.ts に無い")
        return Regex("\"([^\"]+)\"").findAll(body).map { it.groupValues[1] }.toList()
    }

    @Test
    fun `category の 7 語がフロントと一致する`() {
        assertThat(ReviewSchema.CATEGORIES).isEqualTo(unionOf("AiCategory"))
    }

    @Test
    fun `severity の 3 語がフロントと一致する`() {
        assertThat(ReviewSchema.SEVERITIES).isEqualTo(unionOf("AiSeverity"))
    }

    @Test
    fun `keyType の 4 語がフロントと一致する`() {
        assertThat(ReviewSchema.KEY_TYPES).isEqualTo(unionOf("AiKeyType"))
    }

    @Test
    fun `op の 8 語がフロントと一致する`() {
        /* AiPatch の各枝は `readonly op: "rename-table";` の形 */
        val ops = Regex("""readonly op: "([^"]+)"""").findAll(suggestionTs)
            .map { it.groupValues[1] }
            .toList()

        assertThat(ops).describedAs("js/io/ai/suggestion.ts の AiPatch").hasSize(8)
        assertThat(ReviewSchema.OPS).isEqualTo(ops)
    }

    @Test
    fun `破壊的な op がスキーマに存在しない（形式で潰していることの実測）`() {
        assertThat(ReviewSchema.JSON).doesNotContain("drop-table")
        assertThat(ReviewSchema.JSON).doesNotContain("drop-column")
    }

    /* ------------------------- スキーマ自身の制約 ------------------ */

    @Test
    fun `スキーマは JSON として読める`() {
        assertThat(schema.isObject).isTrue()
        assertThat(schema.path("properties").path(ReviewSchema.ROOT_PROPERTY).path("type").asString())
            .isEqualTo("array")
    }

    @Test
    fun `すべてのオブジェクトが additionalProperties false を持つ`() {
        val missing = mutableListOf<String>()
        walk(schema, "#") { node, path ->
            if (node.path("type").asString("") == "object" &&
                node.path("additionalProperties").asBoolean(true)
            ) {
                missing.add(path)
            }
        }

        assertThat(missing).describedAs("Claude の JSON Schema は全オブジェクトに要求する").isEmpty()
    }

    @Test
    fun `使えない制約を書いていない`() {
        val forbidden = listOf("minimum", "maximum", "multipleOf", "minLength", "maxLength", "minItems")
        val found = mutableListOf<String>()
        walk(schema, "#") { node, path ->
            for (key in forbidden) {
                if (node.has(key)) {
                    found.add("$path.$key")
                }
            }
        }

        /* 件数の上限はスキーマではなくサーバ側で切る（AiProperties） */
        assertThat(found).isEmpty()
    }

    @Test
    fun `再帰していない（refs を 1 つも使っていない）`() {
        assertThat(ReviewSchema.JSON).doesNotContain("\$ref")
    }

    @Test
    fun `patch の 8 枝が op の const で判別できる`() {
        val branches = schema
            .path("properties").path(ReviewSchema.ROOT_PROPERTY)
            .path("items").path("properties").path("patch").path("anyOf")
        val consts = buildList {
            for (branch in branches) {
                add(branch.path("properties").path("op").path("const").asString(""))
            }
        }

        assertThat(consts).isEqualTo(ReviewSchema.OPS)
    }

    @Test
    fun `SDK に渡す形に変換できる`() {
        assertThat(ReviewSchema.asJsonValue()).isNotNull()
    }

    /** スキーマを深さ優先で歩く（オブジェクトと配列の中身をすべて見る）。 */
    private fun walk(node: JsonNode, path: String, visit: (JsonNode, String) -> Unit) {
        if (node.isObject) {
            visit(node, path)
            node.properties().forEach { (name, child) -> walk(child, "$path.$name", visit) }
        } else if (node.isArray) {
            node.forEachIndexed { index, child -> walk(child, "$path[$index]", visit) }
        }
    }

    private fun JsonNode.forEachIndexed(action: (Int, JsonNode) -> Unit) {
        var index = 0
        for (child in this) {
            action(index, child)
            index++
        }
    }
}
