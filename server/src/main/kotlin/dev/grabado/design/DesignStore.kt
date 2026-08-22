package dev.grabado.design

/**
 * 設計ファイルの置き場。**HTTP を知らない。**
 *
 * 段階5-4 で `load` は ETag を、`save` は `If-Match` を扱うように育つ。段階5-3 では
 * READONLY の実現がこの interface の**差し替え**になる（`ReadOnlyDesignStore` が
 * `save` で例外を投げる delegate）—— 禁止を「禁止したいもの」の直上に置くため。
 * フィルタや各ハンドラの `if` にすると「守るべき経路の一覧」を人が維持することになる。
 */
interface DesignStore {

    /**
     * 設計の名前を返す。
     *
     * 並びは**昇順で固定**する。php-file が使っていた `glob` は fs 順＝未規定だったので、
     * 昇順にしても実測契約には反しない。実行のたびに並びが変わるのは公開プロダクトとして
     * 良くない（CLAUDE.md 制約3 の価値観）。
     *
     * （注: Kotlin はブロックコメントがネストするので、KDoc に glob のパターンを
     * そのまま書けない —— スラッシュとアスタリスクの並びがコメント開始として読まれる。）
     *
     * `.` で始まる名前は返さない。PHP の `glob` も dotfile を返さないので挙動は同じで、
     * ついでに [save] の一時ファイルが見える窓も塞げる。
     */
    fun list(): List<String>

    /** 保存されているバイト列。無ければ `null`（＝ HTTP 404）。 */
    fun load(name: DesignName): ByteArray?

    /**
     * バイト列をそのまま書く。**内容は一切解釈しない**（実測契約。round-trip の
     * バイト一致は §0 実測で確認済み）。
     */
    fun save(name: DesignName, bytes: ByteArray)
}
