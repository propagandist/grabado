import { test, expect } from "@playwright/test";
import { generateDdl, loadJson, openDesigner, toJson, useDatatypes } from "../browser/harness.ts";
import { syntheticDesign } from "../support/synthetic.ts";

/*
 * 書き出しの費用（#206）。
 *
 * ★★ **読み込みと違って DOM を触らない。** serializer も DDL 生成も
 *   ライブツリーを歩いて文字列を組むだけなので、**強制同期レイアウトが 1 回も起きない**。
 *   読み込み側（load.spec.ts）と桁が違うことを見るのがここの仕事。
 *
 * ★ **300 テーブルの設計 JSON のバイト数は #215 の判断の入力**（save にサイズ上限を置くなら、
 *   その値はここの実測から出す）。
 */

const STEPS = [10, 50, 100, 300] as const;

test.describe.configure({ timeout: 300_000 });

test("書き出し（JSON / DDL）の費用を測る", async ({ page }) => {
    await openDesigner(page);
    await useDatatypes(page, "postgresql");

    const lines = [
        "| N | 設計 JSON | toJson ms | DDL bytes | toDdl ms |",
        "|---|---|---|---|---|",
    ];

    for (const n of STEPS) {
        const json = syntheticDesign(n);
        await page.evaluate(() => window.d!.clearTables());
        await loadJson(page, json);

        const t0 = Date.now();
        const written = await toJson(page);
        const jsonMs = Date.now() - t0;

        const t1 = Date.now();
        const ddl = await generateDdl(page, "postgresql");
        const ddlMs = Date.now() - t1;

        /* 往復でバイト一致 ―― 合成設計が正準形であることの、実ブラウザ側の確認 */
        expect(written, `N=${n} の往復`).toBe(json);

        lines.push(
            `| ${n} | ${json.length} | ${jsonMs} | ${ddl.length} | ${ddlMs} |`,
        );
    }

    console.log("\n" + lines.join("\n") + "\n");
});
