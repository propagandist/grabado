/* -------------------- base visual element -------------------- */
/*
 * grabado: ES クラス化した（HANDOVER §3 段階2）。
 *
 * 二相構築（_init / _build）の呼び出しは基底コンストラクタに持たせない。
 * 派生クラスは super() より前に this を触れないが、js/table.js の _build() は
 * this.owner.map.dom.container を読むため両立しない。各サブクラスが従来
 * SQL.Visual.apply(this) を書いていた位置で自分で呼ぶ（Step4 で分離済み）。
 * そのためコンストラクタは持たない（既定＝何もしない）。
 *
 * class 宣言は window.eval ではグローバルに残らない（lexical 宣言は使い捨ての
 * 環境レコードに入る仕様）。tests/node/harness.ts が js/*.js を 1 本ずつ eval
 * する経路を保つため、同一ファイル内で必ず SQL に載せる。ファイルをまたぐ参照が
 * SQL.* 経由になるのは現行と同じ。
 */
class Visual {
    _init() {
        this.dom = {
            container: null,
            title: null,
        };
        this.data = {
            title: "",
        };
    }

    _build() {}

    toXML() {}

    fromXML(node) {}

    destroy() {
        /* "destructor" */
        var p = this.dom.container.parentNode;
        if (p && p.nodeType == 1) {
            p.removeChild(this.dom.container);
        }
    }

    setTitle(text) {
        if (!text) {
            return;
        }
        this.data.title = text;
        this.dom.title.innerHTML = text;
    }

    getTitle() {
        return this.data.title;
    }

    redraw() {}
}

SQL.Visual = Visual;
