import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { REPO_ROOT } from "../support/fixtures.ts";

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

/** src/main.ts:13-30 の読み込み順（段階1 で index.html から移設）。依存の薄い順の指標でもある（docs/ARCHITECTURE.md §5.1） */
const SCRIPT_ORDER = [
    "oz.js",
    "config.js",
    "globals.js",
    "visual.js",
    "row.js",
    "table.js",
    "relation.js",
    "key.js",
    "rubberband.js",
    "map.js",
    "toggle.js",
    "io.js",
    "tablemanager.js",
    "rowmanager.js",
    "keymanager.js",
    "window.js",
    "options.js",
    "wwwsqldesigner.js",
] as const;

/* SQL.designer の型は types/globals.d.ts の SqlDesigner に集約した（HANDOVER §3 段階2） */

export interface NodeHarness {
    readonly dom: JSDOM;
    readonly window: JSDOM["window"];
    /** window.DATATYPES を差し替える（dbResponse() と同じ操作） */
    useDatatypes(db: string): void;
    /** fixture を読み込む。alert が出たら例外にする */
    loadFixture(xml: string): void;
    toXML(): string;
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

export function createHarness(): NodeHarness {
    // index.html から <script src> と末尾の `new SQL.Designer()` を外す。
    // スクリプトは順序と OZ.Request の差し替えを制御するため手で評価する。
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

    for (const file of SCRIPT_ORDER) {
        window.eval(readRepoFile(`js/${file}`));
    }

    // OZ.Request を fs 読みへ。同期的にコールバックを呼ぶので
    // new SQL.Designer() のうちに init2() まで到達する。
    window.OZ.Request = (
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

    window.eval("new SQL.Designer();");

    // 段階2 でクラス（SQL.Designer）と唯一のインスタンス（SQL.designer）に分離した。
    // new SQL.Designer() 自体は無改修で通る（コンストラクタが SQL.designer に自己登録する）。
    const sql = window.SQL;
    if (!sql?.designer?.map || !sql.designer.io) {
        throw new Error(`SQL.designer の初期化に失敗:\n${alerts.join("\n")}`);
    }

    const takeAlerts = (): string[] => alerts.splice(0, alerts.length);
    takeAlerts();

    return {
        dom,
        window,
        useDatatypes(db: string): void {
            const xml = readRepoFile(`db/${db}/datatypes.xml`);
            const doc = new window.DOMParser().parseFromString(xml, "text/xml");
            window.DATATYPES = doc.documentElement;
        },
        loadFixture(xml: string): void {
            sql.designer.io.fromXMLText(xml);
            const failures = takeAlerts();
            if (failures.length) {
                throw new Error(`fixture の読み込みに失敗:\n${failures.join("\n")}`);
            }
        },
        toXML(): string {
            return sql.designer.toXML();
        },
        close(): void {
            window.close();
        },
    };
}
