/*
 * js/*.js が window に載せる「境界」の ambient 宣言（HANDOVER §3 段階2）。
 *
 * これは js/ のためのものではない。js/ は checkJs: false で型検査の対象外なので、
 * ここに何を書いても js/ の診断は変わらない。目的は src/ と tests/ が window 越しに
 * 触る面を 1 か所に集約し、段階2 で行った SQL.Designer -> SQL.designer の改名を
 * npm run typecheck が検出できるようにすること。集約前は tests/node/harness.ts が
 * `as unknown as {...}` で受けていたため、直し忘れてもコンパイルが通っていた。
 *
 * 意図的に書いていないもの:
 * - index signature（[k: string]: any）。typo が any に化けて上の目的が消えるため。
 * - js/ 用の裸グローバル（_ / CONFIG / Dropbox / ActiveXObject）の宣言。
 *   checkJs を立てない今は誰も読まず、段階3 で import に置き換わって即座に陳腐化する。
 *
 * 段階3 で js/ が .ts になるたび、その面をここから実体側（js/*.ts の export と
 * declare global）へ移す。移設済み: OZ -> js/oz.ts、SQL / DATATYPES / LOCALE ->
 * js/globals.ts（段階3-1）、SqlDesigner -> js/globals.ts（段階3-2。描画中核 7 本が
 * this.owner として同じ面を参照するため、宣言を実体側に集約した）。
 * 残っているのは src/main.ts が置くデバッグ用ハンドルだけ。段階3-3 で本ファイルは消える。
 */

interface Window {
    /** src/main.ts が置くデバッグ用ハンドル（旧 index.html 末尾の var d = new SQL.Designer()） */
    d?: import("../js/globals.ts").SqlDesigner;
}
