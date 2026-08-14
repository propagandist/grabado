import { test, expect, type Page } from "@playwright/test";
import { SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { goldenPath, readGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
// ハーネスは dev server 側と同じものを使う。配布物でも同じ経路が同じ結果を出すことが確認したいこと。
import { generateDdl, loadFixture, openDesigner, useDatatypes } from "../browser/harness.ts";

/**
 * build 成果物（vite build → vite preview）のスモーク。
 *
 * 特性化の本体は tests/browser/（dev server・golden の権威）で、ここは
 * 「バンドルとアセットのコピーが配布物として成立しているか」だけを見る。
 * golden は読むだけで、絶対に採り直さない。
 */

const SMOKE_FIXTURE = "house-defaults";

let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
});

test.afterAll(async () => {
    await page.close();
});

test("バンドルされた index.html から Designer が初期化される", async () => {
    // openDesigner() が map / io / 型パレットの生成を待っている。ここでは実体の型だけ確かめる。
    const ready = await page.evaluate(() => typeof window.d!.toXML === "function");
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
    await loadFixture(page, readFixture(SMOKE_FIXTURE));

    const actual = await generateDdl(page, SERIALIZER_DB);
    assertNoCarriageReturn(actual, `DDL(${SERIALIZER_DB}/${SMOKE_FIXTURE})`);

    expect(actual).toBe(readGolden(goldenPath("ddl", SERIALIZER_DB, `${SMOKE_FIXTURE}.sql`)));
});
