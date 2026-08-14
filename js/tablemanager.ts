/* --------------------- table manager ------------ */

/*
 * grabado: ES クラス化（HANDOVER §3 段階3-3a）。段階3-3b で .ts 化した。
 *
 * this.save の bind 再代入は「プロトタイプのメソッドをインスタンスの own property で
 * 上書きする」現行の形を温存している（Window.open にコールバックとして渡すため）。
 * インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 *
 * dom バッグは「文字列キーの動的代入」形態（docs/ARCHITECTURE.md §5.4 の (ii)）。
 * 型は完成形を宣言し、嘘は初期化とループ代入の 2 行に閉じ込める（段階3-2 の原理）。
 */

import { OZ } from "./oz.ts";
import { _, type SqlDesigner } from "./globals.ts";
import type { Table } from "./table.ts";

/** 不変条件は「コンストラクタを抜けた時点で全キーが埋まっている」（ボタン 7 個はループが埋める） */
export interface TableManagerDom {
    container: HTMLElement;
    name: HTMLInputElement;
    comment: HTMLTextAreaElement;
    addtable: HTMLInputElement;
    removetable: HTMLInputElement;
    aligntables: HTMLInputElement;
    cleartables: HTMLInputElement;
    addrow: HTMLInputElement;
    edittable: HTMLInputElement;
    tablekeys: HTMLInputElement;
}

export class TableManager {
    declare owner: SqlDesigner;
    declare dom: TableManagerDom;
    declare selection: Table[];
    declare adding: boolean;
    /** 追加モードに入る前の #addtable のラベル（preAdd が控える） */
    declare oldvalue: string;

    constructor(owner: SqlDesigner) {
        this.owner = owner;
        /* 型は構築完了後の状態。残りはこの下のループが埋める */
        this.dom = {
            container: OZ.$("table"),
            name: OZ.$<HTMLInputElement>("tablename"),
            comment: OZ.$<HTMLTextAreaElement>("tablecomment"),
        } as unknown as TableManagerDom;
        this.selection = [];
        this.adding = false;

        var ids = [
            "addtable",
            "removetable",
            "aligntables",
            "cleartables",
            "addrow",
            "edittable",
            "tablekeys",
        ];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i]!;
            var elm = OZ.$<HTMLInputElement>(id);
            /* 動的キーの代入はこの 1 行だけ。完成形は上の TableManagerDom が宣言している */
            (this.dom as unknown as Record<string, HTMLInputElement>)[id] = elm;
            elm.value = _(id);
        }

        var ids = ["tablenamelabel", "tablecommentlabel"];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i]!;
            /* grabado: 上のループの elm と型が違う（ラベル要素）ため改名した（段階3-3b） */
            var labelElm = OZ.$(id);
            labelElm.innerHTML = _(id);
        }

        this.select(false);

        this.save = this.save.bind(this);

        OZ.Event.add("area", "click", this.click.bind(this));
        OZ.Event.add(this.dom.addtable, "click", this.preAdd.bind(this));
        OZ.Event.add(this.dom.removetable, "click", this.remove.bind(this));
        OZ.Event.add(this.dom.cleartables, "click", this.clear.bind(this));
        OZ.Event.add(this.dom.addrow, "click", this.addRow.bind(this));
        OZ.Event.add(
            this.dom.aligntables,
            "click",
            this.owner.alignTables.bind(this.owner)
        );
        OZ.Event.add(this.dom.edittable, "click", this.edit.bind(this));
        OZ.Event.add(this.dom.tablekeys, "click", this.keys.bind(this));
        OZ.Event.add(document, "keydown", this.press.bind(this));

        this.dom.container.parentNode!.removeChild(this.dom.container);
    }

    addRow(e?: Event): void {
        var newrow = this.selection[0]!.addRow(_("newrow"));
        this.owner.rowManager.select(newrow);
        newrow.expand();
    }

    select(table: Table | false, multi?: boolean): void {
        /* activate table */
        if (table) {
            if (multi) {
                var i = this.selection.indexOf(table);
                if (i < 0) {
                    this.selection.push(table);
                } else {
                    this.selection.splice(i, 1);
                }
            } else {
                if (this.selection[0] === table) {
                    return;
                }
                this.selection = [table];
            }
        } else {
            this.selection = [];
        }
        this.processSelection();
    }

    processSelection(): void {
        var tables = this.owner.tables;
        for (var i = 0; i < tables.length; i++) {
            tables[i]!.deselect();
        }
        if (this.selection.length == 1) {
            this.dom.addrow.disabled = false;
            this.dom.edittable.disabled = false;
            this.dom.tablekeys.disabled = false;
            this.dom.removetable.value = _("removetable");
        } else {
            this.dom.addrow.disabled = true;
            this.dom.edittable.disabled = true;
            this.dom.tablekeys.disabled = true;
        }
        if (this.selection.length) {
            this.dom.removetable.disabled = false;
            if (this.selection.length > 1) {
                this.dom.removetable.value = _("removetables");
            }
        } else {
            this.dom.removetable.disabled = true;
            this.dom.removetable.value = _("removetable");
        }
        for (var i = 0; i < this.selection.length; i++) {
            var t = this.selection[i]!;
            t.owner.raise(t);
            t.select();
        }
    }

    selectRect(x: number, y: number, width: number, height: number): void {
        /* select all tables intersecting a rectangle */
        this.selection = [];
        var tables = this.owner.tables;
        var x1 = x + width;
        var y1 = y + height;
        for (var i = 0; i < tables.length; i++) {
            var t = tables[i]!;
            var tx = t.x;
            var tx1 = t.x + t.width;
            var ty = t.y;
            var ty1 = t.y + t.height;
            if (
                ((tx >= x && tx < x1) ||
                    (tx1 >= x && tx1 < x1) ||
                    (tx < x && tx1 > x1)) &&
                ((ty >= y && ty < y1) ||
                    (ty1 >= y && ty1 < y1) ||
                    (ty < y && ty1 > y1))
            ) {
                this.selection.push(t);
            }
        }
        this.processSelection();
    }

    click(e: MouseEvent): void {
        /* finish adding new table */
        var newtable: Table | false = false;
        if (this.adding) {
            this.adding = false;
            OZ.DOM.removeClass("area", "adding");
            this.dom.addtable.value = this.oldvalue;
            var scroll = OZ.DOM.scroll();
            var x = e.clientX + scroll[0];
            var y = e.clientY + scroll[1];
            newtable = this.owner.addTable(_("newtable"), x, y);
            var r = newtable.addRow("id", { ai: true });
            /*
             * grabado: 第 2 引数 "" を落とした（HANDOVER §3 段階3-3b）。Table.addKey は
             * 1 引数しか読まず、現行でも捨てられている（js/table.ts:240 の予告どおり）。
             */
            var k = newtable.addKey("PRIMARY");
            k.addRow(r);
        }
        this.select(newtable);
        this.owner.rowManager.select(false);
        if (this.selection.length == 1) {
            this.edit(e);
        }
    }

    preAdd(e?: Event): void {
        /* click add new table */
        if (this.adding) {
            this.adding = false;
            OZ.DOM.removeClass("area", "adding");
            this.dom.addtable.value = this.oldvalue;
        } else {
            this.adding = true;
            OZ.DOM.addClass("area", "adding");
            this.oldvalue = this.dom.addtable.value;
            this.dom.addtable.value = "[" + _("addpending") + "]";
        }
    }

    clear(e?: Event): void {
        /* remove all tables */
        if (!this.owner.tables.length) {
            return;
        }
        var result = confirm(_("confirmall") + " ?");
        if (!result) {
            return;
        }
        this.owner.clearTables();
    }

    remove(e?: Event): void {
        /*
         * grabado: 現行は Table[] のコピーを文字列で上書きしていく。型では両方を持たせ、
         * 読み出し側に as Table を 1 個置くだけにした（実行コードは無変更・段階3-3b）。
         */
        var titles: Array<Table | string> = this.selection.slice(0);
        for (var i = 0; i < titles.length; i++) {
            titles[i] = "'" + (titles[i] as Table).getTitle() + "'";
        }
        var result = confirm(_("confirmtable") + " " + titles.join(", ") + "?");
        if (!result) {
            return;
        }
        var sel = this.selection.slice(0);
        for (var i = 0; i < sel.length; i++) {
            this.owner.removeTable(sel[i]!);
        }
    }

    edit(e?: Event): void {
        this.owner.window.open(_("edittable"), this.dom.container, this.save);

        var title = this.selection[0]!.getTitle();
        this.dom.name.value = title;
        try {
            /* throws in ie6 */
            this.dom.comment.value = this.selection[0]!.getComment();
        } catch (e) {}

        /* pre-select table name */
        this.dom.name.focus();
        /*
         * grabado: OZ.ie の分岐（IE6 で select() が throw するのを避ける経路）を
         * 撤去した（HANDOVER §3 段階3-3b）。元式 !!document.attachEvent && !window.opera は
         * Chromium 151 / jsdom 29 のどちらでも false（段階3-1 の実測）で、常に
         * else 側が走っている。これで js/oz.ts の ie / opera プロパティも参照 0 になった。
         */
        this.dom.name.setSelectionRange(0, title.length);
    }

    keys(e?: Event): void {
        /* open keys dialog */
        this.owner.keyManager.open(this.selection[0]!);
    }

    save(): void {
        this.selection[0]!.setTitle(this.dom.name.value);
        this.selection[0]!.setComment(this.dom.comment.value);
    }

    press(e: KeyboardEvent): void {
        var target = OZ.Event.target(e).nodeName.toLowerCase();
        if (target == "textarea" || target == "input") {
            return;
        } /* not when in form field */

        if (this.owner.rowManager.selected) {
            return;
        } /* do not process keypresses if a row is selected */

        if (!this.selection.length) {
            return;
        } /* nothing if selection is active */

        switch (e.keyCode) {
            case 46:
                this.remove();
                OZ.Event.prevent(e);
                break;
        }
    }
}
