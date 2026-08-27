package io.propagandist.grabado.introspect

import io.propagandist.grabado.introspect.JdbcSupport.intOrNull
import java.sql.Connection
import java.sql.ResultSet

/**
 * PostgreSQL のカタログを読む（段階5-7a）。**分岐を持たない** ——
 * SELECT の結果を [CatalogSnapshot] に詰め替えるだけで、判断は [IntrospectionMapper] にある。
 *
 * ## コネクションプールを持たない
 *
 * introspection は**人が押したときだけ走る**低頻度・一発読み。プールを持つと外部 DB への
 * idle 接続を抱え続けることになり、可用性（相手 DB の再起動で全部腐る）と資格情報の
 * 露出時間の両方で損をする。
 *
 * 副次的に、**`spring-boot-starter-jdbc` を入れずに済む** —— HikariCP が classpath に
 * 無いので `spring.datasource.*` の auto-configuration が存在せず、
 * **DB レス既定（CLAUDE.md 制約5）が構造で保証される**。
 *
 * ## SQL は実 PG18 で確かめてから書いた
 *
 * 4 本とも `docs/samples/introspection-sample-schema.sql` を投入した PG18 で実行し、
 * 出力を目で確認している（段階5-7a の作業記録）。特に:
 *
 * - **CHECK を読まない**（`constraint_type IN ('PRIMARY KEY','UNIQUE')` の allowlist）——
 *   PG18 は NOT NULL を CHECK として出し、実測ではサンプル 3 テーブルで **16 件**あった
 * - **index は `NOT EXISTS (pg_constraint.conindid)` で除外**する —— 現行 PHP の `break` は
 *   PK の index に当たった時点でループごと抜けており、index が 1 つも出なかった
 * - **FK は `pg_constraint` の `conkey` / `confkey` を `unnest ... WITH ORDINALITY`** で引く。
 *   `information_schema.constraint_column_usage` は複合 FK の対応順を保証しない
 */
class PostgresCatalogReader : CatalogReader {

    override val dialect: String = "postgresql"

    override fun supports(url: String): Boolean = url.startsWith("jdbc:postgresql:")


    override fun read(source: IntrospectSource): CatalogSnapshot =
        JdbcSupport.connect(source, mapOf("options" to "-c statement_timeout=30000")).use { connection ->
            CatalogSnapshot(
                dialect = dialect,
                schema = source.schema,
                tables = readTables(connection, source.schema),
                columns = readColumns(connection, source.schema),
                constraints = readConstraints(connection, source.schema),
                foreignKeys = readForeignKeys(connection, source.schema),
                indexes = readIndexes(connection, source.schema),
            )
        }

    private fun readTables(connection: Connection, schema: String): List<CatalogTable> =
        JdbcSupport.query(
            connection,
            """
            SELECT c.relname AS table_name,
                   obj_description(c.oid, 'pg_class') AS table_comment
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = ? AND c.relkind = 'r'
            ORDER BY c.relname
            """.trimIndent(),
            schema,
        ) { rs -> CatalogTable(rs.getString("table_name"), rs.getString("table_comment")) }

    private fun readColumns(connection: Connection, schema: String): List<CatalogColumn> =
        JdbcSupport.query(
            connection,
            """
            SELECT c.table_name, c.column_name, c.ordinal_position,
                   c.data_type, c.udt_name,
                   c.numeric_precision, c.numeric_scale, c.character_maximum_length,
                   e.data_type AS element_type,
                   c.is_nullable, c.column_default,
                   col_description(
                       format('%I.%I', c.table_schema, c.table_name)::regclass, c.ordinal_position
                   ) AS column_comment
            FROM information_schema.columns c
            LEFT JOIN information_schema.element_types e
                   ON e.object_catalog = c.table_catalog
                  AND e.object_schema = c.table_schema
                  AND e.object_name = c.table_name
                  AND e.object_type = 'TABLE'
                  AND e.collection_type_identifier = c.dtd_identifier
            WHERE c.table_schema = ?
            ORDER BY c.table_name, c.ordinal_position
            """.trimIndent(),
            schema,
        ) { rs ->
            CatalogColumn(
                table = rs.getString("table_name"),
                name = rs.getString("column_name"),
                position = rs.getInt("ordinal_position"),
                dataType = rs.getString("data_type"),
                udtName = rs.getString("udt_name"),
                numericPrecision = rs.intOrNull("numeric_precision"),
                numericScale = rs.intOrNull("numeric_scale"),
                characterMaximumLength = rs.intOrNull("character_maximum_length"),
                elementType = rs.getString("element_type"),
                nullable = rs.getString("is_nullable") == "YES",
                default = rs.getString("column_default"),
                comment = rs.getString("column_comment"),
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
                   ON kcu.constraint_name = tc.constraint_name
                  AND kcu.constraint_schema = tc.constraint_schema
            WHERE tc.table_schema = ?
              AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
            ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
            """.trimIndent(),
            schema,
        ) { rs ->
            CatalogConstraintColumn(
                table = rs.getString("table_name"),
                name = rs.getString("constraint_name"),
                /* 設計モデルの KeyModel.type は PRIMARY / UNIQUE / INDEX の 3 語 */
                type = if (rs.getString("constraint_type") == "PRIMARY KEY") "PRIMARY" else "UNIQUE",
                column = rs.getString("column_name"),
                position = rs.getInt("ordinal_position"),
            )
        }

    private fun readForeignKeys(connection: Connection, schema: String): List<CatalogForeignKey> =
        JdbcSupport.query(
            connection,
            """
            SELECT c.relname AS table_name,
                   a.attname AS column_name,
                   rc.relname AS referenced_table,
                   ra.attname AS referenced_column,
                   k.ord AS position
            FROM pg_constraint con
            JOIN pg_class c ON c.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_class rc ON rc.oid = con.confrelid
            CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(att, ref, ord)
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.att
            JOIN pg_attribute ra ON ra.attrelid = con.confrelid AND ra.attnum = k.ref
            WHERE con.contype = 'f' AND n.nspname = ?
            ORDER BY c.relname, con.conname, k.ord
            """.trimIndent(),
            schema,
        ) { rs ->
            CatalogForeignKey(
                table = rs.getString("table_name"),
                column = rs.getString("column_name"),
                referencedTable = rs.getString("referenced_table"),
                referencedColumn = rs.getString("referenced_column"),
                position = rs.getInt("position"),
            )
        }

    private fun readIndexes(connection: Connection, schema: String): List<CatalogIndexColumn> =
        JdbcSupport.query(
            connection,
            """
            SELECT c.relname AS table_name,
                   i.relname AS index_name,
                   ix.indisunique AS is_unique,
                   a.attname AS column_name,
                   k.ord AS position
            FROM pg_index ix
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_class c ON c.oid = ix.indrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(att, ord)
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.att
            WHERE n.nspname = ?
              AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = ix.indexrelid)
            ORDER BY c.relname, i.relname, k.ord
            """.trimIndent(),
            schema,
        ) { rs ->
            CatalogIndexColumn(
                table = rs.getString("table_name"),
                name = rs.getString("index_name"),
                unique = rs.getBoolean("is_unique"),
                column = rs.getString("column_name"),
                position = rs.getInt("position"),
            )
        }

}

