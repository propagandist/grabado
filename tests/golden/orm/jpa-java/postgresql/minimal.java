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

/* ==== Thing.java ==== */

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "things")
public class Thing {
    @Column(name = "id", nullable = false)
    private Integer id;

    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }
}