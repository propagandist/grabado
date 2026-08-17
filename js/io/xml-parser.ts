/* ------------------------- xml parser ------------------------- */
/*
 * grabado: XML -> DesignModel（HANDOVER §4 段階4-1b）。
 *
 * js/table.ts / js/row.ts / js/key.ts の fromXML() 3 実装と、js/wwwsqldesigner.ts の
 * fromXML() のうち **DOM を読む部分だけ**を逐語で移した。ライブツリー（描画クラスの
 * インスタンス）には一切触らない —— 触る側は js/io/apply.ts。
 *
 * 4-1a の書き出し 2 本（extract / ddl-xml）と鏡になる:
 *
 *            ライブ側（描画エンジンを触る）      バイト側（形式を知る）
 *      出    extract.ts                        ddl-xml.ts（4-3a まで xml-serializer.ts）
 *      入    apply.ts                          本ファイル
 *
 * 逐語であることが本段階の要件なので、var / for (var i = …) / 二重の var d /
 * non-null の ! / 緩い比較（==）まで現行のまま持ち込んでいる（docs/ARCHITECTURE.md
 * §5.5 の規約3）。**「整理したくなる箇所」がそのまま危険箇所**で、内訳は
 * CUSTOMIZATIONS.md の段階4-1b の記録にある。とくに次の 3 つは揃えてはいけない:
 *
 *   - <comment> の走査規則が table と row で違う（table = 直下 childNodes・最後が勝つ /
 *     row = getElementsByTagName の子孫先頭が勝つ）。片方に寄せると挙動が変わる。
 *   - <part> の nodeValue はガード無しで読む（空の <part> は現行も TypeError）。
 *
 * この一覧には 3 つ目として「型解決のループに break が無く最後の一致が勝つ」があったが、
 * **段階6-2 で解決した**（本ファイルの照合ループごと TypePalette.indexOfTypeName へ移した）。
 * 6-2 が直したのは sql の完全一致どうしの順序だけで、re の後勝ち（known-issue #10）と
 * 一致が無いときに先頭型へ落ちる挙動（known-issue #4）が残っていたが、**段階6-3 で
 * 現代化済みプロファイル（strict）については両方消えた** —— #4 は下の parseRow が例外に
 * 倒し、#10 は strict の照合が re を見ない。どちらも未現代化の 4 本には残り、6-8 で消える。
 * 上の 2 つ（comment の走査規則・<part> のガード無し）は揃えてはいけないまま。
 *
 * palette を引数で受けるのは、型パレット依存の解決（sql/re 照合・quote 剥がし）を
 * 形式側に閉じる 4-1a の規約による。モデルは添字のまま持つ（js/io/model.ts）。
 */

import type { TypePalette } from "./palette.ts";
import type {
    DesignModel,
    TableModel,
    RowModel,
    KeyModel,
    RelationRef,
} from "./model.ts";

/**
 * 設計 XML が同梱している <datatypes>（型パレット）。無ければ null。
 *
 * Element のまま返して呼び出し側（Designer.fromXML）が palette に入れる。モデルに
 * 入れないのは、これが DOM ノードそのものでモデルデータではないため。
 * 差し替えの**タイミング**が挙動を決めるので、順序の理由は呼び出し側に書いてある。
 */
export function parseDatatypes(node: Element): Element | null {
    var types = node.getElementsByTagName("datatypes");
    if (types.length) {
        return types[0]!;
    }
    return null;
}

export function parseDesignXml(node: Element, palette: TypePalette): DesignModel {
    var tables: TableModel[] = [];
    var ts = node.getElementsByTagName("table");
    for (var i = 0; i < ts.length; i++) {
        tables.push(parseTable(ts[i]!, palette));
    }
    return { tables: tables };
}

function parseTable(node: Element, palette: TypePalette): TableModel {
    var name = node.getAttribute("name");
    var x = parseInt(node.getAttribute("x")!) || 0;
    var y = parseInt(node.getAttribute("y")!) || 0;

    var rows: RowModel[] = [];
    var rs = node.getElementsByTagName("row");
    for (var i = 0; i < rs.length; i++) {
        rows.push(parseRow(rs[i]!, palette));
    }

    var keys: KeyModel[] = [];
    var ks = node.getElementsByTagName("key");
    for (var i = 0; i < ks.length; i++) {
        keys.push(parseKey(ks[i]!));
    }

    /*
     * <comment> は**直下の childNodes を走り、最後の一致が勝つ**。
     * getElementsByTagName("comment")[0] にすると row の中の comment を拾う。
     * 現行は一致するたびに setComment() を呼ぶが、最終値だけが観測できる
     * （setComment は data.comment と dom.title.title への代入だけ）ので同値。
     */
    var comment = "";
    for (var i = 0; i < node.childNodes.length; i++) {
        /* テキストノードも来るので Element として読む（tagName が無ければ短絡する） */
        var ch = node.childNodes[i] as Element;
        if (
            ch.tagName &&
            ch.tagName.toLowerCase() == "comment" &&
            ch.firstChild
        ) {
            comment = ch.firstChild.nodeValue!;
        }
    }

    return {
        /*
         * name 属性が無ければ実行時 null。現行は setTitle(null) が
         * Visual.setTitle の !text で早期 return するので "" のままになり、
         * relation の所属引き直しにも同じ null が渡っていた（下の parseRelations の
         * コメントを参照）。型の嘘は js/io/model.ts に記録してある。
         */
        title: name as string,
        x: x,
        y: y,
        comment: comment,
        rows: rows,
        keys: keys,
    };
}

function parseRow(node: Element, palette: TypePalette): RowModel {
    var name = node.getAttribute("name");

    /*
     * 現行 Row.fromXML の obj をそのまま持つ。現行は comment / def を「見つかったときだけ」
     * 足す Partial だったが、ここでは 6 キーを常に持たせている。Row のコンストラクタが
     * 入れる既定（type 0 / size "" / def "" / comment ""）と本オブジェクトの初期値が
     * 一致するので、update() の for-in が余分にコピーしても結果は同じ。
     */
    var obj = {
        type: 0,
        size: "",
        nll: node.getAttribute("null") == "1",
        ai: node.getAttribute("autoincrement") == "1",
        comment: "",
        def: "",
    };

    var cs = node.getElementsByTagName("comment");
    if (cs.length && cs[0]!.firstChild) {
        obj.comment = cs[0]!.firstChild!.nodeValue!;
    }

    var d = node.getElementsByTagName("datatype");
    if (d.length && d[0]!.firstChild) {
        var s = d[0]!.firstChild!.nodeValue!;
        var r = s.match(/^([^\(]+)(\((.*)\))?.*$/);
        var type = r![1]!;
        if (r![3]) {
            obj.size = r![3]!;
        }
        /*
         * 照合の規則は TypePalette.indexOfTypeName（段階6-2 / strict 分岐は 6-3）。
         *
         * **現代化済みプロファイル（strict）は一致が無ければ例外**（段階6-3 で known-issue #4 を
         * PG について解消した箇所）。未現代化のプロファイルでは -1 のまま obj.type が初期値 0 に
         * 残り、**先頭の型に黙って落ちる** —— #4 は 6-8 でこちらが strict になったときに消える。
         *
         * 横断で例外にできないのは、fixture が PG 用に書かれたまま全プロファイルに流れていて
         * （6-0 の決めたこと 2）、未現代化のパレットでは大半の型が未知になるため。
         * DB 別 fixture の整備は 6-6。
         *
         * 例外の message は開発者向けで locale を通さない（js/io/json-parser.ts と同じ立場。
         * 受け止めは js/io.ts の loadDesignText が alert に流す 1 か所）。ここで落ちても
         * **同梱パレットを持たない XML なら今開いている設計は変わらない** —— 6-3 が
         * Designer.fromXML にその経路を分けて parse を clearTables() より先に置いたため。
         */
        var found = palette.indexOfTypeName(type);
        if (found !== -1) {
            obj.type = found;
        } else if (palette.isStrict()) {
            throw new Error(
                `設計 XML: 型 "${type}" が現在の型パレット（db=${palette.db()}）に無い`
            );
        }

        /*
         * **寄せ先がサイズを取らない型なら size を捨てる**（段階6-3・strict のみ）。
         *
         * 6-3 の aka は CHAR(10) を text に、TIMESTAMP(3) を timestamptz に寄せる。前者は
         * PG に size の概念が無い型なので、抽出した "10" を残すと js/io/ddl-xml.ts が
         * TEXT(10) という**構文として壊れた DDL** を吐く（size があれば必ず括弧を付ける）。
         * 後者は timestamptz(3) が有効なので残す —— その差を持っているのが length 属性で、
         * 6-3 が読む契約にした（TypePalette.hasSize）。
         *
         * 同じ判断は tools/migrate-design.mjs の dropSize 側にもある（char -> text だけ）。
         * **両者が一致していることは golden が見ている** —— tests/golden/json/ の 7 本は
         * 移行ツールが書いたもので、それを serializer の出力と突き合わせているため。
         */
        if (palette.isStrict() && !palette.hasSize(obj.type)) {
            obj.size = "";
        }
    }

    var elm = palette.typeAt(obj.type);
    var d = node.getElementsByTagName("default");
    if (d.length && d[0]!.firstChild) {
        var def = d[0]!.firstChild!.nodeValue!;
        obj.def = def;
        var q = elm.getAttribute("quote");
        if (q) {
            /* 上のループの var re が string | null なので同名だと TS2403（段階3-2 の改名） */
            var quoteRe = new RegExp("^" + q + "(.*)" + q + "$");
            var r = def.match(quoteRe);
            if (r) {
                obj.def = r[1]!;
            }
        }
    }

    return {
        title: name as string,
        type: obj.type,
        size: obj.size,
        /*
         * "NULL" -> "" の正規化はここでやらない（段階4-5 でも同じ立場を保った）。
         * 正規化は Row.update() の中（data.nll && data.def.match(/^null$/i)）にあり、
         * ここにも書くと同じ規則が 2 箇所に分かれて片方だけ直す事故の余地が残る。
         * したがって読み込みモデルの def は「XML が言った値」—— 4-3b 以前に
         * 書き出されたファイルの <default>NULL</default> は "NULL" のまま渡り、
         * apply -> update() が "" に潰す。extract が作るモデル（＝ツリーが保持して
         * いる値）とは一致しないことがある（js/io/model.ts の非対称 2）。
         */
        def: obj.def,
        nll: obj.nll,
        ai: obj.ai,
        comment: obj.comment,
        relations: parseRelations(node),
    };
}

/*
 * <row> 直下の <relation>。参照先（親）の table / row を名前で持つ。
 *
 * 現行は Designer.fromXML が**文書順で <relation> を全走査**し、所属（子側）を
 * parentNode / parentNode.parentNode の name 属性から引き直している。行ごとの直下走査に
 * 置き換えても、serializer が出す形（<relation> は <row> の直下）では並びも組み合わせも
 * 一致する —— テーブルは文書順、行はテーブル内の文書順なので、走査順は文書順のまま。
 *
 * 直下走査（getElementsByTagName ではなく childNodes）にしてあるのは、`<row>` の孫に
 * ある `<relation>`（例: <key> の中。serializer は出さない）で現行と揃えるため。現行は
 * その場合 parentNode 鎖から <key> / <row> の name を読むので findNamedTable が落ちて
 * スキップされる。子孫走査にすると拾ってしまい、手書き XML で挙動が変わる。
 */
function parseRelations(node: Element): RelationRef[] {
    var relations: RelationRef[] = [];
    for (var i = 0; i < node.childNodes.length; i++) {
        var ch = node.childNodes[i] as Element;
        if (ch.tagName && ch.tagName.toLowerCase() == "relation") {
            relations.push({
                /* 属性が無ければ実行時 null。現行も同じ null を findNamedTable に渡す */
                table: ch.getAttribute("table") as string,
                row: ch.getAttribute("row") as string,
            });
        }
    }
    return relations;
}

function parseKey(node: Element): KeyModel {
    var parts: string[] = [];
    var ps = node.getElementsByTagName("part");
    for (var i = 0; i < ps.length; i++) {
        /* firstChild をガードしないのは現行どおり（空の <part> は現行も TypeError） */
        parts.push(ps[i]!.firstChild!.nodeValue!);
    }
    return {
        /* type 属性が無ければ実行時 null。Key.setType() の !t が握りつぶして既定 "INDEX" のまま */
        type: node.getAttribute("type") as string,
        /* name 属性が無ければ実行時 null。書き出すと name="null" になる現行の癖（model.ts） */
        name: node.getAttribute("name") as string,
        parts: parts,
    };
}
