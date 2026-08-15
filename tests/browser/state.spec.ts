import { test, expect, type Page } from "@playwright/test";
import { FIXTURES, SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { goldenPath, writeOrReadGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import { captureState, loadFixture, openDesigner, useDatatypes } from "./harness.ts";

/**
 * 読み込み方向（fromXML）の特性化。HANDOVER §4 段階4-1b の安全網。
 *
 * 既存の serializer golden は toXML() の結果しか押さえていない。fromXML は
 * 「XML を再生する UI 操作列」なので、XML に出ない状態 —— 選択クラス・型パレット由来の色・
 * z-index・relation がどの**実体**に繋がったか・clearTables() の後始末 —— が丸ごと
 * 素通りする。ここで固定してから js/io/ への移設に入る（CLAUDE.md 制約1）。
 *
 * 採取項目と除外項目は tests/support/state.ts の冒頭。
 */

let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
    await useDatatypes(page, SERIALIZER_DB);
});

test.afterAll(async () => {
    await page.close();
});

test.describe("読み込み後の状態 特性化（fromXML）", () => {
    for (const fixture of FIXTURES) {
        test(`state golden: ${fixture.name} — ${fixture.purpose}`, async () => {
            await useDatatypes(page, SERIALIZER_DB);
            await loadFixture(page, readFixture(fixture.name));

            const actual = await captureState(page);
            assertNoCarriageReturn(actual, `state(${fixture.name})`);

            const expected = writeOrReadGolden(goldenPath("state", `${fixture.name}.json`), actual);
            expect(actual).toBe(expected);
        });
    }

    // postgresql だけだと <default> の quote 剥がしと sql/re 照合が 1 パレットぶんしか
    // 通らない。別プロファイルを 1 本だけ足して、パレット依存の解決が parser 側に
    // 移っても結果が変わらないことを押さえる。
    test("state golden: house-defaults を mysql パレットで読む", async () => {
        await useDatatypes(page, "mysql");
        await loadFixture(page, readFixture("house-defaults"));

        const actual = await captureState(page);
        assertNoCarriageReturn(actual, "state(mysql/house-defaults)");

        const expected = writeOrReadGolden(
            goldenPath("state", "mysql-house-defaults.json"),
            actual,
        );
        expect(actual).toBe(expected);
    });

    test("冪等: 同じ XML を 2 回読んでも状態が一致する（clearTables() の後始末）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        const xml = readFixture("relations");

        await loadFixture(page, xml);
        const first = await captureState(page);
        await loadFixture(page, xml);
        const second = await captureState(page);

        expect(second).toBe(first);
    });
});
