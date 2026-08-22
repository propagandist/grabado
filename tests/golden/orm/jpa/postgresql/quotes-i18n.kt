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

/** 顧客マスタ。'仮登録' の状態も含む */
@Entity
@Table(name = "顧客")
class 顧客(
    @Id
    @Column(name = "id")
    var id: Int,

    /** 姓と名は分けない */
    @Column(name = "氏名", nullable = false)
    var 氏名: String,

    /** 識別子に " が入る場合の属性エスケープ確認 */
    @Column(name = "say \"hi\"", nullable = true)
    var `say "hi"`: String? = null,

    /** 顧客の'愛称'をここに書く */
    @Column(name = "メモ", nullable = true)
    var メモ: String? = null,
)