package io.propagandist.grabado.introspect

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test

/**
 * **実 MySQL 8.4 を相手にする opt-in の統合テスト**（段階5-8a）。
 *
 * `GRABADO_IT_MYSQL_URL` が無ければ丸ごと skip する。PG 側（[PostgresCatalogIntegrationTest]）と
 * 同じ立場で、**フィクスチャが実 DB と一致すること**を保証する。
 *
 * ## 走らせ方
 *
 * ```bash
 * docker run -d --name grabado-mysql -e MYSQL_ROOT_PASSWORD=grabado \
 *   -e MYSQL_DATABASE=grabado_survey -p 33066:3306 mysql:8.4
 * docker exec -i grabado-mysql mysql -uroot -pgrabado grabado_survey \
 *   < docs/samples/introspection-sample-schema-mysql.sql
 *
 * cd server && GRABADO_IT_MYSQL_URL=jdbc:mysql://127.0.0.1:33066/grabado_survey \
 *   GRABADO_IT_MYSQL_USER=root GRABADO_IT_MYSQL_PASSWORD=grabado ./gradlew test
 * ```
 */
class MySqlCatalogIntegrationTest {

    @Test
    fun `テーブルとコメントが読める`() {
        val snapshot = read()

        assertThat(snapshot.tables.map { it.name })
            .containsExactly("article_tags", "articles", "users")
        assertThat(snapshot.tables.first { it.name == "users" }.comment).isEqualTo("ユーザー")
    }

    @Test
    fun `コメントが無い列は null（MySQL は空文字を返すので潰している）`() {
        val snapshot = read()
        val title = snapshot.columns.first { it.table == "articles" && it.name == "title" }

        assertThat(title.comment).isNull()
    }

    @Test
    fun `NOT NULL の CHECK は出ない（§4-6-1 は PG 固有の挙動だった）`() {
        /*
         * PG18 は同じ設計に対して CHECK を 16 件出すが、MySQL は 0 件。
         * **allowlist で引いているので、どちらでも同じ結果になる** —— 方言差に
         * 引きずられない形にしてあることの確認。
         */
        val snapshot = read()

        assertThat(snapshot.constraints.map { it.type }.distinct())
            .containsExactlyInAnyOrder("PRIMARY", "UNIQUE")
    }

    @Test
    fun `index から PK と UNIQUE が除外される（MySQL は statistics に全部出る）`() {
        val snapshot = read()

        val names = snapshot.indexes.map { it.name }.distinct()
        assertThat(names).containsExactly("idx_articles_author_id", "idx_articles_published_on_title")
        /* PRIMARY（PK）と users_email_key（UNIQUE 制約）は制約側で拾うので出てこない */
        assertThat(names).doesNotContain("PRIMARY", "users_email_key")
    }

    @Test
    fun `複合 index は列の並びを保つ`() {
        val snapshot = read()

        val composite = snapshot.indexes
            .filter { it.name == "idx_articles_published_on_title" }
            .sortedBy { it.position }
            .map { it.column }
        assertThat(composite).containsExactly("published_on", "title")
    }

    @Test
    fun `型情報が落ちない（decimal の精度・スケールと文字列の長さ）`() {
        val snapshot = read()
        val byName = snapshot.columns.associateBy { it.table to it.name }

        val price = byName["articles" to "price"]!!
        assertThat(price.dataType).isEqualTo("decimal")
        assertThat(price.numericPrecision).isEqualTo(12)
        assertThat(price.numericScale).isEqualTo(2)

        val email = byName["users" to "email"]!!
        assertThat(email.dataType).isEqualTo("varchar")
        assertThat(email.characterMaximumLength).isEqualTo(255)
    }

    @Test
    fun `column_type がより詳しい形として載る`() {
        val snapshot = read()
        val id = snapshot.columns.first { it.table == "users" && it.name == "id" }

        /* data_type は char、column_type は char(36)。解決の第 2 候補になる */
        assertThat(id.dataType).isEqualTo("char")
        assertThat(id.udtName).isEqualTo("char(36)")
    }

    @Test
    fun `外部キーが子側の列に付く`() {
        val snapshot = read()

        assertThat(snapshot.foreignKeys.map { "${it.table}.${it.column}->${it.referencedTable}.${it.referencedColumn}" })
            .containsExactlyInAnyOrder(
                "articles.author_id->users.id",
                "article_tags.article_id->articles.id",
            )
    }

    @Test
    fun `複合 PK は列の並びを保つ`() {
        val model = IntrospectionMapper.toModel(read(), "it")
        val pk = model.tables.first { it.name == "article_tags" }.keys.first { it.type == "PRIMARY" }

        assertThat(pk.columns).containsExactly("article_id", "tag")
    }

    @Test
    fun `PG と同じ形のモデルになる（方言差は Reader に閉じている）`() {
        val model = IntrospectionMapper.toModel(read(), "it")

        assertThat(model.introspectionVersion).isEqualTo(1)
        assertThat(model.dialect).isEqualTo("mysql")
        assertThat(model.tables.map { it.name }).containsExactly("article_tags", "articles", "users")

        val articles = model.tables.first { it.name == "articles" }
        assertThat(articles.keys.map { it.type }).containsExactly("PRIMARY", "INDEX", "INDEX")
    }

    /** PG 側と同じく、フィクスチャが実 DB と一致することを保証する。 */
    @Test
    fun `フィクスチャが実 DB の出力と一致する`() {
        val actual = CatalogSnapshotFixture.toJson(read())

        if (System.getenv("GRABADO_IT_WRITE_FIXTURE") == "1") {
            CatalogSnapshotFixture.write(actual, "mysql-catalog.json")
            return
        }
        assertThat(actual)
            .describedAs("フィクスチャが古い。GRABADO_IT_WRITE_FIXTURE=1 で採り直すこと")
            .isEqualTo(CatalogSnapshotFixture.read("mysql-catalog.json"))
    }

    private fun read(): CatalogSnapshot = MySqlCatalogReader().read(source!!)

    companion object {
        private var source: IntrospectSource? = null

        @JvmStatic
        @BeforeAll
        fun setUp() {
            val url = System.getenv("GRABADO_IT_MYSQL_URL")
            assumeTrue(url != null, "GRABADO_IT_MYSQL_URL が無いので skip（実 MySQL が要る統合テスト）")
            source = IntrospectSource(
                url = url!!,
                user = System.getenv("GRABADO_IT_MYSQL_USER") ?: "root",
                password = System.getenv("GRABADO_IT_MYSQL_PASSWORD") ?: "grabado",
                /* MySQL に「スキーマ」の階層は無く、データベース名がそれにあたる */
                schema = System.getenv("GRABADO_IT_MYSQL_SCHEMA") ?: "grabado_survey",
            )
        }
    }
}
