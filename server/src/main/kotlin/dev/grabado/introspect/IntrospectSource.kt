package dev.grabado.introspect

/**
 * introspection の接続先 1 件（段階5-7a）。**env に列挙したものしか使えない。**
 *
 * ## SSRF を「対策」ではなく「不可能」にする
 *
 * `?action=import&database=<name>` の `<name>` が選ぶのは**この表のキーだけ**で、
 * **ホスト名はクライアントから 1 バイトも渡らない**。リクエストで JDBC URL を受ける形は
 * 完全な SSRF プリミティブなので採らない。
 *
 * 公開デモを READONLY 一択にした理由（2026-08-15）は「introspection が任意ホストへ接続を
 * 試みる」ことだったが、この形なら**その前提自体が消える** —— READONLY での無効化は
 * 二重の安全になる。
 *
 * 思想は org `security-baseline.md` §3.1「識別子は列挙した定数からしか選ばない」・
 * §3.11「公開するパスは列挙する」と同じ。同規約に SSRF の項目は無い（規約の穴）ので、
 * **「外部入力をコネクション文字列にしない」を grabado 側の決定として台帳に置いた**。
 *
 * ## 資格情報の扱い
 *
 * `toString()` を**上書きしてある** —— data class の既定はプロパティを全部出すので、
 * ログや例外メッセージに**パスワードと JDBC URL が載る**（org §4.1 / §4.5 / §5.2）。
 */
data class IntrospectSource(
    val url: String,
    val user: String,
    val password: String,
    val schema: String = "public",
) {
    override fun toString(): String = "IntrospectSource(schema=$schema)"
}
