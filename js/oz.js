/* (c) 2007 - now() Ondrej Zara, 1.7 */
/* grabado: ESM バンドル後もグローバルであり続けるよう window に載せる（HANDOVER §3 段階1） */
window.OZ = {
    $: function (x) {
        return typeof x == "string" ? document.getElementById(x) : x;
    },
    select: function (x) {
        return document.querySelectorAll(x);
    },
    opera: !!window.opera,
    ie: !!document.attachEvent && !window.opera,
    gecko: !!document.getAnonymousElementByAttribute,
    webkit: !!navigator.userAgent.match(/webkit/i),
    khtml:
        !!navigator.userAgent.match(/khtml/i) ||
        !!navigator.userAgent.match(/konqueror/i),
    Event: {
        _id: 0,
        _byName: {},
        _byID: {},
        add: function (elm, event, cb) {
            var id = OZ.Event._id++;
            var element = OZ.$(elm);
            var fnc =
                element && element.attachEvent
                    ? function () {
                          return cb.apply(element, arguments);
                      }
                    : cb;
            var rec = [element, event, fnc];
            var parts = event.split(" ");
            while (parts.length) {
                var e = parts.pop();
                if (element) {
                    if (element.addEventListener) {
                        element.addEventListener(e, fnc, false);
                    } else if (element.attachEvent) {
                        element.attachEvent("on" + e, fnc);
                    }
                }
                if (!(e in OZ.Event._byName)) {
                    OZ.Event._byName[e] = {};
                }
                OZ.Event._byName[e][id] = rec;
            }
            OZ.Event._byID[id] = rec;
            return id;
        },
        remove: function (id) {
            var rec = OZ.Event._byID[id];
            if (!rec) {
                return;
            }
            var elm = rec[0];
            var parts = rec[1].split(" ");
            while (parts.length) {
                var e = parts.pop();
                if (elm) {
                    if (elm.removeEventListener) {
                        elm.removeEventListener(e, rec[2], false);
                    } else if (elm.detachEvent) {
                        elm.detachEvent("on" + e, rec[2]);
                    }
                }
                delete OZ.Event._byName[e][id];
            }
            delete OZ.Event._byID[id];
        },
        stop: function (e) {
            e.stopPropagation ? e.stopPropagation() : (e.cancelBubble = true);
        },
        prevent: function (e) {
            e.preventDefault ? e.preventDefault() : (e.returnValue = false);
        },
        target: function (e) {
            return e.target || e.srcElement;
        },
    },
    /*
     * grabado: OZ.Class / implement / extend / dispatch を削除した（HANDOVER §3 段階2）。
     * アプリからの参照が 1 件も無く、arguments.callee 依存で strict では動かないため。
     * 実際に使われている継承は SQL.Visual を頂点とする ES クラス階層（js/visual.js）、
     * pub/sub は SQL.publish / SQL.subscribe（js/globals.js）。
     */
    DOM: {
        elm: function (name, opts) {
            var elm = document.createElement(name);
            for (var p in opts) {
                var val = opts[p];
                if (p == "class") {
                    p = "className";
                }
                if (p in elm) {
                    elm[p] = val;
                }
            }
            OZ.Style.set(elm, opts);
            return elm;
        },
        text: function (str) {
            return document.createTextNode(str);
        },
        clear: function (node) {
            while (node.firstChild) {
                node.removeChild(node.firstChild);
            }
        },
        pos: function (elm) {
            /* relative to _viewport_ */
            var cur = OZ.$(elm);
            var html = cur.ownerDocument.documentElement;
            var parent = cur.parentNode;
            var x = (y = 0);
            if (cur == html) {
                return [x, y];
            }
            while (1) {
                if (OZ.Style.get(cur, "position") == "fixed") {
                    x += cur.offsetLeft;
                    y += cur.offsetTop;
                    return [x, y];
                }

                if (
                    OZ.opera &&
                    (parent == html || OZ.Style.get(cur, "display") != "block")
                ) {
                } else {
                    x -= parent.scrollLeft;
                    y -= parent.scrollTop;
                }
                if (parent == cur.offsetParent || cur.parentNode == html) {
                    x += cur.offsetLeft;
                    y += cur.offsetTop;
                    cur = parent;
                }

                if (parent == html) {
                    return [x, y];
                }
                parent = parent.parentNode;
            }
        },
        scroll: function () {
            var x =
                document.documentElement.scrollLeft ||
                document.body.scrollLeft ||
                0;
            var y =
                document.documentElement.scrollTop ||
                document.body.scrollTop ||
                0;
            return [x, y];
        },
        win: function (avail) {
            return avail
                ? [window.innerWidth, window.innerHeight]
                : [
                      document.documentElement.clientWidth,
                      document.documentElement.clientHeight,
                  ];
        },
        hasClass: function (node, className) {
            var cn = OZ.$(node).className;
            var arr = cn ? cn.split(" ") : [];
            return arr.indexOf(className) != -1;
        },
        addClass: function (node, className) {
            if (OZ.DOM.hasClass(node, className)) {
                return;
            }
            var cn = OZ.$(node).className;
            var arr = cn ? cn.split(" ") : [];
            arr.push(className);
            OZ.$(node).className = arr.join(" ");
        },
        removeClass: function (node, className) {
            if (!OZ.DOM.hasClass(node, className)) {
                return;
            }
            var cn = OZ.$(node).className;
            var arr = cn ? cn.split(" ") : [];
            var arr = arr.filter(function ($) {
                return $ != className;
            });
            OZ.$(node).className = arr.join(" ");
        },
        append: function () {
            if (arguments.length == 1) {
                var arr = arguments[0];
                var root = OZ.$(arr[0]);
                for (var i = 1; i < arr.length; i++) {
                    root.appendChild(OZ.$(arr[i]));
                }
            } else
                for (var i = 0; i < arguments.length; i++) {
                    OZ.DOM.append(arguments[i]);
                }
        },
    },
    Style: {
        get: function (elm, prop) {
            if (document.defaultView && document.defaultView.getComputedStyle) {
                try {
                    var cs = elm.ownerDocument.defaultView.getComputedStyle(
                        elm,
                        ""
                    );
                } catch (e) {
                    return false;
                }
                if (!cs) {
                    return false;
                }
                return cs[prop];
            } else {
                return elm.currentStyle[prop];
            }
        },
        set: function (elm, obj) {
            for (var p in obj) {
                var val = obj[p];
                if (p == "opacity" && OZ.ie) {
                    p = "filter";
                    val = "alpha(opacity=" + Math.round(100 * val) + ")";
                    elm.style.zoom = 1;
                } else if (p == "float") {
                    p = OZ.ie ? "styleFloat" : "cssFloat";
                }
                if (p in elm.style) {
                    elm.style[p] = val;
                }
            }
        },
    },
    Request: function (url, callback, options) {
        var o = { data: false, method: "get", headers: {}, xml: false };
        for (var p in options) {
            o[p] = options[p];
        }
        o.method = o.method.toUpperCase();

        var xhr = false;
        if (window.XMLHttpRequest) {
            xhr = new XMLHttpRequest();
        } else if (window.ActiveXObject) {
            xhr = new ActiveXObject("Microsoft.XMLHTTP");
        } else {
            return false;
        }
        xhr.open(o.method, url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState != 4) {
                return;
            }
            if (!callback) {
                return;
            }
            var data = o.xml ? xhr.responseXML : xhr.responseText;
            var headers = {};
            var h = xhr.getAllResponseHeaders();
            if (h) {
                h = h.split(/[\r\n]/);
                for (var i = 0; i < h.length; i++)
                    if (h[i]) {
                        var v = h[i].match(/^([^:]+): *(.*)$/);
                        headers[v[1]] = v[2];
                    }
            }
            callback(data, xhr.status, headers);
        };
        if (o.method == "POST") {
            xhr.setRequestHeader(
                "Content-Type",
                "application/x-www-form-urlencoded"
            );
        }
        for (var p in o.headers) {
            xhr.setRequestHeader(p, o.headers[p]);
        }
        xhr.send(o.data || null);
        return xhr;
    },
};

/*
 * grabado: ES5 polyfill 群を削除した（HANDOVER §3 段階2）。
 *
 * prototype 版（Function.prototype.bind、Array.prototype の indexOf / lastIndexOf /
 * forEach / every / some / map / filter）は if (!X) ガード付きで、jsdom / Chromium の
 * どちらにもネイティブが実在するため本体は一度も評価されていなかった（実測確認済み）。
 *
 * 非標準の静的版（Array.indexOf / lastIndexOf / forEach / every / some / map / filter）は
 * ネイティブに無く実際にインストールされていたが、参照が 1 件も無いことを確認して削除した。
 */
