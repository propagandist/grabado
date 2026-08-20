import { test, expect, type Page } from "@playwright/test";
import { DB_PROFILES, DDL_FIXTURES, readFixture } from "../support/fixtures.ts";
import { goldenPath, writeOrReadGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import { generateDdl, loadFixture, openDesigner, useDatatypes } from "./harness.ts";

// DDL 生成の実体は db/<db>/output.xsl（XSLT 1.0）をブラウザの XSLTProcessor で適用したもの。
// Node には XSLTProcessor が無いため、golden は必ずこの実ブラウザ経路で採る。
//
// 1 ページを beforeAll で作って使い回す（現行アプリはページ単位のグローバル SQL.designer 1 個で動く）。
// serial モードにはしない — 1 件落ちた時点で残りが skip され、
// 「何件が影響を受けたのか」が見えなくなるため。順序は workers:1 / fullyParallel:false で保証される。

let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
});

test.afterAll(async () => {
    await page.close();
});

for (const db of DB_PROFILES) {
    test.describe(`DDL golden: ${db}`, () => {
        for (const fixture of DDL_FIXTURES) {
            test(`${db} / ${fixture.name}`, async () => {
                await useDatatypes(page, db);
                await loadFixture(page, readFixture(db, fixture.name));

                const actual = await generateDdl(page, db);
                assertNoCarriageReturn(actual, `DDL(${db}/${fixture.name})`);

                const expected = writeOrReadGolden(
                    goldenPath("ddl", db, `${fixture.name}.sql`),
                    actual,
                );
                expect(actual).toBe(expected);
            });
        }
    });
}
