/*
 * grabado: HANDOVER §3 段階3-1 で .ts 化した。
 *
 * export ＋ window 登録の 2 本立て（イディオムは js/oz.ts の冒頭を参照）。
 * まだ .js の 15 本が裸の _ / SQL / DATATYPES / LOCALE を読むので、window 登録は
 * 段階3-4 まで残す。DATATYPES と LOCALE は js/wwwsqldesigner.js とテストが
 * window 越しに差し替える（window.DATATYPES = … / window.LOCALE[n] = …）ので、
 * モジュールローカルの変数にはしない。参照経路を現行と 1 バイトも変えないため。
 */

/** SQL.subscribe が受け取るハンドラ。SQL.publish が {target, data} を渡す */
export type SqlSubscriber = (e: { target: unknown; data: unknown }) => void;

/**
 * SQL 名前空間。
 *
 * publish / subscribe / unsubscribe / escape は本ファイルの実体。
 * Designer / designer は js/wwwsqldesigner.js（まだ .js）が後から載せるもので、
 * src/main.ts と tests/ が触るため型だけ先に宣言してある（types/globals.d.ts の
 * Sql interface から移設）。段階3-2 / 3-3 で各クラスが .ts になるたび、ここに
 * 実体の型が増えていく。index signature は書かない（typo が any に化けるため）。
 */
export interface SqlNamespace {
    _subscribers: Record<string, SqlSubscriber[]>;
    publish(message: string, publisher: unknown, data?: unknown): void;
    subscribe(message: string, subscriber: SqlSubscriber): void;
    unsubscribe(message: string, subscriber: SqlSubscriber): void;
    escape(str: string): string;
    /** クラス。生成すると自身を SQL.designer に登録する */
    Designer: new () => SqlDesigner;
    /** 唯一のインスタンス。new SQL.Designer() が走るまでは存在しない */
    designer: SqlDesigner;
}

/* getText。window.LOCALE を読むのは現行のまま（初期化はこのファイルの下） */
export const _ = function _(str: string): string {
    /* getText */
    if (!(str in window.LOCALE)) {
        return str;
    }
    return window.LOCALE[str]!;
};

/*
 * grabado: ES5/ES2015 polyfill（String.prototype.endsWith / trim、Object.create）を
 * 削除した（HANDOVER §3 段階2）。いずれもガード付きで、jsdom / Chromium の
 * どちらにもネイティブが実在するため本体は一度も評価されていなかった（実測確認済み）。
 * 非標準の String.trim（静的版）は実際にインストールされていたが参照 0 件。
 */

/*
 * Designer / designer は後から載るので、リテラルだけでは SqlNamespace を満たさない。
 * 「未 .ts のファイルが生やすプロパティ」を型で表現するためのキャストで、
 * 段階3-3 で js/wwwsqldesigner.ts が実体を持てば不要になる。
 */
export const SQL = {
    _subscribers: {} as Record<string, SqlSubscriber[]>,

    publish: function (
        this: SqlNamespace,
        message: string,
        publisher: unknown,
        data?: unknown,
    ): void {
        var subscribers = this._subscribers[message] || [];
        var obj = {
            target: publisher,
            data: data,
        };
        subscribers.forEach(function (subscriber) {
            subscriber(obj);
        });
    },

    subscribe: function (
        this: SqlNamespace,
        message: string,
        subscriber: SqlSubscriber,
    ): void {
        if (!(message in this._subscribers)) {
            this._subscribers[message] = [];
        }
        var index = this._subscribers[message]!.indexOf(subscriber);
        if (index == -1) {
            this._subscribers[message]!.push(subscriber);
        }
    },

    unsubscribe: function (
        this: SqlNamespace,
        message: string,
        subscriber: SqlSubscriber,
    ): void {
        var index = this._subscribers[message]!.indexOf(subscriber);
        if (index > -1) {
            this._subscribers[message]!.splice(index, 1);
        }
    },

    escape: function (str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/>/g, "&gt;")
            .replace(/</g, "&lt;");
    },
} as SqlNamespace;

declare global {
    interface Window {
        _: typeof _;
        /**
         * js/globals.ts の初期値は false で、dbResponse() が Element を入れる。
         * false のままにしてあるのは js/wwwsqldesigner.js の XMLSerializer フォールバックが
         * `window.DATATYPES.xml` を評価するため（null にすると TypeError）。
         * 是正は HANDOVER §4 の XML 書き出し撤去でこの分岐ごと消える。
         */
        DATATYPES: Element | false;
        LOCALE: Record<string, string>;
        SQL: SqlNamespace;
    }
}

/* grabado: ESM バンドル後もグローバルであり続けるよう window に載せる（HANDOVER §3 段階1） */
window._ = _;
window.DATATYPES = false;
window.LOCALE = {};
/*
 * grabado: このキャストは移行中だけのもの（HANDOVER §3 段階3-1）。
 * まだ .js の 15 本が `SQL.Visual = Visual;` のようにトップレベルでプロパティを
 * 生やしており、TS は allowJs のもとで .js のその代入から SQL のグローバル型を
 * 合成する。結果 window.SQL の型は「上の SqlNamespace ∩ js/ が合成した型」になり、
 * まだ生えていないクラス 14 個を要求してくる。段階3-3 で全部 .ts になれば合成が
 * 止まり、素の代入に戻せる。
 */
window.SQL = SQL as unknown as typeof window.SQL;

window.onbeforeunload = function (e) {
    return ""; /* some browsers will show this text, some won't. */
};
