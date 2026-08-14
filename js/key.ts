/* --------------------- db index ------------ */
/*
 * grabado: ES クラス化（HANDOVER §3 段階2）。段階3-2 で .ts 化した。
 * _init() / _build() は従来 SQL.Visual.apply(this) を書いていた位置で呼ぶ。
 *
 * dom を一度も触らないので基底の VisualDom のまま（_init() が入れた
 * {container, title} が使われずに残る）。インスタンスプロパティを declare で
 * 宣言する理由は js/visual.ts の冒頭。
 */

import { Visual } from "./visual.ts";
import type { Table } from "./table.ts";
import type { Row } from "./row.ts";

export class Key extends Visual {
    declare owner: Table;
    declare rows: Row[];
    declare type: string;
    declare name: string;

    constructor(owner: Table, type?: string, name?: string) {
        super();
        this.owner = owner;
        this.rows = [];
        this.type = type || "INDEX";
        this.name = name || "";
        this._init();
        this._build();
    }

    setName(n: string): void {
        this.name = n;
    }

    getName(): string {
        return this.name;
    }

    /* null を受けるのは、下の fromXML が getAttribute の結果をそのまま渡すため
       （ガードが実在するので型に出しても呼び出し側の負担にならない） */
    setType(t: string | null): void {
        if (!t) {
            return;
        }
        this.type = t;
        for (var i = 0; i < this.rows.length; i++) {
            this.rows[i]!.redraw();
        }
    }

    getType(): string {
        return this.type;
    }

    addRow(r: Row): void {
        if (r.owner != this.owner) {
            return;
        }
        this.rows.push(r);
        r.addKey(this);
    }

    removeRow(r: Row): void {
        var idx = this.rows.indexOf(r);
        if (idx == -1) {
            return;
        }
        r.removeKey(this);
        this.rows.splice(idx, 1);
    }

    /* 基底の destroy() は呼ばない（現行どおり）。Key は dom.container を持たないため */
    destroy(): void {
        for (var i = 0; i < this.rows.length; i++) {
            this.rows[i]!.removeKey(this);
        }
    }

    getLabel(): string {
        return this.name || this.type;
    }

    toXML(): string {
        var xml = "";
        xml +=
            '<key type="' +
            this.getType() +
            '" name="' +
            this.getName() +
            '">\n';
        for (var i = 0; i < this.rows.length; i++) {
            var r = this.rows[i]!;
            xml += "<part>" + r.getTitle() + "</part>\n";
        }
        xml += "</key>\n";
        return xml;
    }

    fromXML(node: Element): void {
        this.setType(node.getAttribute("type"));
        this.setName(node.getAttribute("name")!);
        var parts = node.getElementsByTagName("part");
        for (var i = 0; i < parts.length; i++) {
            var name = parts[i]!.firstChild!.nodeValue!;
            /* <part> には自テーブルの row 名しか書かれない前提（IO の不変条件）。
               外れれば現行も addRow の r.owner で TypeError になる */
            var row = this.owner.findNamedRow(name) as Row;
            this.addRow(row);
        }
    }
}
