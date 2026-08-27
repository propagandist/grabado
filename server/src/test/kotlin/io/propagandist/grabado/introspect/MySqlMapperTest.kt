package io.propagandist.grabado.introspect

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

/**
 * MySQL のカタログ → 応答モデル（段階5-8a）。**Docker 無しで常に走る。**
 *
 * 入力は実 MySQL 8.4 から採ったフィクスチャで、[MySqlCatalogIntegrationTest] が
 * 「実 DB と一致すること」を保証している（PG 側と同じ 2 層）。
 *
 * ★ ここで見たいのは **「方言差が Reader に閉じている」こと** ——
 * [IntrospectionMapper] は PG と MySQL のどちらの `CatalogSnapshot` も同じ規則で扱う。
 */
class MySqlMapperTest {

    private val snapshot = CatalogSnapshotFixture.load("mysql-catalog.json")

    private fun model() = IntrospectionMapper.toModel(snapshot, "shop")

    @Test
    fun `PG と同じ形のモデルになる`() {
        val model = model()

        assertThat(model.introspectionVersion).isEqualTo(1)
        assertThat(model.dialect).isEqualTo("mysql")
        assertThat(model.tables.map { it.name }).containsExactly("article_tags", "articles", "users")
    }

    @Test
    fun `制約が先、index が後（PG と同じ並び）`() {
        val articles = model().tables.first { it.name == "articles" }

        assertThat(articles.keys.map { it.type }).containsExactly("PRIMARY", "INDEX", "INDEX")
    }

    @Test
    fun `PK と UNIQUE の index は重複して出てこない`() {
        /*
         * MySQL は statistics に PK も UNIQUE も出す。Reader 側で制約名による除外を
         * かけているので、ここには「制約が持たない index」だけが来る。
         */
        val users = model().tables.first { it.name == "users" }

        assertThat(users.keys.map { it.name }).containsExactly("PRIMARY", "users_email_key")
        assertThat(users.keys.map { it.type }).containsExactly("PRIMARY", "UNIQUE")
    }

    @Test
    fun `複合 PK と複合 index が並びを保つ`() {
        val model = model()

        val pk = model.tables.first { it.name == "article_tags" }.keys.first { it.type == "PRIMARY" }
        assertThat(pk.columns).containsExactly("article_id", "tag")

        val index = model.tables.first { it.name == "articles" }
            .keys.first { it.name == "idx_articles_published_on_title" }
        assertThat(index.columns).containsExactly("published_on", "title")
    }

    @Test
    fun `型情報が落ちない`() {
        val articles = model().tables.first { it.name == "articles" }

        val price = articles.columns.first { it.name == "price" }
        assertThat(price.sqlType).isEqualTo("decimal")
        assertThat(price.numericPrecision).isEqualTo(12)
        assertThat(price.numericScale).isEqualTo(2)

        /* MySQL に配列型は無いので、要素型は常に null */
        assertThat(articles.columns.map { it.arrayElementType }).allMatch { it == null }
    }

    @Test
    fun `外部キーが子側の列に付く`() {
        val articles = model().tables.first { it.name == "articles" }

        assertThat(articles.columns.first { it.name == "author_id" }.references)
            .containsExactly(IntrospectedReference("users", "id"))
    }

    @Test
    fun `コメントは日本語がそのまま通る`() {
        val users = model().tables.first { it.name == "users" }

        assertThat(users.comment).isEqualTo("ユーザー")
        assertThat(users.columns.first { it.name == "email" }.comment)
            .isEqualTo("ログイン用メールアドレス")
    }

    @Test
    fun `コメントが無い列は null（MySQL の空文字を潰している）`() {
        val articles = model().tables.first { it.name == "articles" }

        assertThat(articles.columns.first { it.name == "title" }.comment).isNull()
    }
}
