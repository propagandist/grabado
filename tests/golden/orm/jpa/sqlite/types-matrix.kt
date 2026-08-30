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
import jakarta.persistence.Table

@Entity
@Table(name = "type_samples")
class TypeSample(
    @Id
    @Column(name = "c_integer")
    var cInteger: Long,

    @Column(name = "c_real", nullable = true)
    var cReal: Double? = null,

    @Column(name = "c_text", nullable = true)
    var cText: String? = null,

    @Column(name = "c_blob", nullable = true)
    var cBlob: ByteArray? = null,

    @Column(name = "c_any", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（ANY） */
    var cAny: String? = null,
)