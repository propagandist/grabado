package dev.grabado.design

/**
 * 検証済みの設計ファイル名。**HTTP も java.nio も知らない純粋な値**。
 *
 * ## 現行 PHP との違い（意図した挙動変更）
 *
 * php-file は `basename($keyword)` でファイル名を作っていた。つまり `../../x` を渡すと
 * **黙って `x` に書き換えて保存する**。これは採らない —— 書き換えるとユーザーが指定した
 * 名前と実際に書かれるファイル名がずれ、`js/io/conflict.ts` の `Baseline.name` が
 * **別のファイルを見張る**ことになる（段階4-6 の外部変更検知が壊れる）。**400 で拒む。**
 *
 * どちらの実装でも「正本ディレクトリの外には書けない」点は同じなので、安全性は落ちていない。
 * 変わるのは「黙って直すか、断るか」だけ。
 *
 * ## 段階5-1b で入れる規則はこの 2 つだけ
 *
 * `.json` の強制（大小無視）・制御文字全般・Windows 予約名・255 バイト超は **5-2**。
 * ここで先に入れないのは、5-1b の完了条件が「既存 601 本が 1 本も動かずに緑」だから
 * ——**規則を足すたびに、それがフロントに届くかどうかを 1 段階ずつ確かめる**。
 *
 * @see docs/ARCHITECTURE.md §4.3（実測）/ §7.1（到達点）
 */
@JvmInline
value class DesignName private constructor(val value: String) {

    override fun toString(): String = value

    companion object {
        /** パス区切りと NUL。どれか 1 文字でも含んでいたら正本ディレクトリの外を指しうる。 */
        private const val PATH_SEPARATORS = "/\\"

        /**
         * クエリの `keyword` を検証する。
         *
         * @throws InvalidDesignNameException 空・未指定・パス区切りや NUL を含む・`..` で始まる場合
         */
        fun parse(raw: String?): DesignName {
            if (raw.isNullOrBlank()) {
                // php-file は 200 + PHP の Fatal error 本文を返していた（実測）。
                // 移植先では 400（ARCHITECTURE §4.3 の申し送り）。
                throw InvalidDesignNameException(NameRejection.MISSING)
            }
            if (raw.any { it in PATH_SEPARATORS || it.code == 0 }) {
                throw InvalidDesignNameException(NameRejection.TRAVERSAL)
            }
            if (raw == "." || raw.startsWith("..")) {
                throw InvalidDesignNameException(NameRejection.TRAVERSAL)
            }
            return DesignName(raw)
        }
    }
}

/** [DesignName.parse] が拒んだ理由。どれも HTTP 400 に写る。 */
enum class NameRejection {
    /** `keyword` が無い / 空 / 空白のみ。 */
    MISSING,

    /** パス区切り・NUL を含む、または `..` で始まる。正本ディレクトリの外を指しうる。 */
    TRAVERSAL,
}

/** `keyword` が受け取れない形だった。[dev.grabado.api.ApiExceptionHandler] が 400 に写す。 */
class InvalidDesignNameException(val reason: NameRejection) :
    RuntimeException("keyword を受け取れない: $reason")
