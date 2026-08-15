/*
 * grabado: ES クラス化し、クラスとインスタンスを分離した（HANDOVER §3 段階2）。
 * 段階3-3b で .ts 化した（js/ の最後の 1 本）。
 *
 * 現行は `SQL.Designer = function () { SQL.Designer = this; ... }` で、生成した
 * 瞬間にクラスが唯一のインスタンスに置き換わっていた。参照側（table / row /
 * relation / rowmanager）はすべて実体を期待するので、クラス = SQL.Designer、
 * 唯一のインスタンス = SQL.designer に分けた。
 *
 * 自己登録（SQL.designer = this）は段階4-0a で撤去した（HANDOVER §4）。読み手は
 * すべて Designer に所有される側で、owner 鎖の終端が同じ実体を指すため
 * this.owner / this.owner.owner に置換できた。詳細は js/globals.ts の該当コメント。
 *
 * 本ファイルが .ts になったことで js/globals.ts の SqlDesigner は構造的 interface を
 * やめて型エイリアスに縮み、段階4-1c で撤去された。this.owner の型を必要とする 10 本は
 * この Designer を直接 import type する（書き方の正本は js/table.ts の冒頭）。
 * インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 *
 * 生成する 11 クラスは段階3-4a で値 import になった（それまでは new SQL.X 経由で、
 * 型だけ import type していた）。本ファイルは読み込み順（src/app.ts）の最後尾なので、
 * 値の辺を張っても参照先はすべて評価済みで順序は動かない。Row は生成しないので
 * import type のまま。クラス名 Window は lib.dom の型と同名なので SqlWindow に改名して受ける。
 */

import { OZ } from "./oz.ts";
import { CONFIG } from "./config.ts";
import { _, LOCALE } from "./globals.ts";
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
import { TypePalette } from "./io/palette.ts";
import { extractModel } from "./io/extract.ts";
import { buildDdlInputXml } from "./io/ddl-xml.ts";
import { parseDatatypes, parseDesignXml } from "./io/xml-parser.ts";
import { applyDesignModel } from "./io/apply.ts";
import { serializeDesignJson } from "./io/json-serializer.ts";
import { parseDesignJson } from "./io/json-parser.ts";

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
    /**
     * 型パレット（db/<db>/datatypes.xml の <datatypes>）。段階4-0b で window.DATATYPES から移した。
     * 所有される側（Row / IO）は owner 鎖でここに到達する。
     */
    declare palette: TypePalette;
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

        this.xhrheaders = {};
        this.tables = [];
        this.relations = [];
        this.title = document.title;
        /*
         * 段階4-0b。requestDB() より前であることが必須で、コンストラクタの先頭寄りに置くのは
         * それより強い理由から: 旧 window.DATATYPES は評価時点で必ず存在し（globals.ts が
         * false で初期化していた）、未読込を false で表していた。生成が読み手より後になると
         * 「未読込」が undefined になり TypeError で割れる。ここなら以降のどの行より先。
         */
        this.palette = new TypePalette();

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
            this.palette.setRoot((xmlDoc as Document).documentElement);
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

    /*
     * grabado: 段階4-4 で known-issue #7 を直した。現行は this.tables を直接 sort() して
     * いたので、再配置するだけのつもりが**保存されるテーブル順まで変わって**いた
     * （js/io.ts の importresponse がロード直後に呼ぶため、サーバ import 経由で開くと
     * 保存内容の順序が入れ替わる）。
     *
     * 不具合は「配列を破壊すること」で、「関係数の降順に座標を割り当てること」は仕様。
     * そこで並べ替えた**コピー**を配置順としてだけ使う。this.tables の順序は入力のまま
     * 保たれ、moveTo() が動かす座標は従来と 1 ピクセルも変わらない
     * （sort は安定なので、関係数が同じテーブル同士の相対順も現行と同じ）。
     */
    alignTables(): void {
        var win = OZ.DOM.win();
        var avail = win[0] - OZ.$("bar").offsetWidth;
        var x = 10;
        var y = 10;
        var max = 0;

        var order = this.tables.slice().sort(function (a, b) {
            return b.getRelations().length - a.getRelations().length;
        });

        for (var i = 0; i < order.length; i++) {
            var t = order[i]!;
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

    /** 見つからなければ undefined を返す（js/io/apply.ts が if (!t1) continue で消費する） */
    findNamedTable(name: string | null): Table | undefined {
        /* find row specified as table(row) */
        for (var i = 0; i < this.tables.length; i++) {
            if (this.tables[i]!.getTitle() == name) {
                return this.tables[i];
            }
        }
        return undefined;
    }

    /*
     * grabado: 本体は段階4-1a で js/io/extract.ts と js/io/ddl-xml.ts に分けた。
     * このメソッド自体は残す —— 両ハーネス（node は new Designer() の戻り値、page は
     * window.d）が触る面で、名前と到達性が変わるとテストが要改修になる。
     * override が外れたのは基底 Visual の空 toXML() を同時に撤去したため。
     *
     * **段階4-3b で出荷側の呼び手は js/io.ts の finish()（DDL 生成）1 か所になった。**
     * 保存/読込 8 経路は toJson() / loadDesignText() に移り、ここに残る XML は
     * output.xsl（XSLT）への入力だけ。メソッドごと消えるのは §6.3。
     *
     * **段階4-4 で location.href の評価が消えた。** 4-1a で引数に押し出してあった
     * 唯一の環境依存で、これで出力は同一モデル→同一バイト列になる。
     */
    toXML(): string {
        return buildDdlInputXml(extractModel(this), this.palette);
    }

    /*
     * grabado: 本体は段階4-1b で js/io/xml-parser.ts と js/io/apply.ts に分けた。
     * toXML() のような 1 行委譲にせず 4 行残しているのは、**この 4 行の順序が
     * 本段階でいちばん危険**だから —— 両方を所有する唯一の場所に見える形で置く。
     *
     * clearTables() は**旧パレット**で走らなければならない。removeTable ->
     * rowManager.select(false) -> Row.deselect() -> redraw() -> getColor() ->
     * getDataType() とたどってパレットを読むので、先に差し替えると古い添字で
     * 新パレットを引くことになる。逆に parse（行の型解決）は**新パレット**で走る。
     * したがって clear -> setRoot -> parse -> apply の順は入れ替えられない。
     *
     * 基底 Visual の空 fromXML() は同時に撤去した（4-1a の toXML() と同じ論法。
     * 残すと table.fromXML() の消し漏れが TypeError にならず黙って何もしない）。
     * override が外れたのはそのため。
     */
    fromXML(node: Element): void {
        this.clearTables();
        var types = parseDatatypes(node);
        if (types) {
            this.palette.setRoot(types);
        }
        applyDesignModel(this, parseDesignXml(node, this.palette));
    }

    /*
     * grabado: 設計 JSON（HANDOVER §4 段階4-2）。**UI からはまだ呼ばれない** ——
     * js/io.ts の保存/読込 8 経路を JSON に切り替えるのは 4-3 で、本段階は形式側 2 本を
     * 足して安全網を張るところまで。現時点の呼び手は両ハーネスだけ。
     *
     * toJSON / fromJSON という名前にしない。toJSON は JSON.stringify の特殊フックなので、
     * Designer が（テストのスナップショットなどで）stringify される経路ができた瞬間に
     * 黙って発火する。
     */
    toJson(): string {
        return serializeDesignJson(extractModel(this), this.palette);
    }

    /*
     * fromXML() と違い 2 行で済む。JSON は型パレットを同梱せず db 名しか持たないので、
     * 4-1b が守った「clearTables() は旧パレットで、行の型解決は新パレットで」という
     * 順序制約がそもそも生じない（clear と apply の間にパレットが動かない）。
     *
     * parse を clearTables() より先に置いてあるのは、壊れた JSON で例外が出たときに
     * **今開いている設計を消さない**ため（XML 側は現行の挙動を保つのが要件なので
     * clear が先のまま）。
     */
    fromJson(text: string): void {
        var model = parseDesignJson(text, this.palette);
        this.clearTables();
        applyDesignModel(this, model);
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
            var types = this.palette.types();
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
            var types = this.palette.types();
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
