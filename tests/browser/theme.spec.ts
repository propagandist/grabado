import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openDesigner } from "./harness.ts";

const FIXTURE = readFileSync("tests/fixtures/postgresql/house-defaults.xml", "utf8");

/*
 * テーマ 3 本が実際に切り替わることを固定する（#172）。
 *
 * ★★ ここが見るのは **CSS が本当に当たっているか**で、CSS の中身ではない ——
 *   ファイル名の打ち間違い（404）も、<link> の rel / title の書き損じも、
 *   **症状は「色が変わらない」だけ**で、既存のテストは 1 本も赤くならない
 *   （tests/support/state.ts はレイアウト由来の値も色も採らない）。
 *
 * ★ applyStyle() は rel に "style" を含み title を持つ <link> だけを disabled で切る。
 *   title を持たない base.css / icons.css / print.css は常に効く（#169 / #170）。
 */

const THEMES = ["material-inspired", "material-dark", "original"] as const;

test("3 テーマそれぞれで、有効な titled sheet がちょうど 1 本になる", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await openDesigner(page);

    const seen: Record<string, { enabled: string[]; theme: string; bg: string }> = {};
    for (const theme of THEMES) {
        await page.evaluate((t) => {
            const d = window.d!;
            d.setOption("style", t);
            d.applyStyle();
        }, theme);
        /*
         * ★★ **applyStyle() は同期だが、その結果が computed style に出るのは非同期**
         *   （2026-09-06 に踏んだ）。applyStyle() は **全 titled sheet を一度 disabled にして
         *   から目的の 1 本を戻す**ので、Chromium はその sheet を捨てて**再パースする** ——
         *   直後に getComputedStyle を読むと、**まだ styleSheets に戻っていない**。
         *   実アプリでは起動時の 1 回で、body が visibility: hidden のあいだに済む。
         */
        await page.waitForFunction(
            (t) =>
                [...document.styleSheets].some(
                    (s) => s.title === t && !s.disabled,
                ),
            theme,
        );
        seen[theme] = await page.evaluate(() => ({
            enabled: [...document.querySelectorAll<HTMLLinkElement>("link[title]")]
                .filter((l) => !l.disabled)
                .map((l) => l.title),
            theme: document.documentElement.dataset["theme"] ?? "",
            bg: getComputedStyle(document.body).backgroundColor,
        }));
    }

    for (const theme of THEMES) {
        expect(seen[theme]!.enabled, `${theme}: 有効な titled sheet`).toEqual([theme]);
        expect(seen[theme]!.theme, `${theme}: data-theme`).toBe(theme);
    }

    /* ★ 色が本当に変わっていること。ここが「CSS が届いた」の唯一の証拠 */
    expect(seen["material-inspired"]!.bg).not.toBe(seen["material-dark"]!.bg);
    expect(errors).toEqual([]);
});

test("ダークではリレーション線の色が変わる（暗い盤面に暗い線を引かない）", async ({ page }) => {
    /*
     * ★ relation.ts の switch が default に落ちると CONFIG.RELATION_COLORS
     *   （#000 / #800 / #080 …）になり、**暗い盤面に暗い線**で見えなくなる。
     *   **色は Relation の生成時に決まる**ので、テーマを変えてから設計を読む。
     *   tests/support/state.ts は relation の色を意図的に採っていないので、
     *   **この経路を見ているのはここだけ**。
     */
    await openDesigner(page);
    const strokes: Record<string, string[]> = {};
    for (const theme of ["material-inspired", "material-dark"]) {
        await page.evaluate(
            ([t, xml]) => {
                const d = window.d!;
                d.setOption("style", t!);
                d.applyStyle();
                const originalAlert = window.alert;
                window.alert = () => {};
                try {
                    d.io.fromXMLText(xml!);
                } finally {
                    window.alert = originalAlert;
                }
            },
            [theme, FIXTURE],
        );
        await page.waitForTimeout(200);
        strokes[theme] = await page.evaluate(() =>
            [...document.querySelectorAll<SVGPathElement>("#area svg path")]
                .map((p) => p.getAttribute("stroke") ?? "")
                .filter(Boolean),
        );
    }

    expect(strokes["material-inspired"]!.length, "ライトで線が引かれていない").toBeGreaterThan(0);
    expect(strokes["material-dark"]!.length, "ダークで線が引かれていない").toBeGreaterThan(0);
    expect(strokes["material-dark"], "ダークの線がライトと同じ色になっている").not.toEqual(
        strokes["material-inspired"],
    );
    /* 既定（CONFIG.RELATION_COLORS）に落ちていないこと —— #000 は暗い盤面で見えない */
    expect(strokes["material-dark"]).not.toContain("#000");
});
