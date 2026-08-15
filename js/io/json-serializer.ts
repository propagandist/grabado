/* ------------------------- json serializer -------------------- */
/*
 * grabado: DesignModel -> 設計 JSON（HANDOVER §4 段階4-2）。
 *
 * 4-1a / 4-1b で組んだ格子の**形式側にもう 1 本足しただけ**で、ライブ側
 * （js/io/extract.ts / js/io/apply.ts）とモデル（js/io/model.ts）には 1 行も触らない。
 *
 *            ライブ側（描画エンジンを触る）      形式側（バイト列を知る）
 *      出    extract.ts                        xml-serializer.ts / 本ファイル
 *      入    apply.ts                          xml-parser.ts / json-parser.ts
 *
 * xml-serializer.ts と違って**逐語移設ではない**（保存すべき現行の emit が無い新規実装）
 * ので、const / for-of / map で書く。先例は js/io/palette.ts。
 *
 * 環境依存の入力は 1 つも無い —— XML 側が持っていた location.href（`<!-- Active URL -->`）に
 * 相当するものを最初から入れないので、4-4 の決定論化を待たずにここは決定論。
 *
 * 内部関数に Json を冠しているのは、js/io/xml-serializer.ts の同名関数（serializeTable /
 * serializeKey）とバンドル上で衝突させないため。衝突すると rolldown は**旧側**に $1 を付けるので、
 * 本段階のバンドル差分が「新モジュールの純粋な追加」でなくなり、挙動不変の判定が濁る。
 * js/io/json-parser.ts も同じ理由で parseJsonTable / parseJsonKey。
 *
 * 形式そのものの定義とキー順の契約は js/io/json-format.ts、散文は docs/FORMAT.md。
 */

import type { TypePalette } from "./palette.ts";
import type { DesignModel, TableModel, RowModel, KeyModel } from "./model.ts";
import type {
    JsonDesign,
    JsonTable,
    JsonColumn,
    JsonKey,
    Writable,
} from "./json-format.ts";

export function serializeDesignJson(
    model: DesignModel,
    palette: TypePalette
): string {
    const tables = model.tables.map((t) => serializeJsonTable(t, palette));
    const db = palette.db();

    /*
     * db の有無で 2 通りのリテラルを書き分けるのは、キー順を
     * formatVersion -> db -> tables に固定するため（後から代入すると末尾に付く）。
     */
    const design: JsonDesign = db
        ? { formatVersion: 1, db: db, tables: tables }
        : { formatVersion: 1, tables: tables };

    /* 2 スペース・末尾 LF。tests/support/state.ts と同じ形 */
    return `${JSON.stringify(design, null, 2)}\n`;
}

function serializeJsonTable(table: TableModel, palette: TypePalette): JsonTable {
    const columns = table.rows.map((r) => serializeColumn(r, palette));

    /* comment を columns の前に出すためリテラルを書き分ける（上の db と同じ理由） */
    const out: Writable<JsonTable> = table.comment
        ? {
              name: table.title,
              x: table.x,
              y: table.y,
              comment: table.comment,
              columns: columns,
          }
        : { name: table.title, x: table.x, y: table.y, columns: columns };

    if (table.keys.length) {
        out.keys = table.keys.map(serializeJsonKey);
    }
    return out;
}

function serializeColumn(row: RowModel, palette: TypePalette): JsonColumn {
    /* 代入の並び = 出力のキー順。既定値と同じキーは出さない（js/io/json-format.ts） */
    const out: Writable<JsonColumn> = {
        name: row.title,
        type: typeLabel(row.type, palette),
    };

    if (row.size) {
        out.size = row.size;
    }
    if (row.nll) {
        out.nullable = true;
    }
    if (row.ai) {
        out.autoincrement = true;
    }
    /*
     * null（＝ DEFAULT NULL）と ""（＝既定なし）をどちらも落とす。この 1 行が
     * known-issue #2 / #5 を JSON 経路に持ち込まない箇所（js/io/json-format.ts の default）。
     */
    if (row.def) {
        out.default = row.def;
    }
    if (row.comment) {
        out.comment = row.comment;
    }
    if (row.relations.length) {
        out.references = row.relations.map((r) => ({
            table: r.table,
            column: r.row,
        }));
    }
    return out;
}

function serializeJsonKey(key: KeyModel): JsonKey {
    /* name が falsy（Key の既定 ""、および name 属性の無い <key> を読んだときの null）なら出さない */
    return key.name
        ? { type: key.type, name: key.name, columns: key.parts }
        : { type: key.type, columns: key.parts };
}

/*
 * 型パレットの添字 -> label。
 *
 * palette.typeAt() を通さず types() を直に引くのは、範囲外を「戻りが undefined で
 * 次の行が TypeError」ではなく**理由の分かる例外**にするため。ここは書き出しの入口で、
 * 落ちるならファイルを 1 バイトも書かないほうがよい（XML 側は現行の挙動を保つのが
 * 要件だったので typeAt のまま）。
 */
function typeLabel(index: number, palette: TypePalette): string {
    const types = palette.types();
    const elm = types[index];
    if (!elm) {
        throw new Error(
            `型パレットに添字 ${index} の <type> が無い（db=${palette.db()}、型数 ${types.length}）`
        );
    }
    const label = elm.getAttribute("label");
    if (label === null) {
        throw new Error(
            `型パレットの添字 ${index} に label 属性が無い（db=${palette.db()}）`
        );
    }
    return label;
}
