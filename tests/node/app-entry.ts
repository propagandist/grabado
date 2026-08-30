/*
 * grabado: Node ハーネス専用のバンドルエントリ（HANDOVER §3 段階3-4b）。
 *
 * jsdom の window.eval で評価した IIFE の「内側」に Node 側から手を入れるための
 * ハンドルを 1 つだけ出す。段階3-4a までこの役目は js/oz.ts の window.OZ = OZ と
 * js/globals.ts の window.SQL = SQL が担っていたが、あれは出荷コードが持つ
 * グローバルで、撤去が段階3-4 の目的そのもの。テストのための面はテストが持つ。
 *
 * 読み込み順の定義は src/app.ts の 1 か所のまま。ここは副作用 import 1 本に続けて
 * ハンドルを載せるだけで、起動（new Designer()）は含めない — OZ.Request を fs 読みに
 * 差し替えてから生成する順序を現行と 1 行も変えないため（src/app.ts の冒頭を参照）。
 *
 * page 文脈（tests/browser / tests/dist / tests/known-issues）はバンドル外の
 * page.evaluate から触るのでこの経路が使えず、src/main.ts の window.d を見る。
 */
import "../../frontend/src/app.ts";
import { OZ } from "../../frontend/js/oz.ts";
import { Designer } from "../../frontend/js/wwwsqldesigner.ts";

/** window.eval したバンドルが載せる、ハーネス専用の面 */
export interface GrabadoTestApi {
    /** Request を fs 読みに差し替えるために要る（jsdom で XHR を飛ばさない） */
    OZ: typeof OZ;
    /** 生成はハーネスが順序を握り、戻り値をそのまま使う（旧 SQL.designer は段階4-0a で消えた） */
    Designer: typeof Designer;
}

(window as unknown as { __grabado: GrabadoTestApi }).__grabado = { OZ, Designer };
