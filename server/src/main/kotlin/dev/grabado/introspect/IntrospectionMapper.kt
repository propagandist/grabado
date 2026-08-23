package dev.grabado.introspect

/**
 * [CatalogSnapshot]（カタログの生の行）→ [IntrospectionModel]（応答の形）。**純粋。**
 *
 * ★ **判断はすべてここにある。** [JdbcCatalogReader] は SELECT の結果を詰め替えるだけで
 * 分岐を持たないので、テストはこの 1 本に集中できる。
 *
 * ## 現行 PHP との差（どれも「挙動不変を目指してはいけない」箇所）
 *
 * | | 現行 PHP | ここ |
 * |---|---|---|
 * | NOT NULL の CHECK | denylist で除外しようとして `</key>` を余分に出す（§4.6-1） | **そもそも読まない**（allowlist） |
 * | index | `break` で 1 件も出ない（§4.6-2） | 制約が裏に持つものだけ除外して**全件出す** |
 * | `numeric(12,2)` | `NUMERIC`（精度・スケール落ち） | 精度とスケールを保つ |
 * | `text[]` | `ARRAY`（要素型落ち） | `arrayElementType` に要素型を入れる |
 *
 * ## 並びは決定論
 *
 * table は名前の昇順、column は `ordinal_position`、key の `columns` は制約内の順序。
 * **同じ DB からは必ず同じバイト列**（`IntrospectionJson` が golden で固定する）。
 */
object IntrospectionMapper {

    fun toModel(snapshot: CatalogSnapshot, source: String): IntrospectionModel {
        val columnsByTable = snapshot.columns.groupBy { it.table }
        val referencesByColumn = snapshot.foreignKeys
            .sortedBy { it.position }
            .groupBy { it.table to it.column }

        val tables = snapshot.tables
            .sortedBy { it.name }
            .map { table ->
                IntrospectedTable(
                    name = table.name,
                    comment = table.comment,
                    columns = (columnsByTable[table.name] ?: emptyList())
                        .sortedBy { it.position }
                        .map { column -> toColumn(column, referencesByColumn) },
                    keys = keysOf(snapshot, table.name),
                )
            }

        return IntrospectionModel(
            introspectionVersion = 1,
            source = source,
            dialect = snapshot.dialect,
            schema = snapshot.schema,
            tables = tables,
        )
    }

    private fun toColumn(
        column: CatalogColumn,
        referencesByColumn: Map<Pair<String, String>, List<CatalogForeignKey>>,
    ): IntrospectedColumn = IntrospectedColumn(
        name = column.name,
        sqlType = column.dataType,
        udtName = column.udtName,
        numericPrecision = column.numericPrecision,
        numericScale = column.numericScale,
        characterMaximumLength = column.characterMaximumLength,
        arrayElementType = column.elementType,
        nullable = column.nullable,
        default = column.default,
        comment = column.comment,
        references = (referencesByColumn[column.table to column.name] ?: emptyList())
            .map { IntrospectedReference(it.referencedTable, it.referencedColumn) },
    )

    /**
     * キーの組み立て。**制約（PRIMARY / UNIQUE）が先、index が後。**
     *
     * index は「制約が裏に持たないもの」だけが [CatalogSnapshot] に入っている
     * （SQL の `NOT EXISTS (pg_constraint.conindid)`）ので、ここで重複を除く必要は無い。
     * **除外を SQL 側に置いたのは、`break` で全滅した現行 PHP の反省** —— 手続きの途中で
     * 「この行は飛ばす」を判断するより、集合として最初から入れないほうが壊れにくい。
     */
    private fun keysOf(snapshot: CatalogSnapshot, table: String): List<IntrospectedKey> {
        val fromConstraints = snapshot.constraints
            .filter { it.table == table }
            .groupBy { it.name }
            .toSortedMap()
            .map { (name, columns) ->
                IntrospectedKey(
                    type = columns.first().type,
                    name = name,
                    columns = columns.sortedBy { it.position }.map { it.column },
                )
            }

        val fromIndexes = snapshot.indexes
            .filter { it.table == table }
            .groupBy { it.name }
            .toSortedMap()
            .map { (name, columns) ->
                IntrospectedKey(
                    /* 制約を持たない unique index も UNIQUE として出す（設計としては同じ意味） */
                    type = if (columns.first().unique) "UNIQUE" else "INDEX",
                    name = name,
                    columns = columns.sortedBy { it.position }.map { it.column },
                )
            }

        return fromConstraints + fromIndexes
    }
}
