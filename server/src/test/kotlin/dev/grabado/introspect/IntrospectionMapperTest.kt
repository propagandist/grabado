package dev.grabado.introspect

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

/**
 * カタログの生の行 → 応答の形（段階5-7a）。**純粋なので Docker 無しで常に走る。**
 *
 * 入力は [CatalogSnapshotFixture] —— **実 PG18 から採ったもの**で、
 * [PostgresCatalogIntegrationTest] が「実 DB と一致すること」を保証している。
 * 手で書いたフィクスチャなら「PG18 はこう返すはずだ」という信念を符号化しただけになり、
 * 信念が間違っていても緑になる（`docs/ARCHITECTURE.md` §4.6 の 2 不具合がその形で残っていた）。
 */
class IntrospectionMapperTest {

    private val snapshot = CatalogSnapshotFixture.load()

    private fun model() = IntrospectionMapper.toModel(snapshot, "shop")

    @Test
    fun `テーブルは名前の昇順で並ぶ（決定論）`() {
        assertThat(model().tables.map { it.name })
            .containsExactly("article_tags", "articles", "users")
    }

    @Test
    fun `列は ordinal_position の順で並ぶ`() {
        val users = model().tables.first { it.name == "users" }

        assertThat(users.columns.map { it.name }).containsExactly(
            "id", "email", "display_name", "is_active", "preferences", "created_at", "updated_at",
        )
    }

    @Test
    fun `メタ情報が載る`() {
        val model = model()

        assertThat(model.introspectionVersion).isEqualTo(1)
        assertThat(model.source).isEqualTo("shop")
        assertThat(model.dialect).isEqualTo("postgresql")
        assertThat(model.schema).isEqualTo("public")
    }

    @Test
    fun `コメントが写る`() {
        val users = model().tables.first { it.name == "users" }

        assertThat(users.comment).isEqualTo("ユーザー")
        assertThat(users.columns.first { it.name == "email" }.comment)
            .isEqualTo("ログイン用メールアドレス")
    }

    @Test
    fun `CHECK は 1 件も出てこない（PG18 の NOT NULL 問題）`() {
        /*
         * PG18 はサンプルスキーマに対して CHECK を 16 件出す（すべて <table>_<col>_not_null）。
         * **allowlist で引いているので、そもそも snapshot に入っていない。**
         * 現行 PHP は denylist で除外しようとして </key> を余分に出し、XML が
         * well-formed でなくなった（§4.6-1）—— denylist は必ず漏れる。
         */
        val types = model().tables.flatMap { it.keys }.map { it.type }.distinct()

        assertThat(types).doesNotContain("CHECK")
        assertThat(model().tables.flatMap { it.keys }.map { it.name })
            .noneMatch { it.endsWith("_not_null") }
    }

    @Test
    fun `index が出る（現行 PHP は break で 1 件も出せなかった）`() {
        val articles = model().tables.first { it.name == "articles" }

        assertThat(articles.keys.map { it.name }).contains(
            "idx_articles_author_id",
            "idx_articles_published_on_title",
        )
    }

    @Test
    fun `制約が先、index が後（並びが決定論）`() {
        val articles = model().tables.first { it.name == "articles" }

        assertThat(articles.keys.map { it.type }).containsExactly("PRIMARY", "INDEX", "INDEX")
    }

    @Test
    fun `複合キーは列の並びを保つ`() {
        val articleTags = model().tables.first { it.name == "article_tags" }
        val pk = articleTags.keys.first { it.type == "PRIMARY" }

        assertThat(pk.columns).containsExactly("article_id", "tag")
    }

    @Test
    fun `複合 index も列の並びを保つ`() {
        val articles = model().tables.first { it.name == "articles" }
        val index = articles.keys.first { it.name == "idx_articles_published_on_title" }

        assertThat(index.columns).containsExactly("published_on", "title")
    }

    @Test
    fun `型情報が落ちない（numeric の精度・スケールと配列の要素型）`() {
        val articles = model().tables.first { it.name == "articles" }

        val price = articles.columns.first { it.name == "price" }
        assertThat(price.sqlType).isEqualTo("numeric")
        assertThat(price.numericPrecision).isEqualTo(12)
        assertThat(price.numericScale).isEqualTo(2)

        val tags = articles.columns.first { it.name == "tags" }
        assertThat(tags.sqlType).isEqualTo("ARRAY")
        assertThat(tags.udtName).isEqualTo("_text")
        assertThat(tags.arrayElementType).isEqualTo("text")
    }

    @Test
    fun `外部キーは子側の列に付く`() {
        val articles = model().tables.first { it.name == "articles" }

        assertThat(articles.columns.first { it.name == "author_id" }.references)
            .containsExactly(IntrospectedReference("users", "id"))
        assertThat(articles.columns.first { it.name == "id" }.references).isEmpty()
    }

    @Test
    fun `既定値は生のまま（正規化しない）`() {
        val users = model().tables.first { it.name == "users" }

        assertThat(users.columns.first { it.name == "id" }.default).isEqualTo("uuidv7()")
        assertThat(users.columns.first { it.name == "created_at" }.default).isEqualTo("now()")
        assertThat(users.columns.first { it.name == "email" }.default).isNull()
    }

    @Test
    fun `NOT NULL が nullable に写る`() {
        val users = model().tables.first { it.name == "users" }

        assertThat(users.columns.first { it.name == "id" }.nullable).isFalse()
        assertThat(users.columns.first { it.name == "display_name" }.nullable).isFalse()
    }

    @Test
    fun `空のカタログは空のモデルになる`() {
        val empty = CatalogSnapshot("postgresql", "public", emptyList(), emptyList(), emptyList(), emptyList(), emptyList())

        assertThat(IntrospectionMapper.toModel(empty, "x").tables).isEmpty()
    }

    @Test
    fun `同じ入力からは同じ出力（決定論）`() {
        assertThat(model()).isEqualTo(model())
    }
}
