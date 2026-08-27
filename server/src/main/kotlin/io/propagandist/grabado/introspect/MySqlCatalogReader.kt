package io.propagandist.grabado.introspect

import io.propagandist.grabado.introspect.JdbcSupport.intOrNull
import java.sql.Connection

/**
 * MySQL / MariaDB のカタログを読む（段階5-8a）。
 *
 * ## PostgreSQL との差（実 MySQL 8.4 で確かめた）
 *
 * | | PostgreSQL 18 | MySQL 8.4 |
 * |---|---|---|
 * | NOT NULL の CHECK | **16 件出る** | **0 件** —— `docs/ARCHITECTURE.md` §4.6-1 は **PG 固有の挙動**だった |
 * | index | `pg_index` ＋ `pg_constraint.conindid` | `information_schema.statistics`。**PK / UNIQUE も出る** |
 * | FK | `pg_constraint` の `conkey` / `confkey` | `key_column_usage.referenced_table_name` |
 * | 配列 | `element_types` で要素型が引ける | **配列型が無い** |
 * | コメント | `obj_description` / `col_description` | `tables.table_comment` / `columns.column_comment` |
 *
 * **index の除外条件だけが方言差**で、構造（allowlist で制約を引き、制約が持つ index を
 * 除外する）は同じ。MySQL は制約名と index 名が一致するので `table_constraints` に
 * 同名があるかで判定する（PG の `conindid` に対応）。
 *
 * ## MariaDB も同じ経路で読む
 *
 * MariaDB は MySQL のプロトコルとカタログに互換で、`information_schema` の
 * 該当ビューはどちらも同じ形。**ドライバも MySQL Connector/J で繋がる**ので、
 * 専用の実装もドライバも足していない（[supports] が `jdbc:mariadb:` も受ける）。
 */
class MySqlCatalogReader : CatalogReader {

    override val dialect: String = "mysql"

    override fun supports(url: String): Boolean =
        url.startsWith("jdbc:mysql:") || url.startsWith("jdbc:mariadb:")

    override fun read(source: IntrospectSource): CatalogSnapshot =
        JdbcSupport.connect(source).use { connection ->
            /*
             * MySQL に「スキーマ」の階層は無く、**データベース名がスキーマ名**にあたる。
             * URL に含まれるデータベースを既定にしたいが、`IntrospectSource.schema` を
             * 明示してもらうほうが曖昧さが無い（既定 `public` は PG 向けなので、
             * MySQL では必ず設定させる）。
             */
            val schema = source.schema
            CatalogSnapshot(
                dialect = dialect,
                schema = schema,
                tables = readTables(connection, schema),
                columns = readColumns(connection, schema),
                constraints = readConstraints(connection, schema),
                foreignKeys = readForeignKeys(connection, schema),
                indexes = readIndexes(connection, schema),
            )
        }

    private fun readTables(connection: Connection, schema: String): List<CatalogTable> =
        JdbcSupport.query(
            connection,
            """
            SELECT table_name, table_comment
            FROM information_schema.tables
            WHERE table_schema = ? AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """.trimIndent(),
            schema,
        ) { rs ->
            /* MySQL はコメントが無いとき空文字を返す（PG は NULL）。形を揃える */
            CatalogTable(rs.getString("table_name"), rs.getString("table_comment").ifBlank { null })
        }

    private fun readColumns(connection: Connection, schema: String): List<CatalogColumn> =
        JdbcSupport.query(
            connection,
            """
            SELECT table_name, column_name, ordinal_position,
                   data_type, column_type,
                   numeric_precision, numeric_scale, character_maximum_length,
                   is_nullable, column_default, column_comment
            FROM information_schema.columns
            WHERE table_schema = ?
            ORDER BY table_name, ordinal_position
            """.trimIndent(),
            schema,
        ) { rs ->
            CatalogColumn(
                table = rs.getString("table_name"),
                name = rs.getString("column_name"),
                position = rs.getInt("ordinal_position"),
                dataType = rs.getString("data_type"),
                /*
                 * `column_type` は `char(36)` / `int unsigned` のような完全な形。
                 * PG の `udt_name`（`data_type` が型を隠すときの手がかり）とは役割が違うが、
                 * **より詳しい情報**という点で同じ枠に入れておく —— フロントの解決は
                 * `sqlType` を先に見るので、当たらなかったときの第 2 候補になる。
                 */
                udtName = rs.getString("column_type"),
                numericPrecision = rs.intOrNull("numeric_precision"),
                numericScale = rs.intOrNull("numeric_scale"),
                characterMaximumLength = rs.intOrNull("character_maximum_length"),
                /* MySQL に配列型は無い */
                elementType = null,
                nullable = rs.getString("is_nullable") == "YES",
                default = rs.getString("column_default"),
                comment = rs.getString("column_comment").ifBlank { null },
            )
        }

    private fun readConstraints(connection: Connection, schema: String): List<CatalogConstraintColumn> =
        JdbcSupport.query(
            connection,
            """
            SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
                   kcu.column_name, kcu.ordinal_position
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                   ON kcu.constraint_schema = tc.constraint_schema
                  AND kcu.constraint_name = tc.constraint_name
                  AND kcu.table_name = tc.table_name
            WHERE tc.table_schema = ?
              AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
            ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
            """.trimIndent(),
            schema,
        ) { rs ->
            CatalogConstraintColumn(
                table = rs.getString("table_name"),
                name = rs.getString("constraint_name"),
                type = if (rs.getString("constraint_type") == "PRIMARY KEY") "PRIMARY" else "UNIQUE",
                column = rs.getString("column_name"),
                position = rs.getInt("ordinal_position"),
            )
        }

    private fun readForeignKeys(connection: Connection, schema: String): List<CatalogForeignKey> =
        JdbcSupport.query(
            connection,
            """
            SELECT table_name, column_name,
                   referenced_table_name, referenced_column_name,
                   ordinal_position
            FROM information_schema.key_column_usage
            WHERE table_schema = ? AND referenced_table_name IS NOT NULL
            ORDER BY table_name, constraint_name, ordinal_position
            """.trimIndent(),
            schema,
        ) { rs ->
            CatalogForeignKey(
                table = rs.getString("table_name"),
                column = rs.getString("column_name"),
                referencedTable = rs.getString("referenced_table_name"),
                referencedColumn = rs.getString("referenced_column_name"),
                position = rs.getInt("ordinal_position"),
            )
        }

    /**
     * 制約が裏に持たない index だけを返す。
     *
     * MySQL は **PK も UNIQUE も `statistics` に出る**（PK は `PRIMARY` という名前）。
     * 制約名と index 名が一致するので `table_constraints` に同名があるかで判定する ——
     * PG の `pg_constraint.conindid` に対応する条件。
     */
    private fun readIndexes(connection: Connection, schema: String): List<CatalogIndexColumn> =
        JdbcSupport.query(
            connection,
            """
            SELECT s.table_name, s.index_name, s.non_unique, s.column_name, s.seq_in_index
            FROM information_schema.statistics s
            WHERE s.table_schema = ?
              AND NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints tc
                    WHERE tc.table_schema = s.table_schema
                      AND tc.table_name = s.table_name
                      AND tc.constraint_name = s.index_name
              )
            ORDER BY s.table_name, s.index_name, s.seq_in_index
            """.trimIndent(),
            schema,
        ) { rs ->
            CatalogIndexColumn(
                table = rs.getString("table_name"),
                name = rs.getString("index_name"),
                unique = rs.getInt("non_unique") == 0,
                column = rs.getString("column_name"),
                position = rs.getInt("seq_in_index"),
            )
        }
}
