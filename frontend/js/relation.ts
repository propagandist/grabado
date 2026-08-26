/* --------------------------- relation (connector) ----------- */
/*
 * grabado: ES クラス化（HANDOVER §3 段階2）。段階3-2 で .ts 化した。
 * _init() / _build() は従来 SQL.Visual.apply(this) を書いていた位置で呼ぶ。
 *
 * dom が配列なのはこのクラスだけで、基底 Visual を型引数付きにした理由そのもの
 * （docs/ARCHITECTURE.md §5.4 の「3 形態」）。要素をユニオンにしてあるのは、
 * setAttribute（Element 由来）と .style（SVGElement も ElementCSSInlineStyle を
 * 実装する）がユニオンの両側にあるため、読み出し 28 箇所がキャストなしで通る。
 * 配列側のユニオン（SVGPathElement[] | HTMLDivElement[]）にすると owner.vector が
 * this.dom を narrowing しないので全箇所にキャストが要る。
 *
 * インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 */

import { OZ } from "./oz.ts";
import { CONFIG } from "./config.ts";
import { Visual } from "./visual.ts";
import type { Row } from "./row.ts";
/* owner の型。必ず import type で受ける（理由は js/table.ts の冒頭） */
import type { Designer } from "./wwwsqldesigner.ts";

/** vector なら path 1 本、非 vector なら div 3 本（constructor を参照） */
export type RelationNode = SVGPathElement | HTMLDivElement;

/**
 * 先頭 1 個を保証したタプル。dom[0] のリテラル添字 12 箇所が ! なしで通る。
 * 空配列なのは constructor の this.dom = [] から push までの間だけ。
 */
export type RelationDom = [RelationNode, ...RelationNode[]];

export class Relation extends Visual<RelationDom> {
    static _counter = 0;

    declare owner: Designer;
    declare row1: Row;
    declare row2: Row;
    declare color: string;
    declare hidden: boolean;
    declare relationColors: string[];
    declare highlighted: boolean | null;
    declare style: string;

    constructor(owner: Designer, row1: Row, row2: Row) {
        super();
        this.owner = owner;
        this.row1 = row1;
        this.row2 = row2;
        this.color = "#000";
        this.hidden = false;
        this.relationColors = CONFIG.RELATION_COLORS;
        this.highlighted = null;
        this._init();
        this._build();

        /* grabado: 旧 SQL.designer（段階4-0a）。this.owner は上の代入で入っている */
        this.style = this.owner.getOption("style");
        switch (this.style) {
            case "material-inspired":
                this.relationColors = CONFIG.MATERIAL_RELATION_COLORS;
                break;
            case "original":
            default:
                this.relationColors = CONFIG.RELATION_COLORS;
        }

        /* if one of the rows already has relations, inherit color */
        var all = row1.relations.concat(row2.relations);
        if (all.length) {
            /* inherit */
            this.color = all[0]!.getColor();
        } else if (this.relationColors) {
            /* pick next */
            Relation._counter++;
            var colorIndex =
                (Relation._counter - 1) % this.relationColors.length;
            this.color = this.relationColors[colorIndex]!;
        }

        this.row1.addRelation(this);
        this.row2.addRelation(this);
        /*
         * 基底の _init() が入れた dom（{container, title}）を配列で置き換える。
         * 型の嘘はこの 1 行に閉じ込める（直後に必ず 1 本以上 push する）。
         */
        this.dom = [] as unknown as RelationDom;

        if (this.owner.vector) {
            /* svgNS は string なので createElementNS の戻りは Element 止まり */
            var path = document.createElementNS(
                this.owner.svgNS,
                "path"
            ) as SVGPathElement;
            path.setAttribute("stroke", this.color);
            /* 数値→文字列の暗黙変換に依存している代入（現行のまま） */
            path.setAttribute(
                "stroke-width",
                CONFIG.RELATION_THICKNESS as unknown as string
            );
            path.setAttribute("fill", "none");
            this.owner.dom.svg.appendChild(path);
            this.dom.push(path);
        } else {
            for (var i = 0; i < 3; i++) {
                var div = OZ.DOM.elm("div", {
                    position: "absolute",
                    className: "relation",
                    backgroundColor: this.color,
                });
                this.dom.push(div);
                if (i & 1) {
                    /* middle */
                    OZ.Style.set(div, {
                        width: CONFIG.RELATION_THICKNESS + "px",
                    });
                } else {
                    /* first & last */
                    OZ.Style.set(div, {
                        height: CONFIG.RELATION_THICKNESS + "px",
                    });
                }
                this.owner.dom.container.appendChild(div);
            }
        }

        this.redraw();
    }

    getColor(): string {
        return this.color;
    }

    highlight(): void {
        if (this.highlighted) {
            return;
        }
        this.highlighted = true;
        this.dom[0].setAttribute("stroke", CONFIG.RELATION_HIGHLIGHTED_COLOR);
        this.dom[0].setAttribute(
            "stroke-width",
            CONFIG.RELATION_HIGHLIGHTED_THICKNESS as unknown as string
        );
        this.redraw();
    }

    dehighlight(): void {
        if (!this.highlighted) {
            return;
        }
        this.highlighted = false;
        this.dom[0].setAttribute("stroke", this.color);
        this.dom[0].setAttribute(
            "stroke-width",
            CONFIG.RELATION_THICKNESS as unknown as string
        );
        this.redraw();
    }

    show(): void {
        this.hidden = false;
        for (var i = 0; i < this.dom.length; i++) {
            this.dom[i]!.style.visibility = "";
        }
    }

    hide(): void {
        this.hidden = true;
        for (var i = 0; i < this.dom.length; i++) {
            this.dom[i]!.style.visibility = "hidden";
        }
    }

    redrawNormal(
        p1: [number, number],
        p2: [number, number],
        half: number
    ): void {
        if (this.owner.vector) {
            var str =
                "M " +
                p1[0] +
                " " +
                p1[1] +
                " C " +
                (p1[0] + half) +
                " " +
                p1[1] +
                " ";
            str += p2[0] - half + " " + p2[1] + " " + p2[0] + " " + p2[1];
            this.dom[0].setAttribute("d", str);
        } else {
            this.dom[0].style.left = p1[0] + "px";
            this.dom[0].style.top = p1[1] + "px";
            this.dom[0].style.width = half + "px";

            this.dom[1]!.style.left = p1[0] + half + "px";
            this.dom[1]!.style.top = Math.min(p1[1], p2[1]) + "px";
            this.dom[1]!.style.height =
                Math.abs(p1[1] - p2[1]) + CONFIG.RELATION_THICKNESS + "px";

            this.dom[2]!.style.left = p1[0] + half + 1 + "px";
            this.dom[2]!.style.top = p2[1] + "px";
            this.dom[2]!.style.width = half + "px";
        }
    }

    redrawSide(p1: [number, number], p2: [number, number], x: number): void {
        if (this.owner.vector) {
            var str =
                "M " + p1[0] + " " + p1[1] + " C " + x + " " + p1[1] + " ";
            str += x + " " + p2[1] + " " + p2[0] + " " + p2[1];
            this.dom[0].setAttribute("d", str);
        } else {
            this.dom[0].style.left = Math.min(x, p1[0]) + "px";
            this.dom[0].style.top = p1[1] + "px";
            this.dom[0].style.width = Math.abs(p1[0] - x) + "px";

            this.dom[1]!.style.left = x + "px";
            this.dom[1]!.style.top = Math.min(p1[1], p2[1]) + "px";
            this.dom[1]!.style.height =
                Math.abs(p1[1] - p2[1]) + CONFIG.RELATION_THICKNESS + "px";

            this.dom[2]!.style.left = Math.min(x, p2[0]) + "px";
            this.dom[2]!.style.top = p2[1] + "px";
            this.dom[2]!.style.width = Math.abs(p2[0] - x) + "px";
        }
    }

    redraw(): void {
        /* draw connector */
        if (this.hidden) {
            return;
        }
        /*
         * grabado: 元は要素側も var t1 / var t2 で、下の「テーブル上端＋行の中心」を
         * 同名で再宣言していた（HANDOVER §3 段階3-2）。HTMLElement と number の
         * 再宣言は TS2403 で、t1++ が lvalue なので as でも回避できない。
         * 要素側を改名すると下の宣言が再宣言でなくなり、:201 以降の t1 / t2 の
         * 読み出し 10 箇所は 1 文字も触らずに済む（旧束縛はここから先で読まれない）。
         */
        var e1 = this.row1.owner.dom.container;
        var e2 = this.row2.owner.dom.container;

        var l1 = e1.offsetLeft;
        var l2 = e2.offsetLeft;
        var r1 = l1 + e1.offsetWidth;
        var r2 = l2 + e2.offsetWidth;
        var t1 =
            e1.offsetTop +
            this.row1.dom.container.offsetTop +
            Math.round(this.row1.dom.container.offsetHeight / 2);
        var t2 =
            e2.offsetTop +
            this.row2.dom.container.offsetTop +
            Math.round(this.row2.dom.container.offsetHeight / 2);

        if (this.row1.owner.selected) {
            t1++;
            l1++;
            r1--;
        }
        if (this.row2.owner.selected) {
            t2++;
            l2++;
            r2--;
        }

        /* タプルで注釈しておくと redrawNormal / redrawSide 側の添字に ! が要らない */
        var p1: [number, number] = [0, 0];
        var p2: [number, number] = [0, 0];

        if (r1 < l2 || r2 < l1) {
            /* between tables */
            if (Math.abs(r1 - l2) < Math.abs(r2 - l1)) {
                p1 = [r1, t1];
                p2 = [l2, t2];
            } else {
                p1 = [r2, t2];
                p2 = [l1, t1];
            }
            var half = Math.floor((p2[0] - p1[0]) / 2);
            this.redrawNormal(p1, p2, half);
        } else {
            /* next to tables */
            var x = 0;
            var l = 0;
            if (Math.abs(l1 - l2) < Math.abs(r1 - r2)) {
                /* left of tables */
                p1 = [l1, t1];
                p2 = [l2, t2];
                x = Math.min(l1, l2) - CONFIG.RELATION_SPACING;
            } else {
                /* right of tables */
                p1 = [r1, t1];
                p2 = [r2, t2];
                x = Math.max(r1, r2) + CONFIG.RELATION_SPACING;
            }
            this.redrawSide(p1, p2, x);
        } /* line next to tables */
    }

    /*
     * 基底の destroy() は呼ばない（現行どおり）。dom がオブジェクトではなく
     * 配列なので、基底の this.dom.container.parentNode で落ちる。
     */
    destroy(): void {
        this.row1.removeRelation(this);
        this.row2.removeRelation(this);
        for (var i = 0; i < this.dom.length; i++) {
            this.dom[i]!.parentNode!.removeChild(this.dom[i]!);
        }
    }
}
