import { test, expect, type Page } from "@playwright/test";
import { ORM_EXTENSIONS, ORM_TARGETS } from "../../frontend/js/io/orm/generate.ts";
import { DB_PROFILES, ormGoldenCases, readFixture } from "../support/fixtures.ts";
import { goldenPath, writeOrReadGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import { loadFixture, openDesigner, useDatatypes } from "./harness.ts";

/**
 * ORM 出力の golden（HANDOVER §6 段階6-9d）。**採れるのはここだけ**（DDL golden と同じ立場）。
 *
 * 母集団の切り方は tests/support/fixtures.ts の ormGoldenCases —— ORM 出力は
 * 「型の写像」と「構造の組み立て」に分かれ、**構造の側はプロファイルに依らない**ので、
 * 8 × types-matrix ＋ postgresql × 残り 6 本の 14 件で足りる。
 */
let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
});

test.afterAll(async () => {
    await page.close();
});

/** ORM 出力を採る。db が食い違っていないことを page 側で検算する（generateDdl と同じ形） */
function generateOrm(page: Page, db: string, target: string): Promise<string> {
    return page.evaluate(
        (args) => {
            const actual = window.d!.palette.db();
            if (actual !== args.db) {
                throw new Error(`パレットが ${actual}（${args.db} を期待）`);
            }
            return window.d!.toOrm(args.target);
        },
        { db: db, target: target },
    );
}

test.describe("ORM golden", () => {
    for (const target of ORM_TARGETS) {
        for (const one of ormGoldenCases(DB_PROFILES)) {
            test(`${target}: ${one.db} / ${one.fixture}`, async () => {
                await useDatatypes(page, one.db);
                await loadFixture(page, readFixture(one.db, one.fixture));

                const actual = await generateOrm(page, one.db, target);
                assertNoCarriageReturn(actual, `orm(${target}/${one.db}/${one.fixture})`);

                const expected = writeOrReadGolden(
                    goldenPath(
                        "orm",
                        target,
                        one.db,
                        `${one.fixture}.${ORM_EXTENSIONS[target]}`,
                    ),
                    actual,
                );
                expect(actual).toBe(expected);
            });
        }
    }

    test("決定論: 同じ設計から 2 回採ると完全に一致する", async () => {
        await useDatatypes(page, "postgresql");
        await loadFixture(page, readFixture("postgresql", "house-defaults"));

        const first = await generateOrm(page, "postgresql", "jpa");
        const second = await generateOrm(page, "postgresql", "jpa");
        expect(second).toBe(first);
    });

    test("知らないターゲットは例外（黙って空を返さない）", async () => {
        const message = await page.evaluate(() => {
            try {
                window.d!.toOrm("hibernate3");
                return "例外が出なかった";
            } catch (e) {
                return (e as Error).message;
            }
        });
        expect(message).toContain("対応していない ORM ターゲット: hibernate3");
    });

    test("同じ設計から DDL と ORM の両方が出る（db を切り替えずに）", async () => {
        /*
         * **これが「ORM を db プロファイルにしない」判断の実体**（段階6-9a の決めたこと 1）。
         * db/jpa/ を作る形だと設計 JSON の db が "jpa" になり、この 2 つは両立しない。
         */
        await useDatatypes(page, "postgresql");
        await loadFixture(page, readFixture("postgresql", "minimal"));

        const both = await page.evaluate(() => ({
            ddl: window.d!.toDdl(),
            orm: window.d!.toOrm("jpa"),
            db: window.d!.palette.db(),
        }));

        expect(both.db).toBe("postgresql");
        expect(both.ddl).toContain("CREATE TABLE things");
        expect(both.orm).toContain("@Table(name = \"things\")");
    });
});
