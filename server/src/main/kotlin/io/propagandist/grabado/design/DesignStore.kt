package io.propagandist.grabado.design

/**
 * 保存されている 1 件（段階5-4）。
 *
 * `data class` にしないのは、`ByteArray` の `equals` が参照比較で、生成される `equals` が
 * 直感に反するため（AssertJ の `isEqualTo` が黙って落ちる）。
 */
class Stored(val bytes: ByteArray, val etag: String)

/**
 * 設計ファイルの置き場。**HTTP を知らない。**
 *
 * 段階5-3 では READONLY の実現がこの interface の**差し替え**になっている
 * （[ReadOnlyDesignStore] が `save` で例外を投げる delegate）—— 禁止を「禁止したいもの」の
 * 直上に置くため。フィルタや各ハンドラの `if` にすると「守るべき経路の一覧」を人が
 * 維持することになる。
 */
interface DesignStore {

    /**
     * 設計の名前を返す。
     *
     * 並びは**昇順で固定**する。php-file が使っていた `glob` は fs 順＝未規定だったので、
     * 昇順にしても実測契約には反しない。実行のたびに並びが変わるのは公開プロダクトとして
     * 良くない（CLAUDE.md 制約3 の価値観）。
     *
     * `.` で始まる名前と `.json` 以外は返さない（段階5-2）。正本ディレクトリは README や
     * .gitattributes と同居しうるので、設計として扱うものを絞る。
     *
     * （注: Kotlin はブロックコメントがネストするので、KDoc に glob のパターンを
     * そのまま書けない —— スラッシュとアスタリスクの並びがコメント開始として読まれる。）
     */
    fun list(): List<String>

    /** 保存されているバイト列と ETag。無ければ `null`（＝ HTTP 404）。 */
    fun load(name: DesignName): Stored?

    /**
     * バイト列をそのまま書く。**内容は一切解釈しない**（実測契約。round-trip の
     * バイト一致は §0 実測で確認済み）。
     *
     * 条件ヘッダが与えられていれば、**「読む → 比べる → 書く」を 1 つのロックで囲んで**
     * 評価する。囲まないと 412 は「たいてい正しい」だけの機能になり、
     * `docs/ARCHITECTURE.md` §4.3 が「TOCTOU の窓を閉じる」と書いた目的を果たさない。
     *
     * @param ifMatch `If-Match` ヘッダ（未指定は `null`）
     * @param ifNoneMatch `If-None-Match` ヘッダ（未指定は `null`）
     * @return 書いた内容の ETag
     * @throws PreconditionFailedException 条件を満たさなかった（HTTP 412）
     */
    fun save(name: DesignName, bytes: ByteArray, ifMatch: String? = null, ifNoneMatch: String? = null): String
}

/**
 * 条件付き更新の前提が崩れていた（HTTP **412**）。
 *
 * ★ **412 は `js/io.ts` の `check()` に通さない。** フロントが握って confirm に流す
 * （プリフライトの 404 を `check()` に通さないのと同じ理屈）——「衝突したので上書きするか？」は
 * エラー表示ではなく分岐だから。
 */
class PreconditionFailedException : RuntimeException("条件付き更新の前提が崩れている（If-Match / If-None-Match）")
