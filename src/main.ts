/*
 * grabado フロントの起動エントリ（HANDOVER §3 段階1）。
 *
 * js/ の読み込み（＝定義）は src/app.ts に分離した（段階3-0）。ここは旧 index.html 末尾の
 * インライン script 相当だけを持つ。<script type="module"> は defer 相当なので、
 * body 末尾で走らせていた現行と同じく DOM 構築後に初期化される。
 *
 * window.d の宣言は types/globals.d.ts に置いていたが、同ファイルが持っていた他の面は
 * すべて実体側（js/oz.ts / js/globals.ts）へ移り、残ったのがこの 1 つだけになったので
 * 段階3-3b でここへ引き取ってファイルごと消した。
 */
import "./app.ts";
import { Designer } from "../js/wwwsqldesigner.ts";

declare global {
    interface Window {
        /**
         * デバッグ用ハンドル（旧 index.html 末尾の var d = new SQL.Designer()）。
         *
         * 段階3-4b から page 側テスト（tests/browser / tests/dist / tests/known-issues）の
         * 入口も兼ねる。page.evaluate はバンドルの外で走るので window 越しのハンドルが要り、
         * 新しい名前を作るよりこれを公開面として文書化するほうが面が増えない。
         * Node ハーネスは別経路（tests/node/app-entry.ts の window.__grabado）。
         */
        d?: Designer;
    }
}

/* 段階3-4c で window.SQL.Designer から値 import になった */
window.d = new Designer();

// d.setXhrHeaders({"Authorization": "Bearer xxx"});
// d.setXhrHeaders({"X-CSRF-TOKEN": "xxx"});
