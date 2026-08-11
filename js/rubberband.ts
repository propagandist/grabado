/* --------------------- rubberband -------------------- */
/*
 * grabado: ES クラス化（HANDOVER §3 段階2）。段階3-2 で .ts 化した。
 * _init() / _build() は従来 SQL.Visual.apply(this) を書いていた位置で呼ぶ。
 *
 * dom は基底の VisualDom のまま（container だけ使い、title は永久に null で参照 0）。
 * インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 */

import { OZ } from "./oz.ts";
import { SQL, type SqlDesigner } from "./globals.ts";
import { Visual } from "./visual.ts";

export class Rubberband extends Visual {
    declare owner: SqlDesigner;
    declare x: number;
    declare y: number;
    declare x0: number;
    declare y0: number;
    declare width: number;
    declare height: number;
    declare documentMove: number;
    declare documentUp: number;

    constructor(owner: SqlDesigner) {
        super();
        this.owner = owner;
        this._init();
        this._build();
        this.dom.container = OZ.$("rubberband");
        OZ.Event.add("area", "mousedown", this.down.bind(this));
    }

    down(e: MouseEvent): void {
        OZ.Event.prevent(e);
        var scroll = OZ.DOM.scroll();
        this.x = this.x0 = e.clientX + scroll[0];
        this.y = this.y0 = e.clientY + scroll[1];
        this.width = 0;
        this.height = 0;
        this.redraw();
        this.documentMove = OZ.Event.add(
            document,
            "mousemove",
            this.move.bind(this)
        );
        this.documentUp = OZ.Event.add(document, "mouseup", this.up.bind(this));
    }

    move(e: MouseEvent): void {
        var scroll = OZ.DOM.scroll();
        var x = e.clientX + scroll[0];
        var y = e.clientY + scroll[1];
        this.width = Math.abs(x - this.x0);
        this.height = Math.abs(y - this.y0);
        if (x < this.x0) {
            this.x = x;
        } else {
            this.x = this.x0;
        }
        if (y < this.y0) {
            this.y = y;
        } else {
            this.y = this.y0;
        }
        this.redraw();
        this.dom.container.style.visibility = "visible";
    }

    up(e: MouseEvent): void {
        OZ.Event.prevent(e);
        this.dom.container.style.visibility = "hidden";
        OZ.Event.remove(this.documentMove);
        OZ.Event.remove(this.documentUp);
        this.owner.tableManager.selectRect(
            this.x,
            this.y,
            this.width,
            this.height
        );
    }

    redraw(): void {
        this.dom.container.style.left = this.x + "px";
        this.dom.container.style.top = this.y + "px";
        this.dom.container.style.width = this.width + "px";
        this.dom.container.style.height = this.height + "px";
    }
}

SQL.Rubberband = Rubberband;
