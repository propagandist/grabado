/*
 * grabado: HANDOVER §3 段階3-1 で .ts 化した。
 *
 * export ＋ window 登録の 2 本立て（イディオムは js/oz.ts の冒頭を参照）。
 * 段階3-3b で js/ が全部 .ts になったので裸のグローバルを読む参照側は無くなったが、
 * window 登録の撤去は段階3-4 でまとめて行う（index.html や外部から触る面の確認と
 * 同時にやるほうが安全なため）。DATATYPES と LOCALE は js/wwwsqldesigner.ts と
 * テストが window 越しに差し替える（window.DATATYPES = … / window.LOCALE[n] = …）ので、
 * モジュールローカルの変数にはしない。参照経路を現行と 1 バイトも変えないため。
 */

/*
 * ここは必ず import type。値 import にすると globals.ts が 7 本を先に評価しにいって
 * 読み込み順（src/app.ts）が壊れる。型だけの import は verbatimModuleSyntax のもとで
 * emit から完全に消えるので、Rollup の依存グラフに辺が生えない。
 */
import type { Visual } from "./visual.ts";
import type { Row } from "./row.ts";
import type { Table } from "./table.ts";
import type { Relation } from "./relation.ts";
import type { Key } from "./key.ts";
import type { Rubberband } from "./rubberband.ts";
import type { Minimap } from "./map.ts";
import type { Toggle } from "./toggle.ts";
import type { IO } from "./io.ts";
import type { TableManager } from "./tablemanager.ts";
import type { RowManager } from "./rowmanager.ts";
import type { KeyManager } from "./keymanager.ts";
/* Window は lib.dom のグローバル型と同名なので改名して受ける */
import type { Window as SqlWindow } from "./window.ts";
import type { Options } from "./options.ts";
import type { Designer } from "./wwwsqldesigner.ts";

/** SQL.subscribe が受け取るハンドラ。SQL.publish が {target, data} を渡す */
export type SqlSubscriber = (e: { target: unknown; data: unknown }) => void;

/**
 * Designer インスタンスの型。
 *
 * 段階3-2 まではここに構造的 interface を書いていた（当時 js/wwwsqldesigner.js は
 * まだ .js で、描画中核 7 本の this.owner が同じ面を参照する必要があったため）。
 * 段階3-3b で実体が .ts になったので、実体への型エイリアスにした。参照している
 * 13 本は import を変えずに本物の型を見る（3-2 で予告したとおり、7 ファイルを
 * 回って書き換える作業は発生しない）。名前を Designer に統一するのは段階3-4。
 */
export type SqlDesigner = Designer;

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
    /*
     * 描画中核のクラス（段階3-2 で .ts 化した分から順に載せていく）。
     * .ts 側は import した SQL に代入するので、宣言が無いと代入自体が TS2339 になる
     * （.js のときのようなグローバル型の合成は起きない）。
     */
    Visual: typeof Visual;
    Row: typeof Row;
    Table: typeof Table;
    Relation: typeof Relation;
    Key: typeof Key;
    Rubberband: typeof Rubberband;
    /** 公開名は SQL.Map、クラス名は Minimap（ES 標準 Map との衝突回避。§5.4） */
    Map: typeof Minimap;
    Toggle: typeof Toggle;
    IO: typeof IO;
    TableManager: typeof TableManager;
    RowManager: typeof RowManager;
    KeyManager: typeof KeyManager;
    /** 公開名は SQL.Window（lib.dom の Window とは別物） */
    Window: typeof SqlWindow;
    Options: typeof Options;
    /** クラス。生成すると自身を SQL.designer に登録する */
    Designer: typeof Designer;
    /** 唯一のインスタンス。new SQL.Designer() が走るまでは存在しない */
    designer: Designer;
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
 * grabado: 段階3-1〜3-2 はここに as unknown as typeof window.SQL を置いていた。
 * まだ .js のファイルがトップレベルで SQL.X = X と生やすと、TS が allowJs のもとで
 * その代入からグローバル型を合成し、window.SQL の型が「SqlNamespace ∩ 合成型」に
 * なっていたため。段階3-3b で js/ から .js が尽きて合成が止まったので、素の代入に戻した。
 */
window.SQL = SQL;

window.onbeforeunload = function (e) {
    return ""; /* some browsers will show this text, some won't. */
};
