/*
 * grabado フロントの起動エントリ（HANDOVER §3 段階1）。
 *
 * js/ の読み込み（＝定義）は src/app.ts に分離した（段階3-0）。ここは旧 index.html 末尾の
 * インライン script 相当だけを持つ。<script type="module"> は defer 相当なので、
 * body 末尾で走らせていた現行と同じく DOM 構築後に初期化される。
 * window 越しの型は types/globals.d.ts に集約してあるのでキャストは要らない（§3 段階2）。
 */
import "./app.ts";

window.d = new window.SQL.Designer();

// d.setXhrHeaders({"Authorization": "Bearer xxx"});
// d.setXhrHeaders({"X-CSRF-TOKEN": "xxx"});
