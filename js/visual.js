/* -------------------- base visual element -------------------- */
/*
 * grabado: 二相構築（_init / _build）の呼び出しを基底コンストラクタから外し、
 * 各サブクラスが従来 SQL.Visual.apply(this) を書いていた位置で自分で呼ぶ形にした
 * （HANDOVER §3 段階2）。呼び出し順は現行と 1 行もずれない。
 *
 * こうしないと ES クラス化できない。派生クラスは super() より前に this を
 * 触れないが、js/table.js の _build() は this.owner.map... を読むため、
 * 「基底コンストラクタが _build() を呼ぶ」形とは原理的に両立しない。
 */
SQL.Visual = function () {};

SQL.Visual.prototype._init = function () {
    this.dom = {
        container: null,
        title: null,
    };
    this.data = {
        title: "",
    };
};

SQL.Visual.prototype._build = function () {};

SQL.Visual.prototype.toXML = function () {};

SQL.Visual.prototype.fromXML = function (node) {};

SQL.Visual.prototype.destroy = function () {
    /* "destructor" */
    var p = this.dom.container.parentNode;
    if (p && p.nodeType == 1) {
        p.removeChild(this.dom.container);
    }
};

SQL.Visual.prototype.setTitle = function (text) {
    if (!text) {
        return;
    }
    this.data.title = text;
    this.dom.title.innerHTML = text;
};

SQL.Visual.prototype.getTitle = function () {
    return this.data.title;
};

SQL.Visual.prototype.redraw = function () {};
