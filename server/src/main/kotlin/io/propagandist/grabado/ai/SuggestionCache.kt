package io.propagandist.grabado.ai

import tools.jackson.databind.JsonNode
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.time.Instant

/**
 * 送ったバイト列 → 提案の結果キャッシュ（段階11-2a。`docs/ARCHITECTURE.md` §8.5）。
 *
 * **プロセス内メモリのみ。再起動で消えてよい**（DB レス既定＝ CLAUDE.md 制約5）。
 *
 * ★ **これが成立するのは serializer が決定論だから**（制約3）。同じ設計からは同じバイト列が
 *   出るので、ハッシュが安定する。§4 の決定論が効く 2 つ目の場所で、1 つ目は 5-4 の ETag。
 *
 * ★ **鍵は送られてきた生バイトのハッシュで、正規化しない。** 正規化すると「同じ意味だが
 *   バイト列が違う入力」も当たるようになるが、その正規化規則がフロントの構築器（11-3）と
 *   ずれた瞬間に**別の設計へ別の提案を返す**——キャッシュの誤ヒットは、外から見て
 *   AI が壊れたのと区別がつかない。当たらない方に倒す。
 *
 * @param maxEntries 上限件数。超えたら**最も長く触られていないもの**から捨てる
 * @param ttl 寿命。設計を直して測り直す間隔より短くする
 * @param clock TTL の判定に使う。テストが時間を進めるために外から渡す
 */
class SuggestionCache(
    private val maxEntries: Int,
    private val ttl: Duration,
    private val clock: Clock = Clock.systemUTC(),
) {

    private data class Entry(val stored: Instant, val suggestions: List<JsonNode>)

    /*
     * accessOrder = true で LRU になる（get も順序を動かす）。removeEldestEntry で上限を保つ。
     * 素の LinkedHashMap を synchronized で包むのは、要る操作が put / get の 2 つだけで、
     * 依存を 1 つも増やさずに済むため。
     */
    private val entries = object : LinkedHashMap<String, Entry>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Entry>): Boolean =
            size > maxEntries
    }

    /** 期限切れなら null（そのとき掃除もする）。 */
    @Synchronized
    fun get(key: String): List<JsonNode>? {
        val entry = entries[key] ?: return null
        if (Duration.between(entry.stored, clock.instant()) > ttl) {
            entries.remove(key)
            return null
        }
        return entry.suggestions
    }

    @Synchronized
    fun put(key: String, suggestions: List<JsonNode>) {
        entries[key] = Entry(clock.instant(), suggestions)
    }

    /** 現在の件数（テストと運用の目視のため）。 */
    @Synchronized
    fun size(): Int = entries.size

    companion object {
        /** 送るバイト列の SHA-256（16 進小文字）。 */
        fun keyOf(body: ByteArray): String =
            MessageDigest.getInstance("SHA-256").digest(body)
                .joinToString("") { byte -> "%02x".format(byte) }
    }
}
