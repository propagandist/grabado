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
 * js/ 側に import / export は入っていない。相互参照は現行どおりグローバル
 * （OZ / CONFIG / SQL / DATATYPES / LOCALE / _）のままで、定義側だけを window に載せてある。
 * import/export の依存グラフへの置き換えは .ts 化と同じ後続 PR で行う（段階3-2 以降）。
 */
import "../js/oz.ts";
import "../js/config.js";
import "../js/globals.js";
import "../js/visual.js";
import "../js/row.js";
import "../js/table.js";
import "../js/relation.js";
import "../js/key.js";
import "../js/rubberband.js";
import "../js/map.js";
import "../js/toggle.js";
import "../js/io.js";
import "../js/tablemanager.js";
import "../js/rowmanager.js";
import "../js/keymanager.js";
import "../js/window.js";
import "../js/options.js";
import "../js/wwwsqldesigner.js";
