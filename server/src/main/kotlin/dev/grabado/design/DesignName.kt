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
 * ## 規則（段階5-1b で 2 つ、5-2 で 4 つ）
 *
 * どれもフロントには届かない —— `js/io.ts` の `jsonKeyword()` が必ず `.json` を付け、
 * 設計名にパス区切りや制御文字が入る UI 経路が無いため。**UI から見た挙動は変わらない**が、
 * 公開 API としては塞いでおく（正本ディレクトリはユーザーの git repo そのもの）。
 *
 * @see docs/ARCHITECTURE.md §4.3（実測）/ §7.1（到達点）
 */
@JvmInline
value class DesignName private constructor(val value: String) {

    override fun toString(): String = value

    companion object {
        /** パス区切り。どちらか 1 文字でも含んでいたら正本ディレクトリの外を指しうる。 */
        private const val PATH_SEPARATORS = "/\\"

        /** 設計ファイルの拡張子。判定は**大小無視**（`jsonKeyword()` は `.JSON` を二重付与しない）。 */
        private const val EXTENSION = ".json"

        /** ext4 / NTFS のファイル名上限。超えると `IOException` が 500 になるので手前で弾く。 */
        private const val MAX_NAME_BYTES = 255

        /**
         * Windows の予約デバイス名。拡張子を付けても予約のままなので、`CON.json` も作れない。
         * 開発機が Windows でも動かすための規則（`FileDesignStore` が OS 依存の例外で
         * 500 を返すのを防ぐ）。
         */
        private val WINDOWS_RESERVED: Set<String> = buildSet {
            addAll(listOf("CON", "PRN", "AUX", "NUL"))
            for (i in 1..9) {
                add("COM$i")
                add("LPT$i")
            }
        }

        /**
         * クエリの `keyword` を検証する。
         *
         * @throws InvalidDesignNameException [NameRejection] のいずれかに当たった場合（すべて HTTP 400）
         */
        fun parse(raw: String?): DesignName {
            if (raw.isNullOrBlank()) {
                // php-file は 200 + PHP の Fatal error 本文を返していた（実測）。
                // 移植先では 400（ARCHITECTURE §4.3 の申し送り）。
                throw InvalidDesignNameException(NameRejection.MISSING)
            }
            if (raw.any { it in PATH_SEPARATORS }) {
                throw InvalidDesignNameException(NameRejection.TRAVERSAL)
            }
            if (raw == "." || raw.startsWith("..")) {
                throw InvalidDesignNameException(NameRejection.TRAVERSAL)
            }
            // NUL もここに含まれる。ファイル名に制御文字が要る正当な理由は無い。
            if (raw.any { it.isISOControl() }) {
                throw InvalidDesignNameException(NameRejection.CONTROL_CHARACTER)
            }
            if (!raw.endsWith(EXTENSION, ignoreCase = true)) {
                throw InvalidDesignNameException(NameRejection.NOT_JSON)
            }
            if (raw.toByteArray(Charsets.UTF_8).size > MAX_NAME_BYTES) {
                throw InvalidDesignNameException(NameRejection.TOO_LONG)
            }
            if (raw.dropLast(EXTENSION.length).uppercase() in WINDOWS_RESERVED) {
                throw InvalidDesignNameException(NameRejection.WINDOWS_RESERVED)
            }
            return DesignName(raw)
        }
    }
}

/** [DesignName.parse] が拒んだ理由。どれも HTTP 400 に写る。 */
enum class NameRejection {
    /** `keyword` が無い / 空 / 空白のみ。 */
    MISSING,

    /** パス区切りを含む、または `..` で始まる。正本ディレクトリの外を指しうる。 */
    TRAVERSAL,

    /** 制御文字（NUL を含む）を含む。段階5-2。 */
    CONTROL_CHARACTER,

    /** `.json` で終わらない。正本ディレクトリに設計以外を作らせない。段階5-2。 */
    NOT_JSON,

    /** UTF-8 で 255 バイトを超える。ファイルシステムの上限。段階5-2。 */
    TOO_LONG,

    /** Windows の予約デバイス名（`CON.json` など）。段階5-2。 */
    WINDOWS_RESERVED,
}

/** `keyword` が受け取れない形だった。[dev.grabado.api.ApiExceptionHandler] が 400 に写す。 */
class InvalidDesignNameException(val reason: NameRejection) :
    RuntimeException("keyword を受け取れない: $reason")
