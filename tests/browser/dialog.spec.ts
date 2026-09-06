import { test, expect } from "@playwright/test";
import { openDesigner } from "./harness.ts";

/*
 * alert / confirm / prompt の置き換え（#173）。
 *
 * ★ ここが見るのは **1 問ダイアログが 3 種類の形で出ること** と
 *   **キーボードだけで閉じられること**。**どちらも既存のテストが 1 本も見ていない**
 *   —— tests/support/state.ts は #area / svg / #minimap しか採らず、
 *   ハーネスは d.dialogs を覆ってしまうので、実物の DOM を通らない。
 */

test("alert / confirm / prompt が、それぞれの形で出る", async ({ page }) => {
    await openDesigner(page);

    const shapes: Record<string, unknown> = {};
    for (const kind of ["alert", "confirm", "prompt"] as const) {
        await page.evaluate((k) => {
            const d = window.d!.dialogs;
            if (k === "alert") void d.alert("メッセージ");
            if (k === "confirm") void d.confirm("いいですか ?");
            if (k === "prompt") void d.prompt("名前", "orders");
        }, kind);
        await page.waitForFunction(
            () => (document.getElementById("prompt") as HTMLDialogElement)?.open,
        );
        shapes[kind] = await page.evaluate(() => {
            const dlg = document.getElementById("prompt") as HTMLDialogElement;
            const shown = (sel: string) =>
                getComputedStyle(dlg.querySelector(sel)!).display !== "none";
            return {
                /* showModal() で開いている = ::backdrop が出て、背後が inert になる */
                modal: dlg.matches(":modal"),
                input: shown(".dialog-input"),
                cancel: shown(".dialog-cancel"),
                focus: (document.activeElement as HTMLElement).className,
            };
        });
        await page.keyboard.press("Escape");
        await page.waitForFunction(
            () => !(document.getElementById("prompt") as HTMLDialogElement).open,
        );
    }

    expect(shapes["alert"]).toEqual({
        modal: true,
        input: false,
        cancel: false,
        focus: "dialog-ok",
    });
    expect(shapes["confirm"]).toEqual({
        modal: true,
        input: false,
        cancel: true,
        focus: "dialog-ok",
    });
    expect(shapes["prompt"]).toEqual({
        modal: true,
        input: true,
        cancel: true,
        focus: "dialog-input",
    });
});

test("Esc は confirm を false、prompt を null にする（ネイティブと同じ）", async ({ page }) => {
    await openDesigner(page);
    const answers = await page.evaluate(async () => {
        const d = window.d!.dialogs;
        const dlg = document.getElementById("prompt") as HTMLDialogElement;
        const escape = async () => {
            /* showModal() の直後に閉じる —— キー入力は page 側から送れないので API で */
            while (!dlg.open) await new Promise((r) => setTimeout(r, 0));
            dlg.close();
        };
        const c = d.confirm("?");
        await escape();
        const p = d.prompt("?", "既定値");
        await escape();
        return { confirm: await c, prompt: await p };
    });
    expect(answers).toEqual({ confirm: false, prompt: null });
});

test("続けて出しても重ならない —— 1 問ずつ順に出る", async ({ page }) => {
    /*
     * ★★ alert は戻り値を持たないので**呼び手が await しない**。そのままだと
     *   「警告を出してから保存し、失敗したらもう 1 本」の経路で、開いている <dialog> に
     *   showModal() を呼んで **InvalidStateError** になる。待ち行列がそれを防ぐ。
     */
    await openDesigner(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    const opened = await page.evaluate(async () => {
        const d = window.d!.dialogs;
        const dlg = document.getElementById("prompt") as HTMLDialogElement;
        const seen: string[] = [];
        void d.alert("1 本目");
        void d.alert("2 本目");
        void d.alert("3 本目");
        for (let i = 0; i < 3; i++) {
            while (!dlg.open) await new Promise((r) => setTimeout(r, 0));
            seen.push(dlg.querySelector(".dialog-message")!.textContent ?? "");
            dlg.querySelector<HTMLInputElement>(".dialog-ok")!.click();
            dlg.close();
            await new Promise((r) => setTimeout(r, 0));
        }
        return seen;
    });

    expect(opened).toEqual(["1 本目", "2 本目", "3 本目"]);
    expect(errors).toEqual([]);
});
