/*
 * grabado が生成した Jakarta Persistence の entity（Kotlin）。
 *
 * **kotlin("plugin.jpa") が要る** —— JPA は引数の無いコンストラクタを求めるので、
 * コンストラクタ引数で書く形はプラグイン前提になる（Spring Initializr の既定）。
 * package 宣言は出さない（置き場所は生成物を受け取る側が決める）。
 */

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.OffsetTime

@Entity
@Table(name = "type_samples")
class TypeSample(
    @Column(name = "c_integer", nullable = true)
    var cInteger: Int? = null,

    @Column(name = "c_smallint", nullable = true)
    var cSmallint: Short? = null,

    @Column(name = "c_bigint", nullable = true)
    var cBigint: Long? = null,

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "c_bigint_identity")
    var cBigintIdentity: Long = 0L,

    @Column(name = "c_decimal", nullable = true)
    var cDecimal: BigDecimal? = null,

    @Column(name = "c_float", nullable = true)
    var cFloat: Float? = null,

    @Column(name = "c_double", nullable = true)
    var cDouble: Double? = null,

    @Column(name = "c_char", nullable = true, length = 10)
    var cChar: String? = null,

    @Column(name = "c_varchar", nullable = true, length = 255)
    var cVarchar: String? = null,

    @Column(name = "c_text", nullable = true)
    var cText: String? = null,

    @Column(name = "c_bytea", nullable = true)
    var cBytea: ByteArray? = null,

    @Column(name = "c_boolean", nullable = true)
    var cBoolean: Boolean? = null,

    @Column(name = "c_date", nullable = true)
    var cDate: LocalDate? = null,

    @Column(name = "c_time", nullable = true)
    var cTime: LocalTime? = null,

    @Column(name = "c_time_tz", nullable = true)
    var cTimeTz: OffsetTime? = null,

    @Column(name = "c_interval", nullable = true)
    /* interval: JPA の標準に対応する型が無いので String で出す（INTERVAL(6)） */
    var cInterval: String? = null,

    @Column(name = "c_timestamp_tz", nullable = true)
    var cTimestampTz: OffsetDateTime? = null,

    @Column(name = "c_xml", nullable = true)
    /* xml: JPA の標準に対応する型が無いので String で出す（XML） */
    var cXml: String? = null,

    @Column(name = "c_json", nullable = true)
    /* json: JPA の標準に対応する型が無いので String で出す（JSON） */
    var cJson: String? = null,
)