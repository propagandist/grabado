import { test, expect, type Page } from "@playwright/test";
import { readFixture, readKnownIssueFixture, SERIALIZER_DB } from "../support/fixtures.ts";
import { loadFixture, openDesigner, toXml, useDatatypes } from "./harness.ts";

/**
 * 型解決の特性化（HANDOVER §6 段階6-2）。
 *
 * serialize.spec.ts が toXML/fromXML の形式を、json.spec.ts が正本フォーマットを見るのに対し、
 * ここは**型パレットを引く経路**だけを見る。tests/known-issues/ にあった #3 の「直った後の挙動」の
 * 受け皿でもある（README の運用 3）。
 *
 * FK 自動生成（rowManager 経由）はこの段階まで**どのテストも通っていなかった**。fixture 読込は
 * 経路が違い、リレーションを対話的に張る操作が要るため。段階6-2 が触る面なのでここで塞ぐ。
 */
let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
});

test.afterAll(async () => {
    await page.close();
});

/** 先頭テーブルの先頭行を親にして FK を 1 本張り、生えた子行の型 id を返す */
function createFkChildId(page: Page, parentTypeId: string): Promise<string | null> {
    return page.evaluate((typeId) => {
        const d = window.d!;
        const parentIndex = d.palette.indexOfId(typeId);
        if (parentIndex === -1) {
            throw new Error(`型 ${typeId} が現在のパレットに無い`);
        }

        const t1 = d.tables[0]!;
        const r1 = t1.rows[0]!;
        r1.update({ type: parentIndex });

        /* rowManager.tableClick は「行を選んで creating 中に別テーブルを叩く」実経路 */
        const t2 = d.addTable("fk_probe_target", 500, 500);
        d.rowManager.select(r1);
        d.rowManager.creating = true;
        d.rowManager.tableClick({ target: t2, data: null });

        const child = t2.rows[t2.rows.length - 1]!;
        return d.palette.idAt(child.data.type);
    }, parentTypeId);
}

test.describe("型解決（段階6-2）", () => {
    test("BIGINT は Big Integer に解決される（known-issue #3 が直った後の挙動）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readKnownIssueFixture("bigint-drift"));

        const label = await page.evaluate(
            () => window.d!.tables[0]!.rows[0]!.getDataType().getAttribute("label"),
        );

        /*
         * db/postgresql/datatypes.xml は sql="BIGINT" を Big Integer と Real の 2 か所に持つ。
         * 段階6-2 で sql 完全一致を先勝ちにしたので、後ろの x_real ではなく bigint が勝つ。
         * fixture は tests/known-issues/ に置いたまま（正常系へ昇格させると DDL golden の
         * 母集団が動く。判断は tests/support/fixtures.ts）。
         */
        expect(label).toBe("Big Integer");
    });

    test("XML 往復で型がドリフトしない", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readKnownIssueFixture("bigint-drift"));

        const first = await toXml(page);
        await loadFixture(page, first);
        const second = await toXml(page);

        /* 6-2 以前は BIGINT -> Real(BIGINT) と 1 回化けてから収束していた */
        expect(first).toContain("<datatype>BIGINT</datatype>");
        expect(second).toBe(first);
    });

    test("FK 自動生成は fk 属性の id に従う", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("minimal"));

        /* db/postgresql/datatypes.xml: serial -> fk="integer" / bigserial -> fk="bigint" */
        expect(await createFkChildId(page, "serial")).toBe("integer");
        expect(await createFkChildId(page, "bigserial")).toBe("bigint");
        /* fk を持たない型は親と同じ型のまま */
        expect(await createFkChildId(page, "text")).toBe("text");
    });

    test("パレットを差し替えた後の FK 自動生成は新しいパレットに従う", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("minimal"));
        /* ここで旧実装は Designer.fkTypeFor を postgresql の内容で焼いていた */
        expect(await createFkChildId(page, "serial")).toBe("integer");

        await useDatatypes(page, "mysql");
        await loadFixture(page, readFixture("minimal"));

        /*
         * mysql は fk 属性を 1 つも持たないので、FK 子行は親と同じ型でなければならない。
         * 旧実装では postgresql の fkTypeFor[5]=2 が残り、BIGINT の FK が **SMALLINT** に
         * なっていた（実測は CUSTOMIZATIONS.md の段階6-2）。差し替えでキャッシュが
         * 捨てられないことが原因で、キャッシュごと廃止して塞いだ。
         */
        expect(await createFkChildId(page, "bigint")).toBe("bigint");
        expect(await createFkChildId(page, "int")).toBe("int");
    });
});
