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
 * ここは必ず import type。値 import にすると globals.ts が wwwsqldesigner を先に
 * 評価しにいって読み込み順（src/app.ts）が壊れる。型だけの import は
 * verbatimModuleSyntax のもとで emit から完全に消えるので、Rollup の依存グラフに辺が生えない。
 *
 * 段階3-4a まではここに 15 本のクラスが並んでいた（SqlNamespace が全クラスの型を
 * 持っていたため）。クラス参照が import になって SqlNamespace が縮んだので、
 * 残るのは Designer 1 本だけになった。
 */
import type { Designer } from "./wwwsqldesigner.ts";

/** subscribe() が受け取るハンドラ。publish() が {target, data} を渡す */
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
 * 段階3-4a でクラス 15 個と publish / subscribe / unsubscribe / escape が抜け、
 * 残るのは実行時インスタンスまわりの 2 つだけになった。クラスはファイル間の
 * 相互参照が import になったので名前空間に載せる必要がなくなり、pub/sub と escape は
 * 本ファイルの named export に出した（SQL は 1 個しか存在せず、関数値を取り出して
 * 渡す呼び出しも無いので this 束縛が消えても同値）。
 *
 * designer は「唯一のインスタンス」への参照で、import にすると循環するため
 * 名前空間オブジェクト経由のまま据え置く。DI 化は HANDOVER §4 の IO 分離と同時
 * （段階3-4 のスコープは「外部から触れる面＝window の撤去」まで。内部の可変
 * シングルトンの撤去は「Designer は生涯 1 個」というプログラム不変条件への依存で、
 * 参照経路の付け替えとは性質が違う）。
 *
 * Designer（クラス）は src/main.ts と tests/ が window 越しに触るため残している。
 * 撤去は段階3-4c（テスト面の付け替えが済んでから）。index signature は書かない
 * （typo が any に化けるため）。
 */
export interface SqlNamespace {
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
 * 購読者テーブル。段階3-4a まで SQL._subscribers として公開されていたが、
 * 参照は本ファイル内だけだったのでモジュールプライベートにした。
 */
const _subscribers: Record<string, SqlSubscriber[]> = {};

export function publish(
    message: string,
    publisher: unknown,
    data?: unknown,
): void {
    var subscribers = _subscribers[message] || [];
    var obj = {
        target: publisher,
        data: data,
    };
    subscribers.forEach(function (subscriber) {
        subscriber(obj);
    });
}

export function subscribe(message: string, subscriber: SqlSubscriber): void {
    if (!(message in _subscribers)) {
        _subscribers[message] = [];
    }
    var index = _subscribers[message]!.indexOf(subscriber);
    if (index == -1) {
        _subscribers[message]!.push(subscriber);
    }
}

/*
 * grabado: SQL.unsubscribe は段階3-4a で撤去した（HANDOVER §3）。js/ src/ tests/
 * index.html のどこからも参照されておらず、段階3-4c で window.SQL が消えれば
 * 名前で呼ぶ経路も物理的に無くなる。
 */

/* XML 書き出し用（HANDOVER §4 で serializer 側に移る）。lib.dom の非推奨 escape とは別物 */
export function escape(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/>/g, "&gt;")
        .replace(/</g, "&lt;");
}

/*
 * Designer / designer は js/wwwsqldesigner.ts が後から載せるので、リテラルだけでは
 * SqlNamespace を満たさない。段階3-4c で Designer 側が消え、残りは §4 で DI 化される。
 */
export const SQL = {} as SqlNamespace;

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
