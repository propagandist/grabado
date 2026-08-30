import { test, expect, type Page } from "@playwright/test";
import { FIXTURES, SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { goldenPath, writeOrReadGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import { captureState, loadFixture, openDesigner, useDatatypes } from "./harness.ts";

/**
 * 読み込み方向（fromXML）の特性化。HANDOVER §4 段階4-1b の安全網。
 *
 * 書き出しの golden は結果しか押さえていない。fromXML は
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
            await loadFixture(page, readFixture(SERIALIZER_DB, fixture.name));

            const actual = await captureState(page);
            assertNoCarriageReturn(actual, `state(${fixture.name})`);

            const expected = writeOrReadGolden(goldenPath("state", `${fixture.name}.json`), actual);
            expect(actual).toBe(expected);
        });
    }

    // postgresql だけだと <default> の quote 剥がしと型の照合が 1 パレットぶんしか
    // 通らない。別プロファイルを 1 本だけ足して、パレット依存の解決が parser 側に
    // 移っても結果が変わらないことを押さえる。
    //
    // **入力は postgresql の fixture のまま**（段階6-6a）。見たいのは「同じ入力を別のパレットで
    // 読むと解決がどう変わるか」なので、その DB の fixture に差し替えるとこの主張が消える。
    //
    // **寄せ先は h2 に落ち着いた**（段階6-8d）。6-8a まで「未現代化のプロファイルでなければ
    // ならない」——strict なパレットは未知の型を例外にするので、寄せ先は mysql -> oracle ->
    // sqlite と現代化のたびに動いてきた。6-8d で未現代化が 0 本になり、動かす先が尽きた。
    //
    // **h2 は house 既定の 8 型（UUID / TEXT / INTEGER / JSONB / TIMESTAMP WITH TIME ZONE /
    // DECIMAL(12,2) / DATE / BOOLEAN）が全部 aka で解決する唯一の非 PG プロファイル**なので、
    // 主張が「別パレットで読むと潰れる」から**「strict どうしなら潰れずに移る」**に変わる。
    // 次に動く先が要らない形で、6-9 のプロファイル変換への足がかりにもなる。
    //
    // 空にしてから差し替える儀式は useDatatypes() の中へ畳んだ（tests/browser/harness.ts）。
    test("state golden: house-defaults を h2 パレットで読む", async () => {
        await useDatatypes(page, "h2");
        await loadFixture(page, readFixture(SERIALIZER_DB, "house-defaults"));

        const actual = await captureState(page);
        assertNoCarriageReturn(actual, "state(h2/house-defaults)");

        const expected = writeOrReadGolden(
            goldenPath("state", "h2-house-defaults.json"),
            actual,
        );
        expect(actual).toBe(expected);
    });

    test("冪等: 同じ XML を 2 回読んでも状態が一致する（clearTables() の後始末）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        const xml = readFixture(SERIALIZER_DB, "relations");

        await loadFixture(page, xml);
        const first = await captureState(page);
        await loadFixture(page, xml);
        const second = await captureState(page);

        expect(second).toBe(first);
    });
});
