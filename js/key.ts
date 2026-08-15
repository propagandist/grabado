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

    /* null を受けるのは、js/io/apply.ts が type 属性の生値をそのまま渡すため
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

    /*
     * grabado: fromXML() は段階4-1b で撤去した（読み込みは js/io/xml-parser.ts と
     * js/io/apply.ts）。<part> の nodeValue をガードなしで読む現行の癖も含めて逐語で移した。
     */
}
