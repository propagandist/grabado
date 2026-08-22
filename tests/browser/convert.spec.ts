import { test, expect, type Page } from "@playwright/test";
import {
    CONVERT_SOURCE,
    DB_PROFILES,
    convertGoldenCases,
    readFixture,
} from "../support/fixtures.ts";
import { goldenPath, writeOrReadGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import { generateDdl, loadFixture, openDesigner, useDatatypes } from "./harness.ts";

/**
 * プロファイル変換 DDL の golden（HANDOVER §6 段階6-10a）。**採れるのはここだけ**
 * （DDL / ORM golden と同じ立場）。
 *
 * 母集団の切り方は tests/support/fixtures.ts の convertGoldenCases —— postgresql の
 * 設計を他 7 プロファイル向けに出した 14 本。**設計そのものは 1 バイトも変わらない**
 * （変換は出力の直前にモデルの写しを作るだけ）ことも、ここで golden と別に見る。
 */
let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
});

test.afterAll(async () => {
    await page.close();
});

/**
 * 出力先のパレットを読み込んでから変換 DDL を採る。
 *
 * **loadPalette と toDdl の 2 段**なのは、パレットの取得だけが非同期で生成は同期だから
 * （js/wwwsqldesigner.ts の outputPalettes に理由がある）。設計側のパレットが
 * 食い違っていないことは harness の generateDdl と同じ形で page 側で検算する。
 */
function generateConverted(page: Page, from: string, to: string): Promise<string> {
    return page.evaluate(
        async (args) => {
            const actual = window.d!.palette.db();
            if (actual !== args.from) {
                throw new Error(`設計のパレットが ${actual}（${args.from} を期待）`);
            }
            await new Promise<void>((resolve, reject) => {
                window.d!.loadPalette(args.to, (ok) => {
                    if (ok) {
                        resolve();
                    } else {
                        reject(new Error(`出力先のパレットが読めない: ${args.to}`));
                    }
                });
            });
            return window.d!.toDdl(args.to);
        },
        { from: from, to: to },
    );
}

test.describe("プロファイル変換 golden", () => {
    for (const one of convertGoldenCases(DB_PROFILES)) {
        test(`${CONVERT_SOURCE} -> ${one.to} / ${one.fixture}`, async () => {
            await useDatatypes(page, CONVERT_SOURCE);
            await loadFixture(page, readFixture(CONVERT_SOURCE, one.fixture));

            const actual = await generateConverted(page, CONVERT_SOURCE, one.to);
            assertNoCarriageReturn(actual, `convert(${CONVERT_SOURCE}->${one.to})`);

            const expected = writeOrReadGolden(
                goldenPath("convert", `${CONVERT_SOURCE}-${one.to}`, `${one.fixture}.sql`),
                actual,
            );
            expect(actual).toBe(expected);
        });
    }

    test("決定論: 同じ設計から 2 回採ると完全に一致する", async () => {
        await useDatatypes(page, CONVERT_SOURCE);
        await loadFixture(page, readFixture(CONVERT_SOURCE, "house-defaults"));

        const first = await generateConverted(page, CONVERT_SOURCE, "mysql");
        const second = await generateConverted(page, CONVERT_SOURCE, "mysql");
        expect(second).toBe(first);
    });

    test("**設計は 1 バイトも変わらない**（変換は出力の直前だけ）", async () => {
        /*
         * これが「出力時変換のみ」という 6-10 のスコープの実体。設計 JSON の db も型 id も
         * 動かないので、保存されるファイルは変換前と同じ —— js/io/json-parser.ts の
         * db 照合（4-2b で型キーの安全性の根拠になった）に穴を開けずに済む。
         */
        await useDatatypes(page, CONVERT_SOURCE);
        await loadFixture(page, readFixture(CONVERT_SOURCE, "house-defaults"));

        const before = await page.evaluate(() => window.d!.toJson());
        await generateConverted(page, CONVERT_SOURCE, "sqlite");
        const after = await page.evaluate(() => window.d!.toJson());

        expect(after).toBe(before);
        expect(after).toContain('"db": "postgresql"');
    });

    test("変換せずに出した DDL は従来と同一（引数なしの toDdl）", async () => {
        await useDatatypes(page, CONVERT_SOURCE);
        await loadFixture(page, readFixture(CONVERT_SOURCE, "house-defaults"));

        const plain = await generateDdl(page, CONVERT_SOURCE);
        const explicit = await generateConverted(page, CONVERT_SOURCE, CONVERT_SOURCE);
        expect(explicit).toBe(plain);
        /* 同じ db なので変換の説明は 1 バイトも足さない */
        expect(plain).not.toContain("grabado:");
    });

    test("読み込んでいないパレットを指定したら例外（黙って設計の db で出さない）", async () => {
        await useDatatypes(page, CONVERT_SOURCE);
        await loadFixture(page, readFixture(CONVERT_SOURCE, "minimal"));

        const message = await page.evaluate(() => {
            try {
                window.d!.toDdl("mariadb-not-loaded");
                return "例外が出なかった";
            } catch (e) {
                return (e as Error).message;
            }
        });
        expect(message).toContain("出力先の型パレットが読み込まれていない");
    });
});
