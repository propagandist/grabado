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
import java.time.LocalDateTime
import java.time.OffsetDateTime

@Entity
@Table(name = "type_samples")
class TypeSample(
    @Id
    @Column(name = "c_number")
    var cNumber: BigDecimal,

    @Column(name = "c_integer", nullable = true)
    var cInteger: Long? = null,

    @Column(name = "c_decimal", nullable = true)
    var cDecimal: BigDecimal? = null,

    @Column(name = "c_float", nullable = true)
    var cFloat: Double? = null,

    @Column(name = "c_binary_float", nullable = true)
    var cBinaryFloat: Float? = null,

    @Column(name = "c_binary_double", nullable = true)
    var cBinaryDouble: Double? = null,

    @Column(name = "c_char", nullable = true, length = 10)
    var cChar: String? = null,

    @Column(name = "c_varchar2", nullable = true, length = 255)
    var cVarchar2: String? = null,

    @Column(name = "c_nchar", nullable = true, length = 10)
    var cNchar: String? = null,

    @Column(name = "c_nvarchar2", nullable = true, length = 255)
    var cNvarchar2: String? = null,

    @Column(name = "c_clob", nullable = true)
    var cClob: String? = null,

    @Column(name = "c_nclob", nullable = true)
    var cNclob: String? = null,

    @Column(name = "c_boolean", nullable = true)
    var cBoolean: Boolean? = null,

    @Column(name = "c_date", nullable = true)
    var cDate: LocalDateTime? = null,

    @Column(name = "c_timestamp", nullable = true)
    var cTimestamp: LocalDateTime? = null,

    @Column(name = "c_timestamp_tz", nullable = true)
    var cTimestampTz: OffsetDateTime? = null,

    @Column(name = "c_interval_ym", nullable = true)
    /* interval: JPA の標準に対応する型が無いので String で出す（INTERVAL YEAR TO MONTH） */
    var cIntervalYm: String? = null,

    @Column(name = "c_interval_ds", nullable = true)
    /* interval: JPA の標準に対応する型が無いので String で出す（INTERVAL DAY TO SECOND） */
    var cIntervalDs: String? = null,

    @Column(name = "c_raw", nullable = true)
    var cRaw: ByteArray? = null,

    @Column(name = "c_blob", nullable = true)
    var cBlob: ByteArray? = null,

    @Column(name = "c_json", nullable = true)
    /* json: JPA の標準に対応する型が無いので String で出す（JSON） */
    var cJson: String? = null,

    @Column(name = "c_xml", nullable = true)
    /* xml: JPA の標準に対応する型が無いので String で出す（XMLTYPE） */
    var cXml: String? = null,

    @Column(name = "c_rowid", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（ROWID） */
    var cRowid: String? = null,
)