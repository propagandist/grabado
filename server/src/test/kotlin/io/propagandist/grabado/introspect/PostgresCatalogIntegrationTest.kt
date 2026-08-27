package io.propagandist.grabado.introspect

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test

/**
 * **実 PostgreSQL 18 を相手にする opt-in の統合テスト**（段階5-7a）。
 *
 * `GRABADO_IT_JDBC_URL` が無ければ丸ごと skip する（`./gradlew test` の既定では走らない）。
 *
 * ## なぜ opt-in なのか、なぜ必要なのか
 *
 * 純粋なフィクスチャだけで [IntrospectionMapper] を回すと速くて依存も 0 だが、
 * **フィクスチャは「PG18 はこう返すはずだ」という我々の信念を符号化したもの**でしかない。
 * 信念が間違っていればテストは緑のまま本番が壊れる —— `docs/ARCHITECTURE.md` §4.6 が
 * 記録している失敗（NOT NULL の CHECK と index の `break`）は、まさにその形で 10 年以上
 * 残っていた。
 *
 * ここが 1 本あれば、**フィクスチャが作文に堕ちる経路が閉じる**。
 *
 * Testcontainers を入れないのは、`docs/ARCHITECTURE.md` §4.1 に `docker run … postgres:18` の
 * レシピが既にあり、CI では GitHub Actions の `services:` が**追加依存ゼロ**で同じ JDBC URL を
 * 供給できるから（org security-baseline の「依存を増やす前に基準を読む」に対する答え）。
 *
 * ## 走らせ方
 *
 * ```bash
 * docker run -d --name grabado-pg -e POSTGRES_PASSWORD=grabado \
 *   -e POSTGRES_DB=grabado_survey -p 55432:5432 postgres:18
 * docker exec -i grabado-pg psql -U postgres -d grabado_survey \
 *   < docs/samples/introspection-sample-schema.sql
 *
 * cd server && GRABADO_IT_JDBC_URL=jdbc:postgresql://127.0.0.1:55432/grabado_survey \
 *   GRABADO_IT_USER=postgres GRABADO_IT_PASSWORD=grabado ./gradlew test
 * ```
 */
class PostgresCatalogIntegrationTest {

    @Test
    fun `テーブルとコメントが読める`() {
        val snapshot = read()

        assertThat(snapshot.tables.map { it.name })
            .containsExactly("article_tags", "articles", "users")
        assertThat(snapshot.tables.first { it.name == "users" }.comment).isEqualTo("ユーザー")
    }

    @Test
    fun `NOT NULL の CHECK を 1 件も読まない（§4-6-1 が構造的に不可能になっている）`() {
        /*
         * PG18 はサンプルスキーマに対して **CHECK を 16 件**出す（実測。すべて
         * <table>_<col>_not_null）。現行 PHP は denylist で除外しようとして </key> を
         * 余分に出し、XML が well-formed でなくなった。**allowlist で引けば起こらない。**
         */
        val snapshot = read()

        assertThat(snapshot.constraints.map { it.type }.distinct())
            .containsExactlyInAnyOrder("PRIMARY", "UNIQUE")
        assertThat(snapshot.constraints.map { it.name }).noneMatch { it.endsWith("_not_null") }
    }

    @Test
    fun `index が全件読める（§4-6-2 の break で 1 件も出なかったもの）`() {
        val snapshot = read()

        val names = snapshot.indexes.map { it.name }.distinct()
        assertThat(names).containsExactly("idx_articles_author_id", "idx_articles_published_on_title")

        /* 複合 index は列の並びを保つ */
        val composite = snapshot.indexes
            .filter { it.name == "idx_articles_published_on_title" }
            .sortedBy { it.position }
            .map { it.column }
        assertThat(composite).containsExactly("published_on", "title")
    }

    @Test
    fun `制約が裏に持つ index は出てこない（PK と UNIQUE の重複を避ける）`() {
        val snapshot = read()

        assertThat(snapshot.indexes.map { it.name }).doesNotContain("users_pkey", "users_email_key")
    }

    @Test
    fun `現行 PHP が落としていた型情報が残る`() {
        val snapshot = read()
        val byName = snapshot.columns.associateBy { it.table to it.name }

        /* numeric(12,2) —— 現行は NUMERIC とだけ書いていた */
        val price = byName["articles" to "price"]!!
        assertThat(price.dataType).isEqualTo("numeric")
        assertThat(price.numericPrecision).isEqualTo(12)
        assertThat(price.numericScale).isEqualTo(2)

        /* text[] —— 現行は ARRAY とだけ書いていた */
        val tags = byName["articles" to "tags"]!!
        assertThat(tags.dataType).isEqualTo("ARRAY")
        assertThat(tags.udtName).isEqualTo("_text")
        assertThat(tags.elementType).isEqualTo("text")
    }

    @Test
    fun `timestamptz は data_type の綴りで返る（パレットの aka が受ける形）`() {
        val snapshot = read()
        val createdAt = snapshot.columns.first { it.table == "users" && it.name == "created_at" }

        /* db/postgresql/datatypes.xml の aka に TIMESTAMP WITH TIME ZONE がある理由がこれ */
        assertThat(createdAt.dataType).isEqualTo("timestamp with time zone")
        assertThat(createdAt.udtName).isEqualTo("timestamptz")
    }

    @Test
    fun `既定値は生のまま返る`() {
        val snapshot = read()
        val byName = snapshot.columns.associateBy { it.table to it.name }

        assertThat(byName["users" to "id"]!!.default).isEqualTo("uuidv7()")
        assertThat(byName["users" to "created_at"]!!.default).isEqualTo("now()")
        assertThat(byName["users" to "email"]!!.default).isNull()
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
    fun `モデルに写しても情報が落ちない`() {
        val model = IntrospectionMapper.toModel(read(), "it")

        assertThat(model.introspectionVersion).isEqualTo(1)
        assertThat(model.dialect).isEqualTo("postgresql")
        assertThat(model.tables.map { it.name }).containsExactly("article_tags", "articles", "users")

        val articles = model.tables.first { it.name == "articles" }
        assertThat(articles.keys.map { it.type })
            .containsExactly("PRIMARY", "INDEX", "INDEX")
        assertThat(articles.columns.first { it.name == "tags" }.arrayElementType).isEqualTo("text")
    }

    /**
     * ★ **フィクスチャが作文に堕ちる経路を閉じる。**
     *
     * `CatalogSnapshotFixture` は [IntrospectionMapperTest]（Docker 無しで CI が回すほう）の
     * 入力で、**このテストだけが正当性を保証できる**。実 DB の出力と 1 バイトでも違えば
     * ここで赤くなる。
     *
     * 採り直すのは `GRABADO_IT_WRITE_FIXTURE=1`（golden の `UPDATE_GOLDEN=1` と同じイディオム）。
     */
    @Test
    fun `フィクスチャが実 DB の出力と一致する`() {
        val actual = CatalogSnapshotFixture.toJson(read())

        if (System.getenv("GRABADO_IT_WRITE_FIXTURE") == "1") {
            CatalogSnapshotFixture.write(actual)
            return
        }
        assertThat(actual)
            .describedAs("フィクスチャが古い。GRABADO_IT_WRITE_FIXTURE=1 で採り直すこと")
            .isEqualTo(CatalogSnapshotFixture.read())
    }

    private fun read(): CatalogSnapshot = PostgresCatalogReader().read(source!!)

    companion object {
        private var source: IntrospectSource? = null

        @JvmStatic
        @BeforeAll
        fun setUp() {
            val url = System.getenv("GRABADO_IT_JDBC_URL")
            /*
             * env が無ければ丸ごと skip。**「実 DB が要る」ことを skip の理由として明示する**
             * ——「たまたま走らなかった」と「意図して走らせていない」を混ぜない。
             */
            assumeTrue(url != null, "GRABADO_IT_JDBC_URL が無いので skip（実 PG18 が要る統合テスト）")
            source = IntrospectSource(
                url = url!!,
                user = System.getenv("GRABADO_IT_USER") ?: "postgres",
                password = System.getenv("GRABADO_IT_PASSWORD") ?: "grabado",
            )
        }
    }
}
