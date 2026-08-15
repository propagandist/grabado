import { test, expect, type Page } from "@playwright/test";
import { FIXTURES, SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { goldenPath, writeOrReadGolden } from "../support/golden.ts";
import {
    ACTIVE_URL_PLACEHOLDER,
    assertNoCarriageReturn,
    hasActiveUrlComment,
    normalizeDesignXml,
} from "../support/normalize.ts";
import { loadFixture, openDesigner, toXml, useDatatypes } from "./harness.ts";

// 1 ページを beforeAll で作って使い回す（現行アプリはページ単位のグローバル SQL.designer 1 個で動く）。
// serial モードにはしない — 1 件落ちた時点で残りが skip され、影響範囲が見えなくなるため。

let page: Page;

/** 出力 XML に現れる <table name="..."> を出現順に取り出す */
function tableNamesOf(xml: string): string[] {
    return [...xml.matchAll(/<table x="[^"]*" y="[^"]*" name="([^"]*)">/g)].map(
        (m) => m[1]!
    );
}

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
    await useDatatypes(page, SERIALIZER_DB);
});

test.afterAll(async () => {
    await page.close();
});

test.describe("serializer 特性化（toXML / fromXML）", () => {
    for (const fixture of FIXTURES) {
        test(`golden: ${fixture.name} — ${fixture.purpose}`, async () => {
            await useDatatypes(page, SERIALIZER_DB);
            await loadFixture(page, readFixture(fixture.name));

            const actual = normalizeDesignXml(await toXml(page));
            assertNoCarriageReturn(actual, `toXML(${fixture.name})`);

            const expected = writeOrReadGolden(goldenPath("xml", `${fixture.name}.xml`), actual);
            expect(actual).toBe(expected);
        });

        test(`round-trip: ${fixture.name}`, async () => {
            await useDatatypes(page, SERIALIZER_DB);
            await loadFixture(page, readFixture(fixture.name));

            // fixture -> toXML -> fromXML -> toXML -> fromXML -> toXML
            const first = await toXml(page);
            await loadFixture(page, first);
            const second = await toXml(page);
            await loadFixture(page, second);
            const third = await toXml(page);

            // 保存した XML を読み直しても同じ XML に戻る（＝情報が落ちない・増えない）
            expect(second).toBe(first);
            expect(third).toBe(second);
        });
    }

    test("決定論: 同一モデルから toXML() を 2 回呼ぶと完全に一致する", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("house-defaults"));

        expect(await toXml(page)).toBe(await toXml(page));
    });

    test("非決定性の所在: Active URL コメントに location.href が入る（§4 で撤去する対象）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("minimal"));

        const raw = await toXml(page);
        const href = await page.evaluate(() => location.href);

        expect(hasActiveUrlComment(raw)).toBe(true);
        expect(raw).toContain(`<!-- Active URL: ${href} -->`);
        // golden はこの 1 行だけを正規化している。他に環境依存が無いことの確認。
        expect(normalizeDesignXml(raw)).toContain(`<!-- Active URL: ${ACTIVE_URL_PLACEHOLDER} -->`);
        expect(normalizeDesignXml(raw)).not.toContain(href);
    });

    /*
     * 旧 known-issue #7。段階4-4 で alignTables() が this.tables を破壊的ソートするのを
     * やめたので、ここで「直った後の挙動」を固定する（tests/known-issues/README.md の運用 3）。
     * 保存順の安定性そのものなので known-issues ではなく serializer の特性化に置く。
     */
    test("alignTables() はテーブル順を変えない（座標だけを動かす）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("relations"));

        const before = await page.evaluate(() =>
            (window.d!.tables as { getTitle(): string }[]).map((t) => t.getTitle())
        );
        const xmlBefore = await toXml(page);

        await page.evaluate(() =>
            (window.d! as unknown as { alignTables(): void }).alignTables()
        );

        const after = await page.evaluate(() =>
            (window.d!.tables as { getTitle(): string }[]).map((t) => t.getTitle())
        );
        const xmlAfter = await toXml(page);

        expect(before).toEqual([
            "employees",
            "projects",
            "teams",
            "employee_projects",
        ]);
        expect(after).toEqual(before);
        // 座標の再配置は仕様なので出力自体は変わってよい。変わってはいけないのは順序。
        expect(tableNamesOf(xmlAfter)).toEqual(tableNamesOf(xmlBefore));
    });

    test("型解決は型パレット依存（DB 横断 golden を持たない根拠）", async () => {
        const xml = readFixture("minimal");

        await useDatatypes(page, "postgresql");
        await loadFixture(page, xml);
        const pg = await toXml(page);

        await useDatatypes(page, "mysql");
        await loadFixture(page, xml);
        const my = await toXml(page);

        // 同じ入力・同じ serializer でも <datatypes> ブロックと型解決結果が変わる
        expect(pg).toContain('<datatypes db="postgresql">');
        expect(my).toContain('<datatypes db="mysql">');
        expect(pg).not.toBe(my);
    });
});
