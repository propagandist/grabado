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
 * 18 本は段階3-1〜3-3b で .ts になり（.ts 化 = モジュール化。イディオムは js/oz.ts の冒頭）、
 * 相互参照は段階3-4 で import 化されて window 登録も尽きた。したがってこの副作用 import は
 * 値の辺としては冗長だが、読み込み順の文書として、また Node ハーネスのエントリとして残す
 * （tests/node/app-entry.ts が本ファイルを import する）。
 */
/* 段階4-0b で新設した型パレット層。js/ のどこにも依存しないので先頭に置く */
import "../js/io/palette.ts";
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
import "../js/toggle.ts";
import "../js/io.ts";
import "../js/tablemanager.ts";
import "../js/rowmanager.ts";
import "../js/keymanager.ts";
import "../js/window.ts";
import "../js/options.ts";
import "../js/wwwsqldesigner.ts";
