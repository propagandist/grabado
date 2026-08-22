/* --------------------- table row ( = db column) ------------ */
/*
 * grabado: ES クラス化（HANDOVER §3 段階2）。段階3-2 で .ts 化した。
 * _init() / _build() は従来 SQL.Visual.apply(this) を書いていた位置で呼ぶ。
 * 親メソッド呼び出し（旧 SQL.Visual.prototype.X.apply(this, ...)）は super.X() に。
 *
 * インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 */

import { OZ } from "./oz.ts";
import { _, publish } from "./globals.ts";
import { Visual, type VisualDom, type VisualData } from "./visual.ts";
import type { Table } from "./table.ts";
import type { Key } from "./key.ts";
import type { Relation } from "./relation.ts";

/**
 * buildEdit() が作る編集フォームの 8 要素。
 *
 * 不変条件: この 8 つが存在する ⇔ this.expanded === true。
 *   立てるのは expand() だけ（先頭で expanded を見て早期 return する）、
 *   読むのは collapse() / load() / changeComment() で、いずれも expanded が
 *   true のときしか到達しない（collapse も先頭で早期 return、changeComment は
 *   buildEdit が張ったリスナー経由）。
 * optional にしないのは、TS2532 が 20 箇所超に出てイディオム C（実行時ガードを
 * 足さない）と正面衝突するため。non-optional は「同じ不変条件を 20 回書く代わりに
 * ここに 1 回書く」ことと等価。
 */
export interface RowEditDom {
    name: HTMLInputElement;
    type: HTMLSelectElement;
    size: HTMLInputElement;
    def: HTMLInputElement;
    ai: HTMLInputElement;
    nll: HTMLInputElement;
    comment: HTMLSpanElement;
    commentbtn: HTMLInputElement;
}

export interface RowDom extends VisualDom, RowEditDom {
    container: HTMLTableSectionElement;
    content: HTMLTableRowElement;
    selected: HTMLDivElement;
    title: HTMLDivElement;
    typehint: HTMLTableCellElement;
}

export interface RowData extends VisualData {
    type: number;
    size: string;
    /**
     * 既定値。**"" が「既定なし」**で、それ以外に「既定 NULL」を表す内部表現は無い
     * （段階4-5 で null を撤去した。known-issue #2）。nullable な行に "NULL" と
     * 打った場合は update() が "" に潰す。
     */
    def: string;
    nll: boolean;
    ai: boolean;
    comment: string;
}

export class Row extends Visual<RowDom> {
    declare data: RowData;
    declare owner: Table;
    declare relations: Relation[];
    declare keys: Key[];
    declare selected: boolean;
    declare expanded: boolean;

    constructor(owner: Table, title: string, data?: Partial<RowData>) {
        super();
        this.owner = owner;
        this.relations = [];
        this.keys = [];
        this.selected = false;
        this.expanded = false;

        this._init();
        this._build();

        this.data.type = 0;
        this.data.size = "";
        this.data.def = "";
        this.data.nll = true;
        this.data.ai = false;
        this.data.comment = "";

        if (data) {
            this.update(data);
        }
        this.setTitle(title);
    }

    _build(): void {
        this.dom.container = OZ.DOM.elm("tbody");

        this.dom.content = OZ.DOM.elm("tr");
        this.dom.selected = OZ.DOM.elm("div", {
            className: "selected",
            innerHTML: "&raquo;&nbsp;",
        });
        this.dom.title = OZ.DOM.elm("div", { className: "title" });
        var td1 = OZ.DOM.elm("td");
        var td2 = OZ.DOM.elm("td", { className: "typehint" });
        this.dom.typehint = td2;

        OZ.DOM.append(
            [this.dom.container, this.dom.content],
            [this.dom.content, td1, td2],
            [td1, this.dom.selected, this.dom.title]
        );

        this.enter = this.enter.bind(this);
        this.changeComment = this.changeComment.bind(this);
        this.syncSizeField = this.syncSizeField.bind(this);

        OZ.Event.add(this.dom.container, "click", this.click.bind(this));
        OZ.Event.add(this.dom.container, "dblclick", this.dblclick.bind(this));
    }

    select(): void {
        if (this.selected) {
            return;
        }
        this.selected = true;
        for (var i = 0; i < this.relations.length; i++) {
            this.relations[i]!.highlight();
        }
        this.redraw();
    }

    deselect(): void {
        if (!this.selected) {
            return;
        }
        this.selected = false;
        for (var i = 0; i < this.relations.length; i++) {
            this.relations[i]!.dehighlight();
        }
        this.redraw();
        this.collapse();
    }

    setTitle(t: string): void {
        var old = this.getTitle();
        for (var i = 0; i < this.relations.length; i++) {
            var r = this.relations[i]!;
            if (r.row1 != this) {
                continue;
            }
            var tt = r.row2.getTitle().replace(new RegExp(old, "g"), t);
            if (tt != r.row2.getTitle()) {
                r.row2.setTitle(tt);
            }
        }

        super.setTitle(t);
    }

    click(e: MouseEvent): void {
        /* clicked on row */
        publish("rowclick", this);
        this.owner.owner.rowManager.select(this);
    }

    dblclick(e: MouseEvent): void {
        /* dblclicked on row */
        OZ.Event.prevent(e);
        OZ.Event.stop(e);
        this.expand();
    }

    update(data: Partial<RowData>): void {
        /* update subset of row data */
        /* grabado: 旧 SQL.designer（段階4-0a）。コンストラクタは this.owner の代入後に
           update() を呼ぶので、ここで owner 鎖は必ず張れている */
        var des = this.owner.owner;
        /*
         * grabado: 段階4-5（known-issue #2）。潰し先を null から "" に替えた。
         * nullable 列の DEFAULT NULL は SQL 上も暗黙の既定と同義なので情報は失われず、
         * これで「保存すると <default>NULL</default> が生える」経路が塞がる。
         * 条件（data.nll）は現行のまま —— NOT NULL 行に "NULL" と打った場合は
         * 従来どおり文字列として残る。
         *
         * この正規化は **ここ 1 箇所だけ**にある（parser は読んだ生値を渡す）。
         * 詳細は js/io/model.ts の RowModel.def。
         */
        if (data.nll && data.def && data.def.match(/^null$/i)) {
            data.def = "";
        }

        for (var p in data) {
            (this.data as unknown as Record<string, unknown>)[p] = (
                data as unknown as Record<string, unknown>
            )[p];
        }

        /*
         * grabado: 段階6-9a。**サイズを取らない型は size を持たない。**
         * def の正規化（上）と同じ立場で、ここ 1 箇所に置く —— UI・FK の伝播
         * （下のループが親の size をそのまま子へ渡す）・テンプレート適用の 3 経路が
         * 同じ規則を通る。読み込み側は js/io/xml-parser.ts が同じ判定を持っており、
         * どちらを通っても同じ状態になる。
         */
        if (!des.palette.hasSize(this.data.type)) {
            this.data.size = "";
        }

        var elm = this.getDataType();
        for (var i = 0; i < this.relations.length; i++) {
            var r = this.relations[i]!;
            if (r.row1 == this) {
                r.row2.update({
                    /* grabado: 段階6-2 で des.getFKTypeFor() から移した（id 照合・キャッシュ無し） */
                    type: des.palette.fkIndexFor(this.data.type),
                    size: this.data.size,
                });
            }
        }
        this.redraw();
    }

    up(): void {
        /* shift up */
        var r = this.owner.rows;
        var idx = r.indexOf(this);
        if (!idx) {
            return;
        }
        r[idx - 1]!.dom.container.parentNode!.insertBefore(
            this.dom.container,
            r[idx - 1]!.dom.container
        );
        r.splice(idx, 1);
        r.splice(idx - 1, 0, this);
        this.redraw();
    }

    down(): void {
        /* shift down */
        var r = this.owner.rows;
        var idx = r.indexOf(this);
        if (idx + 1 == this.owner.rows.length) {
            return;
        }
        r[idx]!.dom.container.parentNode!.insertBefore(
            this.dom.container,
            r[idx + 1]!.dom.container.nextSibling
        );
        r.splice(idx, 1);
        r.splice(idx + 1, 0, this);
        this.redraw();
    }

    /** ここが RowEditDom の 8 キーを成立させる唯一の場所（不変条件は同 interface のコメント） */
    buildEdit(): void {
        OZ.DOM.clear(this.dom.container);

        var elms: Array<[string, HTMLElement]> = [];
        this.dom.name = OZ.DOM.elm("input");
        this.dom.name.type = "text";
        elms.push(["name", this.dom.name]);
        OZ.Event.add(this.dom.name, "keypress", this.enter);

        this.dom.type = this.buildTypeSelect(this.data.type);
        elms.push(["type", this.dom.type]);
        /*
         * grabado: 段階6-9a。型を切り替えたら size 欄の開閉も切り替える。
         * 6-3 が length を読む契約にしたのは読み込み側だけで、**UI は型と無関係に
         * size を打てるまま**だった（db/postgresql/datatypes.xml の頭が「片側だけ
         * 閉じる形になる」と送っていた項目）。DDL 側は 6-8d が塞いだので出力は
         * 壊れないが、打った値が黙って消えるのは UI として不親切。
         */
        OZ.Event.add(this.dom.type, "change", this.syncSizeField);

        this.dom.size = OZ.DOM.elm("input");
        this.dom.size.type = "text";
        elms.push(["size", this.dom.size]);

        this.dom.def = OZ.DOM.elm("input");
        this.dom.def.type = "text";
        elms.push(["def", this.dom.def]);

        this.dom.ai = OZ.DOM.elm("input");
        this.dom.ai.type = "checkbox";
        elms.push(["ai", this.dom.ai]);

        this.dom.nll = OZ.DOM.elm("input");
        this.dom.nll.type = "checkbox";
        elms.push(["null", this.dom.nll]);

        this.dom.comment = OZ.DOM.elm("span", { className: "comment" });
        this.dom.comment.innerHTML = "";
        this.dom.comment.appendChild(
            document.createTextNode(this.data.comment)
        );

        this.dom.commentbtn = OZ.DOM.elm("input");
        this.dom.commentbtn.type = "button";
        this.dom.commentbtn.id = "commentbtn";
        this.dom.commentbtn.value = _("comment");

        OZ.Event.add(this.dom.commentbtn, "click", this.changeComment);

        for (var i = 0; i < elms.length; i++) {
            var row = elms[i]!;
            var tr = OZ.DOM.elm("tr");
            var td1 = OZ.DOM.elm("td");
            var td2 = OZ.DOM.elm("td");
            var l = OZ.DOM.text(_(row[0]) + ": ");
            OZ.DOM.append([tr, td1, td2], [td1, l], [td2, row[1]]);
            this.dom.container.appendChild(tr);
        }

        var tr = OZ.DOM.elm("tr");
        var td1 = OZ.DOM.elm("td");
        var td2 = OZ.DOM.elm("td");
        OZ.DOM.append(
            [tr, td1, td2],
            [td1, this.dom.comment],
            [td2, this.dom.commentbtn]
        );
        this.dom.container.appendChild(tr);
    }

    changeComment(e: MouseEvent): void {
        var c = prompt(_("commenttext"), this.data.comment);
        if (c === null) {
            return;
        }
        this.data.comment = c;
        this.dom.comment.innerHTML = "";
        this.dom.comment.appendChild(
            document.createTextNode(this.data.comment)
        );
    }

    expand(): void {
        if (this.expanded) {
            return;
        }
        this.expanded = true;
        this.buildEdit();
        this.load();
        this.redraw();
        this.dom.container.classList.add("expanded");
        this.dom.name.focus();
        this.dom.name.select();
    }

    collapse(): void {
        if (!this.expanded) {
            return;
        }
        this.expanded = false;
        this.dom.container.classList.remove("expanded");

        var data = {
            type: this.dom.type.selectedIndex,
            def: this.dom.def.value,
            size: this.dom.size.value,
            nll: this.dom.nll.checked,
            ai: this.dom.ai.checked,
        };

        OZ.DOM.clear(this.dom.container);
        this.dom.container.appendChild(this.dom.content);

        this.update(data);
        this.setTitle(this.dom.name.value);
    }

    load(): void {
        /* put data to expanded form */
        this.dom.name.value = this.getTitle();
        /* grabado: 段階4-5。null を "NULL" と表示する分岐を落とした（known-issue #2）。
           既定値を持たない行を開くと、"NULL" ではなく空欄が出る */
        this.dom.def.value = this.data.def;
        this.dom.size.value = this.data.size;
        this.dom.nll.checked = this.data.nll;
        this.dom.ai.checked = this.data.ai;
        this.syncSizeField();
    }

    /**
     * size 欄を選択中の型に合わせて開閉する（段階6-9a）。
     *
     * サイズを取らない型（<type length="0">）では**入力できないようにし、値も捨てる** ——
     * 残すと update() が正規化して黙って消えるので、打ってから消えるより打てないほうがよい。
     * 判定は読み込み側（js/io/xml-parser.ts）と DDL 側（js/io/ddl/shared.ts）と同じ
     * TypePalette.hasSize で、**3 経路が 1 つの規則を共有する**。
     *
     * 属性を持たない旧パレットでは hasSize が true を返すので、従来どおり自由に打てる。
     */
    syncSizeField(): void {
        var takesSize = this.owner.owner.palette.hasSize(this.dom.type.selectedIndex);
        this.dom.size.disabled = !takesSize;
        if (!takesSize) {
            this.dom.size.value = "";
        }
    }

    redraw(): void {
        var color = this.getColor();
        this.dom.container.style.backgroundColor = color;
        this.dom.container.style.borderColor = color;
        OZ.DOM.removeClass(this.dom.title, "primary");
        OZ.DOM.removeClass(this.dom.title, "key");
        if (this.isPrimary()) {
            OZ.DOM.addClass(this.dom.title, "primary");
        }
        if (this.isKey()) {
            OZ.DOM.addClass(this.dom.title, "key");
        }
        this.dom.selected.style.display = this.selected ? "" : "none";
        this.dom.container.title = this.data.comment;

        var typehint: string[] = [];
        if (this.owner.owner.getOption("showtype")) {
            var elm = this.getDataType();
            typehint.push(elm.getAttribute("sql")!);
        }

        if (this.owner.owner.getOption("showsize") && this.data.size) {
            typehint.push("(" + this.data.size + ")");
        }

        this.dom.typehint.innerHTML = typehint.join(" ");
        this.owner.redraw();
        this.owner.owner.rowManager.redraw();
    }

    addRelation(r: Relation): void {
        this.relations.push(r);
    }

    removeRelation(r: Relation): void {
        var idx = this.relations.indexOf(r);
        if (idx == -1) {
            return;
        }
        this.relations.splice(idx, 1);
    }

    addKey(k: Key): void {
        this.keys.push(k);
        this.redraw();
    }

    removeKey(k: Key): void {
        var idx = this.keys.indexOf(k);
        if (idx == -1) {
            return;
        }
        this.keys.splice(idx, 1);
        this.redraw();
    }

    /*
     * grabado: 型パレットの参照を window.DATATYPES から this.owner.owner.palette に
     * 移した（HANDOVER §4 段階4-0b）。owner 鎖は Row -> Table -> Designer で、
     * 段階4-0a が :169 に適用したものと同じ（終端は唯一の Designer と同一実体）。
     *
     * 戻りを non-null の Element で確定させるのは OZ.$ と同じ論法。呼び出し 4 箇所が
     * ガードなしで getAttribute を呼ぶので、undefined を戻り型に出すと全部が
     * イディオム C と衝突する（添字が範囲外なら現行も同じ場所で落ちる）。
     * パレットが未読込なのは dbResponse() が Element を入れるまでで、
     * ここに到達する時点では必ず読込済み（init2 は locale と datatypes が揃ってから走る）。
     */
    getDataType(): Element {
        var type = this.data.type;
        var elm = this.owner.owner.palette.typeAt(type);
        return elm;
    }

    getColor(): string {
        var elm = this.getDataType();
        var g = this.getDataType().parentNode as Element;
        return elm.getAttribute("color") || g.getAttribute("color") || "#fff";
    }

    buildTypeSelect(id: number): HTMLSelectElement {
        /* build selectbox with avail datatypes */
        var s = OZ.DOM.elm("select");
        var gs = this.owner.owner.palette.groups();
        for (var i = 0; i < gs.length; i++) {
            var g = gs[i]!;
            var og = OZ.DOM.elm("optgroup");
            og.style.backgroundColor = g.getAttribute("color") || "#fff";
            og.label = g.getAttribute("label")!;
            s.appendChild(og);
            var ts = g.getElementsByTagName("type");
            for (var j = 0; j < ts.length; j++) {
                var t = ts[j]!;
                var o = OZ.DOM.elm("option");
                if (t.getAttribute("color")) {
                    o.style.backgroundColor = t.getAttribute("color")!;
                }
                if (t.getAttribute("note")) {
                    o.title = t.getAttribute("note")!;
                }
                o.innerHTML = t.getAttribute("label")!;
                og.appendChild(o);
            }
        }
        s.selectedIndex = id;
        return s;
    }

    destroy(): void {
        super.destroy();
        while (this.relations.length) {
            this.owner.owner.removeRelation(this.relations[0]!);
        }
        for (var i = 0; i < this.keys.length; i++) {
            this.keys[i]!.removeRow(this);
        }
    }

    /*
     * grabado: fromXML() は段階4-1b で撤去した（読み込みは js/io/xml-parser.ts と
     * js/io/apply.ts）。型パレット依存の解決（sql / re 照合と <default> の quote 剥がし）は
     * parser 側が palette 引数で行う —— 4-1a で決めた §4 の規約。
     */

    isPrimary(): boolean {
        for (var i = 0; i < this.keys.length; i++) {
            var k = this.keys[i]!;
            if (k.getType() == "PRIMARY") {
                return true;
            }
        }
        return false;
    }

    isUnique(): boolean {
        for (var i = 0; i < this.keys.length; i++) {
            var k = this.keys[i]!;
            var t = k.getType();
            if (t == "PRIMARY" || t == "UNIQUE") {
                return true;
            }
        }
        return false;
    }

    isKey(): boolean {
        return this.keys.length > 0;
    }

    enter(e: KeyboardEvent): void {
        if (e.keyCode == 13) {
            this.collapse();
        }
    }
}
