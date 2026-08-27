package io.propagandist.grabado.design

import java.security.MessageDigest

/**
 * 内容から ETag を作り、条件ヘッダと突き合わせる（段階5-4）。**純粋。**
 *
 * ## なぜ mtime ではなく内容ハッシュなのか
 *
 * **正本は git 管理のファイル**（CLAUDE.md 制約2）。`git checkout` / `git pull` は
 * **内容が同じでも mtime を書き換える**ので、mtime ベースの弱 ETag だと
 * **ブランチを切り替えるたびに全ファイルが偽の 412 を出す**。
 * 「内容が同じなら同じ ETag」だけが git 正本と噛み合う。
 *
 * SHA-256 を選ぶのは速度ではなく**説明コスト** —— MD5 / SHA-1 は CVE スキャナと社内基準で
 * 毎回説明が要る。ヘッダに載せるので hex は先頭 16 バイト（128 bit）に切り詰める。
 */
object ETags {

    private const val BYTES = 16

    /** strong ETag（引用符込み）。同じバイト列なら必ず同じ値になる。 */
    fun of(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        val hex = buildString(BYTES * 2) {
            for (i in 0 until BYTES) {
                append("%02x".format(digest[i]))
            }
        }
        return "\"$hex\""
    }

    /**
     * `If-Match` を評価する。
     *
     * - `*` … 「存在すれば無条件で上書き」（RFC 9110）。意図的に上書きしたい CLI 利用者の逃げ道
     * - それ以外 … 現在の ETag と完全一致するか
     *
     * @param current 現在の ETag。対象が存在しなければ `null`
     */
    fun ifMatchSatisfied(header: String, current: String?): Boolean =
        if (header.trim() == "*") current != null else current != null && header.trim() == current

    /**
     * `If-None-Match: *` を評価する。フロントが「新規のつもり」で送る形で、**対象が
     * 実在したら偽**（＝ 412）。実在したことを知ったフロントは load し直して confirm に流す。
     */
    fun ifNoneMatchSatisfied(header: String, current: String?): Boolean =
        if (header.trim() == "*") current == null else header.trim() != current
}
