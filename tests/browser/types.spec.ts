import { test, expect, type Page } from "@playwright/test";
import { readFixture, readKnownIssueFixture, SERIALIZER_DB } from "../support/fixtures.ts";
import { loadFixture, openDesigner, toXml, useDatatypes } from "./harness.ts";

/**
 * 型解決の特性化（HANDOVER §6 段階6-2 / 6-3）。
 *
 * serialize.spec.ts が toXML/fromXML の形式を、json.spec.ts が正本フォーマットを見るのに対し、
 * ここは**型パレットを引く経路**だけを見る。tests/known-issues/ にあった #3（6-2）と
 * #4（6-3・PG 分）の「直った後の挙動」の受け皿でもある（README の運用 3）。
 *
 * FK 自動生成（rowManager 経由）は 6-2 まで**どのテストも通っていなかった**。fixture 読込は
 * 経路が違い、リレーションを対話的に張る操作が要るため。段階6-2 が触る面なのでここで塞いだ。
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

test.describe("型解決（段階6-2 / 6-3）", () => {
    test("BIGINT は Big Integer に解決される（known-issue #3 が直った後の挙動）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readKnownIssueFixture("bigint-drift"));

        const id = await page.evaluate(
            () => window.d!.palette.idAt(window.d!.tables[0]!.rows[0]!.data.type),
        );

        /*
         * 6-2 まで db/postgresql/datatypes.xml は sql="BIGINT" を bigint と x_real の 2 か所に
         * 持ち、後勝ちで Real に化けていた。6-2 が sql 完全一致を先勝ちにして直し、
         * **6-3 が x_real の entry ごと撤去した**ので、いまは重複そのものが無い
         * （palette-id.test.ts の「sql がパレット内で重複しない」が再発を止める）。
         *
         * label ではなく id で見るのは 6-3 から —— label は §6 が自由に動かしてよい表示名で、
         * ファイルとの契約は id だけ（docs/FORMAT.md の規則3）。
         * fixture は tests/known-issues/ に置いたまま（正常系へ昇格させると DDL golden の
         * 母集団が動く。判断は tests/support/fixtures.ts）。
         */
        expect(id).toBe("bigint");
    });

    test("UUID が uuid に解決される（known-issue #4 が直った後の挙動・PG）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("house-defaults"));

        /*
         * 6-3 まで PG パレットに uuid が無く、house 既定の PK（uuidv7）が黙って先頭型の
         * INTEGER に落ちていた —— #4 の実害そのもの。golden にも
         * `id INTEGER NOT NULL DEFAULT uuidv7()` として焼かれていた。
         */
        const ids = await page.evaluate(() =>
            window.d!.tables[0]!.rows.map((r) => window.d!.palette.idAt(r.data.type)),
        );

        expect(ids[0]).toBe("uuid");
        /* 監査列は timestamptz（sql は TIMESTAMPTZ だが aka で標準名も受ける） */
        expect(ids[ids.length - 1]).toBe("timestamp_with_time_zone");
    });

    test("strict なパレットでは未知の型が例外になる（#4 の再発防止）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("minimal"));

        /*
         * 黙って先頭型に落ちないこと。ここが緑である限り、パレットから型を落としたときに
         * 「設計が別の型で開く」事故は起きない（設計 JSON 側は 4-2b から同じ立場）。
         * 落ちても**今開いている設計は変わらない**ことを同時に見る。
         */
        const before = await toXml(page);
        const result = await page.evaluate(() => {
            const xml =
                `<sql><table x="0" y="0" name="t">` +
                `<row name="c" null="1" autoincrement="0"><datatype>MEDIUMTEXT</datatype></row>` +
                `</table></sql>`;
            try {
                window.d!.fromXML(new DOMParser().parseFromString(xml, "text/xml").documentElement);
                return "例外が出なかった";
            } catch (e) {
                return (e as Error).message;
            }
        });

        expect(result).toContain('型 "MEDIUMTEXT" が現在の型パレット（db=postgresql）に無い');
        expect(await toXml(page)).toBe(before);
    });

    test("未現代化のプロファイルでは従来どおり先頭型に落ちる（#4 は 6-8 まで残る）", async () => {
        await useDatatypes(page, "mysql");
        await loadFixture(page, readFixture("minimal"));

        /*
         * strict 化は現代化済みプロファイルに限る（6-0 の決めたこと 2）。横断で例外にすると
         * PG 用に書かれた fixture が読めず、どのプロファイルの DDL golden も採れなくなる。
         */
        const id = await page.evaluate(() => {
            const xml =
                `<sql><table x="0" y="0" name="t">` +
                `<row name="c" null="1" autoincrement="0"><datatype>BYTEA</datatype></row>` +
                `</table></sql>`;
            window.d!.fromXML(new DOMParser().parseFromString(xml, "text/xml").documentElement);
            return window.d!.palette.idAt(window.d!.tables[0]!.rows[0]!.data.type);
        });

        /* mysql パレットの先頭型 */
        expect(id).toBe("integer");
    });

    test("型セレクタが新しいパレットの 24 型を出す（golden が張らない UI の面）", async () => {
        /*
         * Row.buildTypeSelect は **パレットを読む唯一の UI 面**で、golden には 1 ビットも
         * 写らない（golden はすべて toXML / toJson 経由で採るため）。6-3 は label を動かし
         * 型を 5 本減らしたので、ここが動いたことに気づける経路を 1 本だけ置く。
         * マウス操作の経路そのものは今も誰も張っていない（docs/TESTING.md）。
         */
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("minimal"));

        const menu = await page.evaluate(() => {
            const row = window.d!.tables[0]!.rows[0]!;
            row.expand();
            const select = row.dom.type;
            return {
                options: select.options.length,
                groups: select.getElementsByTagName("optgroup").length,
                labels: [...select.options].map((o) => o.textContent),
            };
        });

        expect(menu.options).toBe(24);
        expect(menu.groups).toBe(4);
        /* 6-3 で足した 2 型 */
        expect(menu.labels).toContain("UUID");
        expect(menu.labels).toContain("Big Integer (identity)");
        /* 撤去した型はユーザーが選べない（HANDOVER §6.1「パレットから外す」の実体） */
        expect(menu.labels).not.toContain("Serial");
        expect(menu.labels).not.toContain("Char");
        expect(menu.labels).not.toContain("JSON");
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

        /*
         * db/postgresql/datatypes.xml: bigint_identity -> fk="bigint"。
         * 6-3 で serial（fk="integer"）と bigserial（fk="bigint"）が
         * bigint_identity 1 本にまとまった —— identity 列を参照する FK は BIGINT でなければ
         * ならないので、これが唯一の fk になる。
         */
        expect(await createFkChildId(page, "bigint_identity")).toBe("bigint");
        /* fk を持たない型は親と同じ型のまま */
        expect(await createFkChildId(page, "text")).toBe("text");
        expect(await createFkChildId(page, "uuid")).toBe("uuid");
    });

    test("パレットを差し替えた後の FK 自動生成は新しいパレットに従う", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("minimal"));
        /* ここで旧実装は Designer.fkTypeFor を postgresql の内容で焼いていた */
        expect(await createFkChildId(page, "bigint_identity")).toBe("bigint");

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
