/* --------------------- table row ( = db column) ------------ */
/*
 * grabado: ES クラス化（HANDOVER §3 段階2）。
 * _init() / _build() は従来 SQL.Visual.apply(this) を書いていた位置で呼ぶ。
 * 親メソッド呼び出し（旧 SQL.Visual.prototype.X.apply(this, ...)）は super.X() に。
 */
class Row extends SQL.Visual {
    constructor(owner, title, data) {
        super();
        this.owner = owner;
        this.relations = [];
        this.keys = [];
        this.selected = false;
        this.expanded = false;

        this._init();
        this._build();

        this.data.type = 0;
        this.data.size = "";
        this.data.def = null;
        this.data.nll = true;
        this.data.ai = false;
        this.data.comment = "";

        if (data) {
            this.update(data);
        }
        this.setTitle(title);
    }

    _build() {
        this.dom.container = OZ.DOM.elm("tbody");

        this.dom.content = OZ.DOM.elm("tr");
        this.dom.selected = OZ.DOM.elm("div", {
            className: "selected",
            innerHTML: "&raquo;&nbsp;",
        });
        this.dom.title = OZ.DOM.elm("div", { className: "title" });
        var td1 = OZ.DOM.elm("td");
        var td2 = OZ.DOM.elm("td", { className: "typehint" });
        this.dom.typehint = td2;

        OZ.DOM.append(
            [this.dom.container, this.dom.content],
            [this.dom.content, td1, td2],
            [td1, this.dom.selected, this.dom.title]
        );

        this.enter = this.enter.bind(this);
        this.changeComment = this.changeComment.bind(this);

        OZ.Event.add(this.dom.container, "click", this.click.bind(this));
        OZ.Event.add(this.dom.container, "dblclick", this.dblclick.bind(this));
    }

    select() {
        if (this.selected) {
            return;
        }
        this.selected = true;
        for (var i = 0; i < this.relations.length; i++) {
            this.relations[i].highlight();
        }
        this.redraw();
    }

    deselect() {
        if (!this.selected) {
            return;
        }
        this.selected = false;
        for (var i = 0; i < this.relations.length; i++) {
            this.relations[i].dehighlight();
        }
        this.redraw();
        this.collapse();
    }

    setTitle(t) {
        var old = this.getTitle();
        for (var i = 0; i < this.relations.length; i++) {
            var r = this.relations[i];
            if (r.row1 != this) {
                continue;
            }
            var tt = r.row2.getTitle().replace(new RegExp(old, "g"), t);
            if (tt != r.row2.getTitle()) {
                r.row2.setTitle(tt);
            }
        }

        super.setTitle(t);
    }

    click(e) {
        /* clicked on row */
        SQL.publish("rowclick", this);
        this.owner.owner.rowManager.select(this);
    }

    dblclick(e) {
        /* dblclicked on row */
        OZ.Event.prevent(e);
        OZ.Event.stop(e);
        this.expand();
    }

    update(data) {
        /* update subset of row data */
        var des = SQL.Designer;
        if (data.nll && data.def && data.def.match(/^null$/i)) {
            data.def = null;
        }

        for (var p in data) {
            this.data[p] = data[p];
        }
        if (!this.data.nll && this.data.def === null) {
            this.data.def = "";
        }

        var elm = this.getDataType();
        for (var i = 0; i < this.relations.length; i++) {
            var r = this.relations[i];
            if (r.row1 == this) {
                r.row2.update({
                    type: des.getFKTypeFor(this.data.type),
                    size: this.data.size,
                });
            }
        }
        this.redraw();
    }

    up() {
        /* shift up */
        var r = this.owner.rows;
        var idx = r.indexOf(this);
        if (!idx) {
            return;
        }
        r[idx - 1].dom.container.parentNode.insertBefore(
            this.dom.container,
            r[idx - 1].dom.container
        );
        r.splice(idx, 1);
        r.splice(idx - 1, 0, this);
        this.redraw();
    }

    down() {
        /* shift down */
        var r = this.owner.rows;
        var idx = r.indexOf(this);
        if (idx + 1 == this.owner.rows.length) {
            return;
        }
        r[idx].dom.container.parentNode.insertBefore(
            this.dom.container,
            r[idx + 1].dom.container.nextSibling
        );
        r.splice(idx, 1);
        r.splice(idx + 1, 0, this);
        this.redraw();
    }

    buildEdit() {
        OZ.DOM.clear(this.dom.container);

        var elms = [];
        this.dom.name = OZ.DOM.elm("input");
        this.dom.name.type = "text";
        elms.push(["name", this.dom.name]);
        OZ.Event.add(this.dom.name, "keypress", this.enter);

        this.dom.type = this.buildTypeSelect(this.data.type);
        elms.push(["type", this.dom.type]);

        this.dom.size = OZ.DOM.elm("input");
        this.dom.size.type = "text";
        elms.push(["size", this.dom.size]);

        this.dom.def = OZ.DOM.elm("input");
        this.dom.def.type = "text";
        elms.push(["def", this.dom.def]);

        this.dom.ai = OZ.DOM.elm("input");
        this.dom.ai.type = "checkbox";
        elms.push(["ai", this.dom.ai]);

        this.dom.nll = OZ.DOM.elm("input");
        this.dom.nll.type = "checkbox";
        elms.push(["null", this.dom.nll]);

        this.dom.comment = OZ.DOM.elm("span", { className: "comment" });
        this.dom.comment.innerHTML = "";
        this.dom.comment.appendChild(
            document.createTextNode(this.data.comment)
        );

        this.dom.commentbtn = OZ.DOM.elm("input");
        this.dom.commentbtn.type = "button";
        this.dom.commentbtn.id = "commentbtn";
        this.dom.commentbtn.value = _("comment");

        OZ.Event.add(this.dom.commentbtn, "click", this.changeComment);

        for (var i = 0; i < elms.length; i++) {
            var row = elms[i];
            var tr = OZ.DOM.elm("tr");
            var td1 = OZ.DOM.elm("td");
            var td2 = OZ.DOM.elm("td");
            var l = OZ.DOM.text(_(row[0]) + ": ");
            OZ.DOM.append([tr, td1, td2], [td1, l], [td2, row[1]]);
            this.dom.container.appendChild(tr);
        }

        var tr = OZ.DOM.elm("tr");
        var td1 = OZ.DOM.elm("td");
        var td2 = OZ.DOM.elm("td");
        OZ.DOM.append(
            [tr, td1, td2],
            [td1, this.dom.comment],
            [td2, this.dom.commentbtn]
        );
        this.dom.container.appendChild(tr);
    }

    changeComment(e) {
        var c = prompt(_("commenttext"), this.data.comment);
        if (c === null) {
            return;
        }
        this.data.comment = c;
        this.dom.comment.innerHTML = "";
        this.dom.comment.appendChild(
            document.createTextNode(this.data.comment)
        );
    }

    expand() {
        if (this.expanded) {
            return;
        }
        this.expanded = true;
        this.buildEdit();
        this.load();
        this.redraw();
        this.dom.container.classList.add("expanded");
        this.dom.name.focus();
        this.dom.name.select();
    }

    collapse() {
        if (!this.expanded) {
            return;
        }
        this.expanded = false;
        this.dom.container.classList.remove("expanded");

        var data = {
            type: this.dom.type.selectedIndex,
            def: this.dom.def.value,
            size: this.dom.size.value,
            nll: this.dom.nll.checked,
            ai: this.dom.ai.checked,
        };

        OZ.DOM.clear(this.dom.container);
        this.dom.container.appendChild(this.dom.content);

        this.update(data);
        this.setTitle(this.dom.name.value);
    }

    load() {
        /* put data to expanded form */
        this.dom.name.value = this.getTitle();
        var def = this.data.def;
        if (def === null) {
            def = "NULL";
        }

        this.dom.def.value = def;
        this.dom.size.value = this.data.size;
        this.dom.nll.checked = this.data.nll;
        this.dom.ai.checked = this.data.ai;
    }

    redraw() {
        var color = this.getColor();
        this.dom.container.style.backgroundColor = color;
        this.dom.container.style.borderColor = color;
        OZ.DOM.removeClass(this.dom.title, "primary");
        OZ.DOM.removeClass(this.dom.title, "key");
        if (this.isPrimary()) {
            OZ.DOM.addClass(this.dom.title, "primary");
        }
        if (this.isKey()) {
            OZ.DOM.addClass(this.dom.title, "key");
        }
        this.dom.selected.style.display = this.selected ? "" : "none";
        this.dom.container.title = this.data.comment;

        var typehint = [];
        if (this.owner.owner.getOption("showtype")) {
            var elm = this.getDataType();
            typehint.push(elm.getAttribute("sql"));
        }

        if (this.owner.owner.getOption("showsize") && this.data.size) {
            typehint.push("(" + this.data.size + ")");
        }

        this.dom.typehint.innerHTML = typehint.join(" ");
        this.owner.redraw();
        this.owner.owner.rowManager.redraw();
    }

    addRelation(r) {
        this.relations.push(r);
    }

    removeRelation(r) {
        var idx = this.relations.indexOf(r);
        if (idx == -1) {
            return;
        }
        this.relations.splice(idx, 1);
    }

    addKey(k) {
        this.keys.push(k);
        this.redraw();
    }

    removeKey(k) {
        var idx = this.keys.indexOf(k);
        if (idx == -1) {
            return;
        }
        this.keys.splice(idx, 1);
        this.redraw();
    }

    getDataType() {
        var type = this.data.type;
        var elm = DATATYPES.getElementsByTagName("type")[type];
        return elm;
    }

    getColor() {
        var elm = this.getDataType();
        var g = this.getDataType().parentNode;
        return elm.getAttribute("color") || g.getAttribute("color") || "#fff";
    }

    buildTypeSelect(id) {
        /* build selectbox with avail datatypes */
        var s = OZ.DOM.elm("select");
        var gs = DATATYPES.getElementsByTagName("group");
        for (var i = 0; i < gs.length; i++) {
            var g = gs[i];
            var og = OZ.DOM.elm("optgroup");
            og.style.backgroundColor = g.getAttribute("color") || "#fff";
            og.label = g.getAttribute("label");
            s.appendChild(og);
            var ts = g.getElementsByTagName("type");
            for (var j = 0; j < ts.length; j++) {
                var t = ts[j];
                var o = OZ.DOM.elm("option");
                if (t.getAttribute("color")) {
                    o.style.backgroundColor = t.getAttribute("color");
                }
                if (t.getAttribute("note")) {
                    o.title = t.getAttribute("note");
                }
                o.innerHTML = t.getAttribute("label");
                og.appendChild(o);
            }
        }
        s.selectedIndex = id;
        return s;
    }

    destroy() {
        super.destroy();
        while (this.relations.length) {
            this.owner.owner.removeRelation(this.relations[0]);
        }
        for (var i = 0; i < this.keys.length; i++) {
            this.keys[i].removeRow(this);
        }
    }

    toXML() {
        var xml = "";

        var t = this.getTitle().replace(/"/g, "&quot;");
        var nn = this.data.nll ? "1" : "0";
        var ai = this.data.ai ? "1" : "0";
        xml +=
            '<row name="' +
            t +
            '" null="' +
            nn +
            '" autoincrement="' +
            ai +
            '">\n';

        var elm = this.getDataType();
        var t = elm.getAttribute("sql");
        if (this.data.size.length) {
            t += "(" + this.data.size + ")";
        }
        xml += "<datatype>" + t + "</datatype>\n";

        if (this.data.def || this.data.def === null) {
            var q = elm.getAttribute("quote");
            var d = this.data.def;
            if (d === null) {
                d = "NULL";
            } else if (d != "CURRENT_TIMESTAMP") {
                d = q + d + q;
            }
            xml += "<default>" + SQL.escape(d) + "</default>";
        }

        for (var i = 0; i < this.relations.length; i++) {
            var r = this.relations[i];
            if (r.row2 != this) {
                continue;
            }
            xml +=
                '<relation table="' +
                r.row1.owner.getTitle() +
                '" row="' +
                r.row1.getTitle() +
                '" />\n';
        }

        if (this.data.comment) {
            xml += "<comment>" + SQL.escape(this.data.comment) + "</comment>\n";
        }

        xml += "</row>\n";
        return xml;
    }

    fromXML(node) {
        var name = node.getAttribute("name");

        var obj = { type: 0, size: "" };
        obj.nll = node.getAttribute("null") == "1";
        obj.ai = node.getAttribute("autoincrement") == "1";

        var cs = node.getElementsByTagName("comment");
        if (cs.length && cs[0].firstChild) {
            obj.comment = cs[0].firstChild.nodeValue;
        }

        var d = node.getElementsByTagName("datatype");
        if (d.length && d[0].firstChild) {
            var s = d[0].firstChild.nodeValue;
            var r = s.match(/^([^\(]+)(\((.*)\))?.*$/);
            var type = r[1];
            if (r[3]) {
                obj.size = r[3];
            }
            var types = window.DATATYPES.getElementsByTagName("type");
            for (var i = 0; i < types.length; i++) {
                var sql = types[i].getAttribute("sql");
                var re = types[i].getAttribute("re");
                if (sql == type || (re && new RegExp(re).exec(type))) {
                    obj.type = i;
                }
            }
        }

        var elm = DATATYPES.getElementsByTagName("type")[obj.type];
        var d = node.getElementsByTagName("default");
        if (d.length && d[0].firstChild) {
            var def = d[0].firstChild.nodeValue;
            obj.def = def;
            var q = elm.getAttribute("quote");
            if (q) {
                var re = new RegExp("^" + q + "(.*)" + q + "$");
                var r = def.match(re);
                if (r) {
                    obj.def = r[1];
                }
            }
        }

        this.update(obj);
        this.setTitle(name);
    }

    isPrimary() {
        for (var i = 0; i < this.keys.length; i++) {
            var k = this.keys[i];
            if (k.getType() == "PRIMARY") {
                return true;
            }
        }
        return false;
    }

    isUnique() {
        for (var i = 0; i < this.keys.length; i++) {
            var k = this.keys[i];
            var t = k.getType();
            if (t == "PRIMARY" || t == "UNIQUE") {
                return true;
            }
        }
        return false;
    }

    isKey() {
        return this.keys.length > 0;
    }

    enter(e) {
        if (e.keyCode == 13) {
            this.collapse();
        }
    }
}

SQL.Row = Row;
