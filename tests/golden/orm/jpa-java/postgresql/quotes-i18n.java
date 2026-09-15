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

/* ==== 顧客.java ==== */

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 顧客マスタ。'仮登録' の状態も含む */
@Entity
@Table(name = "顧客")
public class 顧客 {
    @Id
    @Column(name = "id")
    private Integer id;

    /** 姓と名は分けない */
    @Column(name = "氏名", nullable = false)
    private String 氏名;

    /** 識別子に " が入る場合の属性エスケープ確認 */
    @Column(name = "say \"hi\"", nullable = true)
    private String say__hi_;

    /** 顧客の'愛称'をここに書く */
    @Column(name = "メモ", nullable = true)
    private String メモ;

    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String get氏名() {
        return 氏名;
    }

    public void set氏名(String 氏名) {
        this.氏名 = 氏名;
    }

    public String getSay__hi_() {
        return say__hi_;
    }

    public void setSay__hi_(String say__hi_) {
        this.say__hi_ = say__hi_;
    }

    public String getメモ() {
        return メモ;
    }

    public void setメモ(String メモ) {
        this.メモ = メモ;
    }
}