/* ------------------------- xml serializer --------------------- */
/*
 * grabado: DesignModel -> XML 文字列（HANDOVER §4 段階4-1a）。
 *
 * js/wwwsqldesigner.ts / js/table.ts / js/row.ts / js/key.ts の toXML() 4 実装を
 * 逐語で移した。出力バイト列を 1 バイトも変えないことが本段階の要件なので、
 * var / for (var i = …) / 二重の var t / non-null の ! / 緩い比較（!=）まで
 * 現行のまま持ち込んでいる（docs/ARCHITECTURE.md §5.5 の規約3 を移設にも適用）。
 * 「整理したくなる箇所」がそのまま危険箇所で、内訳は CUSTOMIZATIONS.md の
 * 段階4-1a の記録にある。
 *
 * ファイル名を serializer.ts にしないのは、HANDOVER §4 の io/serializer.ts が
 * JSON serializer の指定だから。本ファイルは 4-3 で js/io/ddl-xml.ts に改名し、
 * output.xsl（DDL 生成）専用の内部モジュールになる。
 *
 * activeUrl を引数で受けるのは、書き出し経路で唯一の環境依存（location.href）を
 * 関数の外へ押し出して純関数にするため。評価タイミングは Designer.toXML() の
 * 呼び出し時のままなので値は同一。4-4 の決定論化でこの引数ごと消える。
 *
 * export は 1 本だけにしてある。未使用の export を出すと、ツリーシェイクを切って
 * いる Node ハーネス（tests/node/harness.ts）の束と dist の束が構造的にずれる。
 */

import { _ } from "../globals.ts";
import type { TypePalette } from "./palette.ts";
import type { DesignModel, TableModel, RowModel, KeyModel } from "./model.ts";

export function serializeDesignXml(
    model: DesignModel,
    palette: TypePalette,
    activeUrl: string
): string {
    var xml = '<?xml version="1.0" encoding="utf-8" ?>\n';
    xml +=
        "<!-- SQL XML created by WWW SQL Designer, https://github.com/ondras/wwwsqldesigner/ -->\n";
    xml += "<!-- Active URL: " + activeUrl + " -->\n";
    xml += "<sql>\n";

    /* serialize datatypes */
    if (window.XMLSerializer) {
        var s = new XMLSerializer();
        xml += s.serializeToString(palette.element());
    } else if ((palette.element() as unknown as { xml?: string }).xml) {
        xml += (palette.element() as unknown as { xml: string }).xml;
    } else {
        /*
         * grabado: e は未定義（本物のバグ）。到達不能な分岐（XMLSerializer が無い
         * 実行系のみ）で、直すには「何を表示すべきか」を発明することになるため、
         * 段階2 の判断どおりマーカーとして残す。@ts-expect-error は「エラーが
         * 消えたらそれ自体がエラーになる」ので、§4 の XML 書き出し撤去でこの分岐が
         * 消えたときに気づける。
         */
        // @ts-expect-error 未定義の識別子（js/wwwsqldesigner.js から持ち越した既知のバグ）
        alert(_("errorxml") + ": " + e.message);
    }

    for (var i = 0; i < model.tables.length; i++) {
        xml += serializeTable(model.tables[i]!, palette);
    }
    xml += "</sql>\n";
    return xml;
}

function serializeTable(table: TableModel, palette: TypePalette): string {
    var t = table.title.replace(/"/g, "&quot;");
    var xml = "";
    xml += '<table x="' + table.x + '" y="' + table.y + '" name="' + t + '">\n';
    for (var i = 0; i < table.rows.length; i++) {
        xml += serializeRow(table.rows[i]!, palette);
    }
    for (var i = 0; i < table.keys.length; i++) {
        xml += serializeKey(table.keys[i]!);
    }
    var c = table.comment;
    if (c) {
        xml += "<comment>" + escapeXML(c) + "</comment>\n";
    }
    xml += "</table>\n";
    return xml;
}

function serializeRow(row: RowModel, palette: TypePalette): string {
    var xml = "";

    var t = row.title.replace(/"/g, "&quot;");
    var nn = row.nll ? "1" : "0";
    var ai = row.ai ? "1" : "0";
    xml +=
        '<row name="' + t + '" null="' + nn + '" autoincrement="' + ai + '">\n';

    var elm = palette.typeAt(row.type);
    /* getAttribute の null を ! で潰しているのは、下の t += が string を要求するため。
       sql 属性の無い型は datatypes.xml に存在しない（あれば現行も "null(...)" を書く） */
    var t = elm.getAttribute("sql")!;
    if (row.size.length) {
        t += "(" + row.size + ")";
    }
    xml += "<datatype>" + t + "</datatype>\n";

    if (row.def || row.def === null) {
        /* quote 属性が無い型では現行も "null" が連結される（挙動不変） */
        var q = elm.getAttribute("quote")!;
        var d = row.def;
        if (d === null) {
            d = "NULL";
        } else if (d != "CURRENT_TIMESTAMP") {
            d = q + d + q;
        }
        /* 末尾に改行を付けないのはここだけ（known-issue #8。4-4 で直す） */
        xml += "<default>" + escapeXML(d) + "</default>";
    }

    for (var i = 0; i < row.relations.length; i++) {
        var r = row.relations[i]!;
        xml += '<relation table="' + r.table + '" row="' + r.row + '" />\n';
    }

    if (row.comment) {
        xml += "<comment>" + escapeXML(row.comment) + "</comment>\n";
    }

    xml += "</row>\n";
    return xml;
}

function serializeKey(key: KeyModel): string {
    var xml = "";
    xml += '<key type="' + key.type + '" name="' + key.name + '">\n';
    for (var i = 0; i < key.parts.length; i++) {
        var r = key.parts[i]!;
        /* <part> は escapeXML も " の置換も通らない（現行どおり） */
        xml += "<part>" + r + "</part>\n";
    }
    xml += "</key>\n";
    return xml;
}

/*
 * grabado: js/globals.ts の escape を改名して移設した（段階4-1a）。本体は 1 文字も
 * 変えていない。置換順（& -> > -> <）を入れ替えると二重エスケープになる。
 *
 * 適用先は <comment>（table / row）と <default> の 3 か所だけで、属性値は通らない
 * （name は " -> &quot; のみ、<relation> の属性と <part> は素通し）。これは
 * known-issue #1 として記録済みの逸脱で、直すのは 4-4。ここで適用範囲を広げると
 * npm run known-issues が赤くなる。
 */
function escapeXML(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/>/g, "&gt;")
        .replace(/</g, "&lt;");
}
