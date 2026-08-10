/* --------------------- db index ------------ */
/*
 * grabado: ES クラス化（HANDOVER §3 段階2）。
 * _init() / _build() は従来 SQL.Visual.apply(this) を書いていた位置で呼ぶ。
 * class 宣言は window.eval に残らないので、同一ファイル内で SQL に載せる。
 */
class Key extends SQL.Visual {
    constructor(owner, type, name) {
        super();
        this.owner = owner;
        this.rows = [];
        this.type = type || "INDEX";
        this.name = name || "";
        this._init();
        this._build();
    }

    setName(n) {
        this.name = n;
    }

    getName() {
        return this.name;
    }

    setType(t) {
        if (!t) {
            return;
        }
        this.type = t;
        for (var i = 0; i < this.rows.length; i++) {
            this.rows[i].redraw();
        }
    }

    getType() {
        return this.type;
    }

    addRow(r) {
        if (r.owner != this.owner) {
            return;
        }
        this.rows.push(r);
        r.addKey(this);
    }

    removeRow(r) {
        var idx = this.rows.indexOf(r);
        if (idx == -1) {
            return;
        }
        r.removeKey(this);
        this.rows.splice(idx, 1);
    }

    /* 基底の destroy() は呼ばない（現行どおり）。Key は dom.container を持たないため */
    destroy() {
        for (var i = 0; i < this.rows.length; i++) {
            this.rows[i].removeKey(this);
        }
    }

    getLabel() {
        return this.name || this.type;
    }

    toXML() {
        var xml = "";
        xml +=
            '<key type="' +
            this.getType() +
            '" name="' +
            this.getName() +
            '">\n';
        for (var i = 0; i < this.rows.length; i++) {
            var r = this.rows[i];
            xml += "<part>" + r.getTitle() + "</part>\n";
        }
        xml += "</key>\n";
        return xml;
    }

    fromXML(node) {
        this.setType(node.getAttribute("type"));
        this.setName(node.getAttribute("name"));
        var parts = node.getElementsByTagName("part");
        for (var i = 0; i < parts.length; i++) {
            var name = parts[i].firstChild.nodeValue;
            var row = this.owner.findNamedRow(name);
            this.addRow(row);
        }
    }
}

SQL.Key = Key;
