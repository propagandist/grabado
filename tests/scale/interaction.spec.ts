import { test, expect } from "@playwright/test";
import { loadJson, openDesigner, useDatatypes } from "../browser/harness.ts";
import { ALIGN_COUNTS, syntheticDesign } from "../support/synthetic.ts";
import {
    installScaleProbe,
    readScaleProbe,
    resetScaleProbe,
    type ScaleCounts,
} from "../support/probe.ts";

/*
 * 読み込んだ後の 1 操作あたりの費用（#206）。
 *
 * ★★ **読み込みは N 回の操作の総和だが、こちらは 1 回。** 1 操作が O(N) なら、
 *   大きな設計では**触るたびに**待たされる —— 読み込みの遅さは 1 度きりだが、
 *   こちらは使っているあいだずっと効く。**どちらが効くかを分けて数える。**
 *
 * ★ ドラッグそのものは張らない（mousedown/move/up の合成は tests/browser 側の仕事で、
 *   ここが見るのは**費用の増え方**）。呼ぶのは Designer.sync() ―― テーブルを動かすたびに
 *   走る経路で、minimap と <svg> の寸法を決める。
 */

const STEPS = [10, 50, 100, 300] as const;

test.describe.configure({ timeout: 300_000 });

test("1 操作あたりの費用を測る", async ({ page }) => {
    await openDesigner(page);
    await useDatatypes(page, "postgresql");

    await loadJson(page, syntheticDesign(2));
    await page.evaluate(
        `(${installScaleProbe})(window, {
            table: window.d.tables[0],
            row: window.d.tables[0].rows[0],
            relation: window.d.relations[0],
        })`,
    );

    const lines = [
        "| N | sync() ms | sync() の offsetW+H | 型変更 ms | 型変更の rowUpdate | 整列 ms | 整列の offsetW |",
        "|---|---|---|---|---|---|---|",
    ];

    for (const n of STEPS) {
        await page.evaluate(() => window.d!.clearTables());
        await loadJson(page, syntheticDesign(n));

        /* (1) テーブルを動かすたびに走る経路 */
        await page.evaluate(`(${resetScaleProbe})(window)`);
        const t0 = Date.now();
        await page.evaluate(() => window.d!.sync());
        const syncMs = Date.now() - t0;
        const syncCounts = (await page.evaluate(
            `(${readScaleProbe})(window)`,
        )) as ScaleCounts;

        /* (2) 鎖の先頭の型を変える ―― FK の伝播が N-1 段ぶん走る、いちばん重い 1 操作 */
        await page.evaluate(`(${resetScaleProbe})(window)`);
        const t1 = Date.now();
        await page.evaluate(() => {
            const d = window.d!;
            d.tables[0]!.rows[0]!.update({ type: d.palette.indexOfId("bigint") });
        });
        const updateMs = Date.now() - t1;
        const updateCounts = (await page.evaluate(
            `(${readScaleProbe})(window)`,
        )) as ScaleCounts;

        /*
         * ★★ **伝播は N によらず 2 段で止まる。** 合成設計の FK は
         *   `t(i).parent_id -> t(i-1).id` なので、辺は `t0.id -> t1.parent_id` で終わる
         *   —— `t1.parent_id` を指すものが無い（tests/support/synthetic.ts の★★）。
         *
         *   **これ自体が情報**: FK の型伝播の費用は**設計の形（鎖の深さ）で決まり、
         *   テーブル数では決まらない**。読み込みや sync() が N に比例するのとは別の軸。
         */
        expect(updateCounts.rowUpdate, `N=${n} の伝播`).toBe(2);

        /*
         * (3) 整列（#297）。**回数は実行系によらない。**
         *
         * ★★ **ここが「2 実行系で一致する」を見る唯一の場所。** 折り返しの結果は
         *   `#area` の実寸で決まるので jsdom と実ブラウザで**座標は違う**が、
         *   **読み出しの回数は同じ式に乗る** —— 計算が純関数で、DOM を 1 度も読まないため。
         *   式の正本は tests/support/synthetic.ts の ALIGN_COUNTS（**2 か所に書かない**）。
         */
        await page.evaluate(`(${resetScaleProbe})(window)`);
        const t2 = Date.now();
        await page.evaluate(() => window.d!.alignTables());
        const alignMs = Date.now() - t2;
        const alignCounts = (await page.evaluate(
            `(${readScaleProbe})(window)`,
        )) as ScaleCounts;

        expect(alignCounts.offsetWidth, `N=${n} の整列 offsetWidth`).toBe(
            ALIGN_COUNTS.offsetWidth(n),
        );
        expect(alignCounts.offsetHeight, `N=${n} の整列 offsetHeight`).toBe(
            ALIGN_COUNTS.offsetHeight(n),
        );
        expect(alignCounts.tableRedrawWorked, `N=${n} の整列 tableRedrawWorked`).toBe(
            ALIGN_COUNTS.tableRedrawWorked(n),
        );

        lines.push(
            `| ${n} | ${syncMs} | ${syncCounts.offsetWidth + syncCounts.offsetHeight} |` +
                ` ${updateMs} | ${updateCounts.rowUpdate} |` +
                ` ${alignMs} | ${alignCounts.offsetWidth} |`,
        );
    }

    console.log("\n" + lines.join("\n") + "\n");
});
