/* --------------------- row manager ------------ */

/*
 * grabado: ES クラス化（HANDOVER §3 段階3-3a）。段階3-3b で .ts 化した。
 * インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 *
 * dom バッグは「文字列キーの動的代入」形態（docs/ARCHITECTURE.md §5.4 の (ii)）で、
 * ここは全 7 キーがループで埋まる。型は完成形を宣言し、嘘は初期化とループ代入の
 * 2 行に閉じ込める（段階3-2 の原理）。
 *
 * selected は Row | false | null を正直に出した。ガード付きで読む箇所（select /
 * redraw / press）が実在し、Row と偽るとその分岐が「型上ありえない」ことになるため。
 * ガードなしで読む up / down / remove / edit / foreigndisconnect / tableClick は
 * ボタンの disabled（redraw が管理）で保護されているので ! を置く。
 */

import { OZ } from "./oz.ts";
import { _, subscribe } from "./globals.ts";
import type { Row } from "./row.ts";
import type { Table } from "./table.ts";
/* owner の型。必ず import type で受ける（理由は js/table.ts の冒頭） */
import type { Designer } from "./wwwsqldesigner.ts";

/** 不変条件は「コンストラクタを抜けた時点で全キーが埋まっている」（7 個ともループが埋める） */
export interface RowManagerDom {
    editrow: HTMLInputElement;
    removerow: HTMLInputElement;
    uprow: HTMLInputElement;
    downrow: HTMLInputElement;
    foreigncreate: HTMLInputElement;
    foreignconnect: HTMLInputElement;
    foreigndisconnect: HTMLInputElement;
}

export class RowManager {
    declare owner: Designer;
    declare dom: RowManagerDom;
    declare selected: Row | false | null;
    declare creating: boolean;
    declare connecting: boolean;

    constructor(owner: Designer) {
        this.owner = owner;
        /* 型は構築完了後の状態。7 キーはこの下のループが埋める */
        this.dom = {} as unknown as RowManagerDom;
        this.selected = null;
        this.creating = false;
        this.connecting = false;

        var ids = [
            "editrow",
            "removerow",
            "uprow",
            "downrow",
            "foreigncreate",
            "foreignconnect",
            "foreigndisconnect",
        ];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i]!;
            var elm = OZ.$<HTMLInputElement>(id);
            /* 動的キーの代入はこの 1 行だけ。完成形は上の RowManagerDom が宣言している */
            (this.dom as unknown as Record<string, HTMLInputElement>)[id] = elm;
            elm.value = _(id);
        }

        this.select(false);

        OZ.Event.add(this.dom.editrow, "click", this.edit.bind(this));
        OZ.Event.add(this.dom.uprow, "click", this.up.bind(this));
        OZ.Event.add(this.dom.downrow, "click", this.down.bind(this));
        OZ.Event.add(this.dom.removerow, "click", this.remove.bind(this));
        OZ.Event.add(
            this.dom.foreigncreate,
            "click",
            this.foreigncreate.bind(this)
        );
        OZ.Event.add(
            this.dom.foreignconnect,
            "click",
            this.foreignconnect.bind(this)
        );
        OZ.Event.add(
            this.dom.foreigndisconnect,
            "click",
            this.foreigndisconnect.bind(this)
        );
        OZ.Event.add(document, "keydown", this.press.bind(this));

        subscribe("tableclick", this.tableClick.bind(this));
        subscribe("rowclick", this.rowClick.bind(this));
    }

    select(row: Row | false): void {
        /* activate a row */
        if (this.selected === row) {
            return;
        }
        if (this.selected) {
            this.selected.deselect();
        }

        this.selected = row;
        if (this.selected) {
            this.selected.select();
        }
        this.redraw();
    }

    tableClick(e: { target: unknown; data: unknown }): void {
        /* create relation after clicking target table */
        if (!this.creating) {
            return;
        }

        var r1 = this.selected as Row;
        var t2 = e.target as Table;

        /* getOption の戻りは string | number（既定値に 0 がある）。pattern は文字列 */
        var p = this.owner.getOption("pattern") as string;
        p = p.replace(/%T/g, r1.owner.getTitle());
        p = p.replace(/%t/g, t2.getTitle());
        p = p.replace(/%R/g, r1.getTitle());

        var r2 = t2.addRow(p, r1.data);
        /* grabado: 旧 SQL.designer（段階4-0a）。すぐ上の :118 が同じ this.owner を読んでいる。
           解決そのものは段階6-2 で this.owner.getFKTypeFor() から palette へ移した */
        r2.update({ type: this.owner.palette.fkIndexFor(r1.data.type) });
        r2.update({ ai: false });
        this.owner.addRelation(r1, r2);
    }

    rowClick(e: { target: unknown; data: unknown }): void {
        /* draw relation after clicking target row */
        if (!this.connecting) {
            return;
        }

        var r1 = this.selected as Row;
        var r2 = e.target as Row;

        if (r1 == r2) {
            return;
        }

        this.owner.addRelation(r1, r2);
    }

    foreigncreate(e?: Event): void {
        /* start creating fk */
        this.endConnect();
        if (this.creating) {
            this.endCreate();
        } else {
            this.creating = true;
            this.dom.foreigncreate.value = "[" + _("foreignpending") + "]";
        }
    }

    foreignconnect(e?: Event): void {
        /* start drawing fk */
        this.endCreate();
        if (this.connecting) {
            this.endConnect();
        } else {
            this.connecting = true;
            this.dom.foreignconnect.value =
                "[" + _("foreignconnectpending") + "]";
        }
    }

    foreigndisconnect(e?: Event): void {
        /* remove connector */
        var rels = (this.selected as Row).relations;
        for (var i = rels.length - 1; i >= 0; i--) {
            var r = rels[i]!;
            if (r.row2 == this.selected) {
                this.owner.removeRelation(r);
            }
        }
        this.redraw();
    }

    endCreate(): void {
        this.creating = false;
        this.dom.foreigncreate.value = _("foreigncreate");
    }

    endConnect(): void {
        this.connecting = false;
        this.dom.foreignconnect.value = _("foreignconnect");
    }

    up(e?: Event): void {
        (this.selected as Row).up();
        this.redraw();
    }

    down(e?: Event): void {
        (this.selected as Row).down();
        this.redraw();
    }

    remove(e?: Event): void {
        var result = confirm(
            _("confirmrow") + " '" + (this.selected as Row).getTitle() + "' ?"
        );
        if (!result) {
            return;
        }
        var t = (this.selected as Row).owner;
        (this.selected as Row).owner.removeRow(this.selected as Row);

        var next: Row | false = false;
        if (t.rows) {
            next = t.rows[t.rows.length - 1]!;
        }
        this.select(next);
    }

    redraw(): void {
        this.endCreate();
        this.endConnect();
        if (this.selected) {
            var table = this.selected.owner;
            var rows = table.rows;
            this.dom.uprow.disabled = rows[0] == this.selected;
            this.dom.downrow.disabled = rows[rows.length - 1] == this.selected;
            this.dom.removerow.disabled = false;
            this.dom.editrow.disabled = false;
            this.dom.foreigncreate.disabled = !this.selected.isUnique();
            this.dom.foreignconnect.disabled = !this.selected.isUnique();

            this.dom.foreigndisconnect.disabled = true;
            var rels = this.selected.relations;
            for (var i = 0; i < rels.length; i++) {
                var r = rels[i]!;
                if (r.row2 == this.selected) {
                    this.dom.foreigndisconnect.disabled = false;
                }
            }
        } else {
            this.dom.uprow.disabled = true;
            this.dom.downrow.disabled = true;
            this.dom.removerow.disabled = true;
            this.dom.editrow.disabled = true;
            this.dom.foreigncreate.disabled = true;
            this.dom.foreignconnect.disabled = true;
            this.dom.foreigndisconnect.disabled = true;
        }
    }

    press(e: KeyboardEvent): void {
        if (!this.selected) {
            return;
        }

        var target = OZ.Event.target(e).nodeName.toLowerCase();
        if (target == "textarea" || target == "input") {
            return;
        } /* not when in form field */

        switch (e.keyCode) {
            case 38:
                this.up();
                OZ.Event.prevent(e);
                break;
            case 40:
                this.down();
                OZ.Event.prevent(e);
                break;
            case 46:
                this.remove();
                OZ.Event.prevent(e);
                break;
            case 13:
            case 27:
                this.selected.collapse();
                break;
        }
    }

    edit(e?: Event): void {
        (this.selected as Row).expand();
    }
}
