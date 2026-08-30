package io.propagandist.grabado.introspect

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.sql.DriverManager

/**
 * **実 H2 を相手にする統合テスト（段階5-8b）。opt-in ではなく常に走る。**
 *
 * PG / MySQL の統合テストは `docker run` が要るので `assumeTrue` で skip しているが、
 * **H2 は組み込みで起こせる**（`jdbc:h2:mem:`）。つまり
 * **「実 DB に対して確かめる」を CI に載せられる唯一の方言**で、
 * フィクスチャと実 DB の一致を毎回検証できる。
 *
 * スキーマは `docs/samples/introspection-sample-schema-h2.sql`。PG / MySQL 版と**同じ設計**を
 * H2 方言で書いたもの。
 */
class H2CatalogIntegrationTest {

    @Test
    fun `テーブルとコメントが読める`() {
        val snapshot = read()

        /*
         * H2 は引用符なしの識別子を大文字化する。
         *
         * ★ **並びが PG / MySQL と逆になる。** 昇順は String.compareTo（UTF-16 コード単位）で、
         *   `_`(0x5F) は小文字 `s`(0x73) より前だが大文字 `S`(0x53) より後 ——
         *   小文字なら article_tags < articles、大文字なら ARTICLES < ARTICLE_TAGS。
         *   **決定論であることに変わりはない**（同じ DB からは必ず同じ並び）。
         */
        assertThat(snapshot.tables.map { it.name })
            .containsExactly("ARTICLES", "ARTICLE_TAGS", "USERS")
        assertThat(snapshot.tables.first { it.name == "USERS" }.comment).isEqualTo("ユーザー")
    }

    @Test
    fun `NOT NULL の CHECK は出ない（allowlist なのでどの方言でも同じ）`() {
        val snapshot = read()

        assertThat(snapshot.constraints.map { it.type }.distinct())
            .containsExactlyInAnyOrder("PRIMARY", "UNIQUE")
    }

    @Test
    fun `自動生成の index が出てこない（IS_GENERATED で除外している）`() {
        /*
         * ★ H2 は PK / UNIQUE の裏 index に加えて **FK にも自動で index を作る**
         *   （FK_..._INDEX_E）。名前で弾こうとすると denylist になって必ず漏れるが、
         *   H2 自身が IS_GENERATED で印を付けているのでそれを使う。
         */
        val snapshot = read()

        val names = snapshot.indexes.map { it.name }.distinct()
        assertThat(names).containsExactly("IDX_ARTICLES_AUTHOR_ID", "IDX_ARTICLES_PUBLISHED_ON_TITLE")
        assertThat(names).noneMatch { it.startsWith("PRIMARY_KEY") || it.contains("_INDEX_") }
    }

    @Test
    fun `複合 index は列の並びを保つ`() {
        val composite = read().indexes
            .filter { it.name == "IDX_ARTICLES_PUBLISHED_ON_TITLE" }
            .sortedBy { it.position }
            .map { it.column }

        assertThat(composite).containsExactly("PUBLISHED_ON", "TITLE")
    }

    @Test
    fun `型情報が落ちない（SQL 標準の綴りで返る）`() {
        val byName = read().columns.associateBy { it.table to it.name }

        val price = byName["ARTICLES" to "PRICE"]!!
        assertThat(price.dataType).isEqualTo("NUMERIC")
        assertThat(price.numericPrecision).isEqualTo(12)
        assertThat(price.numericScale).isEqualTo(2)

        /* H2 は CHARACTER VARYING / TIMESTAMP WITH TIME ZONE と綴る（パレットの aka が受ける形） */
        assertThat(byName["USERS" to "EMAIL"]!!.dataType).isEqualTo("CHARACTER VARYING")
        assertThat(byName["USERS" to "CREATED_AT"]!!.dataType).isEqualTo("TIMESTAMP WITH TIME ZONE")
    }

    @Test
    fun `外部キーが子側の列に付く`() {
        val snapshot = read()

        assertThat(snapshot.foreignKeys.map { "${it.table}.${it.column}->${it.referencedTable}.${it.referencedColumn}" })
            .containsExactlyInAnyOrder(
                "ARTICLES.AUTHOR_ID->USERS.ID",
                "ARTICLE_TAGS.ARTICLE_ID->ARTICLES.ID",
            )
    }

    @Test
    fun `複合 PK は列の並びを保つ`() {
        val model = IntrospectionMapper.toModel(read(), "it")
        val pk = model.tables.first { it.name == "ARTICLE_TAGS" }.keys.first { it.type == "PRIMARY" }

        assertThat(pk.columns).containsExactly("ARTICLE_ID", "TAG")
    }

    @Test
    fun `PG と同じ形のモデルになる（方言差は Reader に閉じている）`() {
        val model = IntrospectionMapper.toModel(read(), "it")

        assertThat(model.introspectionVersion).isEqualTo(1)
        assertThat(model.dialect).isEqualTo("h2")
        assertThat(model.tables.map { it.name }).containsExactly("ARTICLES", "ARTICLE_TAGS", "USERS")

        val articles = model.tables.first { it.name == "ARTICLES" }
        assertThat(articles.keys.map { it.type }).containsExactly("PRIMARY", "INDEX", "INDEX")
    }

    @Test
    fun `URL で Reader が選ばれる`() {
        val readers = listOf(PostgresCatalogReader(), MySqlCatalogReader(), H2CatalogReader())

        assertThat(CatalogReader.forUrl("jdbc:h2:mem:x", readers).dialect).isEqualTo("h2")
        assertThat(CatalogReader.forUrl("jdbc:postgresql://h/db", readers).dialect).isEqualTo("postgresql")
        assertThat(CatalogReader.forUrl("jdbc:mysql://h/db", readers).dialect).isEqualTo("mysql")
        /* MariaDB は MySQL の Reader が受ける（プロトコルとカタログが互換） */
        assertThat(CatalogReader.forUrl("jdbc:mariadb://h/db", readers).dialect).isEqualTo("mysql")
    }

    private fun read(): CatalogSnapshot = H2CatalogReader().read(source)

    companion object {
        private const val URL = "jdbc:h2:mem:grabado_survey;DB_CLOSE_DELAY=-1"

        private val source = IntrospectSource(url = URL, user = "sa", password = "", schema = "public")

        @JvmStatic
        @BeforeAll
        fun setUp() {
            val repoRoot = Path.of(
                System.getProperty("grabado.repoRoot")
                    ?: error("grabado.repoRoot が未設定（build.gradle.kts の test タスク）"),
            )
            val script = Files.readString(
                repoRoot.resolve("docs").resolve("samples").resolve("introspection-sample-schema-h2.sql"),
            )
            DriverManager.getConnection(URL, "sa", "").use { connection ->
                connection.createStatement().use { it.execute(script) }
            }
        }
    }
}
