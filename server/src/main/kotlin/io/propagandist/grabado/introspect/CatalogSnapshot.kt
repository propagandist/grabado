package io.propagandist.grabado.introspect

/**
 * カタログから読んだ生の行（段階5-7a）。**SELECT の列と 1 対 1 の平坦なリスト。**
 *
 * ## ここを seam にする理由
 *
 * `ResultSet` をモックすると「呼び出し順」にテストが結合し、200 メソッドの interface を
 * 相手にすることになる。**SELECT した列そのものを持つ data class** を境界にすれば、
 * [JdbcCatalogReader] は「`rs.getString("table_name")` を並べる」以外の分岐を 1 つも持たず、
 * **判断はすべて [IntrospectionMapper]（純粋）に寄る**。
 *
 * テストは [IntrospectionMapper] に集中し、`JdbcCatalogReader` は
 * opt-in の統合テスト（実 PG18）が見る。
 */
data class CatalogSnapshot(
    val dialect: String,
    val schema: String,
    val tables: List<CatalogTable>,
    val columns: List<CatalogColumn>,
    val constraints: List<CatalogConstraintColumn>,
    val foreignKeys: List<CatalogForeignKey>,
    val indexes: List<CatalogIndexColumn>,
)

data class CatalogTable(
    val name: String,
    val comment: String?,
)

/**
 * `information_schema.columns` の 1 行 ＋ コメント ＋ 配列の要素型。
 *
 * **現行 PHP が落としていた 3 つ**（`udtName` / 精度・スケール / 要素型）をすべて持つ
 * （`docs/ARCHITECTURE.md` §4.5 の型マッピング表が挙げていた欠落）。
 */
data class CatalogColumn(
    val table: String,
    val name: String,
    val position: Int,
    /** `data_type`。`ARRAY` / `USER-DEFINED` は**実際の型を隠す** */
    val dataType: String,
    /** `udt_name`。配列は `_text` のような形で、enum はその型名 */
    val udtName: String?,
    val numericPrecision: Int?,
    val numericScale: Int?,
    val characterMaximumLength: Int?,
    /** `information_schema.element_types` から引いた要素型（配列でなければ null） */
    val elementType: String?,
    val nullable: Boolean,
    /** `column_default` を**生のまま**（`"NULL"` → `""` の正規化はしない） */
    val default: String?,
    val comment: String?,
)

/**
 * PRIMARY KEY / UNIQUE の 1 列ぶん。
 *
 * ★ **CHECK は読まない。** PG18 は NOT NULL を `table_constraints` に
 * `<table>_<col>_not_null` / CHECK として出す（実測: サンプル 3 テーブルで **CHECK 16 件**が
 * すべてこれ）。現行 PHP は `_not_null` サフィックスの **denylist** で除外しようとして
 * `</key>` を余分に出し、**XML が well-formed でなくなった**（§4.6-1）。
 * **allowlist で引く**ので、この壊れ方は構造的に起こらない。
 */
data class CatalogConstraintColumn(
    val table: String,
    val name: String,
    /** `PRIMARY` / `UNIQUE`（`information_schema` の `PRIMARY KEY` を縮めたもの） */
    val type: String,
    val column: String,
    val position: Int,
)

data class CatalogForeignKey(
    val table: String,
    val column: String,
    val referencedTable: String,
    val referencedColumn: String,
    /** 複合 FK の中での順序（`unnest(conkey, confkey) WITH ORDINALITY`） */
    val position: Int,
)

/**
 * 制約が裏に持たない index の 1 列ぶん。
 *
 * ★ **`pg_constraint.conindid` に一致するものは除外済み。** 現行 PHP はここで
 * `continue` ではなく **`break`** しており、PK の index に当たった時点でループごと抜けて
 * **index が 1 つも出なかった**（§4.6-2）。実測では `idx_articles_author_id` と
 * `idx_articles_published_on_title`（2 列）が正しく出る。
 */
data class CatalogIndexColumn(
    val table: String,
    val name: String,
    val unique: Boolean,
    val column: String,
    val position: Int,
)
