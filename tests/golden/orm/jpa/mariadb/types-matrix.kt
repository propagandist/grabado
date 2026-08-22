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
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.util.UUID

@Entity
@Table(name = "type_samples")
class TypeSample(
    @Column(name = "c_integer", nullable = true)
    var cInteger: Int? = null,

    @Column(name = "c_smallint", nullable = true)
    var cSmallint: Short? = null,

    @Column(name = "c_tinyint", nullable = true)
    var cTinyint: Short? = null,

    @Column(name = "c_mediumint", nullable = true)
    var cMediumint: Int? = null,

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

    @Column(name = "c_binary", nullable = true)
    var cBinary: ByteArray? = null,

    @Column(name = "c_varbinary", nullable = true)
    var cVarbinary: ByteArray? = null,

    @Column(name = "c_boolean", nullable = true)
    var cBoolean: Boolean? = null,

    @Column(name = "c_date", nullable = true)
    var cDate: LocalDate? = null,

    @Column(name = "c_time", nullable = true)
    var cTime: LocalTime? = null,

    @Column(name = "c_datetime", nullable = true)
    var cDatetime: LocalDateTime? = null,

    @Column(name = "c_timestamp", nullable = true)
    var cTimestamp: OffsetDateTime? = null,

    @Column(name = "c_year", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（YEAR） */
    var cYear: String? = null,

    @Column(name = "c_uuid", nullable = true)
    var cUuid: UUID? = null,

    @Column(name = "c_inet4", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（INET4） */
    var cInet4: String? = null,

    @Column(name = "c_inet6", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（INET6） */
    var cInet6: String? = null,

    @Column(name = "c_json", nullable = true)
    /* json: JPA の標準に対応する型が無いので String で出す（JSON） */
    var cJson: String? = null,

    @Column(name = "c_enum", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（ENUM('draft','published')） */
    var cEnum: String? = null,

    @Column(name = "c_set", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（SET('a','b')） */
    var cSet: String? = null,

    @Column(name = "c_bit", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（BIT(8)） */
    var cBit: String? = null,
)