import { test, expect, type Page } from "@playwright/test";
import { SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { goldenPath, readGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
// ハーネスは dev server 側と同じものを使う。配布物でも同じ経路が同じ結果を出すことが確認したいこと。
import { clickIo, generateDdl, loadFixture, openDesigner, useDatatypes } from "../browser/harness.ts";
import viteConfig from "../../vite.config.ts";

/**
 * build 成果物（vite build → vite preview）のスモーク。
 *
 * 特性化の本体は tests/browser/（dev server・golden の権威）で、ここは
 * 「バンドルとアセットのコピーが配布物として成立しているか」だけを見る。
 * golden は読むだけで、絶対に採り直さない。
 */

const SMOKE_FIXTURE = "house-defaults";

/**
 * 配布時と同じセキュリティヘッダ（段階2-2）。**正本は Kotlin の SecurityHeadersFilter** で、
 * ここが読むのは vite preview の写し —— 両者のずれは tests/node/csp.test.ts が見る。
 */
const EXPECTED_HEADERS = (viteConfig.preview?.headers ?? {}) as Record<string, string>;

/** 旧書式（{k:'v'} の生連結）なら読み戻しが壊れる値。cookie の往復に使う */
const TRICKY_PATTERN = `it's, a "test"`;

/** Chrome が console に出した CSP 違反。**afterEach で毎回空を確かめる** */
const cspViolations: string[] = [];

let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    /*
     * ★ **CSP は curl では確かめにならない**（org security-verification §1.2）。ヘッダの
     *   有無しか見えず、「違反が出ないこと」と「機能が壊れていないこと」はブラウザにしか
     *   出ない。開いた瞬間から console を拾っておく。
     */
    page.on("console", (msg) => {
        if (/Content Security Policy/i.test(msg.text())) {
            cspViolations.push(msg.text());
        }
    });
    await openDesigner(page);
});

/* どのテストで出たかが分かるよう、毎回引き取ってから空を確かめる */
test.afterEach(() => {
    expect(cspViolations.splice(0), "CSP 違反が出た").toEqual([]);
});

test.afterAll(async () => {
    await page.close();
});

test("バンドルされた index.html から Designer が初期化される", async () => {
    // openDesigner() が map / io / 型パレットの生成を待っている。ここでは実体の型だけ確かめる。
    const ready = await page.evaluate(() => typeof window.d!.toDdl === "function");
    expect(ready).toBe(true);
});

test("Rollup の依存グラフに乗らない資産が dist に入っている", async () => {
    // db/ locale/ は OZ.Request が相対 URL で fetch する。
    // images/ はバンドル後の CSS が url(../images/…) のまま参照する（実測）ので、
    // dist/assets/*.css から見て dist/images/ が実在しないと背景が欠ける。
    for (const path of [`db/${SERIALIZER_DB}/datatypes.xml`, "locale/en.xml", "images/back.png"]) {
        const status = await page.evaluate(
            async (p) => (await fetch(p, { method: "GET" })).status,
            path,
        );
        expect(status, `${path} が dist に無い`).toBe(200);
    }
});

test(`配布物でも DDL が golden と一致する（${SERIALIZER_DB} / ${SMOKE_FIXTURE}）`, async () => {
    await useDatatypes(page, SERIALIZER_DB);
    await loadFixture(page, readFixture(SERIALIZER_DB, SMOKE_FIXTURE));

    const actual = await generateDdl(page, SERIALIZER_DB);
    assertNoCarriageReturn(actual, `DDL(${SERIALIZER_DB}/${SMOKE_FIXTURE})`);

    expect(actual).toBe(readGolden(goldenPath("ddl", SERIALIZER_DB, `${SMOKE_FIXTURE}.sql`)));
});

test("配布時と同じセキュリティヘッダで配られる", async () => {
    const actual = (await page.request.get("/index.html")).headers();

    for (const [name, value] of Object.entries(EXPECTED_HEADERS)) {
        expect(actual[name.toLowerCase()], `${name} が落ちている`).toBe(value);
    }
});

test("CSP 下でも blob: のダウンロードが通る", async () => {
    /*
     * clientdownload は Blob を URL.createObjectURL で包み、<a download> をクリックする
     * （js/io.ts）。**ダウンロードはナビゲーションではない**ので CSP のどのディレクティブにも
     * 掛からない —— 2026-08-25 実測。掛かるようになれば download が発火せず、ここが赤くなる。
     */
    const [download] = await Promise.all([
        page.waitForEvent("download"),
        clickIo(page, "clientdownload"),
    ]);

    expect(download.suggestedFilename()).toBe("new-database.json");
});

test("CSP 下で主要操作が一巡する", async () => {
    /*
     * org security-verification §1.2:「**CSP はブラウザでしか確認にならない**。違反が出ない
     * ことと、機能が壊れていないことは、Console を開いたまま主要画面を通して確認する」。
     * その一巡を機械にやらせる —— 違反が出れば afterEach が拾う。
     *
     * 経路は既存テストと同じ入口を借りる（tests/browser/template.spec.ts / keys.spec.ts）。
     * ここが見るのは**配布物が CSP 下で動くこと**で、経路そのものの正しさは向こうの担当。
     */
    const result = await page.evaluate((tricky) => {
        const d = window.d!;

        /* テーブル追加 → 行追加（#addtable / #addrow と同じ経路） */
        d.tableManager.preAdd();
        d.tableManager.click({ clientX: 300, clientY: 200 } as unknown as MouseEvent);
        d.window.close();
        const table = d.tables[d.tables.length - 1]!;
        d.tableManager.select(table);
        d.tableManager.addRow();

        /* キー編集（#tablekeys） */
        d.keyManager.sync(table);
        d.keyManager.add();

        /* オプション変更 —— テーマ切り替えと cookie の往復（段階2-2 で eval を撤去した経路） */
        d.setOption("pattern", tricky);
        d.setOption("style", "original");
        d.applyStyle();
        const pattern = d.getOption("pattern");
        d.setOption("style", "material-inspired");
        d.applyStyle();

        return { rows: table.rows.length, keys: table.keys.length, pattern };
    }, TRICKY_PATTERN);

    expect(result.rows).toBeGreaterThan(0);
    expect(result.keys).toBeGreaterThan(0);
    /* 記号を含む値が cookie を往復する（往復そのものは tests/node/options-cookie.test.ts） */
    expect(result.pattern).toBe(TRICKY_PATTERN);

    /* DDL 出力と localStorage の保存/読込（どちらも alert が出なければ通っている） */
    expect(await clickIo(page, "clientsql")).toEqual([]);
    expect(await clickIo(page, "clientlocalsave", "csp-smoke")).toEqual([]);
    expect(await clickIo(page, "clientlocalload", "csp-smoke")).toEqual([]);
});
