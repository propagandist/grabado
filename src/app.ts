/*
 * grabado フロントの「定義」エントリ（HANDOVER §3 段階1 で src/main.ts に置き、段階3-0 で分離）。
 *
 * index.html が並べていた 18 本の <script src> をここに集約している。順序は依存の薄い順で、
 * 移設前の読み込み順そのまま（docs/ARCHITECTURE.md §5.1）。
 *
 * このファイルは js/ を評価するだけで、アプリの起動（new SQL.Designer()）はしない。
 * 起動を含めない理由は tests/node/harness.ts が「js/ を全部評価 -> OZ.Request を fs 読みに
 * 差し替え -> 生成」の順を要求するため。ブラウザは src/main.ts、Node ハーネスはこのファイルを
 * エントリにすることで、読み込み順の定義が 1 か所に集約される（段階3-0 以前はハーネス側に
 * SCRIPT_ORDER として二重に書かれていた）。
 *
 * 先頭 3 本は段階3-1 で .ts になった（.ts 化 = モジュール化。イディオムは js/oz.ts の冒頭）。
 * 残り 15 本はまだ .js で、相互参照も現行どおりグローバル（OZ / CONFIG / SQL / DATATYPES /
 * LOCALE / _）のまま。.ts 側はその参照が生き続けるよう定義を window にも載せている。
 * 参照側の import/export 化は各ファイルの .ts 化と同じ PR で行い、window 登録は
 * 全部が .ts になる段階3-4 でまとめて撤去する。
 */
import "../js/oz.ts";
import "../js/config.ts";
import "../js/globals.ts";
import "../js/visual.ts";
import "../js/row.ts";
import "../js/table.ts";
import "../js/relation.ts";
import "../js/key.ts";
import "../js/rubberband.ts";
import "../js/map.ts";
import "../js/toggle.js";
import "../js/io.js";
import "../js/tablemanager.js";
import "../js/rowmanager.js";
import "../js/keymanager.js";
import "../js/window.js";
import "../js/options.js";
import "../js/wwwsqldesigner.js";
