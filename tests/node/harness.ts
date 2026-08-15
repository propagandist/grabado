import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "vite";
import { REPO_ROOT } from "../support/fixtures.ts";
import { captureDesignState } from "../support/state.ts";
/* OZ の型は js/oz.ts の export に移した（HANDOVER §3 段階3-1）。
   実体は window.eval したバンドルが載せるので、ここでは型だけ借りる。 */
import type { OzRequestCallback, OzRequestOptions } from "../../js/oz.ts";
/* バンドルが window に載せるハンドルの型（実体は tests/node/app-entry.ts） */
import type { GrabadoTestApi } from "./app-entry.ts";

/**
 * jsdom 上に現行アプリを起こす、Node 側（高速回帰）のハーネス。
 *
 * 権威は実ブラウザ側（tests/browser/）。こちらは同じ fixture・同じ golden を
 * 高速に回すための第 2 の実行系で、両者がずれたらそれ自体が情報になる。
 *
 * 実ブラウザとの構造的な違いは 2 つだけ:
 *   1. OZ.Request を fs 読みに差し替える（jsdom で XHR を実際に飛ばさないため）
 *   2. offsetWidth/offsetHeight が常に 0（jsdom はレイアウトしない）
 *      -> toXML() が使うのは x/y だけなのでシリアライズの特性化には影響しない
 */

/*
 * Designer インスタンスの型は js/wwwsqldesigner.ts の実体 1 本（HANDOVER §4 段階4-1c）。
 * 段階3-2 の SqlDesigner（types/globals.d.ts -> js/globals.ts と移った別名）は撤去済み。
 * 本ファイルは designer を api 越しの値として持つだけなので、この型を import していない。
 */

export interface NodeHarness {
    readonly dom: JSDOM;
    readonly window: JSDOM["window"];
    /** 型パレットを差し替える（dbResponse() と同じ操作） */
    useDatatypes(db: string): void;
    /** fixture を読み込む。alert が出たら例外にする */
    loadFixture(xml: string): void;
    toXML(): string;
    /** 設計 JSON の書き出し / 読み込み（段階4-2。UI 未配線なので Designer の面を直接叩く） */
    toJson(): string;
    /** 読み込みは alert ではなく例外で落ちる（js/io/json-parser.ts） */
    loadJson(json: string): void;
    /** 読み込み後の状態スナップショット（page 側と同じ関数。tests/support/state.ts） */
    captureState(): string;
    close(): void;
}

function readRepoFile(relPath: string): string {
    return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

/**
 * URL パス -> リポジトリ内ファイル。OZ.Request の差し替え先。
 * CONFIG.STATIC_PATH は空文字なので、アプリが投げる URL は "locale/en.xml" のような相対パス。
 */
function resolveRequestUrl(url: string): string {
    return url.replace(/^\/+/, "").split("?")[0] ?? "";
}

/**
 * tests/node/app-entry.ts を単一 IIFE に束ねて返す（HANDOVER §3 段階3-0、3-4b で入口を変更）。
 *
 * 以前はここで js/*.js を 1 本ずつ eval していたが、その経路は js/ が .ts になった時点で
 * 動かなくなる（docs/TESTING.md が段階3 の分岐点として予告していた箇所）。バンドルを噛ませると
 * js/ が .js でも .ts でも、参照がグローバルでも ESM でも同じコードで動くので、移行が 1 回で済む。
 * 副次的に、読み込み順の定義が src/app.ts の 1 か所に集約される（従来はここに SCRIPT_ORDER として
 * 二重に書かれていた）。
 *
 * 束ねるのは src/app.ts をそのまま import して window.__grabado を載せるだけの薄いエントリ
 * （段階3-4b）。バンドルの内側にある OZ と Designer に Node 側から手を届かせるためで、
 * 読み込み順の定義は src/app.ts の 1 か所のまま。
 *
 * 起動（new Designer()）は含めない。OZ.Request を fs 読みに差し替えてから生成する必要があり、
 * その順序は現行と 1 行も変えないため。だから束ねるのは src/main.ts ではない。
 */
async function bundleApp(): Promise<string> {
    const result = await build({
        // vite.config.ts を読ませない。viteStaticCopy が走ると dist/ に書き込んでしまう。
        configFile: false,
        // process.cwd() を読ませない（Windows の cwd 大小問題と非干渉にする。
        // scripts/canonical-cwd.mjs の WORKAROUND を参照）。
        root: REPO_ROOT,
        logLevel: "silent",
        build: {
            write: false,
            target: "es2022",
            minify: false,
            // 副作用 import だけで構成されるエントリなので、ツリーシェイクの判断に
            // 安全網を依存させない。配布物の妥当性は npm run test:dist が別途張る。
            rollupOptions: { treeshake: false },
            lib: {
                entry: "tests/node/app-entry.ts",
                formats: ["iife"],
                name: "GrabadoApp",
                fileName: "app",
            },
        },
    });

    const outputs = Array.isArray(result) ? result : [result];
    const first = outputs[0];
    if (!first || !("output" in first)) {
        throw new Error("vite build がバンドル出力を返さなかった（watch モードになっている）");
    }
    const chunk = first.output.find((o) => o.type === "chunk");
    if (!chunk) {
        throw new Error("バンドル出力に chunk が無い");
    }
    return chunk.code;
}

export async function createHarness(): Promise<NodeHarness> {
    const appBundle = await bundleApp();

    // index.html から <script src> と末尾の `new SQL.Designer()` を外す。
    // 評価の順序と OZ.Request の差し替えを制御するため、バンドルは手で eval する。
    const html = readRepoFile("index.html")
        .replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, "")
        .replace(/<script type="text\/javascript">[\s\S]*?<\/script>/g, "");

    const virtualConsole = new VirtualConsole();
    // jsdom が実装していない API（alert 等）の警告は握らず捨てる。
    // 本当のエラーは下の alert フックと pageerror 相当で拾う。
    virtualConsole.on("jsdomError", () => {});

    const dom = new JSDOM(html, {
        runScripts: "dangerously",
        url: "http://127.0.0.1:4173/index.html",
        pretendToBeVisual: true,
        virtualConsole,
    });
    const window = dom.window;

    // strict で評価する。ESM で配る側（dev / build / test:browser / test:dist）は常に strict
    // なのに window.eval は sloppy、という実行系の乖離を縮めるため。rolldown の IIFE 出力自体には
    // "use strict" が付かないので前置が要る。
    //
    // ただし暗黙グローバル（段階2 で直した js/io.js の req / js/oz.js の y）は、これを入れても
    // 捕まらない。jsdom の Window は vm の contextified global（Proxy）なので、strict でも
    // 未宣言の名前への代入が成立してしまう。実測: 前置ありで関数内の this は undefined、
    // frozen への代入は TypeError、delete 変数は SyntaxError になる（＝コードは strict）が、
    // 暗黙グローバル代入だけは素通りして window に載る。Node の素の indirect eval と
    // vm.runInContext では同じコードが ReferenceError になるので、これは jsdom 固有の制約。
    // 暗黙グローバルの検出は引き続き npm run test:browser の担当（docs/TESTING.md）。
    window.eval(`"use strict";\n${appBundle}`);

    // バンドルが載せたハンドル（tests/node/app-entry.ts）。段階3-4b までは
    // window.OZ / window.SQL という出荷コード側のグローバルを踏んでいた。
    const api = (window as unknown as { __grabado?: GrabadoTestApi }).__grabado;
    if (!api) {
        throw new Error("バンドルが window.__grabado を載せていない（tests/node/app-entry.ts）");
    }

    // OZ.Request を fs 読みへ。同期的にコールバックを呼ぶので
    // new Designer() のうちに init2() まで到達する。
    api.OZ.Request = (
        url: string,
        callback?: OzRequestCallback,
        options?: OzRequestOptions,
    ) => {
        if (!callback) {
            return false;
        }
        const path = resolveRequestUrl(url);
        let text: string;
        try {
            text = readRepoFile(path);
        } catch {
            callback(null, 404, {});
            return false;
        }
        const data = options?.xml
            ? new window.DOMParser().parseFromString(text, "text/xml")
            : text;
        callback(data, 200, {});
        return false;
    };

    const alerts: string[] = [];
    window.alert = (msg?: unknown) => void alerts.push(String(msg));

    // 段階3-4b まで window.eval("new SQL.Designer();") と書いて結果を window.SQL.designer から
    // 拾っていた。ハンドルを掴んでいるので戻り値をそのまま使える（コンストラクタ内の
    // SQL.designer への自己登録も段階4-0a で消え、インスタンスへの経路はこの戻り値だけになった）。
    const designer = new api.Designer();
    if (!designer.map || !designer.io) {
        throw new Error(`Designer の初期化に失敗:\n${alerts.join("\n")}`);
    }

    const takeAlerts = (): string[] => alerts.splice(0, alerts.length);
    takeAlerts();

    return {
        dom,
        window,
        useDatatypes(db: string): void {
            const xml = readRepoFile(`db/${db}/datatypes.xml`);
            const doc = new window.DOMParser().parseFromString(xml, "text/xml");
            // 段階4-0b で window.DATATYPES から Designer のプロパティになった。
            // 差し替えの中身（dbResponse() と同じ「documentElement を入れる」操作）は不変。
            designer.palette.setRoot(doc.documentElement);
        },
        loadFixture(xml: string): void {
            designer.io.fromXMLText(xml);
            const failures = takeAlerts();
            if (failures.length) {
                throw new Error(`fixture の読み込みに失敗:\n${failures.join("\n")}`);
            }
        },
        toXML(): string {
            return designer.toXML();
        },
        toJson(): string {
            return designer.toJson();
        },
        loadJson(json: string): void {
            designer.fromJson(json);
        },
        captureState(): string {
            return captureDesignState(designer);
        },
        close(): void {
            window.close();
        },
    };
}
