import { test, expect, type CDPSession, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadJson, openDesigner, useDatatypes } from "../browser/harness.ts";
import { SCALE_COUNTS, syntheticDesign } from "../support/synthetic.ts";
import {
    installScaleProbe,
    readScaleProbe,
    resetScaleProbe,
    type ScaleCounts,
} from "../support/probe.ts";
import { REPO_ROOT } from "../support/fixtures.ts";

/*
 * 規模の天井を実ブラウザで測る（#206）。
 *
 * ★★ **本命は「読み出し回数と LayoutCount の比」。** jsdom は offsetWidth の**読み出し回数**は
 *   本物と同じだけ数えられるが、**その読み出しが実際にレイアウトを走らせたか**は分からない
 *   （jsdom はレイアウトしない）。Chromium の LayoutCount と突き合わせて初めて
 *   「読み出しのうち何回が本当に高くついたか」が出る。
 *
 * ★★ **LayoutCount を閾値にしない。** Chromium の版で動く。**記録はする。**
 *   実時間も同じ —— 共有ランナーが不安定で、計装自体が歪める。
 *   **数として守るのは tests/node/scale.test.ts のカウンタ**（あちらが CI に乗る）。
 *
 * ★ **生成物はコミットしない。** SCALE_DUMP=1 のときだけ test-results/（gitignore 済み）へ
 *   落とす。既定で 1 バイトも書かない —— CI の最終ステップが git diff --exit-code を回す。
 */

/** 測る段。100 はサーバが宣言している AI レビューの上限、300 はその 3 倍 */
const STEPS = [10, 50, 100, 300] as const;

/* N=300 の読み込みが実ブラウザでどれだけ掛かるかは未知。遅ければそれ自体が結論なので、
   タイムアウトで隠さずに済むよう明示して広げる（#206 の申し送り） */
test.describe.configure({ timeout: 300_000 });

interface Row {
    n: number;
    bytes: number;
    ms: number;
    dom: number;
    layoutCount: number;
    recalcStyleCount: number;
    counts: ScaleCounts;
}

async function metrics(cdp: CDPSession): Promise<Record<string, number>> {
    const res = (await cdp.send("Performance.getMetrics")) as {
        metrics: { name: string; value: number }[];
    };
    const out: Record<string, number> = {};
    for (const m of res.metrics) {
        out[m.name] = m.value;
    }
    return out;
}

test("10 / 50 / 100 / 300 テーブルの費用を測る", async ({ page, context }) => {
    await openDesigner(page);
    await useDatatypes(page, "postgresql");

    /* 計装は生きている実体からプロトタイプを辿る。2 テーブルなら table / row / relation が揃う */
    await loadJson(page, syntheticDesign(2));
    await page.evaluate(
        `(${installScaleProbe})(window, {
            table: window.d.tables[0],
            row: window.d.tables[0].rows[0],
            relation: window.d.relations[0],
        })`,
    );

    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");

    const rows: Row[] = [];
    for (const n of STEPS) {
        const json = syntheticDesign(n);
        await page.evaluate(() => window.d!.clearTables());
        await page.evaluate(`(${resetScaleProbe})(window)`);

        const before = await metrics(cdp);
        const t0 = Date.now();
        await loadJson(page, json);
        const ms = Date.now() - t0;
        const after = await metrics(cdp);

        const counts = (await page.evaluate(
            `(${readScaleProbe})(window)`,
        )) as ScaleCounts;
        const dom = await page.evaluate(() => document.querySelectorAll("*").length);

        rows.push({
            n,
            bytes: json.length,
            ms,
            dom,
            layoutCount: (after["LayoutCount"] ?? 0) - (before["LayoutCount"] ?? 0),
            recalcStyleCount:
                (after["RecalcStyleCount"] ?? 0) - (before["RecalcStyleCount"] ?? 0),
            counts,
        });

        if (process.env["SCALE_DUMP"]) {
            const dir = join(REPO_ROOT, "test-results", "scale");
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, `synthetic-${n}.json`), json, "utf8");
        }
    }

    /* 表として出す。判定はしない ―― 数の正本は CUSTOMIZATIONS.md（測った日と機械つき） */
    const lines = [
        "| N | bytes | ms | DOM | offsetW+H | Layout | Recalc | Layout/読み出し |",
        "|---|---|---|---|---|---|---|---|",
    ];
    for (const r of rows) {
        const reads = r.counts.offsetWidth + r.counts.offsetHeight;
        const ratio = reads === 0 ? 0 : r.layoutCount / reads;
        lines.push(
            `| ${r.n} | ${r.bytes} | ${r.ms} | ${r.dom} | ${reads} |` +
                ` ${r.layoutCount} | ${r.recalcStyleCount} | ${ratio.toFixed(4)} |`,
        );
    }
    console.log("\n" + lines.join("\n") + "\n");

    /*
     * ★ 判定するのは 2 つだけ。**数そのものは判定しない**（実時間も LayoutCount も、
     *   機械とブラウザの版で動く）。
     */
    for (const r of rows) {
        /* 1. 読み出し回数が jsdom 側と一致する ―― 2 実行系で同じ経路を通っている証拠 */
        /* 式の正本は tests/support/synthetic.ts（#207 で 2 か所にあった重複を潰した） */
        expect(r.counts.offsetWidth, `N=${r.n} の offsetWidth`).toBe(
            SCALE_COUNTS.offsetWidth(r.n),
        );
        /* 2. 実際にレイアウトが走った回数が、読み出し回数を超えない */
        expect(r.layoutCount, `N=${r.n} の LayoutCount`).toBeLessThanOrEqual(
            r.counts.offsetWidth + r.counts.offsetHeight,
        );
    }
});
