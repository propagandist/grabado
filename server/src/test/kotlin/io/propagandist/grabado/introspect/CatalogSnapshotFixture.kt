package io.propagandist.grabado.introspect

import tools.jackson.databind.json.JsonMapper
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path

/**
 * 実 PG18 から採った [CatalogSnapshot] の保管（段階5-7a）。
 *
 * ## 2 層にする理由
 *
 * | | 走る条件 | 見るもの |
 * |---|---|---|
 * | [IntrospectionMapperTest] | **常に**（CI 込み） | フィクスチャ → モデルの写し方 |
 * | [PostgresCatalogIntegrationTest] | `GRABADO_IT_JDBC_URL` があるときだけ | **フィクスチャが実 DB と一致するか** |
 *
 * 純粋なフィクスチャだけだと「PG18 はこう返すはずだ」という**信念を符号化しただけ**になり、
 * 信念が間違っていても緑になる（`docs/ARCHITECTURE.md` §4.6 の 2 不具合が 10 年以上
 * 残っていたのはこの形）。**採り直し以外の方法でフィクスチャが生まれない**ようにしてある。
 *
 * 保管形式は JSON（人が差分を読めるため）。**Kotlin と TypeScript で共有しない** ——
 * これは backend の内部表現で、契約ではない。
 */
object CatalogSnapshotFixture {

    private val mapper = JsonMapper.builder().build()

    /** `server/src/test/resources/` ではなく repo 側に置く（人が差分を読む対象なので） */
    /** 既定は PostgreSQL。段階5-8a から方言ごとに 1 本ずつ持つ。 */
    const val POSTGRESQL = "postgresql-catalog.json"

    private fun path(name: String): Path {
        val repoRoot = Path.of(
            System.getProperty("grabado.repoRoot")
                ?: error("grabado.repoRoot が未設定（build.gradle.kts の test タスク）"),
        )
        return repoRoot.resolve("tests").resolve("fixtures").resolve("introspection").resolve(name)
    }

    /** 決定論のため、書き出しは pretty print（改行は LF）で固定する。 */
    fun toJson(snapshot: CatalogSnapshot): String =
        mapper.writerWithDefaultPrettyPrinter().writeValueAsString(snapshot).replace("\r\n", "\n") + "\n"

    fun read(name: String = POSTGRESQL): String =
        Files.readString(path(name), StandardCharsets.UTF_8).replace("\r\n", "\n")

    fun write(json: String, name: String = POSTGRESQL) {
        Files.createDirectories(path(name).parent)
        Files.writeString(path(name), json, StandardCharsets.UTF_8)
    }

    fun load(name: String = POSTGRESQL): CatalogSnapshot =
        mapper.readValue(read(name), CatalogSnapshot::class.java)
}
