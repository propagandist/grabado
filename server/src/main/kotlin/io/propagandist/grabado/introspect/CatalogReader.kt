package io.propagandist.grabado.introspect

/**
 * 方言ごとのカタログ読み取り（段階5-8a）。
 *
 * 5-7a は PostgreSQL 専用の 1 本だったが、対応 DB を広げるにあたって interface にした。
 * **[CatalogSnapshot] という共通の形に詰める**ところまでが実装の責務で、そこから先
 * （[IntrospectionMapper]）は方言を知らない。
 *
 * ## 方言差は「カタログの引き方」に閉じている
 *
 * 実測で分かった差（段階5-8a）:
 *
 * | | PostgreSQL 18 | MySQL 8.4 |
 * |---|---|---|
 * | NOT NULL の CHECK | **16 件出る**（`<table>_<col>_not_null`） | **0 件**（PG 固有の挙動だった） |
 * | index | `pg_index` ＋ `pg_constraint.conindid` で除外 | `information_schema.statistics`。**PK / UNIQUE も出る**ので制約名で除外 |
 * | FK | `pg_constraint` の `conkey` / `confkey` | `key_column_usage.referenced_table_name` |
 * | 配列の要素型 | `information_schema.element_types` | **配列型が無い** |
 *
 * どちらも **allowlist で制約を引き、index は「制約が持つもの」を除外する**という
 * 構造は同じ —— 5-7a で `break` を捨てて集合として扱う形にしたのが、方言が増えても効いている。
 */
interface CatalogReader {

    /** この Reader が扱う JDBC URL か。`jdbc:postgresql:` のような接頭辞で見る。 */
    fun supports(url: String): Boolean

    /** [CatalogSnapshot] の `dialect` に入る値（`postgresql` / `mysql`）。 */
    val dialect: String

    fun read(source: IntrospectSource): CatalogSnapshot

    companion object {
        /**
         * URL から Reader を選ぶ。
         *
         * @throws UnsupportedDialectException 対応していない JDBC URL
         */
        fun forUrl(url: String, readers: List<CatalogReader>): CatalogReader =
            readers.firstOrNull { it.supports(url) } ?: throw UnsupportedDialectException()
    }
}

/**
 * 対応していない JDBC URL（段階5-8a）。**HTTP 503**（`IntrospectionFailedException` 経由）。
 *
 * env の設定ミスなので運用の問題だが、クライアントに詳細を返さない ——
 * 「どの方言に対応しているか」は探索の手がかりになりうる。
 */
class UnsupportedDialectException : RuntimeException("対応していない JDBC URL")
