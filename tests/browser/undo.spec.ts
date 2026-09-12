import { test, expect, type Page } from "@playwright/test";
import { SERIALIZER_DB } from "../support/fixtures.ts";
import { loadJson, openDesigner, toJson } from "./harness.ts";

/**
 * undo / redo の UI（#289）。
 *
 * ★★ **ここが持つのは、jsdom では成立しない 3 つだけ**（それ以外は
 *   tests/node/undo.test.ts が 24 本で押さえている）:
 *
 *     1. **ドラッグ** —— jsdom は offsetWidth が常に 0 でドラッグが成立しない
 *     2. **ダイアログを開く 3 経路** —— jsdom は showModal() を実装していない
 *     3. **キーボードが document の keydown に実際に届くこと** —— node 側には
 *        先例が 1 本も無く、F2（quicksave）ですら io.quicksave() を直に呼んでいる
 */

let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
});

test.afterAll(async () => {
    await page.close();
});

const DESIGN = JSON.stringify(
    {
        formatVersion: 2,
        db: SERIALIZER_DB,
        tables: [
            {
                name: "orders",
                x: 60,
                y: 60,
                columns: [{ name: "id", type: "integer" }],
                keys: [],
            },
        ],
    },
    null,
    2
);

/** 設計を読み、履歴を空にしてから始める */
async function reset(): Promise<void> {
    await loadJson(page, DESIGN);
    await page.evaluate(() => window.d!.historyManager.reset());
}

/** 履歴に数えない形で 1 手積む */
async function commitOneEdit(): Promise<void> {
    await page.evaluate(() => {
        const d = window.d!;
        d.addTable("extra", 300, 300);
        d.historyManager.commit();
    });
}

test("空のスタックでは両方のボタンが押せない", async () => {
    await reset();

    expect(await page.locator("#undo").isDisabled()).toBe(true);
    expect(await page.locator("#redo").isDisabled()).toBe(true);
});

test("ボタンの可否が状態に追従する", async () => {
    await reset();
    await commitOneEdit();

    expect(await page.locator("#undo").isDisabled()).toBe(false);
    expect(await page.locator("#redo").isDisabled()).toBe(true);

    await page.locator("#undo").click();

    expect(await page.locator("#undo").isDisabled()).toBe(true);
    expect(await page.locator("#redo").isDisabled()).toBe(false);

    await page.locator("#redo").click();

    expect(await page.locator("#undo").isDisabled()).toBe(false);
    expect(await page.locator("#redo").isDisabled()).toBe(true);
});

test("★ Ctrl+Z が document の keydown から実際に届く", async () => {
    await reset();
    const before = await toJson(page);
    await commitOneEdit();
    expect(await toJson(page)).not.toBe(before);

    await page.keyboard.press("Control+z");

    expect(await toJson(page)).toBe(before);
});

test("Ctrl+Shift+Z と Ctrl+Y のどちらでも redo できる", async () => {
    await reset();
    await commitOneEdit();
    const after = await toJson(page);

    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+Shift+z");
    expect(await toJson(page)).toBe(after);

    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+y");
    expect(await toJson(page)).toBe(after);
});

test("★ ドラッグは 1 手。Ctrl+Z で元の座標に戻る", async () => {
    await reset();
    const before = await toJson(page);

    const box = await page.locator("#area div.table").first().boundingBox();
    expect(box, "テーブルが描かれていること").not.toBeNull();

    /* タイトルバーを掴んで動かす（js/table.ts の down -> move -> up） */
    await page.mouse.move(box!.x + 20, box!.y + 6);
    await page.mouse.down();
    await page.mouse.move(box!.x + 220, box!.y + 160, { steps: 12 });
    await page.mouse.up();

    expect(await toJson(page), "座標が動いていること").not.toBe(before);
    expect(
        await page.evaluate(() => window.d!.historyManager.depth()),
        "★ mousemove ごとではなく、離したところで 1 手"
    ).toBe(1);

    await page.keyboard.press("Control+z");

    expect(await toJson(page)).toBe(before);
});

/*
 * ★★ **ダイアログを「開いて閉じるまで」を通す 2 経路は、ここに置いていない**
 *   （テーブル追加 ＝ #addtable -> キャンバス -> #windowok、キー編集 ＝ #tablekeys ->
 *   #keyadd -> #windowok）。**手元では通るのに、全体実行や CI でだけ落ちる**
 *   （2026-09-12 実測。前者は CI、後者は手元の全体実行）。**不安定な赤は安全網に
 *   ならない** —— 赤が信用されなくなるぶん、無いより悪い。
 *
 *   **確定点が close にあること自体は tests/node/undo.test.ts が押さえている**
 *   （jsdom は showModal() を持たないので、close イベントを直に投げる形）。
 *   ここに残したのは、**その前後で Ctrl+Z がどう振る舞うか** —— 開いているあいだは
 *   効かず、テキスト欄の中ではブラウザに譲る —— の 2 本。
 */

test("★ ダイアログが開いているあいだは Ctrl+Z が効かない", async () => {
    await reset();
    await commitOneEdit();
    const after = await toJson(page);

    await page.evaluate(() => window.d!.tableManager.select(window.d!.tables[0]!));
    await page.locator("#edittable").click();

    /*
     * ★★ 効かせると、TableManager.save() が掴んでいる selection[0] が
     *   clearTables() で破棄され、**破棄済みオブジェクトに OK が書き込む**。
     */
    await page.keyboard.press("Control+z");
    expect(await toJson(page), "設計は動かない").toBe(after);

    await page.locator("#windowcancel").click();
});

test("★ textarea の中では Ctrl+Z がブラウザのテキスト undo になる", async () => {
    await reset();
    await commitOneEdit();
    const after = await toJson(page);

    await page.locator("#saveload").click();
    await page.locator("#textarea").fill("打ちかけの文字");
    await page.locator("#textarea").press("Control+z");

    expect(await toJson(page), "設計は戻らない").toBe(after);

    /* Save/Load は callback を取らないので cancel が隠れている（js/window.ts の open） */
    await page.keyboard.press("Escape");
});
