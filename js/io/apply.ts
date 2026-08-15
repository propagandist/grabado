/* ------------------------- model application ------------------ */
/*
 * grabado: DesignModel -> ライブツリー（HANDOVER §4 段階4-1b）。
 *
 * js/wwwsqldesigner.ts の fromXML() の後半（テーブル生成・ff hack・relation・sync）と、
 * js/table.ts / js/row.ts / js/key.ts の fromXML() のうち**描画クラスを操作する部分**を
 * 逐語で移した。形式（XML / JSON）は一切知らない —— 知る側は js/io/xml-parser.ts。
 *
 * ここは 4-1a の extract.ts の裏返しで、同じ理由から**描画クラスに fromModel() を
 * 生やさない**: 描画中核 3 本の差分が「削除のみ」になり、永続化の知識が描画側に残らず、
 * js/table.ts -> js/io/ の辺も生えない（依存は描画 -> io の一方向）。
 * import は型だけなので値の辺は生えない（verbatimModuleSyntax で emit から消える）。
 *
 * 4-1a の extract と違って、本ファイルは**純関数ではない**。fromXML は「XML を再生する
 * UI 操作列」で、moveTo() の snap・update() の FK 連鎖・setTitle() の関連行リネーム・
 * ff one-pixel shift hack といった副作用の**順序**そのものが挙動だから。golden は結果しか
 * 押さえないので、順序は tests/golden/state/ の状態スナップショットが押さえている。
 */

import type { Designer } from "../wwwsqldesigner.ts";
import type { Table } from "../table.ts";
import type { Row, RowData } from "../row.ts";
import type {
    DesignModel,
    TableModel,
    RowModel,
    KeyModel,
} from "./model.ts";

/**
 * モデルをライブツリーへ流し込む。
 *
 * **clearTables() は呼ばない。** 呼び出し側（Designer.fromXML）が
 * 「clearTables() -> 型パレットの差し替え -> parse -> apply」の順で回す必要があり、
 * その理由は同メソッドのコメントにある。ここで clear すると順序が崩れる。
 */
export function applyDesignModel(designer: Designer, model: DesignModel): void {
    for (var i = 0; i < model.tables.length; i++) {
        applyTable(designer, model.tables[i]!);
    }

    for (var i = 0; i < designer.tables.length; i++) {
        /* ff one-pixel shift hack */
        designer.tables[i]!.select();
        designer.tables[i]!.deselect();
    }

    applyRelations(designer, model);

    designer.sync();
}

function applyTable(designer: Designer, model: TableModel): void {
    /* 生成は現行どおり空名・原点から。title と座標は直後に入れる */
    var t = designer.addTable("", 0, 0);
    t.setTitle(model.title);
    t.moveTo(model.x, model.y);

    for (var i = 0; i < model.rows.length; i++) {
        applyRow(t, model.rows[i]!);
    }
    for (var i = 0; i < model.keys.length; i++) {
        applyKey(t, model.keys[i]!);
    }

    /*
     * comment が最後なのは現行どおり。if で包むのも現行どおりで、これは見た目の問題ではない
     * —— 無コメントで setComment("") を呼ぶと dom.title に title="" 属性が生えて
     * tests/golden/state/ の titleTooltip が null から "" に変わる。
     */
    if (model.comment) {
        t.setComment(model.comment);
    }
}

function applyRow(table: Table, model: RowModel): void {
    var r = table.addRow("");

    /*
     * 新しいオブジェクトに詰め替えるのは、update() が受け取った data を書き換えるため
     * （data.def = null）。モデルを直接渡すとスナップショットであるはずのモデルが変わる。
     * "NULL" -> null の正規化はその update() の中で起きる（js/io/xml-parser.ts の def を参照）。
     */
    var obj: Partial<RowData> = {
        type: model.type,
        size: model.size,
        def: model.def,
        nll: model.nll,
        ai: model.ai,
        comment: model.comment,
    };
    r.update(obj);
    /* setTitle が後なのは現行どおり。この時点で this.relations は空なので関連行のリネームは走らない */
    r.setTitle(model.title);
}

function applyKey(table: Table, model: KeyModel): void {
    var k = table.addKey();
    /* setType は falsy を握りつぶす（type 属性が無いと既定 "INDEX" のまま） */
    k.setType(model.type);
    k.setName(model.name);
    for (var i = 0; i < model.parts.length; i++) {
        /* <part> には自テーブルの row 名しか書かれない前提（IO の不変条件）。
           外れれば現行も addRow の r.owner で TypeError になる */
        var row = table.findNamedRow(model.parts[i]!) as Row;
        k.addRow(row);
    }
}

/*
 * relation は全テーブルの生成と ff hack が終わってから張る（現行の第 2 パス）。
 *
 * **両端とも名前で引き直す。** 子側（row2）に「今作ったばかりの Row」を渡してはいけない。
 * 現行は子側も findNamedTable(parentNode.parentNode.name) で引き直していて、同名の
 * テーブルが 2 つあると両端が先頭のテーブルに解決される。これが同名テーブルで
 * リレーションが壊れる既知の不具合の本体で、オブジェクト参照に変えると**バグが直り、
 * テストが 1 本も落ちないまま挙動が変わる**。id 参照へ移すかは formatVersion: 1 を
 * 決める 4-2 の判断（CUSTOMIZATIONS.md 段階4-0a の申し送り）。
 */
function applyRelations(designer: Designer, model: DesignModel): void {
    for (var i = 0; i < model.tables.length; i++) {
        var table = model.tables[i]!;
        for (var j = 0; j < table.rows.length; j++) {
            var row = table.rows[j]!;
            for (var k = 0; k < row.relations.length; k++) {
                var ref = row.relations[k]!;

                var t1 = designer.findNamedTable(ref.table);
                if (!t1) {
                    continue;
                }
                var r1 = t1.findNamedRow(ref.row);
                if (!r1) {
                    continue;
                }

                var t2 = designer.findNamedTable(table.title);
                if (!t2) {
                    continue;
                }
                var r2 = t2.findNamedRow(row.title);
                if (!r2) {
                    continue;
                }

                designer.addRelation(r1, r2);
            }
        }
    }
}
