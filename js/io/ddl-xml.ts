/* ------------------------- ddl xml --------------------- */
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
 * xml-serializer.ts から本名に改名したのは段階4-3a。ユーザーに見える保存経路は
 * 4-3b で JSON になり、この XML は output.xsl（DDL 生成）への入力としてだけ残る
 * ——「設計の保存形式」ではなく「DDL パイプラインの中間表現」なので、名前をその
 * 役目に合わせた。関数名を buildDdlInputXml にしたのは段階4-4。モジュールごと
 * 消えるのは §6.3 で output.xsl を TS 実装に置き換えるとき。
 *
 * **段階4-4 で決定論になった**（CLAUDE.md 制約3 / HANDOVER §4）。撤去したのは 2 つ:
 *
 * - `<!-- Active URL: location.href -->`。書き出し経路で唯一の環境依存だった
 *   （4-1a で引数に押し出してあったので、ここでは引数ごと落とすだけ）。
 * - `<datatypes>` の全文埋め込み。**db 配下の output.xsl 9 本はこれを一切参照しない**
 *   （4-0a の実測。datatypes を grep して 0 件）ので、DDL には
 *   1 バイトも影響しない。数百行のノイズが消え、XMLSerializer の実行系依存も
 *   同時に無くなる。読み込み側は元から実行中のパレットで型を解決していて
 *   （js/io/xml-parser.ts）、同梱 <datatypes> を読む Designer.fromXML() は
 *   「無ければ null」なので、4-3b 以前に保存された XML はこれまでどおり読める。
 *
 * **段階4-4 で well-formed になった**（known-issue #1）。属性値のエスケープが
 * `"` -> `&quot;` の 1 つだけで、`&` を含む識別子を書くと二度と読めない XML が
 * できていた。属性値は escapeAttr、テキストノードは escapeXML を全経路に通す。
 * あわせて <default> の末尾に改行を足した（known-issue #8）。
 *
 * export は 1 本だけにしてある。未使用の export を出すと、ツリーシェイクを切って
 * いる Node ハーネス（tests/node/harness.ts）の束と dist の束が構造的にずれる。
 */

import type { TypePalette } from "./palette.ts";
import type { DesignModel, TableModel, RowModel, KeyModel } from "./model.ts";

export function buildDdlInputXml(
    model: DesignModel,
    palette: TypePalette
): string {
    var xml = '<?xml version="1.0" encoding="utf-8" ?>\n';
    xml +=
        "<!-- SQL XML created by WWW SQL Designer, https://github.com/ondras/wwwsqldesigner/ -->\n";
    xml += "<sql>\n";

    for (var i = 0; i < model.tables.length; i++) {
        xml += serializeTable(model.tables[i]!, palette);
    }
    xml += "</sql>\n";
    return xml;
}

function serializeTable(table: TableModel, palette: TypePalette): string {
    var t = escapeAttr(table.title);
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

    var t = escapeAttr(row.title);
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
    xml += "<datatype>" + escapeXML(t) + "</datatype>\n";

    /* 段階4-5: 「既定なし」（""）では要素ごと出さない。以前はここに || row.def === null が
       あり、既定を持たない行すべてに <default>NULL</default> が生えていた（known-issue #2） */
    if (row.def) {
        /* quote 属性が無い型では現行も "null" が連結される（挙動不変） */
        var q = elm.getAttribute("quote")!;
        var d = row.def;
        if (d != "CURRENT_TIMESTAMP") {
            d = q + d + q;
        }
        /* 段階4-4 で末尾に改行を足した（known-issue #8）。ここだけ改行が無く、
           1 行に 2 要素が並んで diff が読みにくかった */
        xml += "<default>" + escapeXML(d) + "</default>\n";
    }

    for (var i = 0; i < row.relations.length; i++) {
        var r = row.relations[i]!;
        xml +=
            '<relation table="' +
            escapeAttr(r.table) +
            '" row="' +
            escapeAttr(r.row) +
            '" />\n';
    }

    if (row.comment) {
        xml += "<comment>" + escapeXML(row.comment) + "</comment>\n";
    }

    xml += "</row>\n";
    return xml;
}

function serializeKey(key: KeyModel): string {
    var xml = "";
    /* String() を挟むのは、name 属性の無い <key> を読むと実行時 null が入るため
       （js/io/model.ts の KeyModel 参照）。現行は name="null" と書くので、その嘘を
       そのまま保つ —— escapeAttr に直接渡すと TypeError になり挙動が変わる */
    xml +=
        '<key type="' +
        escapeAttr(key.type) +
        '" name="' +
        escapeAttr(String(key.name)) +
        '">\n';
    for (var i = 0; i < key.parts.length; i++) {
        var r = key.parts[i]!;
        xml += "<part>" + escapeXML(r) + "</part>\n";
    }
    xml += "</key>\n";
    return xml;
}

/*
 * grabado: js/globals.ts の escape を改名して移設した（段階4-1a）。置換順
 * （& -> > -> <）を入れ替えると二重エスケープになる。
 *
 * **段階4-4 で適用範囲を全テキストノードに広げた**（known-issue #1）。4-1a 時点の
 * 適用先は <comment>（table / row）と <default> の 3 か所だけで、<datatype> と
 * <part> は素通しだった。属性値は下の escapeAttr が担う。
 */
function escapeXML(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/>/g, "&gt;")
        .replace(/</g, "&lt;");
}

/*
 * grabado: 属性値のエスケープ（段階4-4・known-issue #1）。
 *
 * 4-4 まで属性値に掛かっていたのは `"` -> `&quot;` の 1 つだけで、`&` を含む識別子
 * （`R&D` など）を書くと well-formed でない XML ができ、DOMParser が parsererror に
 * 落ちた —— 保存したファイルを二度と開けない、という形で表に出ていた不具合。
 *
 * escapeXML と同じ順で `&` を先に潰してから `"` を足す。`"` を先にすると
 * `&quot;` の `&` を後段が拾って `&amp;quot;` になる。
 */
function escapeAttr(str: string): string {
    return escapeXML(str).replace(/"/g, "&quot;");
}
