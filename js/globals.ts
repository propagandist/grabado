/*
 * grabado: HANDOVER §3 段階3-1 で .ts 化した。
 *
 * 段階3-4c で window 登録（_ / LOCALE / SQL）を撤去し、素の ES モジュールになった。
 * 残る window 面は DATATYPES 1 つだけで、理由はファイル末尾の declare global に書いてある。
 *
 * 中身は 3 つ: ロケール辞書と getText（LOCALE / _）、pub/sub（publish / subscribe）、
 * XML エスケープ（escape）。いずれも HANDOVER §4 で行き先が決まっている
 * （escape は serializer へ、pub/sub は RowManager 周りへ）。
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
 * Designer（クラス）も段階3-4c で抜けた（src/main.ts と Node ハーネスが値 import と
 * window.__grabado で直接掴むようになったため）。残りは designer 1 つで、
 * これが §4 の DI 化の作業対象そのものになる。index signature は書かない
 * （typo が any に化けるため）。
 */
export interface SqlNamespace {
    /** 唯一のインスタンス。new Designer() が走るまでは存在しない */
    designer: Designer;
}

/*
 * ロケール辞書。段階3-4c で window.LOCALE からモジュール変数にした。
 * 消費者は下の _() の読みと js/wwwsqldesigner.ts の LOCALE[n] = v（localeResponse）だけで、
 * テストは触らない。オブジェクトを丸ごと差し替える代入はこの初期化 1 か所しかないので、
 * window から到達できなくなる以外の差は無い（DATATYPES との違いはファイル末尾を参照）。
 */
export const LOCALE: Record<string, string> = {};

/* getText */
export const _ = function _(str: string): string {
    /* getText */
    if (!(str in LOCALE)) {
        return str;
    }
    return LOCALE[str]!;
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
 * index.html のどこからも参照されておらず、段階3-4c で window.SQL も消えたので
 * 名前で呼ぶ経路は物理的に存在しない。
 */

/* XML 書き出し用（HANDOVER §4 で serializer 側に移る）。lib.dom の非推奨 escape とは別物 */
export function escape(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/>/g, "&gt;")
        .replace(/</g, "&lt;");
}

/*
 * designer は js/wwwsqldesigner.ts が後から載せるので、リテラルだけでは
 * SqlNamespace を満たさない。撤去は HANDOVER §4 の DI 化と同時。
 */
export const SQL = {} as SqlNamespace;

/*
 * grabado: 段階3-4c で window 登録を撤去した（OZ / CONFIG / _ / LOCALE / SQL）。
 * 出荷コードが持つ window 面は、ここに残る DATATYPES と src/main.ts の d の 2 つだけ。
 *
 * DATATYPES だけ残るのは、読み 12 箇所（js/wwwsqldesigner.ts / io.ts / row.ts）と
 * 書き 2 箇所に加えて、**両ハーネスが差し替える**ため（tests/node/harness.ts の
 * useDatatypes と tests/browser/harness.ts の同名関数。dbResponse() と同じ操作を
 * 模していて、実経路との同型性がテストの妥当性を支えている）。page.evaluate は
 * バンドル外なのでモジュールの setter に到達できず、モジュール化するには
 * 「別のテスト専用グローバルを足す」か「Designer / TypePalette のプロパティにする」の
 * どちらかが要る。後者は HANDOVER §6.1 の型パレット差し替えと同時にやるのが自然なので、
 * §4 に繰り越した（LOCALE はテストが触らないので、段階3-4c でモジュール変数にできた）。
 */
declare global {
    interface Window {
        /**
         * 初期値は false で、dbResponse() が Element を入れる。
         * false のままにしてあるのは js/wwwsqldesigner.ts の XMLSerializer フォールバックが
         * `window.DATATYPES.xml` を評価するため（null にすると TypeError）。
         * 是正は HANDOVER §4 の XML 書き出し撤去でこの分岐ごと消える。
         */
        DATATYPES: Element | false;
    }
}

window.DATATYPES = false;

window.onbeforeunload = function (e) {
    return ""; /* some browsers will show this text, some won't. */
};
