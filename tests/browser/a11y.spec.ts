import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openDesigner, loadFixture } from "./harness.ts";

/*
 * 静的に確かめられる a11y（#175）。
 *
 * ★ ここが見るのは**属性が実際に出ているか**だけ。**読み上げの質は目視**
 *   （docs/TESTING.md の「見た目とキーボードの手動確認」）。
 *
 * ★ #bar に role="toolbar" は付けない —— role は本来「矢印キーで移動する
 *   1 タブストップ」を含意し、**roving tabindex を実装しないなら半端な role を
 *   付けるほうが悪い**。ツールバーの a11y は #171 の :focus-visible が担う。
 * ★ aria-disabled も出さない —— **ネイティブの disabled は既にアクセシビリティ
 *   ツリーに現れる**ので二重管理になる。
 */

const FIXTURE = readFileSync("tests/fixtures/postgresql/house-defaults.xml", "utf8");

test("<html lang> が locale に追従する（cookie で決まるので静的属性では書けない）", async ({
    browser,
}) => {
    for (const [locale, expected] of [
        ["en", "en"],
        ["ja", "ja"],
        ["pt_BR", "pt-BR"],
    ] as const) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        await ctx.addCookies([
            {
                name: "wwwsqldesigner",
                value: encodeURIComponent(JSON.stringify({ locale })),
                url: "http://127.0.0.1:4173",
            },
        ]);
        const page = await ctx.newPage();
        await openDesigner(page);
        /* ★ pt_BR → pt-BR。XML のファイル名と BCP 47 で区切りが違う */
        expect(await page.evaluate(() => document.documentElement.lang), locale).toBe(expected);
        await ctx.close();
    }
});

test("カードの <table> が行列として読み上げられない", async ({ page }) => {
    /*
     * ★ **document から見えるのはカードの分だけ** —— #opts / #io / #keys / #table の
     *   4 枚はコンストラクタで DOM から外れている（#167 の調査）。
     *   **静的な 4 枚は tests/node/a11y.test.ts が HTML のソースで見る。**
     */
    await openDesigner(page);
    await loadFixture(page, FIXTURE);

    const roles = await page.evaluate(() => {
        const all = [...document.querySelectorAll("#area table")];
        return {
            total: all.length,
            presentation: all.filter((t) => t.getAttribute("role") === "presentation").length,
        };
    });
    expect(roles.total, "カードが 1 枚も無い").toBeGreaterThan(0);
    expect(roles.presentation, "role=presentation でない <table> がある").toBe(roles.total);
});

test("モーダルに名前がある（<dialog> は role と aria-modal を暗黙に持つ）", async ({ page }) => {
    await openDesigner(page);
    const named = await page.evaluate(() => {
        const dlg = document.getElementById("window")!;
        const ref = dlg.getAttribute("aria-labelledby");
        const title = ref ? document.getElementById(ref) : null;
        return { ref, hasTitle: !!title, tag: dlg.tagName.toLowerCase() };
    });
    expect(named).toEqual({ ref: "windowtitle", hasTitle: true, tag: "dialog" });
});
