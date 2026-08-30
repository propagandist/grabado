import { test, expect, type Page } from "@playwright/test";
import { readFixture, SERIALIZER_DB } from "../support/fixtures.ts";
import { loadFixture, openDesigner, useDatatypes } from "./harness.ts";

/**
 * 識別子の警告の見え方（HANDOVER §6 段階6-9b）。
 *
 * 規則そのものは tests/node/identifier.test.ts が押さえる。ここが見るのは
 * **画面に届いているか** —— 波線の印（class="invalid"）と、理由の tooltip。
 * どちらも golden に 1 ビットも写らない（golden はすべて toDdl / toJson 経由で採る）ので、
 * 6-4 の初期テーブルテンプレートや 6-3 の型セレクタと同じく、ここだけが経路になる。
 *
 * **止めない**ことも同時に押さえる —— 警告が出ても名前はモデルに入る。
 * 拒むと、PG で作った設計を oracle で開いた瞬間に既存の名前が不正になり直せなくなる。
 */
let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
});

test.afterAll(async () => {
    await page.close();
});

/** 1 行目の列名を書き換えて、印と tooltip とモデルの値を返す */
function renameFirstRow(page: Page, name: string) {
    return page.evaluate((newName) => {
        const row = window.d!.tables[0]!.rows[0]!;
        row.setTitle(newName);
        return {
            invalid: row.dom.title.className.includes("invalid"),
            tooltip: row.dom.title.getAttribute("title"),
            stored: row.getTitle(),
        };
    }, name);
}

test.describe("識別子の警告（段階6-9b）", () => {
    test("postgresql: 63 バイトを超えると印が付き、理由が出る", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture(SERIALIZER_DB, "minimal"));

        /* 64 文字。**PG は黙って 63 バイトに切る**ので、DDL を出しても気づけない */
        const tooLong = await renameFirstRow(page, "a".repeat(64));
        expect(tooLong.invalid).toBe(true);
        expect(tooLong.tooltip).toContain("postgresql: 64 > 63 bytes");
        /* 拒まない —— 名前はモデルに入っている */
        expect(tooLong.stored).toBe("a".repeat(64));

        /* 63 バイトに戻すと印も tooltip も消える（属性ごと外す） */
        const ok = await renameFirstRow(page, "a".repeat(63));
        expect(ok.invalid).toBe(false);
        expect(ok.tooltip).toBeNull();
    });

    test("日本語はバイトで数える（21 文字までが 63 バイト）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture(SERIALIZER_DB, "minimal"));

        expect((await renameFirstRow(page, "顧".repeat(21))).invalid).toBe(false);

        const over = await renameFirstRow(page, "顧".repeat(22));
        expect(over.invalid).toBe(true);
        expect(over.tooltip).toContain("66 > 63 bytes");
    });

    test('oracle: 識別子の " に印が付く（known-issue #15 に出す前に気づける）', async () => {
        /*
         * quotes-i18n の `say "hi"` が実物の例。**#15 そのものは直っていない** ——
         * Oracle の制約なので生成器の中に直し方が無く、6-9b がやったのは
         * 「実行できない DDL が出ることに、出す前に気づけるようにする」ことだけ。
         */
        await useDatatypes(page, "oracle");
        await loadFixture(page, readFixture(SERIALIZER_DB, "quotes-i18n"));

        const marked = await page.evaluate(() =>
            window.d!.tables[0]!.rows.map((row) => ({
                title: row.getTitle(),
                invalid: row.dom.title.className.includes("invalid"),
                tooltip: row.dom.title.getAttribute("title"),
            })),
        );

        const quoted = marked.find((one) => one.title.includes('"'))!;
        expect(quoted.invalid).toBe(true);
        expect(quoted.tooltip).toContain('oracle: "');
        /* 日本語の列名は問題ではない（囲めば通る）ので印が付かない */
        expect(marked.filter((one) => one.invalid)).toHaveLength(1);
    });

    test("テーブル名の tooltip はコメントと警告を両方見せる", async () => {
        await useDatatypes(page, "oracle");
        await loadFixture(page, readFixture(SERIALIZER_DB, "quotes-i18n"));

        const table = await page.evaluate(() => {
            const t = window.d!.tables[0]!;
            const before = t.dom.title.getAttribute("title");
            t.setTitle('bad "name"');
            return { before: before, after: t.dom.title.getAttribute("title") };
        });

        /* コメントだけのときはコメントだけ */
        expect(table.before).toBe("顧客マスタ。'仮登録' の状態も含む");
        /*
         * 警告が出たら改行でつなぐ（どちらかを落とすと「もう片方が消えた」ように見える）。
         * 文言は既定 locale の en（js/config.ts の DEFAULT_LOCALE）。
         */
        expect(table.after).toBe(
            "顧客マスタ。'仮登録' の状態も含む\n" +
                'Character not allowed in identifiers (oracle: ")',
        );
    });
});
