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
import java.time.LocalDateTime;
import java.time.OffsetDateTime;

@Entity
@Table(name = "type_samples")
public class TypeSample {
    @Id
    @Column(name = "c_number")
    private BigDecimal cNumber;

    @Column(name = "c_integer", nullable = true)
    private Long cInteger;

    @Column(name = "c_decimal", nullable = true)
    private BigDecimal cDecimal;

    @Column(name = "c_float", nullable = true)
    private Double cFloat;

    @Column(name = "c_binary_float", nullable = true)
    private Float cBinaryFloat;

    @Column(name = "c_binary_double", nullable = true)
    private Double cBinaryDouble;

    @Column(name = "c_char", nullable = true, length = 10)
    private String cChar;

    @Column(name = "c_varchar2", nullable = true, length = 255)
    private String cVarchar2;

    @Column(name = "c_nchar", nullable = true, length = 10)
    private String cNchar;

    @Column(name = "c_nvarchar2", nullable = true, length = 255)
    private String cNvarchar2;

    @Column(name = "c_clob", nullable = true)
    private String cClob;

    @Column(name = "c_nclob", nullable = true)
    private String cNclob;

    @Column(name = "c_boolean", nullable = true)
    private Boolean cBoolean;

    @Column(name = "c_date", nullable = true)
    private LocalDateTime cDate;

    @Column(name = "c_timestamp", nullable = true)
    private LocalDateTime cTimestamp;

    @Column(name = "c_timestamp_tz", nullable = true)
    private OffsetDateTime cTimestampTz;

    @Column(name = "c_interval_ym", nullable = true)
    /* interval: JPA の標準に対応する型が無いので String で出す（INTERVAL YEAR TO MONTH） */
    private String cIntervalYm;

    @Column(name = "c_interval_ds", nullable = true)
    /* interval: JPA の標準に対応する型が無いので String で出す（INTERVAL DAY TO SECOND） */
    private String cIntervalDs;

    @Column(name = "c_raw", nullable = true)
    private byte[] cRaw;

    @Column(name = "c_blob", nullable = true)
    private byte[] cBlob;

    @Column(name = "c_json", nullable = true)
    /* json: JPA の標準に対応する型が無いので String で出す（JSON） */
    private String cJson;

    @Column(name = "c_xml", nullable = true)
    /* xml: JPA の標準に対応する型が無いので String で出す（XMLTYPE） */
    private String cXml;

    @Column(name = "c_rowid", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（ROWID） */
    private String cRowid;

    public BigDecimal getCNumber() {
        return cNumber;
    }

    public void setCNumber(BigDecimal cNumber) {
        this.cNumber = cNumber;
    }

    public Long getCInteger() {
        return cInteger;
    }

    public void setCInteger(Long cInteger) {
        this.cInteger = cInteger;
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

    public Float getCBinaryFloat() {
        return cBinaryFloat;
    }

    public void setCBinaryFloat(Float cBinaryFloat) {
        this.cBinaryFloat = cBinaryFloat;
    }

    public Double getCBinaryDouble() {
        return cBinaryDouble;
    }

    public void setCBinaryDouble(Double cBinaryDouble) {
        this.cBinaryDouble = cBinaryDouble;
    }

    public String getCChar() {
        return cChar;
    }

    public void setCChar(String cChar) {
        this.cChar = cChar;
    }

    public String getCVarchar2() {
        return cVarchar2;
    }

    public void setCVarchar2(String cVarchar2) {
        this.cVarchar2 = cVarchar2;
    }

    public String getCNchar() {
        return cNchar;
    }

    public void setCNchar(String cNchar) {
        this.cNchar = cNchar;
    }

    public String getCNvarchar2() {
        return cNvarchar2;
    }

    public void setCNvarchar2(String cNvarchar2) {
        this.cNvarchar2 = cNvarchar2;
    }

    public String getCClob() {
        return cClob;
    }

    public void setCClob(String cClob) {
        this.cClob = cClob;
    }

    public String getCNclob() {
        return cNclob;
    }

    public void setCNclob(String cNclob) {
        this.cNclob = cNclob;
    }

    public Boolean getCBoolean() {
        return cBoolean;
    }

    public void setCBoolean(Boolean cBoolean) {
        this.cBoolean = cBoolean;
    }

    public LocalDateTime getCDate() {
        return cDate;
    }

    public void setCDate(LocalDateTime cDate) {
        this.cDate = cDate;
    }

    public LocalDateTime getCTimestamp() {
        return cTimestamp;
    }

    public void setCTimestamp(LocalDateTime cTimestamp) {
        this.cTimestamp = cTimestamp;
    }

    public OffsetDateTime getCTimestampTz() {
        return cTimestampTz;
    }

    public void setCTimestampTz(OffsetDateTime cTimestampTz) {
        this.cTimestampTz = cTimestampTz;
    }

    public String getCIntervalYm() {
        return cIntervalYm;
    }

    public void setCIntervalYm(String cIntervalYm) {
        this.cIntervalYm = cIntervalYm;
    }

    public String getCIntervalDs() {
        return cIntervalDs;
    }

    public void setCIntervalDs(String cIntervalDs) {
        this.cIntervalDs = cIntervalDs;
    }

    public byte[] getCRaw() {
        return cRaw;
    }

    public void setCRaw(byte[] cRaw) {
        this.cRaw = cRaw;
    }

    public byte[] getCBlob() {
        return cBlob;
    }

    public void setCBlob(byte[] cBlob) {
        this.cBlob = cBlob;
    }

    public String getCJson() {
        return cJson;
    }

    public void setCJson(String cJson) {
        this.cJson = cJson;
    }

    public String getCXml() {
        return cXml;
    }

    public void setCXml(String cXml) {
        this.cXml = cXml;
    }

    public String getCRowid() {
        return cRowid;
    }

    public void setCRowid(String cRowid) {
        this.cRowid = cRowid;
    }
}