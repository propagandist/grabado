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

@Entity
@Table(name = "type_samples")
public class TypeSample {
    @Id
    @Column(name = "c_integer")
    private Long cInteger;

    @Column(name = "c_real", nullable = true)
    private Double cReal;

    @Column(name = "c_text", nullable = true)
    private String cText;

    @Column(name = "c_blob", nullable = true)
    private byte[] cBlob;

    @Column(name = "c_any", nullable = true)
    /* other: JPA の標準に対応する型が無いので String で出す（ANY） */
    private String cAny;

    public Long getCInteger() {
        return cInteger;
    }

    public void setCInteger(Long cInteger) {
        this.cInteger = cInteger;
    }

    public Double getCReal() {
        return cReal;
    }

    public void setCReal(Double cReal) {
        this.cReal = cReal;
    }

    public String getCText() {
        return cText;
    }

    public void setCText(String cText) {
        this.cText = cText;
    }

    public byte[] getCBlob() {
        return cBlob;
    }

    public void setCBlob(byte[] cBlob) {
        this.cBlob = cBlob;
    }

    public String getCAny() {
        return cAny;
    }

    public void setCAny(String cAny) {
        this.cAny = cAny;
    }
}