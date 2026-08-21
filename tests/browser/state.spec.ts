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

    // postgresql だけだと <default> の quote 剥がしと sql/re 照合が 1 パレットぶんしか
    // 通らない。別プロファイルを 1 本だけ足して、パレット依存の解決が parser 側に
    // 移っても結果が変わらないことを押さえる。
    //
    // **入力は postgresql の fixture のまま**（段階6-6a）。見たいのは「同じ入力を別のパレットで
    // 読むと解決がどう変わるか」なので、その DB の fixture に差し替えるとこの主張が消える。
    //
    // **寄せ先は未現代化のプロファイルでなければならない**（段階6-8a）。strict なパレットは
    // 未知の型を例外にするので、PG の設計（UUID / JSONB）を読ませると落ちる —— それは
    // known-issue #4 が解消したことの証明であって、状態スナップショットの主張ではない。
    // 寄せ先は 6-8a で mysql -> oracle、6-8c で oracle -> sqlite と動いた。**6-8d で
    // 未現代化が尽きる**ので、そのときこのテストは「strict どうしで読む」形に作り直すか、
    // 役目を終えて消える。
    //
    // **空にしてからパレットを差し替える。** sqlite は 5 型しか無く、前のテストが残した
    // テーブル（postgresql の 24 型で解決済み）を後始末すると範囲外の型添字を引いて落ちる
    // （6-8a / 6-8b で 2 度踏んだのと同じ形）。
    test("state golden: house-defaults を sqlite パレットで読む", async () => {
        await loadFixture(page, readFixture(SERIALIZER_DB, "empty"));
        await useDatatypes(page, "sqlite");
        await loadFixture(page, readFixture(SERIALIZER_DB, "house-defaults"));

        const actual = await captureState(page);
        assertNoCarriageReturn(actual, "state(sqlite/house-defaults)");

        const expected = writeOrReadGolden(
            goldenPath("state", "sqlite-house-defaults.json"),
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
