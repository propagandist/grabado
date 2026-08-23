package dev.grabado.introspect

import dev.grabado.introspect.JdbcSupport.intOrNull
import java.sql.Connection

/**
 * H2 のカタログを読む（段階5-8b）。
 *
 * ## PG / MySQL との差（実 H2 で確かめた）
 *
 * | | PostgreSQL | MySQL | H2 |
 * |---|---|---|---|
 * | コメント | `obj_description` | `table_comment` | **`REMARKS`** |
 * | index の除外 | `pg_constraint.conindid` | 制約名との一致 | **`IS_GENERATED = FALSE`** |
 * | index 名 | 制約名と別 | 制約名と一致 | **制約名と一致しない**（`PRIMARY_KEY_E` のような自動名） |
 * | FK | `pg_constraint` | `key_column_usage.referenced_*` | `referential_constraints` を辿る |
 * | 識別子 | そのまま | そのまま | **大文字化される**（引用符なしで作ると） |
 *
 * ★ **`IS_GENERATED` があるのが H2 の利点。** MySQL のように「制約名と index 名が一致する」
 *   という前提が使えない（H2 は `PRIMARY_KEY_E` / `USERS_EMAIL_KEY_INDEX_4` のような名前を
 *   自動で付ける）が、**H2 自身が「生成したもの」と印を付けてくれる** ——
 *   名前で判定する denylist を書かずに済む。**FK が自動で作る index もこれで落ちる。**
 *
 * ## 組み込みで動く（テストの都合として大きい）
 *
 * PG / MySQL の統合テストは `docker run` が要るので opt-in にしてあるが、**H2 は
 * `jdbc:h2:mem:` で起こせる**ので `H2CatalogIntegrationTest` は**常に走る**。
 * 「実 DB に対して確かめる」を CI に載せられる唯一の方言。
 */
class H2CatalogReader : CatalogReader {

    override val dialect: String = "h2"

    override fun supports(url: String): Boolean = url.startsWith("jdbc:h2:")

    override fun read(source: IntrospectSource): CatalogSnapshot =
        JdbcSupport.connect(source).use { connection ->
            /* H2 の既定スキーマは PUBLIC（引用符なしの識別子は大文字化される） */
            val schema = source.schema.uppercase()
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
            SELECT table_name, remarks
            FROM information_schema.tables
            WHERE table_schema = ? AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """.trimIndent(),
            schema,
        ) { rs -> CatalogTable(rs.getString("table_name"), rs.getString("remarks")) }

    private fun readColumns(connection: Connection, schema: String): List<CatalogColumn> =
        JdbcSupport.query(
            connection,
            """
            SELECT table_name, column_name, ordinal_position,
                   data_type, numeric_precision, numeric_scale, character_maximum_length,
                   is_nullable, column_default, remarks
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
                /* H2 は SQL 標準の綴りで返す（CHARACTER VARYING / TIMESTAMP WITH TIME ZONE） */
                dataType = rs.getString("data_type"),
                udtName = null,
                numericPrecision = rs.intOrNull("numeric_precision"),
                numericScale = rs.intOrNull("numeric_scale"),
                characterMaximumLength = rs.intOrNull("character_maximum_length"),
                /* H2 にも配列型はあるが、information_schema からは要素型を引けない */
                elementType = null,
                nullable = rs.getString("is_nullable") == "YES",
                default = rs.getString("column_default"),
                comment = rs.getString("remarks"),
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

    /**
     * FK は `referential_constraints` で「子の制約 → 親の制約」を辿り、
     * 両側の `key_column_usage` を**同じ位置**で突き合わせる（複合 FK の順序を保つ）。
     */
    private fun readForeignKeys(connection: Connection, schema: String): List<CatalogForeignKey> =
        JdbcSupport.query(
            connection,
            """
            SELECT child.table_name AS table_name,
                   child.column_name AS column_name,
                   parent.table_name AS referenced_table,
                   parent.column_name AS referenced_column,
                   child.ordinal_position AS position
            FROM information_schema.referential_constraints rc
            JOIN information_schema.key_column_usage child
                   ON child.constraint_schema = rc.constraint_schema
                  AND child.constraint_name = rc.constraint_name
            JOIN information_schema.key_column_usage parent
                   ON parent.constraint_schema = rc.unique_constraint_schema
                  AND parent.constraint_name = rc.unique_constraint_name
                  AND parent.ordinal_position = child.ordinal_position
            WHERE child.table_schema = ?
            ORDER BY child.table_name, rc.constraint_name, child.ordinal_position
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

    /**
     * 人が作った index だけを返す。
     *
     * ★ **`IS_GENERATED = FALSE` で引く。** H2 は PK / UNIQUE 制約の裏 index に加えて
     * **FK にも自動で index を作る**（`FK_..._INDEX_E`）。名前で弾こうとすると denylist に
     * なって必ず漏れるが、**H2 自身が「生成したもの」と印を付けている**のでそれを使う。
     */
    private fun readIndexes(connection: Connection, schema: String): List<CatalogIndexColumn> =
        JdbcSupport.query(
            connection,
            """
            SELECT i.table_name, i.index_name, i.index_type_name,
                   ic.column_name, ic.ordinal_position
            FROM information_schema.indexes i
            JOIN information_schema.index_columns ic
                   ON ic.index_schema = i.index_schema
                  AND ic.index_name = i.index_name
            WHERE i.table_schema = ? AND i.is_generated = FALSE
            ORDER BY i.table_name, i.index_name, ic.ordinal_position
            """.trimIndent(),
            schema,
        ) { rs ->
            CatalogIndexColumn(
                table = rs.getString("table_name"),
                name = rs.getString("index_name"),
                unique = rs.getString("index_type_name") == "UNIQUE INDEX",
                column = rs.getString("column_name"),
                position = rs.getInt("ordinal_position"),
            )
        }
}
