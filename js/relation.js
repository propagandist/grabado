/* --------------------------- relation (connector) ----------- */
/*
 * grabado: ES クラス化（HANDOVER §3 段階2）。
 * _init() / _build() は従来 SQL.Visual.apply(this) を書いていた位置で呼ぶ。
 */
class Relation extends SQL.Visual {
    static _counter = 0;

    constructor(owner, row1, row2) {
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

        this.style = SQL.designer.getOption("style");
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
            this.color = all[0].getColor();
        } else if (this.relationColors) {
            /* pick next */
            Relation._counter++;
            var colorIndex =
                (Relation._counter - 1) % this.relationColors.length;
            this.color = this.relationColors[colorIndex];
        }

        this.row1.addRelation(this);
        this.row2.addRelation(this);
        /*
         * 基底の _init() が入れた dom（{container, title}）を配列で置き換える。
         * SVG path 1 本、または div 3 本を持つ。基底と形が違うので dom の型を
         * Visual 側で決められない原因そのものだが、段階2 は挙動不変が判定なので
         * 触らない。扱いは段階3（.ts 化）で決める。
         */
        this.dom = [];

        if (this.owner.vector) {
            var path = document.createElementNS(this.owner.svgNS, "path");
            path.setAttribute("stroke", this.color);
            path.setAttribute("stroke-width", CONFIG.RELATION_THICKNESS);
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

    getColor() {
        return this.color;
    }

    highlight() {
        if (this.highlighted) {
            return;
        }
        this.highlighted = true;
        this.dom[0].setAttribute("stroke", CONFIG.RELATION_HIGHLIGHTED_COLOR);
        this.dom[0].setAttribute(
            "stroke-width",
            CONFIG.RELATION_HIGHLIGHTED_THICKNESS
        );
        this.redraw();
    }

    dehighlight() {
        if (!this.highlighted) {
            return;
        }
        this.highlighted = false;
        this.dom[0].setAttribute("stroke", this.color);
        this.dom[0].setAttribute("stroke-width", CONFIG.RELATION_THICKNESS);
        this.redraw();
    }

    show() {
        this.hidden = false;
        for (var i = 0; i < this.dom.length; i++) {
            this.dom[i].style.visibility = "";
        }
    }

    hide() {
        this.hidden = true;
        for (var i = 0; i < this.dom.length; i++) {
            this.dom[i].style.visibility = "hidden";
        }
    }

    redrawNormal(p1, p2, half) {
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

            this.dom[1].style.left = p1[0] + half + "px";
            this.dom[1].style.top = Math.min(p1[1], p2[1]) + "px";
            this.dom[1].style.height =
                Math.abs(p1[1] - p2[1]) + CONFIG.RELATION_THICKNESS + "px";

            this.dom[2].style.left = p1[0] + half + 1 + "px";
            this.dom[2].style.top = p2[1] + "px";
            this.dom[2].style.width = half + "px";
        }
    }

    redrawSide(p1, p2, x) {
        if (this.owner.vector) {
            var str =
                "M " + p1[0] + " " + p1[1] + " C " + x + " " + p1[1] + " ";
            str += x + " " + p2[1] + " " + p2[0] + " " + p2[1];
            this.dom[0].setAttribute("d", str);
        } else {
            this.dom[0].style.left = Math.min(x, p1[0]) + "px";
            this.dom[0].style.top = p1[1] + "px";
            this.dom[0].style.width = Math.abs(p1[0] - x) + "px";

            this.dom[1].style.left = x + "px";
            this.dom[1].style.top = Math.min(p1[1], p2[1]) + "px";
            this.dom[1].style.height =
                Math.abs(p1[1] - p2[1]) + CONFIG.RELATION_THICKNESS + "px";

            this.dom[2].style.left = Math.min(x, p2[0]) + "px";
            this.dom[2].style.top = p2[1] + "px";
            this.dom[2].style.width = Math.abs(p2[0] - x) + "px";
        }
    }

    redraw() {
        /* draw connector */
        if (this.hidden) {
            return;
        }
        var t1 = this.row1.owner.dom.container;
        var t2 = this.row2.owner.dom.container;

        var l1 = t1.offsetLeft;
        var l2 = t2.offsetLeft;
        var r1 = l1 + t1.offsetWidth;
        var r2 = l2 + t2.offsetWidth;
        var t1 =
            t1.offsetTop +
            this.row1.dom.container.offsetTop +
            Math.round(this.row1.dom.container.offsetHeight / 2);
        var t2 =
            t2.offsetTop +
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

        var p1 = [0, 0];
        var p2 = [0, 0];

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
    destroy() {
        this.row1.removeRelation(this);
        this.row2.removeRelation(this);
        for (var i = 0; i < this.dom.length; i++) {
            this.dom[i].parentNode.removeChild(this.dom[i]);
        }
    }
}

SQL.Relation = Relation;
