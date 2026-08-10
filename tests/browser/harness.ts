import type { Page } from "@playwright/test";

/**
 * 実ブラウザ（Chromium）で現行アプリを起こし、現行コードそのものから挙動を採取する。
 *
 * ロジックを抽出せず現行コードを動かすのは意図的。モデル層は描画 DOM と密結合で
 * （docs/ARCHITECTURE.md §5）、抽出は HANDOVER §4 の仕事だから。ここで抽出すると
 * 「抽出後のコード」を特性化することになり安全網の意味が消える。
 */

declare global {
    interface Window {
        DATATYPES: Element;
        SQL: {
            /* 段階2 でクラス（SQL.Designer）と唯一のインスタンス（SQL.designer）に分離した */
            designer: {
                tables: unknown[];
                map: unknown;
                io: { fromXMLText(xml: string): void };
                toXML(): string;
            };
        };
    }
}

/** index.html を開き、SQL.designer の init2() 完了まで待つ */
export async function openDesigner(page: Page): Promise<void> {
    // index.html:22 は Dropbox を CDN から読む。HANDOVER §2 の「Docker でローカル完結」と
    // 噛み合わない既知の外部依存（存廃は未決）。テストは常に遮断してオフラインで走らせる。
    await page.route(/cdnjs\.cloudflare\.com/, (route) => route.abort());

    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    // 現行コードは失敗を alert() で伝える。握り潰さず、テスト側で例外にする。
    page.on("dialog", async (d) => {
        errors.push(`alert: ${d.message()}`);
        await d.dismiss();
    });

    await page.goto("/index.html");

    // init2() は locale/*.xml と db/*/datatypes.xml の 2 本が揃ってから走る
    // （js/wwwsqldesigner.js:77-99, 118-140）。map と io が生えたら初期化完了。
    await page.waitForFunction(
        () => !!window.SQL?.designer?.map && !!window.SQL?.designer?.io && !!window.DATATYPES,
        undefined,
        { timeout: 15_000 },
    );

    if (errors.length) {
        throw new Error(`初期化中にエラー:\n${errors.join("\n")}`);
    }
}

/**
 * DB プロファイルを切り替える。
 *
 * getOption("db") は cookie だけが上書き経路（js/wwwsqldesigner.js:213-245）なので
 * URL では切り替えられない。dbResponse()（同 91-99）と同じく window.DATATYPES を
 * 直接差し替えるのが実経路どおりで、かつ 1 ページで 9 DB を回せる。
 */
export async function useDatatypes(page: Page, db: string): Promise<void> {
    await page.evaluate(async (dbName) => {
        const res = await fetch(`/db/${dbName}/datatypes.xml`);
        if (!res.ok) {
            throw new Error(`datatypes.xml が取れない: ${dbName} (${res.status})`);
        }
        const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
        window.DATATYPES = doc.documentElement;
    }, db);
}

/**
 * fixture を読み込む。
 * importresponse（js/io.js:679）は使わない — alignTables() が this.tables を
 * 破壊的ソートしてテーブル順と座標を変えてしまうため（known-issues に隔離済み）。
 */
export async function loadFixture(page: Page, xml: string): Promise<void> {
    const failures = await page.evaluate((fixtureXml) => {
        const seen: string[] = [];
        const originalAlert = window.alert;
        window.alert = (msg?: unknown) => void seen.push(String(msg));
        try {
            window.SQL.designer.io.fromXMLText(fixtureXml);
        } finally {
            window.alert = originalAlert;
        }
        return seen;
    }, xml);

    if (failures.length) {
        throw new Error(`fixture の読み込みに失敗:\n${failures.join("\n")}`);
    }
}

/** 現行 SQL.designer.toXML() の生出力 */
export function toXml(page: Page): Promise<string> {
    return page.evaluate(() => window.SQL.designer.toXML());
}

/**
 * 任意の設計 XML に db/<db>/output.xsl を適用する。
 * js/io.js:535-559 の finish() と同じ経路
 * （DOMParser → XSLTProcessor → documentElement.textContent → trim）。
 */
export function transformXml(page: Page, db: string, xml: string): Promise<string> {
    return page.evaluate(
        async ([dbName, source]) => {
            const res = await fetch(`/db/${dbName}/output.xsl`);
            if (!res.ok) {
                throw new Error(`output.xsl が取れない: ${dbName} (${res.status})`);
            }
            const xslDoc = new DOMParser().parseFromString(await res.text(), "text/xml");

            const xmlDoc = new DOMParser().parseFromString(source ?? "", "text/xml");
            const proc = new XSLTProcessor();
            proc.importStylesheet(xslDoc);
            const result = proc.transformToDocument(xmlDoc);
            if (!result?.documentElement) {
                throw new Error(`XSLT 変換が空を返した: ${dbName}`);
            }
            return (result.documentElement.textContent ?? "").trim();
        },
        [db, xml] as const,
    );
}

/** 現行の DDL 生成。UI の #textarea に入る値と一致する */
export async function generateDdl(page: Page, db: string): Promise<string> {
    return transformXml(page, db, await toXml(page));
}
