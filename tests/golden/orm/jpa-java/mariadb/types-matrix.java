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
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
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

    @Column(name = "c_mediumint", nullable = true)
    private Integer cMediumint;

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

    @Column(name = "c_char", nullable = true, length = 10)
    private String cChar;

    @Column(name = "c_varchar", nullable = true, length = 255)
    private String cVarchar;

    @Column(name = "c_text", nullable = true)
    private String cText;

    @Column(name = "c_bytea", nullable = true)
    private byte[] cBytea;

    @Column(name = "c_binary", nullable = true)
    private byte[] cBinary;

    @Column(name = "c_varbinary", nullable = true)
    private byte[] cVarbinary;

    @Column(name = "c_boolean", nullable = true)
    private Boolean cBoolean;

    @Column(name = "c_date", nullable = true)
    private LocalDate cDate;

    @Column(name = "c_time", nullable = true)
    private LocalTime cTime;

    @Column(name = "c_datetime", nullable = true)
    private LocalDateTime cDatetime;

    @Column(name = "c_timestamp", nullable = true)
    private OffsetDateTime cTimestamp;

    @Column(name = "c_year", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（YEAR） */
    private String cYear;

    @Column(name = "c_uuid", nullable = true)
    private UUID cUuid;

    @Column(name = "c_inet4", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（INET4） */
    private String cInet4;

    @Column(name = "c_inet6", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（INET6） */
    private String cInet6;

    @Column(name = "c_json", nullable = true)
    /* json: JPA の標準に対応する型が無いので String で出す（JSON） */
    private String cJson;

    @Column(name = "c_enum", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（ENUM('draft','published')） */
    private String cEnum;

    @Column(name = "c_set", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（SET('a','b')） */
    private String cSet;

    @Column(name = "c_bit", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（BIT(8)） */
    private String cBit;

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

    public Integer getCMediumint() {
        return cMediumint;
    }

    public void setCMediumint(Integer cMediumint) {
        this.cMediumint = cMediumint;
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

    public byte[] getCBinary() {
        return cBinary;
    }

    public void setCBinary(byte[] cBinary) {
        this.cBinary = cBinary;
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

    public LocalDateTime getCDatetime() {
        return cDatetime;
    }

    public void setCDatetime(LocalDateTime cDatetime) {
        this.cDatetime = cDatetime;
    }

    public OffsetDateTime getCTimestamp() {
        return cTimestamp;
    }

    public void setCTimestamp(OffsetDateTime cTimestamp) {
        this.cTimestamp = cTimestamp;
    }

    public String getCYear() {
        return cYear;
    }

    public void setCYear(String cYear) {
        this.cYear = cYear;
    }

    public UUID getCUuid() {
        return cUuid;
    }

    public void setCUuid(UUID cUuid) {
        this.cUuid = cUuid;
    }

    public String getCInet4() {
        return cInet4;
    }

    public void setCInet4(String cInet4) {
        this.cInet4 = cInet4;
    }

    public String getCInet6() {
        return cInet6;
    }

    public void setCInet6(String cInet6) {
        this.cInet6 = cInet6;
    }

    public String getCJson() {
        return cJson;
    }

    public void setCJson(String cJson) {
        this.cJson = cJson;
    }

    public String getCEnum() {
        return cEnum;
    }

    public void setCEnum(String cEnum) {
        this.cEnum = cEnum;
    }

    public String getCSet() {
        return cSet;
    }

    public void setCSet(String cSet) {
        this.cSet = cSet;
    }

    public String getCBit() {
        return cBit;
    }

    public void setCBit(String cBit) {
        this.cBit = cBit;
    }
}