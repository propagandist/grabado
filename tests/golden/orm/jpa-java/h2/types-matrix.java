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

    @Column(name = "c_tinyint", nullable = true)
    private Short cTinyint;

    @Column(name = "c_bigint", nullable = true)
    private Long cBigint;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "c_bigint_identity")
    private Long cBigintIdentity;

    @Column(name = "c_decimal", nullable = true)
    private BigDecimal cDecimal;

    @Column(name = "c_float", nullable = true)
    private Float cFloat;

    @Column(name = "c_double", nullable = true)
    private Double cDouble;

    @Column(name = "c_decfloat", nullable = true)
    private BigDecimal cDecfloat;

    @Column(name = "c_char", nullable = true, length = 10)
    private String cChar;

    @Column(name = "c_varchar", nullable = true, length = 255)
    private String cVarchar;

    @Column(name = "c_text", nullable = true)
    private String cText;

    @Column(name = "c_bytea", nullable = true)
    private byte[] cBytea;

    @Column(name = "c_varbinary", nullable = true)
    private byte[] cVarbinary;

    @Column(name = "c_boolean", nullable = true)
    private Boolean cBoolean;

    @Column(name = "c_date", nullable = true)
    private LocalDate cDate;

    @Column(name = "c_time", nullable = true)
    private LocalTime cTime;

    @Column(name = "c_time_tz", nullable = true)
    private OffsetTime cTimeTz;

    @Column(name = "c_timestamp_tz", nullable = true)
    private OffsetDateTime cTimestampTz;

    @Column(name = "c_uuid", nullable = true)
    private UUID cUuid;

    @Column(name = "c_json", nullable = true)
    /* json: JPA の標準に対応する型が無いので String で出す（JSON） */
    private String cJson;

    @Column(name = "c_geometry", nullable = true)
    /* geometry: JPA の標準に対応する型が無いので String で出す（GEOMETRY） */
    private String cGeometry;

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

    public Short getCTinyint() {
        return cTinyint;
    }

    public void setCTinyint(Short cTinyint) {
        this.cTinyint = cTinyint;
    }

    public Long getCBigint() {
        return cBigint;
    }

    public void setCBigint(Long cBigint) {
        this.cBigint = cBigint;
    }

    public Long getCBigintIdentity() {
        return cBigintIdentity;
    }

    public void setCBigintIdentity(Long cBigintIdentity) {
        this.cBigintIdentity = cBigintIdentity;
    }

    public BigDecimal getCDecimal() {
        return cDecimal;
    }

    public void setCDecimal(BigDecimal cDecimal) {
        this.cDecimal = cDecimal;
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

    public BigDecimal getCDecfloat() {
        return cDecfloat;
    }

    public void setCDecfloat(BigDecimal cDecfloat) {
        this.cDecfloat = cDecfloat;
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

    public byte[] getCVarbinary() {
        return cVarbinary;
    }

    public void setCVarbinary(byte[] cVarbinary) {
        this.cVarbinary = cVarbinary;
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

    public OffsetDateTime getCTimestampTz() {
        return cTimestampTz;
    }

    public void setCTimestampTz(OffsetDateTime cTimestampTz) {
        this.cTimestampTz = cTimestampTz;
    }

    public UUID getCUuid() {
        return cUuid;
    }

    public void setCUuid(UUID cUuid) {
        this.cUuid = cUuid;
    }

    public String getCJson() {
        return cJson;
    }

    public void setCJson(String cJson) {
        this.cJson = cJson;
    }

    public String getCGeometry() {
        return cGeometry;
    }

    public void setCGeometry(String cGeometry) {
        this.cGeometry = cGeometry;
    }
}