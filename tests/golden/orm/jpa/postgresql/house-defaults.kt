/*
 * grabado が生成した Jakarta Persistence の entity（Kotlin）。
 *
 * **kotlin("plugin.jpa") が要る** —— JPA は引数の無いコンストラクタを求めるので、
 * コンストラクタ引数で書く形はプラグイン前提になる（Spring Initializr の既定）。
 * package 宣言は出さない（置き場所は生成物を受け取る側が決める）。
 */

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.IdClass
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.io.Serializable
import java.math.BigDecimal
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

/** ユーザー */
@Entity
@Table(name = "users", uniqueConstraints = [UniqueConstraint(name = "users_email_key", columnNames = ["email"])])
class User(
    @Id
    @Column(name = "id")
    var id: UUID,

    /** ログイン用メールアドレス */
    @Column(name = "email", nullable = false)
    var email: String,

    @Column(name = "display_name", nullable = false)
    var displayName: String,

    @Column(name = "is_active", nullable = false)
    var isActive: Boolean,

    /** UI 設定などの任意項目 */
    @Column(name = "preferences", nullable = false)
    /* json: JPA の標準に対応する型が無いので String で出す（JSONB） */
    var preferences: String,

    @Column(name = "created_at", nullable = false)
    var createdAt: OffsetDateTime,

    @Column(name = "updated_at", nullable = false)
    var updatedAt: OffsetDateTime,
)

/** 記事 */
@Entity
@Table(name = "articles")
class Article(
    @Id
    @Column(name = "id")
    var id: UUID,

    /** 執筆者 (users.id) */
    @ManyToOne
    @JoinColumn(name = "author_id", nullable = false)
    var author: User,

    @Column(name = "title", nullable = false)
    var title: String,

    @Column(name = "body", nullable = true)
    var body: String? = null,

    @Column(name = "view_count", nullable = false)
    var viewCount: Int,

    /** 有料記事の価格。money ではなく numeric を使う */
    @Column(name = "price", nullable = true)
    var price: BigDecimal? = null,

    @Column(name = "published_on", nullable = true)
    var publishedOn: LocalDate? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: OffsetDateTime,

    @Column(name = "updated_at", nullable = false)
    var updatedAt: OffsetDateTime,
)

/** 記事とタグの対応 */
@Entity
@Table(name = "article_tags")
@IdClass(ArticleTagId::class)
class ArticleTag(
    @Id
    @Column(name = "article_id")
    var articleId: UUID,

    @Id
    @Column(name = "tag")
    var tag: String,

    @Column(name = "created_at", nullable = false)
    var createdAt: OffsetDateTime,
)

/** article_tags の複合主キー（JPA は @IdClass に id クラスを要求する） */
data class ArticleTagId(
    var articleId: UUID? = null,
    var tag: String? = null,
) : Serializable