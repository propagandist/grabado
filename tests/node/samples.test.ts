import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type NodeHarness } from "./harness.ts";
import { DB_PROFILES, REPO_ROOT } from "../support/fixtures.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";

/*
 * docs/samples/ に置いた**開いて使う設計**が、現行のパーサで読めて正準形であることを見る。
 *
 * ★★ **母集団は表ではなくディレクトリの実体**（readdirSync）。tests/node/fixture-set.test.ts が
 *   表を持つのは 8 × 7 の格子が固定だからで、こちらは**可変長のリスト** —— 表を持たせると
 *   保守だけが乗って利得が無い。**サンプルを足しても、ここに書き足すことは何も無い。**
 *
 * ★ assert は実質 1 つ（往復でバイト一致）だが、それだけで 4 つを同時に押さえる:
 *     - 現行のパーサで読める（formatVersion / db 照合 / 未知の型 id）
 *     - 正準形である（キー順・既定値の省略・2 スペース・末尾 LF・展開形）
 *     - 同名テーブルが無い（json-serializer.ts の assertUniqueTableNames）
 *     - size の正規化に乗る（length="0" の型に size を書いていない）
 *
 * ★ **赤くなる契機はパレットから型を撤去したとき**。対処は
 *   `npm run migrate:design -- docs/samples/*.json` で、これは既にリポジトリ内の設計ファイルに
 *   要る作業（js/io/json-parser.ts の KDoc）。**コストではなく、移行漏れを見る場所が 1 つ増える利得。**
 *
 * ★ **再現用サンプルが今も再現するかは追わない。** それは tests/known-issues/ の軸で、
 *   ここから追うと**不具合を直した日に docs のテストが赤くなる**。
 */

const SAMPLES_DIR = join(REPO_ROOT, "docs", "samples");

const sampleFiles = readdirSync(SAMPLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

describe("docs/samples の設計サンプル", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
    });

    it("1 本以上ある", () => {
        expect(sampleFiles.length).toBeGreaterThan(0);
    });

    for (const file of sampleFiles) {
        describe(file, () => {
            const text = readFileSync(join(SAMPLES_DIR, file), "utf8");

            it("db が実在するプロファイルを指している", () => {
                const db = (JSON.parse(text) as { db: unknown }).db;
                expect(DB_PROFILES).toContain(db);
            });

            it("CRLF が混ざっていない", () => {
                assertNoCarriageReturn(text, `docs/samples/${file}`);
            });

            it("読み込んで書き戻すと 1 バイトも変わらない", () => {
                const db = (JSON.parse(text) as { db: string }).db;
                h.useDatatypes(db);
                h.loadJson(text);
                expect(h.toJson()).toBe(text);
            });
        });
    }
});
