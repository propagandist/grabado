/*
 * grabado が生成した Jakarta Persistence の entity（Java）。
 *
 * **1 クラス 1 ファイルに分けてから使う。** Java は 1 つのコンパイル単位に public な
 * クラスを 1 つしか置けない。区切りの行が次のファイルの始まりで、そこに書いてある名前が
 * ファイル名になる。import はファイルごとに付けてあるので、切ればそのまま通る。
 *
 * package 宣言は出さない（置き場所は生成物を受け取る側が決める）。
 * **コンストラクタも出していない** —— JPA は引数の無いコンストラクタを要求するが、
 * 明示のコンストラクタが 1 つも無ければ Java がそれを作る。**足すときは引数無しも残すこと。**
 *
 * 型はすべてボクシング型（int ではなく Integer）。primitive は null を表せないので、
 * outer join や部分ロードで壊れる。NOT NULL は @Column(nullable = false) が表す。
 */

/* ==== TypeSample.java ==== */

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.OffsetTime;
import java.util.UUID;

@Entity
@Table(name = "type_samples")
public class TypeSample {
    @Column(name = "c_integer", nullable = true)
    private Integer cInteger;

    @Column(name = "c_smallint", nullable = true)
    private Short cSmallint;

    @Column(name = "c_bigint", nullable = true)
    private Long cBigint;

    @Column(name = "c_decimal", nullable = true)
    private BigDecimal cDecimal;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "c_serial")
    private Long cSerial;

    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "c_bigserial", nullable = false)
    private Long cBigserial;

    @Column(name = "c_float", nullable = true)
    private Float cFloat;

    @Column(name = "c_double", nullable = true)
    private Double cDouble;

    @Column(name = "c_char", nullable = true)
    private String cChar;

    @Column(name = "c_varchar", nullable = true, length = 255)
    private String cVarchar;

    @Column(name = "c_text", nullable = true)
    private String cText;

    @Column(name = "c_bytea", nullable = true)
    private byte[] cBytea;

    @Column(name = "c_boolean", nullable = true)
    private Boolean cBoolean;

    @Column(name = "c_date", nullable = true)
    private LocalDate cDate;

    @Column(name = "c_time", nullable = true)
    private LocalTime cTime;

    @Column(name = "c_time_tz", nullable = true)
    private OffsetTime cTimeTz;

    @Column(name = "c_interval", nullable = true)
    /* interval: JPA の標準に対応する型が無いので String で出す（INTERVAL(6)） */
    private String cInterval;

    @Column(name = "c_timestamp", nullable = true)
    private OffsetDateTime cTimestamp;

    @Column(name = "c_timestamp_tz", nullable = true)
    private OffsetDateTime cTimestampTz;

    @Column(name = "c_timestamp_wo_tz", nullable = true)
    private OffsetDateTime cTimestampWoTz;

    @Column(name = "c_uuid", nullable = true)
    private UUID cUuid;

    @Column(name = "c_xml", nullable = true)
    /* xml: JPA の標準に対応する型が無いので String で出す（XML） */
    private String cXml;

    @Column(name = "c_bit", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（BIT(8)） */
    private String cBit;

    @Column(name = "c_varbit", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（VARBIT(8)） */
    private String cVarbit;

    @Column(name = "c_inet", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（INET） */
    private String cInet;

    @Column(name = "c_cidr", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（CIDR） */
    private String cCidr;

    @Column(name = "c_geometry", nullable = true)
    /* geometry: JPA の標準に対応する型が無いので String で出す（GEOMETRY） */
    private String cGeometry;

    @Column(name = "c_json", nullable = true)
    /* json: JPA の標準に対応する型が無いので String で出す（JSONB） */
    private String cJson;

    @Column(name = "c_jsonb", nullable = true)
    /* json: JPA の標準に対応する型が無いので String で出す（JSONB） */
    private String cJsonb;

    public Integer getCInteger() {
        return cInteger;
    }

    public void setCInteger(Integer cInteger) {
        this.cInteger = cInteger;
    }

    public Short getCSmallint() {
        return cSmallint;
    }

    public void setCSmallint(Short cSmallint) {
        this.cSmallint = cSmallint;
    }

    public Long getCBigint() {
        return cBigint;
    }

    public void setCBigint(Long cBigint) {
        this.cBigint = cBigint;
    }

    public BigDecimal getCDecimal() {
        return cDecimal;
    }

    public void setCDecimal(BigDecimal cDecimal) {
        this.cDecimal = cDecimal;
    }

    public Long getCSerial() {
        return cSerial;
    }

    public void setCSerial(Long cSerial) {
        this.cSerial = cSerial;
    }

    public Long getCBigserial() {
        return cBigserial;
    }

    public void setCBigserial(Long cBigserial) {
        this.cBigserial = cBigserial;
    }

    public Float getCFloat() {
        return cFloat;
    }

    public void setCFloat(Float cFloat) {
        this.cFloat = cFloat;
    }

    public Double getCDouble() {
        return cDouble;
    }

    public void setCDouble(Double cDouble) {
        this.cDouble = cDouble;
    }

    public String getCChar() {
        return cChar;
    }

    public void setCChar(String cChar) {
        this.cChar = cChar;
    }

    public String getCVarchar() {
        return cVarchar;
    }

    public void setCVarchar(String cVarchar) {
        this.cVarchar = cVarchar;
    }

    public String getCText() {
        return cText;
    }

    public void setCText(String cText) {
        this.cText = cText;
    }

    public byte[] getCBytea() {
        return cBytea;
    }

    public void setCBytea(byte[] cBytea) {
        this.cBytea = cBytea;
    }

    public Boolean getCBoolean() {
        return cBoolean;
    }

    public void setCBoolean(Boolean cBoolean) {
        this.cBoolean = cBoolean;
    }

    public LocalDate getCDate() {
        return cDate;
    }

    public void setCDate(LocalDate cDate) {
        this.cDate = cDate;
    }

    public LocalTime getCTime() {
        return cTime;
    }

    public void setCTime(LocalTime cTime) {
        this.cTime = cTime;
    }

    public OffsetTime getCTimeTz() {
        return cTimeTz;
    }

    public void setCTimeTz(OffsetTime cTimeTz) {
        this.cTimeTz = cTimeTz;
    }

    public String getCInterval() {
        return cInterval;
    }

    public void setCInterval(String cInterval) {
        this.cInterval = cInterval;
    }

    public OffsetDateTime getCTimestamp() {
        return cTimestamp;
    }

    public void setCTimestamp(OffsetDateTime cTimestamp) {
        this.cTimestamp = cTimestamp;
    }

    public OffsetDateTime getCTimestampTz() {
        return cTimestampTz;
    }

    public void setCTimestampTz(OffsetDateTime cTimestampTz) {
        this.cTimestampTz = cTimestampTz;
    }

    public OffsetDateTime getCTimestampWoTz() {
        return cTimestampWoTz;
    }

    public void setCTimestampWoTz(OffsetDateTime cTimestampWoTz) {
        this.cTimestampWoTz = cTimestampWoTz;
    }

    public UUID getCUuid() {
        return cUuid;
    }

    public void setCUuid(UUID cUuid) {
        this.cUuid = cUuid;
    }

    public String getCXml() {
        return cXml;
    }

    public void setCXml(String cXml) {
        this.cXml = cXml;
    }

    public String getCBit() {
        return cBit;
    }

    public void setCBit(String cBit) {
        this.cBit = cBit;
    }

    public String getCVarbit() {
        return cVarbit;
    }

    public void setCVarbit(String cVarbit) {
        this.cVarbit = cVarbit;
    }

    public String getCInet() {
        return cInet;
    }

    public void setCInet(String cInet) {
        this.cInet = cInet;
    }

    public String getCCidr() {
        return cCidr;
    }

    public void setCCidr(String cCidr) {
        this.cCidr = cCidr;
    }

    public String getCGeometry() {
        return cGeometry;
    }

    public void setCGeometry(String cGeometry) {
        this.cGeometry = cGeometry;
    }

    public String getCJson() {
        return cJson;
    }

    public void setCJson(String cJson) {
        this.cJson = cJson;
    }

    public String getCJsonb() {
        return cJsonb;
    }

    public void setCJsonb(String cJsonb) {
        this.cJsonb = cJsonb;
    }
}