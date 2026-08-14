/*
 * grabado: ES クラス化し、クラスとインスタンスを分離した（HANDOVER §3 段階2）。
 * 段階3-3b で .ts 化した（js/ の最後の 1 本）。
 *
 * 現行は `SQL.Designer = function () { SQL.Designer = this; ... }` で、生成した
 * 瞬間にクラスが唯一のインスタンスに置き換わっていた。参照側（table / row /
 * relation / rowmanager）はすべて実体を期待するので、クラス = SQL.Designer、
 * 唯一のインスタンス = SQL.designer に分けた。
 *
 * 自己登録（SQL.designer = this）をコンストラクタに残しているのは、起動経路が
 * 3 つあり（src/main.ts、tests/node/harness.ts の window.eval、ブラウザ）、
 * いずれも戻り値を SQL に載せないため。DI 化は HANDOVER §4 の IO 分離と同時に行う。
 *
 * 本ファイルが .ts になったことで js/globals.ts の SqlDesigner は構造的 interface を
 * やめ、この Designer への型エイリアスになった（参照している 13 本は無改修）。
 * インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 *
 * 生成する 11 クラスは段階3-4a で値 import になった（それまでは new SQL.X 経由で、
 * 型だけ import type していた）。本ファイルは読み込み順（src/app.ts）の最後尾なので、
 * 値の辺を張っても参照先はすべて評価済みで順序は動かない。Row は生成しないので
 * import type のまま。クラス名 Window は lib.dom の型と同名なので SqlWindow に改名して受ける。
 */

import { OZ } from "./oz.ts";
import { CONFIG } from "./config.ts";
import { SQL, _, LOCALE } from "./globals.ts";
import { Visual, type VisualDom } from "./visual.ts";
import { Table } from "./table.ts";
import type { Row } from "./row.ts";
import { Relation } from "./relation.ts";
import { Minimap } from "./map.ts";
import { Rubberband } from "./rubberband.ts";
import { Toggle } from "./toggle.ts";
import { TableManager } from "./tablemanager.ts";
import { RowManager } from "./rowmanager.ts";
import { KeyManager } from "./keymanager.ts";
import { IO } from "./io.ts";
import { Options } from "./options.ts";
import { Window as SqlWindow } from "./window.ts";

/** 基底の VisualDom に svg が増える（vector が真のときだけ生える。§5.4 の形態 (i)） */
export interface DesignerDom extends VisualDom {
    svg: SVGSVGElement;
}

export class Designer extends Visual<DesignerDom> {
    declare xhrheaders: Record<string, string>;
    declare tables: Table[];
    declare relations: Relation[];
    /** document.title の元の値。setTitle() が接頭辞に使う */
    declare title: string;
    /** #area の初期サイズ。sync() が下限に使う */
    declare minSize: [number, number];
    declare width: number;
    declare height: number;
    /** getTypeIndex() が初回に作るキャッシュ。それまでは false */
    declare typeIndex: Record<string, number> | false;
    /** getFKTypeFor() が初回に作るキャッシュ。それまでは false */
    declare fkTypeFor: Record<number, number> | false;
    /** SVG で描くか。実体は getOption("vector") && document.createElementNS の truthy 値 */
    declare vector: boolean;
    declare svgNS: string;
    /** locale と datatypes の到着を待つカウンタ。0 になると init2() が走る */
    declare flag: number;
    declare map: Minimap;
    declare rubberband: Rubberband;
    declare tableManager: TableManager;
    declare rowManager: RowManager;
    declare keyManager: KeyManager;
    declare io: IO;
    declare options: Options;
    declare window: SqlWindow;

    constructor() {
        super();
        SQL.designer = this;

        this.xhrheaders = {};
        this.tables = [];
        this.relations = [];
        this.title = document.title;

        this._init();
        this._build();
        new Toggle(OZ.$("toggle"));

        this.dom.container = OZ.$("area");
        this.minSize = [
            this.dom.container.offsetWidth,
            this.dom.container.offsetHeight,
        ];
        this.width = this.minSize[0];
        this.height = this.minSize[1];

        this.typeIndex = false;
        this.fkTypeFor = false;

        /*
         * grabado: 現行は「オプションが真 かつ createElementNS がある」の truthy 値を
         * そのまま持つ（値は関数か 0/""）。型は読み手に合わせて boolean と宣言し、
         * キャストをこの 1 行に閉じ込める（実行コードは無変更・段階3-3b）。
         */
        this.vector = (this.getOption("vector") &&
            document.createElementNS) as unknown as boolean;
        if (this.vector) {
            this.svgNS = "http://www.w3.org/2000/svg";
            /* svgNS はリテラルでないので createElementNS が Element を返す */
            this.dom.svg = document.createElementNS(
                this.svgNS,
                "svg"
            ) as SVGSVGElement;
            this.dom.container.appendChild(this.dom.svg);
        }

        this.flag = 2;
        this.requestLanguage();
        this.requestDB();
        this.applyStyle();
    }

    /* update area size */
    sync(): void {
        var w = this.minSize[0];
        var h = this.minSize[0];
        for (var i = 0; i < this.tables.length; i++) {
            var t = this.tables[i]!;
            w = Math.max(w, t.x + t.width);
            h = Math.max(h, t.y + t.height);
        }

        this.width = w;
        this.height = h;
        this.map.sync();

        if (this.vector) {
            /* 数値→文字列の暗黙変換に依存している（段階3-2 の relation 3 箇所と同じ扱い） */
            this.dom.svg.setAttribute(
                "width",
                this.width as unknown as string
            );
            this.dom.svg.setAttribute(
                "height",
                this.height as unknown as string
            );
        }
    }

    requestLanguage(): void {
        /* get locale file */
        var lang = this.getOption("locale");
        var bp = this.getOption("staticpath");
        var url = bp + "locale/" + lang + ".xml";
        OZ.Request(url, this.languageResponse.bind(this), {
            method: "get",
            xml: true,
        });
    }

    languageResponse(xmlDoc: unknown): void {
        if (xmlDoc) {
            var strings = (xmlDoc as Document).getElementsByTagName("string");
            for (var i = 0; i < strings.length; i++) {
                var n = strings[i]!.getAttribute("name")!;
                var v = strings[i]!.firstChild!.nodeValue!;
                LOCALE[n] = v;
            }
        }
        this.flag--;
        if (!this.flag) {
            this.init2();
        }
    }

    requestDB(): void {
        /* get datatypes file */
        var db = this.getOption("db");
        var bp = this.getOption("staticpath");
        var url = bp + "db/" + db + "/datatypes.xml";
        OZ.Request(url, this.dbResponse.bind(this), {
            method: "get",
            xml: true,
        });
    }

    dbResponse(xmlDoc: unknown): void {
        if (xmlDoc) {
            window.DATATYPES = (xmlDoc as Document).documentElement;
        }
        this.flag--;
        if (!this.flag) {
            this.init2();
        }
    }

    applyStyle(): void {
        /* apply style */
        var style = this.getOption("style");
        var i,
            link_elms = document.querySelectorAll("link");
        for (i = 0; i < link_elms.length; i++) {
            if (
                link_elms[i]!.getAttribute("rel")!.indexOf("style") != -1 &&
                link_elms[i]!.getAttribute("title")
            ) {
                link_elms[i]!.disabled = true;
                if (link_elms[i]!.getAttribute("title") == style)
                    link_elms[i]!.disabled = false;
            }
        }
    }

    init2(): void {
        /* secondary init, after locale & datatypes were retrieved */
        this.map = new Minimap(this);
        this.rubberband = new Rubberband(this);
        this.tableManager = new TableManager(this);
        this.rowManager = new RowManager(this);
        this.keyManager = new KeyManager(this);
        this.io = new IO(this);
        this.options = new Options(this);
        this.window = new SqlWindow(this);

        this.sync();

        OZ.$<HTMLInputElement>("docs").value = _("docs");

        var url = window.location.href;
        var r = url.match(/keyword=([^&]+)/);
        if (r) {
            var keyword = r[1]!;
            this.io.serverload(false, keyword);
        }
        document.body.style.visibility = "visible";
    }

    getMaxZ(): number {
        /* find max zIndex */
        var max = 0;
        for (var i = 0; i < this.tables.length; i++) {
            var z = this.tables[i]!.getZ();
            if (z > max) {
                max = z;
            }
        }

        /* 数値→文字列の暗黙変換（上の setAttribute と同じ扱い） */
        OZ.$("controls").style.zIndex = (max + 5) as unknown as string;
        return max;
    }

    addTable(name: string, x: number, y: number): Table {
        var max = this.getMaxZ();
        var t = new Table(this, name, x, y, max + 1);
        this.tables.push(t);
        this.dom.container.appendChild(t.dom.container);
        return t;
    }

    removeTable(t: Table): void {
        this.tableManager.select(false);
        this.rowManager.select(false);
        var idx = this.tables.indexOf(t);
        if (idx == -1) {
            return;
        }
        t.destroy();
        this.tables.splice(idx, 1);
    }

    addRelation(row1: Row, row2: Row): Relation {
        var r = new Relation(this, row1, row2);
        this.relations.push(r);
        return r;
    }

    removeRelation(r: Relation): void {
        var idx = this.relations.indexOf(r);
        if (idx == -1) {
            return;
        }
        r.destroy();
        this.relations.splice(idx, 1);
    }

    getCookie(): Record<string, string> {
        var c = document.cookie;
        var obj: Record<string, string> = {};
        var parts = c.split(";");
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i]!;
            var r = part.match(/wwwsqldesigner=({.*?})/);
            if (r) {
                /* 形式が {k:'v'} で JSON ではないため eval のまま（§4 の IO 移植で消える） */
                obj = eval("(" + r[1] + ")");
            }
        }
        return obj;
    }

    setCookie(obj: Record<string, string>): void {
        var arr: string[] = [];
        for (var p in obj) {
            arr.push(p + ":'" + obj[p] + "'");
        }
        var str = "{" + arr.join(",") + "}";
        document.cookie = "wwwsqldesigner=" + str + "; path=/";
    }

    /*
     * 戻りは cookie の値（文字列）か下の switch の既定値（文字列 / 0 / boolean）。
     * 呼び出しの多くは truthy 判定なので総称シグネチャで足り、switch のキーに使う
     * style だけ string で確定させる（段階3-2 の判断を実体側に移した）。
     */
    getOption(name: "style"): string;
    getOption(name: string): string | number | boolean;
    getOption(name: string): string | number | boolean {
        var c = this.getCookie();
        if (name in c) {
            return c[name]!;
        }
        /* defaults */
        switch (name) {
            case "locale":
                return CONFIG.DEFAULT_LOCALE;
            case "db":
                return CONFIG.DEFAULT_DB;
            case "staticpath":
                return CONFIG.STATIC_PATH || "";
            case "xhrpath":
                return CONFIG.XHR_PATH || "";
            case "snap":
                return 0;
            case "showsize":
                return 0;
            case "showtype":
                return 0;
            case "pattern":
                return "%R_%T";
            case "hide":
                return false;
            case "vector":
                return true;
            case "style":
                return "material-inspired";
            default:
                /*
                 * grabado: 戻り型に null を出していない（段階3-2 の判断）。呼び出しの
                 * 多くは truthy 判定か文字列連結で、null を型に出すと 60 箇所に
                 * ガードを足すことになりイディオム C と衝突する。
                 */
                return null as unknown as string;
        }
    }

    setOption(name: string, value: string): void {
        var obj = this.getCookie();
        obj[name] = value;
        this.setCookie(obj);
    }

    /* 仮引数 value は現行から使われていないが、emit を変えないため残す */
    getXhrHeaders(value?: unknown): Record<string, string> {
        return this.xhrheaders;
    }

    setXhrHeaders(value: Record<string, string>): void {
        this.xhrheaders = value;
    }

    raise(table: Table): void {
        /* raise a table */
        var old = table.getZ();
        var max = this.getMaxZ();
        table.setZ(max);
        for (var i = 0; i < this.tables.length; i++) {
            var t = this.tables[i]!;
            if (t == table) {
                continue;
            }
            if (t.getZ() > old) {
                t.setZ(t.getZ() - 1);
            }
        }
        var m = table.dom.mini;
        m.parentNode!.appendChild(m);
    }

    clearTables(): void {
        while (this.tables.length) {
            this.removeTable(this.tables[0]!);
        }
        this.setTitle(false);
    }

    alignTables(): void {
        var win = OZ.DOM.win();
        var avail = win[0] - OZ.$("bar").offsetWidth;
        var x = 10;
        var y = 10;
        var max = 0;

        this.tables.sort(function (a, b) {
            return b.getRelations().length - a.getRelations().length;
        });

        for (var i = 0; i < this.tables.length; i++) {
            var t = this.tables[i]!;
            var w = t.dom.container.offsetWidth;
            var h = t.dom.container.offsetHeight;
            if (x + w > avail) {
                x = 10;
                y += 10 + max;
                max = 0;
            }
            t.moveTo(x, y);
            x += 10 + w;
            if (h > max) {
                max = h;
            }
        }

        this.sync();
    }

    /** 見つからなければ undefined を返す（fromXML が if (!t1) continue で消費する） */
    findNamedTable(name: string | null): Table | undefined {
        /* find row specified as table(row) */
        for (var i = 0; i < this.tables.length; i++) {
            if (this.tables[i]!.getTitle() == name) {
                return this.tables[i];
            }
        }
        return undefined;
    }

    override toXML(): string {
        var xml = '<?xml version="1.0" encoding="utf-8" ?>\n';
        xml +=
            "<!-- SQL XML created by WWW SQL Designer, https://github.com/ondras/wwwsqldesigner/ -->\n";
        xml += "<!-- Active URL: " + location.href + " -->\n";
        xml += "<sql>\n";

        /* serialize datatypes */
        if (window.XMLSerializer) {
            var s = new XMLSerializer();
            xml += s.serializeToString(window.DATATYPES as Element);
        } else if ((window.DATATYPES as unknown as { xml?: string }).xml) {
            xml += (window.DATATYPES as unknown as { xml: string }).xml;
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

        for (var i = 0; i < this.tables.length; i++) {
            xml += this.tables[i]!.toXML();
        }
        xml += "</sql>\n";
        return xml;
    }

    override fromXML(node: Element): void {
        this.clearTables();
        var types = node.getElementsByTagName("datatypes");
        if (types.length) {
            window.DATATYPES = types[0]!;
        }
        var tables = node.getElementsByTagName("table");
        for (var i = 0; i < tables.length; i++) {
            var t = this.addTable("", 0, 0);
            t.fromXML(tables[i]!);
        }

        for (var i = 0; i < this.tables.length; i++) {
            /* ff one-pixel shift hack */
            this.tables[i]!.select();
            this.tables[i]!.deselect();
        }

        /* relations */
        var rs = node.getElementsByTagName("relation");
        for (var i = 0; i < rs.length; i++) {
            var rel = rs[i]!;
            var tname = rel.getAttribute("table");
            var rname = rel.getAttribute("row");

            var t1 = this.findNamedTable(tname);
            if (!t1) {
                continue;
            }
            var r1 = t1.findNamedRow(rname);
            if (!r1) {
                continue;
            }

            tname = (rel.parentNode!.parentNode as Element).getAttribute(
                "name"
            );
            rname = (rel.parentNode as Element).getAttribute("name");
            var t2 = this.findNamedTable(tname);
            if (!t2) {
                continue;
            }
            var r2 = t2.findNamedRow(rname);
            if (!r2) {
                continue;
            }

            this.addRelation(r1, r2);
        }

        this.sync();
    }

    /* 基底の setTitle() は呼ばない（現行どおり）。document.title だけを更新する */
    override setTitle(t: string | false): void {
        document.title = this.title + (t ? " - " + t : "");
    }

    removeSelection(): void {
        /*
         * grabado: window.getSelection の有無判定と document.selection（IE）への
         * フォールバックを撤去した（HANDOVER §3 段階3-3b）。Chromium 151 / jsdom 29 の
         * 両方で window.getSelection は true、document.selection は false と実測済み。
         * empty() は非標準なので存在判定を残す（現行どおり）。
         */
        var sel = window.getSelection();
        if (!sel) {
            return;
        }
        /* empty() は非標準（存在判定は現行どおり残す）。キャストは emit に出ない */
        if ((sel as unknown as { empty?: () => void }).empty) {
            (sel as unknown as { empty: () => void }).empty();
        }
        if (sel.removeAllRanges) {
            sel.removeAllRanges();
        }
    }

    getTypeIndex(label: string): number {
        if (!this.typeIndex) {
            this.typeIndex = {};
            var types = (window.DATATYPES as Element).getElementsByTagName(
                "type"
            );
            for (var i = 0; i < types.length; i++) {
                var l = types[i]!.getAttribute("label");
                if (l) {
                    this.typeIndex[l] = i;
                }
            }
        }
        return this.typeIndex[label]!;
    }

    getFKTypeFor(typeIndex: number): number {
        if (!this.fkTypeFor) {
            this.fkTypeFor = {};
            var types = (window.DATATYPES as Element).getElementsByTagName(
                "type"
            );
            for (var i = 0; i < types.length; i++) {
                this.fkTypeFor[i] = i;
                var fk = types[i]!.getAttribute("fk");
                if (fk) {
                    this.fkTypeFor[i] = this.getTypeIndex(fk);
                }
            }
        }
        return this.fkTypeFor[typeIndex]!;
    }
}
