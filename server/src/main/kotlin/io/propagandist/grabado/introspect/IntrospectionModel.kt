package io.propagandist.grabado.introspect

/**
 * `?action=import` が返す形（段階5-7a）。
 *
 * **設計 JSON ではない。** 座標を持たず、型はパレットの id ではなく **SQL の生の情報**で、
 * `dialect` は情報として持つだけ（実行中パレットと照合しない）。理由は
 * `js/io/introspect-model.ts` の冒頭と `docs/FORMAT.md` の最終節にある ——
 * **backend にパレットを持たせない**のが要点で、解決はフロントの `TypePalette` が引き受ける。
 *
 * TypeScript 側の受け皿は `js/io/introspect-model.ts`。**プロパティ名を変えるときは
 * 両方**（`tests/node/introspect-parser.test.ts` が fixture で固定している）。
 */
data class IntrospectionModel(
    val introspectionVersion: Int,
    val source: String,
    val dialect: String,
    val schema: String,
    val tables: List<IntrospectedTable>,
)

data class IntrospectedTable(
    val name: String,
    val comment: String?,
    val columns: List<IntrospectedColumn>,
    val keys: List<IntrospectedKey>,
)

data class IntrospectedColumn(
    val name: String,
    val sqlType: String,
    val udtName: String?,
    val numericPrecision: Int?,
    val numericScale: Int?,
    val characterMaximumLength: Int?,
    val arrayElementType: String?,
    val nullable: Boolean,
    val default: String?,
    val comment: String?,
    val references: List<IntrospectedReference>,
)

data class IntrospectedReference(
    val table: String,
    val column: String,
)

/** `PRIMARY` / `UNIQUE` / `INDEX`。**CHECK は出てこない**（読んでいないので）。 */
data class IntrospectedKey(
    val type: String,
    val name: String,
    val columns: List<String>,
)
