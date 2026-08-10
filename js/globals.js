/*
 * grabado: ESM バンドル後もグローバルであり続けるよう window に載せる（HANDOVER §3 段階1）。
 * 参照側（他ファイルの裸の _ / SQL / DATATYPES / LOCALE）は無変更でグローバル経由に解決される。
 */
window._ = function _(str) {
    /* getText */
    if (!(str in window.LOCALE)) {
        return str;
    }
    return window.LOCALE[str];
};

/*
 * grabado: ES5/ES2015 polyfill（String.prototype.endsWith / trim、Object.create）を
 * 削除した（HANDOVER §3 段階2）。いずれもガード付きで、jsdom / Chromium の
 * どちらにもネイティブが実在するため本体は一度も評価されていなかった（実測確認済み）。
 * 非標準の String.trim（静的版）は実際にインストールされていたが参照 0 件。
 */

window.DATATYPES = false;
window.LOCALE = {};
window.SQL = {
    _subscribers: {},

    publish: function (message, publisher, data) {
        var subscribers = this._subscribers[message] || [];
        var obj = {
            target: publisher,
            data: data,
        };
        subscribers.forEach(function (subscriber) {
            subscriber(obj);
        });
    },

    subscribe: function (message, subscriber) {
        if (!(message in this._subscribers)) {
            this._subscribers[message] = [];
        }
        var index = this._subscribers[message].indexOf(subscriber);
        if (index == -1) {
            this._subscribers[message].push(subscriber);
        }
    },

    unsubscribe: function (message, subscriber) {
        var index = this._subscribers[message].indexOf(subscriber);
        if (index > -1) {
            this._subscribers[message].splice(index, 1);
        }
    },

    escape: function (str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/>/g, "&gt;")
            .replace(/</g, "&lt;");
    },
};

window.onbeforeunload = function (e) {
    return ""; /* some browsers will show this text, some won't. */
};
