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
import java.util.UUID

@Entity
@Table(name = "type_samples")
class TypeSample(
    @Column(name = "c_integer", nullable = true)
    var cInteger: Int? = null,

    @Column(name = "c_smallint", nullable = true)
    var cSmallint: Short? = null,

    @Column(name = "c_bigint", nullable = true)
    var cBigint: Long? = null,

    @Column(name = "c_decimal", nullable = true)
    var cDecimal: BigDecimal? = null,

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "c_serial")
    var cSerial: Long = 0L,

    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "c_bigserial", nullable = false)
    var cBigserial: Long = 0L,

    @Column(name = "c_float", nullable = true)
    var cFloat: Float? = null,

    @Column(name = "c_double", nullable = true)
    var cDouble: Double? = null,

    @Column(name = "c_char", nullable = true)
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

    @Column(name = "c_timestamp", nullable = true)
    var cTimestamp: OffsetDateTime? = null,

    @Column(name = "c_timestamp_tz", nullable = true)
    var cTimestampTz: OffsetDateTime? = null,

    @Column(name = "c_timestamp_wo_tz", nullable = true)
    var cTimestampWoTz: OffsetDateTime? = null,

    @Column(name = "c_uuid", nullable = true)
    var cUuid: UUID? = null,

    @Column(name = "c_xml", nullable = true)
    /* xml: JPA の標準に対応する型が無いので String で出す（XML） */
    var cXml: String? = null,

    @Column(name = "c_bit", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（BIT(8)） */
    var cBit: String? = null,

    @Column(name = "c_varbit", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（VARBIT(8)） */
    var cVarbit: String? = null,

    @Column(name = "c_inet", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（INET） */
    var cInet: String? = null,

    @Column(name = "c_cidr", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（CIDR） */
    var cCidr: String? = null,

    @Column(name = "c_geometry", nullable = true)
    /* geometry: JPA の標準に対応する型が無いので String で出す（GEOMETRY） */
    var cGeometry: String? = null,

    @Column(name = "c_json", nullable = true)
    /* json: JPA の標準に対応する型が無いので String で出す（JSONB） */
    var cJson: String? = null,

    @Column(name = "c_jsonb", nullable = true)
    /* json: JPA の標準に対応する型が無いので String で出す（JSONB） */
    var cJsonb: String? = null,
)