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
    @Id
    @Column(name = "c_integer")
    private Integer cInteger;

    @Column(name = "c_smallint", nullable = true)
    private Short cSmallint;

    @Column(name = "c_tinyint", nullable = true)
    private Short cTinyint;

    @Column(name = "c_bigint", nullable = true)
    private Long cBigint;

    @Column(name = "c_decimal", nullable = true)
    private BigDecimal cDecimal;

    @Column(name = "c_float", nullable = true)
    private Double cFloat;

    @Column(name = "c_real", nullable = true)
    private Float cReal;

    @Column(name = "c_char", nullable = true, length = 10)
    private String cChar;

    @Column(name = "c_varchar", nullable = true, length = 255)
    private String cVarchar;

    @Column(name = "c_nchar", nullable = true, length = 10)
    private String cNchar;

    @Column(name = "c_nvarchar", nullable = true, length = 255)
    private String cNvarchar;

    @Column(name = "c_boolean", nullable = true)
    private Boolean cBoolean;

    @Column(name = "c_binary", nullable = true)
    private byte[] cBinary;

    @Column(name = "c_varbinary", nullable = true)
    private byte[] cVarbinary;

    @Column(name = "c_date", nullable = true)
    private LocalDate cDate;

    @Column(name = "c_time", nullable = true)
    private LocalTime cTime;

    @Column(name = "c_datetime", nullable = true)
    private LocalDateTime cDatetime;

    @Column(name = "c_datetime2", nullable = true)
    private LocalDateTime cDatetime2;

    @Column(name = "c_datetimeoffset", nullable = true)
    private OffsetDateTime cDatetimeoffset;

    @Column(name = "c_smalldatetime", nullable = true)
    private LocalDateTime cSmalldatetime;

    @Column(name = "c_uuid", nullable = true)
    private UUID cUuid;

    @Column(name = "c_xml", nullable = true)
    /* xml: JPA の標準に対応する型が無いので String で出す（xml） */
    private String cXml;

    @Column(name = "c_sql_variant", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（sql_variant） */
    private String cSqlVariant;

    @Column(name = "c_rowversion", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（rowversion） */
    private String cRowversion;

    @Column(name = "c_hierarchyid", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（hierarchyid） */
    private String cHierarchyid;

    @Column(name = "c_geometry", nullable = true)
    /* geometry: JPA の標準に対応する型が無いので String で出す（geometry） */
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

    public BigDecimal getCDecimal() {
        return cDecimal;
    }

    public void setCDecimal(BigDecimal cDecimal) {
        this.cDecimal = cDecimal;
    }

    public Double getCFloat() {
        return cFloat;
    }

    public void setCFloat(Double cFloat) {
        this.cFloat = cFloat;
    }

    public Float getCReal() {
        return cReal;
    }

    public void setCReal(Float cReal) {
        this.cReal = cReal;
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

    public String getCNchar() {
        return cNchar;
    }

    public void setCNchar(String cNchar) {
        this.cNchar = cNchar;
    }

    public String getCNvarchar() {
        return cNvarchar;
    }

    public void setCNvarchar(String cNvarchar) {
        this.cNvarchar = cNvarchar;
    }

    public Boolean getCBoolean() {
        return cBoolean;
    }

    public void setCBoolean(Boolean cBoolean) {
        this.cBoolean = cBoolean;
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

    public LocalDateTime getCDatetime2() {
        return cDatetime2;
    }

    public void setCDatetime2(LocalDateTime cDatetime2) {
        this.cDatetime2 = cDatetime2;
    }

    public OffsetDateTime getCDatetimeoffset() {
        return cDatetimeoffset;
    }

    public void setCDatetimeoffset(OffsetDateTime cDatetimeoffset) {
        this.cDatetimeoffset = cDatetimeoffset;
    }

    public LocalDateTime getCSmalldatetime() {
        return cSmalldatetime;
    }

    public void setCSmalldatetime(LocalDateTime cSmalldatetime) {
        this.cSmalldatetime = cSmalldatetime;
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

    public String getCSqlVariant() {
        return cSqlVariant;
    }

    public void setCSqlVariant(String cSqlVariant) {
        this.cSqlVariant = cSqlVariant;
    }

    public String getCRowversion() {
        return cRowversion;
    }

    public void setCRowversion(String cRowversion) {
        this.cRowversion = cRowversion;
    }

    public String getCHierarchyid() {
        return cHierarchyid;
    }

    public void setCHierarchyid(String cHierarchyid) {
        this.cHierarchyid = cHierarchyid;
    }

    public String getCGeometry() {
        return cGeometry;
    }

    public void setCGeometry(String cGeometry) {
        this.cGeometry = cGeometry;
    }
}