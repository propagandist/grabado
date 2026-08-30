/* ---------------------- table template ------------------------ */
/*
 * grabado: §6.2 初期テーブルテンプレート（HANDOVER §6 段階6-4）。
 *
 * db/<db>/datatypes.xml の <template> を読み、新規テーブルの初期列を作る層。
 * 定義をパレットと同じファイルに置いたのは、**type が実在の型 id であることを
 * tests/node/palette-id.test.ts が機械的に押さえられる**ため（別ファイルに切ると
 * その検査が届かない）。§6.2 の house 既定は
 *
 *   id uuid PRIMARY KEY DEFAULT uuidv7()
 *   created_at / updated_at timestamptz NOT NULL DEFAULT now()
 *
 * で、必要な型は 6-3 のパレット差し替えでそろった。
 *
 * **段階6-8d で 8 プロファイルすべてが <template> を持つ。** 6-4 は postgresql だけで、
 * 6-7a 〜 6-8d が残る 7 本を入れた —— テンプレートは「そのプロファイルが house 既定を
 * 最も近く表す形」なので、パレットの現代化と一体でなければ決められなかった。
 *
 * readTemplate() が空を返す経路は残る。**旧 XML 同梱の <datatypes>**（段階4-2b 以前の
 * 設計ファイル）は <template> を持たないので、そのときは呼び手が従来の
 * 「id 1 列 ＋ autoincrement」に落ちる。
 *
 * 置き場所が js/io/ なのは js/io/palette.ts と同じ理由（段階4-0a の記録）。本ファイルの
 * import は型だけで、実行時の依存は 0 本 —— tests/node からハーネス無しで直に叩ける。
 */

import type { TypePalette } from "./palette.ts";
import type { Table } from "../table.ts";
import type { RowData } from "../row.ts";

/** <template> の 1 行。data はそのまま Table.addRow の第 2 引数に渡す形にしてある */
export interface TemplateRow {
    name: string;
    data: Partial<RowData>;
    /** key="PRIMARY" が付いていた（＝ PRIMARY キーに入る）*/
    primary: boolean;
}

/**
 * <template> の行（無ければ空配列）。
 *
 * 属性の意味は設計 XML の <row> に合わせてある —— null="1" が NULL 許可、
 * autoincrement="1" が identity。**type だけは id 参照**（sql 名ではない。段階6-2 の fk と同じ）。
 *
 * 型 id が引けなければ例外にする。呼び手は UI（新規テーブル作成）なので黙って先頭型へ
 * 落とす手もあるが、それは known-issue #4 と同じ「静かに間違った型で作る」形になる。
 * 実在は tests/node/palette-id.test.ts が全プロファイルで押さえるので、実行時には起きない。
 */
export function readTemplate(palette: TypePalette): TemplateRow[] {
    const templates = palette.element().getElementsByTagName("template");
    if (!templates.length) {
        return [];
    }

    const nodes = templates[0]!.getElementsByTagName("row");
    const rows: TemplateRow[] = [];
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        const name = node.getAttribute("name") ?? "";
        rows.push({
            name,
            data: {
                type: typeIndexOf(palette, node.getAttribute("type"), name),
                size: node.getAttribute("size") ?? "",
                def: node.getAttribute("default") ?? "",
                nll: node.getAttribute("null") == "1",
                ai: node.getAttribute("autoincrement") == "1",
            },
            primary: node.getAttribute("key") === "PRIMARY",
        });
    }
    return rows;
}

/**
 * Add row ボタンで足す行の既定型（<datatypes newrowtype="...">。無ければ添字 0）。
 *
 * 6-3 が 6-4 へ送った項目。CLAUDE.md の「text 優先」に合わせて postgresql は text を指す。
 * 属性を持たないパレット（旧 XML 同梱の <datatypes>）は先頭の型になる。
 *
 * Row のコンストラクタ既定（js/row.ts の data.type = 0）は動かしていない —— あそこは
 * 読み込み経路（js/io/apply.ts）も通る道で、直後の update() が必ず型を入れる。
 * 「UI で足す行の既定」はプロファイルの性質なので、パレットを見る側で決める。
 */
export function newRowType(palette: TypePalette): number {
    const id = palette.element().getAttribute("newrowtype");
    if (!id) {
        return 0;
    }
    return typeIndexOf(palette, id, "newrowtype");
}

/**
 * テンプレートを table に適用する。テンプレートが無ければ何もせず false。
 *
 * 呼び手（js/tablemanager.ts）が false のときだけ従来の初期列を作る。**8 プロファイルは
 * すべて <template> を持つ**ので、そちらに落ちるのは旧 XML 同梱パレットの経路だけ。
 *
 * PRIMARY キーは **primary な行が 1 つ以上あるときだけ**作る（空の <key> を書き出さない）。
 * 行より先に作るのは複合 PK を書けるようにするため。
 */
export function applyTemplate(table: Table, palette: TypePalette): boolean {
    const rows = readTemplate(palette);
    if (!rows.length) {
        return false;
    }

    const key = rows.some((row) => row.primary) ? table.addKey("PRIMARY") : null;
    for (const row of rows) {
        const created = table.addRow(row.name, row.data);
        if (row.primary) {
            key!.addRow(created);
        }
    }
    return true;
}

/** 型 id -> 添字。引けなければ例外（where は落ちた場所を人に見せるためだけの文字列） */
function typeIndexOf(
    palette: TypePalette,
    id: string | null,
    where: string
): number {
    const index = id ? palette.indexOfId(id) : -1;
    if (index === -1) {
        throw new Error(
            'テンプレートの型 "' + id + '" がパレットに無い（' + where + "）"
        );
    }
    return index;
}
