import { test, expect, type Page } from "@playwright/test";
import { readFixture, SERIALIZER_DB } from "../support/fixtures.ts";
import { generateDdl, loadFixture, openDesigner, useDatatypes } from "./harness.ts";

/**
 * キー管理 UI から CREATE INDEX に届く経路（HANDOVER §6 段階6-5b）。
 *
 * **この経路は golden に 1 ビットも写らない。** tests/fixtures/ の 7 本に INDEX / FULLTEXT の
 * <key> が 1 つも無いので、35 本の DDL golden に CREATE INDEX の行は 1 行も現れない。
 * 6-5a が「恒久テストを 1 本立てること」と申し送ったのはそのため。
 *
 * 規則そのもの（name 空 -> idx_<table>_<cols>）は tests/node/ddl.test.ts が押さえる。
 * ここが見るのは**人が実際にそこへ辿り着けるか** —— KeyManager.add() は
 * `table.keys.length ? "INDEX" : "PRIMARY"` で name も列も空のキーを作るので、
 * 「2 本目のキーを足して列を入れる」が index を得る唯一の道になっている。
 * 6-3 が Row.buildTypeSelect を、6-4 がテーブル追加を恒久テストに残したのと同じ位置づけ。
 */
let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
});

test.afterAll(async () => {
    await page.close();
});

/** 「キー追加」ボタン（#keyadd）と同じ入口。name も列も空のキーが 1 つ増える */
function addKeyByUi(page: Page): Promise<{ type: string; name: string; parts: string[] }> {
    return page.evaluate(() => {
        const d = window.d!;
        const table = d.tables[0]!;
        /* open() は編集ウィンドウを開くだけなので、状態を作る sync() を直に呼ぶ */
        d.keyManager.sync(table);
        d.keyManager.add();

        const key = table.keys[table.keys.length - 1]!;
        return {
            type: key.getType(),
            name: key.getName(),
            parts: key.rows.map((row) => row.getTitle()),
        };
    });
}

/** avail の列を選んで ←（#left）を押す ＝ キーに列を入れる UI 操作 */
function addColumnToKeyByUi(page: Page, column: string): Promise<string[]> {
    return page.evaluate((col) => {
        const d = window.d!;
        const options = d.keyManager.dom.avail.getElementsByTagName("option");
        for (let i = 0; i < options.length; i++) {
            options[i]!.selected = options[i]!.value === col;
        }
        d.keyManager.left();

        const table = d.tables[0]!;
        const key = table.keys[table.keys.length - 1]!;
        return key.rows.map((row) => row.getTitle());
    }, column);
}

test.describe("キー管理 UI から CREATE INDEX まで（段階6-5b）", () => {
    test("postgresql: 2 本目のキーは INDEX で、列を入れると idx_<table>_<cols> が出る", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("house-defaults"));

        /* 追加直後は name も列も空 —— 規約名を組む側（naming.ts）に入る実際の入力がこれ */
        expect(await addKeyByUi(page)).toEqual({ type: "INDEX", name: "", parts: [] });

        /*
         * 列を 1 つも持たないキーは 1 文字も出さない（段階6-5b の決定 7）。
         * 6-5a まで ALTER TABLE users ADD CONSTRAINT users_pkey KEY (); という
         * 二重に壊れた行（PG に無い構文 ＋ 列が空 ＋ PRIMARY と同名）が出ていた。
         */
        const before = await generateDdl(page, SERIALIZER_DB);
        expect(before).not.toContain("CREATE INDEX");
        expect(before).not.toMatch(/KEY \(\);/);

        expect(await addColumnToKeyByUi(page, "display_name")).toEqual(["display_name"]);

        const after = await generateDdl(page, SERIALIZER_DB);
        expect(after).toContain("CREATE INDEX idx_users_display_name ON users (display_name);");
        /* index は制約ではないので ALTER TABLE では出ない */
        expect(after).not.toMatch(/ADD CONSTRAINT \S+ KEY \(/);
    });
});
