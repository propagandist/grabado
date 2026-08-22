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
import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.util.UUID

@Entity
@Table(name = "type_samples")
class TypeSample(
    @Id
    @Column(name = "c_integer")
    var cInteger: Int,

    @Column(name = "c_smallint", nullable = true)
    var cSmallint: Short? = null,

    @Column(name = "c_tinyint", nullable = true)
    var cTinyint: Short? = null,

    @Column(name = "c_bigint", nullable = true)
    var cBigint: Long? = null,

    @Column(name = "c_decimal", nullable = true)
    var cDecimal: BigDecimal? = null,

    @Column(name = "c_float", nullable = true)
    var cFloat: Double? = null,

    @Column(name = "c_real", nullable = true)
    var cReal: Float? = null,

    @Column(name = "c_char", nullable = true, length = 10)
    var cChar: String? = null,

    @Column(name = "c_varchar", nullable = true, length = 255)
    var cVarchar: String? = null,

    @Column(name = "c_nchar", nullable = true, length = 10)
    var cNchar: String? = null,

    @Column(name = "c_nvarchar", nullable = true, length = 255)
    var cNvarchar: String? = null,

    @Column(name = "c_boolean", nullable = true)
    var cBoolean: Boolean? = null,

    @Column(name = "c_binary", nullable = true)
    var cBinary: ByteArray? = null,

    @Column(name = "c_varbinary", nullable = true)
    var cVarbinary: ByteArray? = null,

    @Column(name = "c_date", nullable = true)
    var cDate: LocalDate? = null,

    @Column(name = "c_time", nullable = true)
    var cTime: LocalTime? = null,

    @Column(name = "c_datetime", nullable = true)
    var cDatetime: LocalDateTime? = null,

    @Column(name = "c_datetime2", nullable = true)
    var cDatetime2: LocalDateTime? = null,

    @Column(name = "c_datetimeoffset", nullable = true)
    var cDatetimeoffset: OffsetDateTime? = null,

    @Column(name = "c_smalldatetime", nullable = true)
    var cSmalldatetime: LocalDateTime? = null,

    @Column(name = "c_uuid", nullable = true)
    var cUuid: UUID? = null,

    @Column(name = "c_xml", nullable = true)
    /* xml: JPA の標準に対応する型が無いので String で出す（xml） */
    var cXml: String? = null,

    @Column(name = "c_sql_variant", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（sql_variant） */
    var cSqlVariant: String? = null,

    @Column(name = "c_rowversion", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（rowversion） */
    var cRowversion: String? = null,

    @Column(name = "c_hierarchyid", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（hierarchyid） */
    var cHierarchyid: String? = null,

    @Column(name = "c_geometry", nullable = true)
    /* geometry: JPA の標準に対応する型が無いので String で出す（geometry） */
    var cGeometry: String? = null,
)