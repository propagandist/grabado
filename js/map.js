/* --------------------- minimap ------------ */
/*
 * grabado: ES クラス化（HANDOVER §3 段階2）。
 * _init() / _build() は従来 SQL.Visual.apply(this) を書いていた位置で呼ぶ。
 * this.sync = this.sync.bind(this) も現行と同じ位置に置く（プロトタイプ上の
 * sync を bind してインスタンスプロパティで隠す形は class でも同じく動く）。
 *
 * クラス名を Map ではなく Minimap にしてあるのは ES 標準の Map と衝突するため
 * （tsc --checkJs で TS2300 Duplicate identifier が出る）。公開名 SQL.Map は
 * 現行のまま。段階3 でモジュール化したとき export class Map が標準 Map を
 * 隠すのを避ける。
 */
class Minimap extends SQL.Visual {
    constructor(owner) {
        super();
        this.owner = owner;
        this._init();
        this._build();
        this.dom.container = OZ.$("minimap");
        this.width = this.dom.container.offsetWidth - 2;
        this.height = this.dom.container.offsetHeight - 2;

        this.dom.port = OZ.DOM.elm("div", { className: "port", zIndex: 1 });
        this.dom.container.appendChild(this.dom.port);
        this.sync = this.sync.bind(this);

        this.flag = false;
        this.sync();

        OZ.Event.add(window, "resize", this.sync);
        OZ.Event.add(window, "scroll", this.sync);
        OZ.Event.add(this.dom.container, "mousedown", this.down.bind(this));
        OZ.Event.add(this.dom.container, "touchstart", this.down.bind(this));
        OZ.Event.add(this.dom.container, "touchmove", OZ.Event.prevent);
    }

    down(e) {
        /* mousedown - move view and start drag */
        this.flag = true;
        this.dom.container.style.cursor = "move";
        var pos = OZ.DOM.pos(this.dom.container);

        this.x = Math.round(pos[0] + this.l + this.w / 2);
        this.y = Math.round(pos[1] + this.t + this.h / 2);
        this.move(e);

        if (e.type == "touchstart") {
            var eventMove = "touchmove";
            var eventUp = "touchend";
        } else {
            var eventMove = "mousemove";
            var eventUp = "mouseup";
        }

        this.documentMove = OZ.Event.add(
            document,
            eventMove,
            this.move.bind(this)
        );
        this.documentUp = OZ.Event.add(document, eventUp, this.up.bind(this));
    }

    move(e) {
        /* mousemove */
        if (!this.flag) {
            return;
        }
        OZ.Event.prevent(e);

        if (e.type.match(/touch/)) {
            if (e.touches.length > 1) {
                return;
            }
            var event = e.touches[0];
        } else {
            var event = e;
        }

        var dx = event.clientX - this.x;
        var dy = event.clientY - this.y;
        if (this.l + dx < 0) {
            dx = -this.l;
        }
        if (this.t + dy < 0) {
            dy = -this.t;
        }
        if (this.l + this.w + 4 + dx > this.width) {
            dx = this.width - 4 - this.l - this.w;
        }
        if (this.t + this.h + 4 + dy > this.height) {
            dy = this.height - 4 - this.t - this.h;
        }

        this.x += dx;
        this.y += dy;

        this.l += dx;
        this.t += dy;

        var coefX = this.width / this.owner.width;
        var coefY = this.height / this.owner.height;
        var left = this.l / coefX;
        var top = this.t / coefY;

        document.documentElement.scrollLeft = Math.round(left);
        document.documentElement.scrollTop = Math.round(top);

        this.redraw();
    }

    up(e) {
        /* mouseup */
        this.flag = false;
        this.dom.container.style.cursor = "";
        OZ.Event.remove(this.documentMove);
        OZ.Event.remove(this.documentUp);
    }

    sync() {
        /* when window changes, adjust map */
        var dims = OZ.DOM.win();
        var scroll = OZ.DOM.scroll();
        var scaleX = this.width / this.owner.width;
        var scaleY = this.height / this.owner.height;

        var w = dims[0] * scaleX - 4 - 0;
        var h = dims[1] * scaleY - 4 - 0;
        var x = scroll[0] * scaleX;
        var y = scroll[1] * scaleY;

        this.w = Math.round(w);
        this.h = Math.round(h);
        this.l = Math.round(x);
        this.t = Math.round(y);

        this.redraw();
    }

    redraw() {
        this.dom.port.style.width = this.w + "px";
        this.dom.port.style.height = this.h + "px";
        this.dom.port.style.left = this.l + "px";
        this.dom.port.style.top = this.t + "px";
    }
}

SQL.Map = Minimap;
