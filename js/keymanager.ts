/* ----------------- key manager ---------- */

/*
 * grabado: ES クラス化（HANDOVER §3 段階3-3a）。段階3-3b で .ts 化した。
 *
 * this.purge の bind 再代入は「プロトタイプのメソッドをインスタンスの own property で
 * 上書きする」現行の形を温存している（Window.open にコールバックとして渡すため）。
 * インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 *
 * dom バッグは「文字列キーの動的代入」形態（docs/ARCHITECTURE.md §5.4 の (ii)）。
 * 型は完成形を宣言し、嘘は初期化とループ代入の 2 行に閉じ込める（段階3-2 の原理）。
 */

import { OZ } from "./oz.ts";
import { _, type SqlDesigner } from "./globals.ts";
import type { Table } from "./table.ts";
import type { Key } from "./key.ts";
import type { Row } from "./row.ts";

/** 不変条件は「build() を抜けた時点で全キーが埋まっている」（keyadd / keyremove はループが埋める） */
export interface KeyManagerDom {
    container: HTMLElement;
    list: HTMLSelectElement;
    type: HTMLSelectElement;
    name: HTMLInputElement;
    left: HTMLInputElement;
    right: HTMLInputElement;
    fields: HTMLSelectElement;
    avail: HTMLSelectElement;
    listlabel: HTMLLabelElement;
    keyadd: HTMLInputElement;
    keyremove: HTMLInputElement;
}

export class KeyManager {
    declare owner: SqlDesigner;
    declare dom: KeyManagerDom;
    /** open() / sync() が対象テーブルを入れる。それ以前に読む経路は無い */
    declare table: Table;
    /** switchTo() が選択中のキーを入れる */
    declare key: Key;
    /** 選択中キーに対応する <option>。redrawListItem がラベルを書き換える */
    declare option: HTMLOptionElement;

    constructor(owner: SqlDesigner) {
        this.owner = owner;
        /* 型は構築完了後の状態。残りは build() が埋める */
        this.dom = {
            container: OZ.$("keys"),
        } as unknown as KeyManagerDom;
        this.build();
    }

    build(): void {
        this.dom.list = OZ.$<HTMLSelectElement>("keyslist");
        this.dom.type = OZ.$<HTMLSelectElement>("keytype");
        this.dom.name = OZ.$<HTMLInputElement>("keyname");
        this.dom.left = OZ.$<HTMLInputElement>("keyleft");
        this.dom.right = OZ.$<HTMLInputElement>("keyright");
        this.dom.fields = OZ.$<HTMLSelectElement>("keyfields");
        this.dom.avail = OZ.$<HTMLSelectElement>("keyavail");
        this.dom.listlabel = OZ.$<HTMLLabelElement>("keyslistlabel");

        var ids = ["keyadd", "keyremove"];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i]!;
            var elm = OZ.$<HTMLInputElement>(id);
            /* 動的キーの代入はこの 1 行だけ。完成形は上の KeyManagerDom が宣言している */
            (this.dom as unknown as Record<string, HTMLInputElement>)[id] = elm;
            elm.value = _(id);
        }

        var ids = [
            "keyedit",
            "keytypelabel",
            "keynamelabel",
            "keyfieldslabel",
            "keyavaillabel",
        ];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i]!;
            /* grabado: 上のループの elm と型が違う（ラベル要素）ため改名した（段階3-3b） */
            var labelElm = OZ.$(id);
            labelElm.innerHTML = _(id);
        }

        var types = ["PRIMARY", "INDEX", "UNIQUE", "FULLTEXT"];
        OZ.DOM.clear(this.dom.type);
        for (var i = 0; i < types.length; i++) {
            var o = OZ.DOM.elm("option");
            o.innerHTML = types[i]!;
            o.value = types[i]!;
            this.dom.type.appendChild(o);
        }

        this.purge = this.purge.bind(this);

        OZ.Event.add(this.dom.list, "change", this.listchange.bind(this));
        OZ.Event.add(this.dom.type, "change", this.typechange.bind(this));
        OZ.Event.add(this.dom.name, "keyup", this.namechange.bind(this));
        OZ.Event.add(this.dom.keyadd, "click", this.add.bind(this));
        OZ.Event.add(this.dom.keyremove, "click", this.remove.bind(this));
        OZ.Event.add(this.dom.left, "click", this.left.bind(this));
        OZ.Event.add(this.dom.right, "click", this.right.bind(this));

        this.dom.container.parentNode!.removeChild(this.dom.container);
    }

    listchange(e?: Event): void {
        this.switchTo(this.dom.list.selectedIndex);
    }

    typechange(e?: Event): void {
        this.key.setType(this.dom.type.value);
        this.redrawListItem();
    }

    namechange(e?: Event): void {
        this.key.setName(this.dom.name.value);
        this.redrawListItem();
    }

    add(e?: Event): void {
        var type = this.table.keys.length ? "INDEX" : "PRIMARY";
        this.table.addKey(type);
        this.sync(this.table);
        this.switchTo(this.table.keys.length - 1);
    }

    remove(e?: Event): void {
        var index = this.dom.list.selectedIndex;
        if (index == -1) {
            return;
        }
        var r = this.table.keys[index]!;
        this.table.removeKey(r);
        this.sync(this.table);
    }

    purge(): void {
        /* remove empty keys */
        for (var i = this.table.keys.length - 1; i >= 0; i--) {
            var k = this.table.keys[i]!;
            if (!k.rows.length) {
                this.table.removeKey(k);
            }
        }
    }

    sync(table: Table): void {
        /* sync content with given table */
        this.table = table;
        this.dom.listlabel.innerHTML = _("keyslistlabel").replace(
            /%s/,
            table.getTitle()
        );

        OZ.DOM.clear(this.dom.list);
        for (var i = 0; i < table.keys.length; i++) {
            var k = table.keys[i]!;
            var o = OZ.DOM.elm("option");
            this.dom.list.appendChild(o);
            var str = i + 1 + ": " + k.getLabel();
            o.innerHTML = str;
        }
        if (table.keys.length) {
            this.switchTo(0);
        } else {
            this.disable();
        }
    }

    redrawListItem(): void {
        var index = this.table.keys.indexOf(this.key);
        this.option.innerHTML = index + 1 + ": " + this.key.getLabel();
    }

    switchTo(index: number): void {
        /* show Nth key */
        this.enable();
        /* index は listchange / add / sync のいずれかが渡す実在のインデックス */
        var k = this.table.keys[index]!;
        this.key = k;
        this.option = this.dom.list.getElementsByTagName("option")[index]!;

        this.dom.list.selectedIndex = index;
        this.dom.name.value = k.getName();

        var opts = this.dom.type.getElementsByTagName("option");
        for (var i = 0; i < opts.length; i++) {
            if (opts[i]!.value == k.getType()) {
                this.dom.type.selectedIndex = i;
            }
        }

        OZ.DOM.clear(this.dom.fields);
        for (var i = 0; i < k.rows.length; i++) {
            var o = OZ.DOM.elm("option");
            o.innerHTML = k.rows[i]!.getTitle();
            o.value = o.innerHTML;
            this.dom.fields.appendChild(o);
        }

        OZ.DOM.clear(this.dom.avail);
        for (var i = 0; i < this.table.rows.length; i++) {
            var r = this.table.rows[i]!;
            if (k.rows.indexOf(r) != -1) {
                continue;
            }
            var o = OZ.DOM.elm("option");
            o.innerHTML = r.getTitle();
            o.value = o.innerHTML;
            this.dom.avail.appendChild(o);
        }
    }

    disable(): void {
        OZ.DOM.clear(this.dom.fields);
        OZ.DOM.clear(this.dom.avail);
        this.dom.keyremove.disabled = true;
        this.dom.left.disabled = true;
        this.dom.right.disabled = true;
        this.dom.list.disabled = true;
        this.dom.name.disabled = true;
        this.dom.type.disabled = true;
        this.dom.fields.disabled = true;
        this.dom.avail.disabled = true;
    }

    enable(): void {
        this.dom.keyremove.disabled = false;
        this.dom.left.disabled = false;
        this.dom.right.disabled = false;
        this.dom.list.disabled = false;
        this.dom.name.disabled = false;
        this.dom.type.disabled = false;
        this.dom.fields.disabled = false;
        this.dom.avail.disabled = false;
    }

    left(e?: Event): void {
        /* add field to index */
        var opts = this.dom.avail.getElementsByTagName("option");
        for (var i = 0; i < opts.length; i++) {
            var o = opts[i]!;
            if (o.selected) {
                /* findNamedRow は Row | false（段階3-2）。option の value は
                   直前に switchTo() が同じテーブルの行名から作っているので必ず見つかる */
                var row = this.table.findNamedRow(o.value) as Row;
                this.key.addRow(row);
            }
        }
        this.switchTo(this.dom.list.selectedIndex);
    }

    right(e?: Event): void {
        /* remove field from index */
        var opts = this.dom.fields.getElementsByTagName("option");
        for (var i = 0; i < opts.length; i++) {
            var o = opts[i]!;
            if (o.selected) {
                var row = this.table.findNamedRow(o.value) as Row;
                this.key.removeRow(row);
            }
        }
        this.switchTo(this.dom.list.selectedIndex);
    }

    open(table: Table): void {
        this.sync(table);
        this.owner.window.open(_("tablekeys"), this.dom.container, this.purge);
    }
}
