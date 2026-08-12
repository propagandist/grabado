/* --------------------- db table ------------ */
/*
 * grabado: ES クラス化（HANDOVER §3 段階2）。段階3-2 で .ts 化した。
 * _init() / _build() は従来 SQL.Visual.apply(this) を書いていた位置で呼ぶ。
 * _build() が this.owner.map.dom.container を読むので、this.owner の代入より
 * 後でなければならない（＝基底コンストラクタからは呼べない）。
 *
 * Row / Key の生成は new SQL.Row / new SQL.Key のまま据え置く。import に変えると
 * 実行コードが変わるうえ、js/key.ts は本ファイルより後に読む決まりなので値 import は
 * 評価順を逆転させる。型は js/globals.ts の SqlNamespace が供給する（イディオム B の
 * 例外である SQL.designer と同じ論理）。
 *
 * インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 */

import { OZ } from "./oz.ts";
import { SQL, type SqlDesigner } from "./globals.ts";
import { Visual, type VisualDom, type VisualData } from "./visual.ts";
import type { Row, RowData } from "./row.ts";
import type { Key } from "./key.ts";
import type { Relation } from "./relation.ts";

export interface TableDom extends VisualDom {
    container: HTMLDivElement;
    content: HTMLTableElement;
    title: HTMLTableCellElement;
    /** ミニマップ上の分身。自分では append せず Minimap の中に入る（_build を参照） */
    mini: HTMLDivElement;
}

export interface TableData extends VisualData {
    comment: string;
}

export class Table extends Visual<TableDom> {
    /*
     * ドラッグ中の状態。現行は down() が代入するまでプロパティ自体が存在せず、
     * up() が active を false に戻す。初期化子を書かないのは、= false にすると
     * 初回ドラッグ前の値が undefined から false に変わるため（読むのは move() と
     * up() だけなので観測はできないが、証明できる同値を採る）。
     *
     * 型は「読むときの形」だけを出す。active に Table[] | false を出すと move() と
     * up() の t.active.length が 2 箇所エラーになり、イディオム C でガードを足せない。
     * false は「ドラッグ終了」の印で、up() がリスナーを外しているので次の down() が
     * 代入するまで読まれない。static には declare を付けない（現行の emit と揃える）。
     */
    static active: Table[];
    static x: number[];
    static y: number[];

    declare data: TableData;
    declare owner: SqlDesigner;
    declare rows: Row[];
    declare keys: Key[];
    declare zIndex: number;
    /** 自分が張ったリスナーの id。destroy() でまとめて外す */
    declare _ec: number[];
    declare flag: boolean;
    declare selected: boolean;
    declare x: number;
    declare y: number;
    declare width: number;
    declare height: number;
    declare documentMove: number;
    declare documentUp: number;

    constructor(
        owner: SqlDesigner,
        name: string,
        x: number | undefined,
        y: number | undefined,
        z: number
    ) {
        super();
        this.owner = owner;
        this.rows = [];
        this.keys = [];
        this.zIndex = 0;
        this._ec = [];

        this.flag = false;
        this.selected = false;
        this._init();
        this._build();
        this.data.comment = "";

        this.setTitle(name);
        this.x = x || 0;
        this.y = y || 0;
        this.setZ(z);
        this.snap();
    }

    _build(): void {
        this.dom.container = OZ.DOM.elm("div", { className: "table" });
        this.dom.content = OZ.DOM.elm("table");
        var thead = OZ.DOM.elm("thead");
        var tr = OZ.DOM.elm("tr");
        this.dom.title = OZ.DOM.elm("td", { className: "title", colSpan: 2 });

        OZ.DOM.append(
            [this.dom.container, this.dom.content],
            [this.dom.content, thead],
            [thead, tr],
            [tr, this.dom.title]
        );

        this.dom.mini = OZ.DOM.elm("div", { className: "mini" });
        this.owner.map.dom.container.appendChild(this.dom.mini);

        this._ec.push(
            OZ.Event.add(this.dom.container, "click", this.click.bind(this))
        );
        this._ec.push(
            OZ.Event.add(
                this.dom.container,
                "dblclick",
                this.dblclick.bind(this)
            )
        );
        this._ec.push(
            OZ.Event.add(this.dom.container, "mousedown", this.down.bind(this))
        );
        this._ec.push(
            OZ.Event.add(this.dom.container, "touchstart", this.down.bind(this))
        );
        this._ec.push(
            OZ.Event.add(this.dom.container, "touchmove", OZ.Event.prevent)
        );
    }

    setTitle(t: string): void {
        var old = this.getTitle();
        for (var i = 0; i < this.rows.length; i++) {
            var row = this.rows[i]!;
            for (var j = 0; j < row.relations.length; j++) {
                var r = row.relations[j]!;
                if (r.row1 != row) {
                    continue;
                }
                var tt = row.getTitle().replace(new RegExp(old, "g"), t);
                if (tt != row.getTitle()) {
                    row.setTitle(tt);
                }
            }
        }
        super.setTitle(t);
    }

    getRelations(): Relation[] {
        var arr: Relation[] = [];
        for (var i = 0; i < this.rows.length; i++) {
            var row = this.rows[i]!;
            for (var j = 0; j < row.relations.length; j++) {
                var r = row.relations[j]!;
                if (arr.indexOf(r) == -1) {
                    arr.push(r);
                }
            }
        }
        return arr;
    }

    showRelations(): void {
        var rs = this.getRelations();
        for (var i = 0; i < rs.length; i++) {
            rs[i]!.show();
        }
    }

    hideRelations(): void {
        var rs = this.getRelations();
        for (var i = 0; i < rs.length; i++) {
            rs[i]!.hide();
        }
    }

    click(e: MouseEvent): void {
        OZ.Event.stop(e);
        var t = OZ.Event.target(e);
        this.owner.tableManager.select(this);

        if (t != this.dom.title) {
            return;
        } /* click on row */

        SQL.publish("tableclick", this);
        this.owner.rowManager.select(false);
    }

    dblclick(e: MouseEvent): void {
        var t = OZ.Event.target(e);
        if (t == this.dom.title) {
            this.owner.tableManager.edit();
        }
    }

    select(): void {
        if (this.selected) {
            return;
        }
        this.selected = true;
        OZ.DOM.addClass(this.dom.container, "selected");
        OZ.DOM.addClass(this.dom.mini, "mini_selected");
        this.redraw();
    }

    deselect(): void {
        if (!this.selected) {
            return;
        }
        this.selected = false;
        OZ.DOM.removeClass(this.dom.container, "selected");
        OZ.DOM.removeClass(this.dom.mini, "mini_selected");
        this.redraw();
    }

    addRow(title: string, data?: Partial<RowData>): Row {
        var r = new SQL.Row(this, title, data);
        this.rows.push(r);
        this.dom.content.appendChild(r.dom.container);
        this.redraw();
        return r;
    }

    removeRow(r: Row): void {
        var idx = this.rows.indexOf(r);
        if (idx == -1) {
            return;
        }
        r.destroy();
        this.rows.splice(idx, 1);
        this.redraw();
    }

    /*
     * grabado: 仮引数名を name から type に直した（HANDOVER §3 段階3-2）。
     * 実引数は SQL.Key の第 2 引数＝type に渡っており、name という名前は誤読しかない。
     * arguments を読んでいないので emit 上の意味は変わらない。
     * js/tablemanager.js:154 だけが addKey("PRIMARY", "") と 2 引数で呼ぶ。第 2 引数は
     * 現行でも捨てられており、new Key(this, "PRIMARY") でも name は name || "" で "" に
     * なるので結果は同一。是正は同ファイルを .ts 化する段階3-3 で行う。
     */
    addKey(type?: string): Key {
        var k = new SQL.Key(this, type);
        this.keys.push(k);
        return k;
    }

    removeKey(k: Key): void {
        var idx = this.keys.indexOf(k);
        if (idx == -1) {
            return;
        }
        k.destroy();
        this.keys.splice(idx, 1);
    }

    redraw(): void {
        var x = this.x;
        var y = this.y;
        if (this.selected) {
            x--;
            y--;
        }
        this.dom.container.style.left = x + "px";
        this.dom.container.style.top = y + "px";

        var ratioX = this.owner.map.width / this.owner.width;
        var ratioY = this.owner.map.height / this.owner.height;

        var w = this.dom.container.offsetWidth * ratioX;
        var h = this.dom.container.offsetHeight * ratioY;
        var x = this.x * ratioX;
        var y = this.y * ratioY;

        this.dom.mini.style.width = Math.round(w) + "px";
        this.dom.mini.style.height = Math.round(h) + "px";
        this.dom.mini.style.left = Math.round(x) + "px";
        this.dom.mini.style.top = Math.round(y) + "px";

        this.width = this.dom.container.offsetWidth;
        this.height = this.dom.container.offsetHeight;

        var rs = this.getRelations();
        for (var i = 0; i < rs.length; i++) {
            rs[i]!.redraw();
        }
    }

    moveBy(dx: number, dy: number): void {
        this.x += dx;
        this.y += dy;

        this.snap();
        this.redraw();
    }

    moveTo(x: number, y: number): void {
        this.x = x;
        this.y = y;

        this.snap();
        this.redraw();
    }

    snap(): void {
        /* getOption("snap") の既定は数値 0、cookie 経由なら文字列。
           parseInt(0) は現行も "0" に変換されて 0 になる（挙動不変） */
        var snap = parseInt(SQL.designer.getOption("snap") as string);
        if (snap) {
            this.x = Math.round(this.x / snap) * snap;
            this.y = Math.round(this.y / snap) * snap;
        }
    }

    down(e: MouseEvent | TouchEvent): void {
        /* mousedown - start drag */
        OZ.Event.stop(e);
        /* grabado: 元は var t（HANDOVER §3 段階3-2）。下の var t = Table と同名で
           TS2403（HTMLElement と typeof Table）になる。読み出しは次の 1 行だけで、
           以降このスコープでは読まれない＝挙動同値 */
        var el = OZ.Event.target(e);
        if (el != this.dom.title) {
            return;
        } /* on a row */

        /* touch? */
        /* grabado: 元は両分岐とも var event。TS2403 は宣言型の一致を見るので、
           同じ注釈を両方に書けば消える（読むのは clientX / clientY だけ） */
        if (e.type == "touchstart") {
            var event: MouseEvent | Touch = (e as TouchEvent).touches[0]!;
            var moveEvent = "touchmove";
            var upEvent = "touchend";
        } else {
            var event: MouseEvent | Touch = e as MouseEvent;
            var moveEvent = "mousemove";
            var upEvent = "mouseup";
        }

        /* a non-shift click within a selection preserves the selection */
        if (e.shiftKey || !this.selected) {
            this.owner.tableManager.select(this, e.shiftKey);
        }

        var t = Table;
        t.active = this.owner.tableManager.selection;
        var n = t.active.length;
        t.x = new Array(n);
        t.y = new Array(n);
        for (var i = 0; i < n; i++) {
            /* position relative to mouse cursor */
            t.x[i] = t.active[i]!.x - event.clientX;
            t.y[i] = t.active[i]!.y - event.clientY;
        }

        if (this.owner.getOption("hide")) {
            for (var i = 0; i < n; i++) {
                t.active[i]!.hideRelations();
            }
        }

        this.documentMove = OZ.Event.add(
            document,
            moveEvent,
            this.move.bind(this)
        );
        this.documentUp = OZ.Event.add(document, upEvent, this.up.bind(this));
    }

    toXML(): string {
        var t = this.getTitle().replace(/"/g, "&quot;");
        var xml = "";
        xml +=
            '<table x="' + this.x + '" y="' + this.y + '" name="' + t + '">\n';
        for (var i = 0; i < this.rows.length; i++) {
            xml += this.rows[i]!.toXML();
        }
        for (var i = 0; i < this.keys.length; i++) {
            xml += this.keys[i]!.toXML();
        }
        var c = this.getComment();
        if (c) {
            xml += "<comment>" + SQL.escape(c) + "</comment>\n";
        }
        xml += "</table>\n";
        return xml;
    }

    fromXML(node: Element): void {
        var name = node.getAttribute("name");
        this.setTitle(name!);
        var x = parseInt(node.getAttribute("x")!) || 0;
        var y = parseInt(node.getAttribute("y")!) || 0;
        this.moveTo(x, y);
        var rows = node.getElementsByTagName("row");
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i]!;
            var r = this.addRow("");
            r.fromXML(row);
        }
        var keys = node.getElementsByTagName("key");
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i]!;
            var k = this.addKey();
            k.fromXML(key);
        }
        for (var i = 0; i < node.childNodes.length; i++) {
            /* テキストノードも来るので Element として読む（tagName が無ければ短絡する） */
            var ch = node.childNodes[i] as Element;
            if (
                ch.tagName &&
                ch.tagName.toLowerCase() == "comment" &&
                ch.firstChild
            ) {
                this.setComment(ch.firstChild.nodeValue!);
            }
        }
    }

    getZ(): number {
        return this.zIndex;
    }

    setZ(z: number): void {
        this.zIndex = z;
        /* 数値→文字列の暗黙変換に依存している代入（現行のまま） */
        this.dom.container.style.zIndex = z as unknown as string;
    }

    /*
     * false を戻り型に出すのは、js/wwwsqldesigner.js が if (!r1) { continue; } で
     * 実際に消費しているため（Row と偽ると段階3-3 でその分岐が型上ありえなくなる）。
     * 唯一ガードなしで受ける js/key.ts 側を 1 キャストで通す。
     */
    /* n が null になりうるのは Designer.fromXML の relation 属性経由（属性が無いとき） */
    findNamedRow(n: string | null): Row | false {
        /* return row with a given name */
        for (var i = 0; i < this.rows.length; i++) {
            if (this.rows[i]!.getTitle() == n) {
                return this.rows[i]!;
            }
        }
        return false;
    }

    setComment(c: string): void {
        this.data.comment = c;
        this.dom.title.title = this.data.comment;
    }

    getComment(): string {
        return this.data.comment;
    }

    move(e: MouseEvent | TouchEvent): void {
        /* mousemove */
        var t = Table;
        SQL.designer.removeSelection();
        if (e.type == "touchmove") {
            if ((e as TouchEvent).touches.length > 1) {
                return;
            }
            var event: MouseEvent | Touch = (e as TouchEvent).touches[0]!;
        } else {
            var event: MouseEvent | Touch = e as MouseEvent;
        }

        for (var i = 0; i < t.active.length; i++) {
            var x = t.x[i]! + event.clientX;
            var y = t.y[i]! + event.clientY;
            x = Math.max(x, 0);
            y = Math.max(y, 0);
            t.active[i]!.moveTo(x, y);
        }
    }

    up(e: MouseEvent | TouchEvent): void {
        var t = Table;
        var d = SQL.designer;
        if (d.getOption("hide")) {
            for (var i = 0; i < t.active.length; i++) {
                t.active[i]!.showRelations();
                t.active[i]!.redraw();
            }
        }
        t.active = false as unknown as Table[];
        OZ.Event.remove(this.documentMove);
        OZ.Event.remove(this.documentUp);
        this.owner.sync();
    }

    destroy(): void {
        super.destroy();
        this.dom.mini.parentNode!.removeChild(this.dom.mini);
        while (this.rows.length) {
            this.removeRow(this.rows[0]!);
        }
        this._ec.forEach(OZ.Event.remove, OZ.Event);
    }
}

SQL.Table = Table;
