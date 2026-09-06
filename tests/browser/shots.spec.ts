import { test } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { openDesigner, loadFixture } from "./harness.ts";

/*
 * PR に貼るためのスクリーンショットを撮る（#175）。**`npm run shots` で回す。**
 *
 * ★★ **baseline を持たせない。** 比較しないので「壊れやすいテスト」にならず、
 *   レビューが実質的になる。**visual regression（baseline 比較）は入れない** ——
 *   1〜2 本で押さえられるのは代表的な 1 画面で、**ドラッグ中の中間状態は押さえられない**。
 *   #167 の「網を足したから作り直してよいと読むと、網の外を作り直すことになる」を引く。
 *   加えて **baseline はフォントのレンダリング差で環境ごとに落ちる**。
 *
 * ★ 既定の実行には入れない —— `playwright.config.ts` の characterization は
 *   `tests/browser` を全部拾うので、**grep で名前を指定して回す**（package.json の shots）。
 */

const FIXTURE = readFileSync("tests/fixtures/postgresql/house-defaults.xml", "utf8");
const DIR = process.env["SHOT_DIR"] ?? "shots";
const THEMES = ["material-inspired", "material-dark", "original"] as const;

test("PR 用のスクリーンショットを撮る（比較しない）", async ({ page }) => {
    mkdirSync(DIR, { recursive: true });
    await openDesigner(page);
    await loadFixture(page, FIXTURE);

    for (const theme of THEMES) {
        await page.evaluate((t) => {
            window.d!.setOption("style", t);
            window.d!.applyStyle();
        }, theme);
        /* applyStyle() は sheet を捨てて再パースするので、戻るまで待つ（#172） */
        await page.waitForFunction(
            (t) => [...document.styleSheets].some((s) => s.title === t && !s.disabled),
            theme,
        );
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${DIR}/${theme}-canvas.png` });

        await page.click("#saveload");
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${DIR}/${theme}-io.png` });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);

        await page.evaluate(() => void window.d!.dialogs.prompt("名前", "orders"));
        await page.waitForFunction(
            () => (document.getElementById("prompt") as HTMLDialogElement)?.open,
        );
        await page.screenshot({ path: `${DIR}/${theme}-prompt.png` });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
    }
    console.log(`${THEMES.length * 3} 枚を ${DIR}/ に置いた`);
});
