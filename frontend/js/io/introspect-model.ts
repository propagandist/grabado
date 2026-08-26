/* ------------------------- introspection の受け皿 ---------------------- */
/*
 * grabado: backend が `?action=import` で返す形（HANDOVER §5.2 / 段階5-6）。
 *
 * ## 設計 JSON（docs/FORMAT.md）とは別の形式である
 *
 * introspection の出力は **設計ファイルではない**。理由は 3 つ:
 *
 * 1. **`x` / `y` を持たない。** 座標は描画の都合で `information_schema` に無い。
 *    現行の XML 経路も持たず、`importresponse` が `alignTables()` を呼んで
 *    **ブラウザ実測の `offsetWidth`** で並べている。設計 JSON v2 の parser は
 *    `x`/`y` が undefined だと throw するので、設計 JSON を返す形にすると
 *    **backend が 0 を詰めてフロントが直後に上書きする**無意味な往復になる。
 * 2. **型を「パレットの安定 id」で持たない。** パレット（`db/<db>/datatypes.xml`）は
 *    フロントの静的資産で、backend が id を返すには XML を読む必要がある ——
 *    それは**現行 PHP がやっていたこと**（`<datatypes>` の全文連結）で、
 *    backend と frontend がパレットを二重に持つ構造そのもの。
 * 3. **ルートの `db` を持たない。** 設計 JSON の `db` は「実行中パレットと違えば throw」
 *    （段階4-2b）。PG を import したいのに実行中が mysql なら何も入らなくなる。
 *    こちらは `dialect` を**情報として**持ち、寄せるかどうかは呼び手が決める。
 *
 * ## backend は「DB がこう言った」だけを返す
 *
 * 型は **SQL の生の情報**（`sqlType` / `udtName` / 精度 / スケール / 長さ / 配列の要素型）。
 * パレットへの解決は [introspect-parser.ts](introspect-parser.ts) が
 * `TypePalette.indexOfTypeName()` で行う —— `db/postgresql/datatypes.xml` の冒頭が
 * 「`aka` に入れる基準の 2 番目は **introspection の実出力**」と明記しているとおり、
 * **パレットは introspection の型名を受けるように設計されている**。
 */

/** 1 列。`information_schema.columns` から素直に写せる範囲を持つ。 */
export interface IntrospectedColumn {
    readonly name: string;
    /** `data_type`（`character varying` / `numeric` / `ARRAY` など）。解決の第 1 候補 */
    readonly sqlType: string;
    /**
     * `udt_name`（`varchar` / `numeric` / `_text` / enum 型の名前）。
     * `sqlType` が `ARRAY` / `USER-DEFINED` のように**実際の型を隠す**ときの手がかり。
     */
    readonly udtName?: string | null;
    readonly numericPrecision?: number | null;
    readonly numericScale?: number | null;
    readonly characterMaximumLength?: number | null;
    /** 配列の要素型（`text[]` なら `text`）。**現行 PHP はここを落としていた** */
    readonly arrayElementType?: string | null;
    readonly nullable: boolean;
    /** `column_default` を**生のまま**。`"NULL"` → `""` の正規化はしない（model.ts の非対称2） */
    readonly default?: string | null;
    readonly comment?: string | null;
    /** この列から出る外部キー（複合 FK は列ごとに 1 本ずつ現れる） */
    readonly references?: readonly IntrospectedReference[];
}

export interface IntrospectedReference {
    readonly table: string;
    readonly column: string;
}

/** PRIMARY / UNIQUE / INDEX。**CHECK は最初から読まない**（設計モデルに概念が無い） */
export interface IntrospectedKey {
    readonly type: string;
    readonly name: string;
    readonly columns: readonly string[];
}

export interface IntrospectedTable {
    readonly name: string;
    readonly comment?: string | null;
    readonly columns: readonly IntrospectedColumn[];
    readonly keys?: readonly IntrospectedKey[];
}

export interface IntrospectionResult {
    /** 形式の版。**設計 JSON の `formatVersion` とは別の系列** */
    readonly introspectionVersion: number;
    /** env に列挙された接続の名前（`?action=import&database=<name>` の値） */
    readonly source?: string;
    /** 読んだ DB の方言。**実行中パレットと照合しない**（情報として持つだけ） */
    readonly dialect?: string;
    readonly schema?: string;
    readonly tables: readonly IntrospectedTable[];
}
