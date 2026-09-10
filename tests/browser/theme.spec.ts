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

/*
 * 「OS に従う」（#235）。
 *
 * ★★ **ここでしか確かめられない。** jsdom には window.matchMedia が無いので
 *   （Designer.prefersDark の KDoc）、Node 側では prefersDark() が常に false になる。
 *   **OS の配色を実際に切り替えて見られるのは Playwright の emulateMedia だけ。**
 *
 * ★ 各テストが自分で cookie を消してから始める（page を共有しないので独立している）。
 */

const AUTO = "auto";

/**
 * 同じ context に**新しいページ**を開く（cookie は context が持つので引き継がれる）。
 *
 * ★★ **openDesigner を同じ page に 2 度呼ばない** —— あれは page.on("dialog") を張るので、
 *   2 度目に同じダイアログを 2 人が dismiss しようとして落ちる（2026-09-10 実測）。
 * ★★ **page.reload() も使わない** —— "load" 待ちがそのまま返らずタイムアウトする（同日実測）。
 *   **新しいページなら、利用者が「開き直す」のと同じ経路**をそのまま踏める。
 */
async function openSecondPage(
    page: import("@playwright/test").Page,
): Promise<import("@playwright/test").Page> {
    const second = await page.context().newPage();
    await openDesigner(second);
    return second;
}

async function styleUnder(
    page: import("@playwright/test").Page,
    scheme: "dark" | "light",
): Promise<{ stored: string; effective: string; theme: string }> {
    await page.emulateMedia({ colorScheme: scheme });
    return page.evaluate(() => {
        const d = window.d!;
        d.applyStyle();
        return {
            stored: d.storedStyle(),
            effective: d.getOption("style"),
            theme: document.documentElement.dataset["theme"] ?? "",
        };
    });
}

test("cookie が無ければ OS に従う（保存されている値は auto のまま）", async ({ page }) => {
    await page.context().clearCookies();
    await openDesigner(page);

    const dark = await styleUnder(page, "dark");
    expect(dark.stored).toBe(AUTO);
    expect(dark.effective).toBe("material-dark");
    expect(dark.theme).toBe("material-dark");

    const light = await styleUnder(page, "light");
    expect(light.stored).toBe(AUTO);
    expect(light.effective).toBe("material-inspired");
    expect(light.theme).toBe("material-inspired");
});

test("auto を保存しても OS に従い続ける（OK を押しても焼かれない）", async ({ page }) => {
    await page.context().clearCookies();
    await openDesigner(page);
    await page.evaluate(() => window.d!.setOption("style", "auto"));

    expect((await styleUnder(page, "dark")).effective).toBe("material-dark");
    expect((await styleUnder(page, "light")).effective).toBe("material-inspired");
});

test("具体のテーマを選ぶと OS を無視する（現行の挙動のまま）", async ({ page }) => {
    await page.context().clearCookies();
    await openDesigner(page);
    await page.evaluate(() => window.d!.setOption("style", "original"));

    for (const scheme of ["dark", "light"] as const) {
        const seen = await styleUnder(page, scheme);
        expect(seen.stored).toBe("original");
        expect(seen.effective).toBe("original");
        expect(seen.theme).toBe("original");
    }
});

test("★ 焼いたあとに auto へ戻せる（cookie を消さずに）", async ({ page }) => {
    await page.context().clearCookies();
    await openDesigner(page);
    await page.evaluate(() => {
        window.d!.setOption("snap", "20");
        window.d!.setOption("style", "material-dark");
    });

    /* 焼かれている状態 */
    expect((await styleUnder(page, "light")).effective).toBe("material-dark");

    await page.evaluate(() => window.d!.setOption("style", "auto"));

    /* 戻った */
    expect((await styleUnder(page, "light")).effective).toBe("material-inspired");
    expect((await styleUnder(page, "dark")).effective).toBe("material-dark");
    /* 他の設定は巻き添えにならない（cookie ごと消していない） */
    expect(await page.evaluate(() => window.d!.getOption("snap"))).toBe("20");
});

test("Options のセレクトに auto が並び、既定で選択済みになる", async ({ page }) => {
    await page.context().clearCookies();
    await openDesigner(page);

    const seen = await page.evaluate(() => {
        const sel = window.d!.options.dom.optionstyle;
        return {
            values: Array.from(sel.options).map((o) => o.value),
            labels: Array.from(sel.options).map((o) => o.innerHTML),
            selected: sel.value,
        };
    });

    /* auto が先頭で、実在の 3 テーマがその後ろ */
    expect(seen.values).toEqual([
        "auto",
        "material-inspired",
        "material-dark",
        "original",
    ]);
    /* ラベルは locale を通る（訳が無い locale では "auto" のまま出る） */
    expect(seen.labels[0]).toBe("Follow the OS");
    expect(seen.labels.slice(1)).toEqual([
        "material-inspired",
        "material-dark",
        "original",
    ]);
    /* cookie が無いので「OS に従う」が選択済み ―― これが「OK で焼かれない」の実体 */
    expect(seen.selected).toBe("auto");
});

test("★ Options の OK を実際に押して、焼いて・戻せる", async ({ page }) => {
    /*
     * ★★ **build() を 2 度呼ばない。** あれは要素を id で引いたあと container を
     *   DOM から外すので、2 度目は getElementById が null を返す。
     *   **セレクトが設定を映すのはページを開いた時点** —— だから焼いたあとは
     *   開き直して確かめる（利用者がやることと同じ）。
     */
    await page.context().clearCookies();
    await openDesigner(page);
    await page.emulateMedia({ colorScheme: "light" });

    /* 1. UI から material-dark を選んで OK を押す */
    const baked = await page.evaluate(() => {
        const d = window.d!;
        d.setOption("snap", "20");
        /*
         * ★★ **利用者と同じ順序: 開く → 変える → OK。** click() を通さずに save() だけ
         *   呼ぶと、**まだ埋まっていない入力欄の値がそのまま保存される**（snap が ""）——
         *   フィールドに現在の設定を書き戻すのは click() の仕事（js/options.ts）。
         */
        d.options.click();
        d.options.dom.optionstyle.value = "material-dark";
        d.options.save();
        return {
            stored: d.storedStyle(),
            theme: document.documentElement.dataset["theme"] ?? "",
        };
    });
    expect(baked.stored).toBe("material-dark");
    /* OS はライトなのにダーク ―― 焼かれている */
    expect(baked.theme).toBe("material-dark");

    /* 2. 開き直すと、セレクトが焼かれた値を映している */
    const second = await openSecondPage(page);
    try {
        await second.emulateMedia({ colorScheme: "light" });
        expect(
            await second.evaluate(() => window.d!.options.dom.optionstyle.value)
        ).toBe("material-dark");

        /* 3. UI から auto を選んで OK を押すと戻る */
        const back = await second.evaluate(() => {
            const d = window.d!;
            d.options.click();
            d.options.dom.optionstyle.value = "auto";
            d.options.save();
            return {
                stored: d.storedStyle(),
                theme: document.documentElement.dataset["theme"] ?? "",
                snap: d.getOption("snap"),
            };
        });
        expect(back.stored).toBe("auto");
        expect(back.theme).toBe("material-inspired");
        /* 他の設定は巻き添えにならない（cookie ごと消していない） */
        expect(back.snap).toBe("20");

        /* 4. 戻ったあとは OS に追従する */
        expect((await styleUnder(second, "dark")).effective).toBe("material-dark");
    } finally {
        await second.close();
    }
});
