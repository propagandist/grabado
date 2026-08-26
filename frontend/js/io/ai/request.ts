/* ------------------------- ai request ------------------------- */
/*
 * grabado: DesignModel -> AI へ送る JSON（HANDOVER §11 段階11-3。契約は docs/ARCHITECTURE.md §8.2）。
 *
 * **設計ファイルでも introspection JSON でもない 3 つ目の形式**（`aiRequestVersion: 1`）。
 * 送るのは判定に要るものだけで、**座標も formatVersion も db も送らない**。
 *
 * ## なぜ設計 JSON をそのまま送らないのか（段階11-0 の決めたこと 2）
 *
 *   1. **`x` / `y` は判定に無関係でトークンだけ食う。** 座標は描画の都合で、house 規約の
 *      どの項目（複数形・uuidv7・監査列・命名）にも掛からない
 *   2. **型は id ではなく SQL 名で送る。** 設計 JSON の `type` は型パレットの安定 id（4-2b）で、
 *      `"5"` を渡されても意味を持たない。解決は `TypePalette` を持つフロントで済ませ、
 *      **backend にパレットを持たせない**（5-0 の決めたこと 3 と同じ理屈）
 *   3. **「AI に送るものは設計ファイルではない」ことを形式で表す**
 *
 * ## 決定論
 *
 * ここは純関数で、同じモデルからは**同じバイト列**が出る（キー順・配列順が固定）。
 * **backend の結果キャッシュの鍵は、この関数が出したバイト列の SHA-256** なので、
 * 揺れると当たらなくなる（`docs/ARCHITECTURE.md` §8.5）。
 *
 * ## 空のものは送らない
 *
 * コメント・サイズ・参照・既定値は**空なら省く**。費用が自社負担なので、
 * 意味を持たないバイトを毎回運ばない。**省いても情報は落ちない** —— 無いことは
 * キーが無いことで伝わる。`nullable` だけは false も情報なので常に送る。
 */

import type { DesignModel, RowModel, TableModel } from "../model.ts";
import type { TypePalette } from "../palette.ts";

export interface AiRequest {
    readonly aiRequestVersion: 1;
    /** ルーブリックの選択に使う（`postgresql` だけが house 規約のフル判定） */
    readonly dialect: string;
    readonly tables: readonly AiRequestTable[];
}

export interface AiRequestTable {
    readonly name: string;
    readonly comment?: string;
    readonly columns: readonly AiRequestColumn[];
    readonly keys: readonly AiRequestKey[];
}

export interface AiRequestColumn {
    readonly name: string;
    /** **解決済みの SQL 名**（型 id でもパレットの添字でもない） */
    readonly sqlType: string;
    readonly size?: string;
    readonly nullable: boolean;
    readonly default?: string;
    readonly comment?: string;
    /** この列を子とする参照（親を名前で指す） */
    readonly references?: readonly AiRequestReference[];
}

export interface AiRequestReference {
    readonly table: string;
    readonly column: string;
}

export interface AiRequestKey {
    readonly type: string;
    /** 空なら省く（生成器が §6.3 の規約で組むので、設計側に無いのが普通） */
    readonly name?: string;
    readonly columns: readonly string[];
}

/**
 * 送る形を組む。
 *
 * @param palette 型の解決に使う（**db 属性が dialect になる**）
 */
export function buildAiRequest(model: DesignModel, palette: TypePalette): AiRequest {
    return {
        aiRequestVersion: 1,
        dialect: palette.db() ?? "",
        tables: model.tables.map((table) => buildAiTable(table, palette)),
    };
}

/**
 * 実際に送るバイト列にする。**プレビューに出すのはこの文字列そのもの。**
 *
 * 整形して送るのは、**「実際に送るバイト列を見せる」という約束**（段階11-0 の決めたこと 3）を
 * 守るため —— compact を送って整形版を見せると、見せているものと送るものが違う。
 * 入力側は費用の 1 割弱（11-2b の実測）なので、読めることのほうが価値が高い。
 */
export function serializeAiRequest(request: AiRequest): string {
    return JSON.stringify(request, null, 2);
}

function buildAiTable(table: TableModel, palette: TypePalette): AiRequestTable {
    const built: Writable<AiRequestTable> = {
        name: table.title,
        columns: table.rows.map((row) => buildAiColumn(row, palette)),
        keys: table.keys.map((key) => {
            const one: Writable<AiRequestKey> = { type: key.type, columns: [...key.parts] };
            if (key.name !== "") {
                one.name = key.name;
            }
            return one;
        }),
    };
    if (table.comment !== "") {
        built.comment = table.comment;
    }
    return built;
}

function buildAiColumn(row: RowModel, palette: TypePalette): AiRequestColumn {
    const built: Writable<AiRequestColumn> = {
        name: row.title,
        sqlType: palette.typeAt(row.type).getAttribute("sql") ?? "",
        nullable: row.nll,
    };
    if (row.size !== "") {
        built.size = row.size;
    }
    if (row.def !== "") {
        built.default = row.def;
    }
    if (row.comment !== "") {
        built.comment = row.comment;
    }
    if (row.relations.length > 0) {
        built.references = row.relations.map((ref) => ({ table: ref.table, column: ref.row }));
    }
    return built;
}

/**
 * キー順を宣言順に保ったまま組み立てるための型（`js/io/json-format.ts` の同名と同じ役割）。
 *
 * **JSON.stringify は挿入順で書く**ので、順に代入することが決定論そのものになる。
 */
type Writable<T> = { -readonly [K in keyof T]: T[K] };
