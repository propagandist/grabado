/*
 * grabado フロントのエントリ（HANDOVER §3 段階1）。
 *
 * index.html が並べていた 18 本の <script src> をここに移した。順序は依存の薄い順で、
 * 移設前の読み込み順そのまま（docs/ARCHITECTURE.md §5.1）。
 *
 * 段階1では js/ 側に import / export を入れない。相互参照は現行どおりグローバル
 * （OZ / CONFIG / SQL / DATATYPES / LOCALE / _）のままで、定義側だけを window に載せてある。
 * こうしておくと tests/node/harness.ts が js/*.js を 1 本ずつ eval する経路も無改修で通り、
 * 特性化テスト（HANDOVER §7）2 系統を安全網として保ったまま束ねられる。
 * import/export の依存グラフへの置き換えは .ts 化と同じ後続 PR で行う。
 */
import "../js/oz.js";
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

// 旧 index.html 末尾のインライン script 相当。<script type="module"> は defer 相当なので、
// body 末尾で走らせていた現行と同じく DOM 構築後に初期化される。
// window 越しの型は types/globals.d.ts に集約してあるのでキャストは要らない（§3 段階2）。
window.d = new window.SQL.Designer();

// d.setXhrHeaders({"Authorization": "Bearer xxx"});
// d.setXhrHeaders({"X-CSRF-TOKEN": "xxx"});
