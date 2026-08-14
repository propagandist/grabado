/*
 * grabado: HANDOVER §3 段階3-1 で .ts 化した。
 *
 * 段階3-4c で window 登録（_ / LOCALE / SQL）を撤去し、素の ES モジュールになった。
 * 段階4-0a では SQL 名前空間そのものが消え、値 export は下記 3 つだけになった。
 * 段階4-0b で DATATYPES も js/io/palette.ts へ移り、本ファイルの window 面は尽きた
 * （経緯はファイル末尾のコメント）。
 *
 * 段階4-1a で escape が js/io/xml-serializer.ts へ出たので、値 export は
 * ロケール辞書と getText（LOCALE / _）、pub/sub（publish / subscribe）の 2 組。
 * pub/sub も HANDOVER §4 で RowManager 周りへ移る予定。
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
 * 回って書き換える作業は発生しない）。名前を Designer に一本化するかは、
 * §4 のモデル層分離（段階4-1）で描画エンジン側の面が確定してから判断する。
 */
export type SqlDesigner = Designer;

/*
 * grabado: SQL 名前空間（interface SqlNamespace と export const SQL）は
 * 段階4-0a で撤去した（HANDOVER §4）。
 *
 * 最後まで残っていたのは SQL.designer = 唯一の Designer インスタンスへの参照で、
 * 実コード 7 行から読まれていた。読み手はすべて Designer に所有される側
 * （Row / Table / Relation / RowManager）だったので、owner 鎖をたどれば同じ実体に
 * 届く。this.owner（Relation / RowManager / Table）と this.owner.owner（Row）への
 * 置換で同値になり、名前空間オブジェクトそのものが不要になった。
 *
 * 段階3-4 のスコープに入れなかったのは、可変シングルトンの撤去が「Designer は生涯
 * 1 個」というプログラム不変条件への依存で、window 面の撤去とは性質が違うため。
 * §4 のモデル層分離は「どの Designer のモデルか」を型で表す必要があるので、
 * その前提として §4 の先頭で外した。
 */

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

/*
 * grabado: XML エスケープ（escape）は段階4-1a で js/io/xml-serializer.ts に
 * escapeXML として移した（HANDOVER §4）。呼び手 3 か所（table / row の <comment> と
 * <default>）がすべて toXML 経路だったので、書き出しの移設と同時に import ごと消えた。
 * lib.dom の非推奨グローバル escape との同名衝突も構造的に無くなっている。
 */

/*
 * grabado: 段階3-4c で window 登録を撤去し（OZ / CONFIG / _ / LOCALE / SQL）、
 * 段階4-0b で最後に残っていた DATATYPES も消えた。出荷コードが持つ window 面は
 * src/main.ts の d（テストの入口を兼ねるデバッグハンドル）1 つだけ。
 *
 * DATATYPES が §4 まで残っていたのは、読み書き 14 箇所の実行コード変更に加えて
 * **両ハーネスが差し替える**ためだった（tests/node/harness.ts の useDatatypes と
 * tests/browser/harness.ts の同名関数。dbResponse() と同じ操作を模していて、
 * 実経路との同型性がテストの妥当性を支えている）。page.evaluate はバンドル外なので
 * モジュールの setter に到達できない。段階4-0b は「Designer のプロパティにする」で
 * 解いた（js/io/palette.ts。差し替え口は node が designer.palette、page が
 * window.d.palette）。下の onbeforeunload はグローバル変数ではなくアプリ挙動なので残す。
 */

window.onbeforeunload = function (e) {
    return ""; /* some browsers will show this text, some won't. */
};
