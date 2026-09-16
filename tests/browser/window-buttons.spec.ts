import { test, expect, type Page } from "@playwright/test";
import { SERIALIZER_DB } from "../support/fixtures.ts";
import { openDesigner, useDatatypes } from "./harness.ts";

/**
 * ダイアログ枠の右下（#311）。
 *
 * ★★ **確定があるかどうかで、ボタンの意味が変わる。**
 *
 *     callback あり（オプション / キー / テーブル編集）  [✓ OK] [× キャンセル]
 *     callback 無し（#io）                              [× 閉じる] だけ
 *
 * ★★ **隠す当て先はラッパー（span.tb）。** input に visibility を当てても、アイコンを
 *   描いているのは `::before` なので**アイコンだけ残る** —— それが #220（2026-09-05）から
 *   9 日間、**押しても何も起きない × が出ていた**形。**input 側を見るテストでは再発を
 *   捕まえられない**ので、ここは**ラッパーの computed style** を見る。
 *
 * ★ **ここが実ブラウザ側にあるのは、jsdom が showModal() を実装していないから**
 *   （undo.spec.ts の「ダイアログを開く 3 経路」と同じ理由）。
 */

let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
    await useDatatypes(page, SERIALIZER_DB);
});

test.afterAll(async () => {
    await page.close();
});

test.afterEach(async () => {
    /* 次のテストへ開いたまま持ち越さない */
    await page.evaluate(() => {
        if (window.d!.window.state) {
            window.d!.window.close();
        }
    });
});

/** ボタンを包む span.tb の可視性（アイコンを描いている側） */
function wrapperVisibility(id: string): Promise<string> {
    return page.evaluate((buttonId) => {
        const wrapper = document.getElementById(buttonId)!.closest(".tb")!;
        return getComputedStyle(wrapper).visibility;
    }, id);
}

test("#io（確定が無い）では、キャンセルがラッパーごと隠れる", async () => {
    await page.evaluate(() => window.d!.io.click());

    expect(await wrapperVisibility("windowcancel"), "ラッパーが可視のまま残っている").toBe("hidden");

    /* 文言は既定 locale の en（js/config.ts の DEFAULT_LOCALE。identifier.spec.ts と同じ立場） */
    const okValue = await page.evaluate(
        () => (document.getElementById("windowok") as HTMLInputElement).value
    );
    expect(okValue, "右下が「閉じる」になっていない").toBe("Close");
    /* io-ui.spec.ts と同じ形 —— locale から引けていなければキー名がそのまま出る */
    expect(okValue, "locale を引けておらず、キー名がそのまま出ている").not.toBe("close");

    const isClose = await page.evaluate(
        () => document.getElementById("windowok")!.closest(".tb")!.classList.contains("is-close")
    );
    expect(isClose, "アイコンを差し替える class が付いていない").toBe(true);
});

test("#io でも .tb.i-windowok は残る（dist のスモークが見ているセレクタ）", async () => {
    await page.evaluate(() => window.d!.io.click());

    const classes = await page.evaluate(() => {
        const wrapper = document.getElementById("windowok")!.closest(".tb")!;
        return [wrapper.classList.contains("tb"), wrapper.classList.contains("i-windowok")];
    });
    expect(classes, "tb / i-windowok のどちらかが外れている").toEqual([true, true]);
});

test("確定があるパネル（オプション）では OK とキャンセルが両方出る", async () => {
    await page.evaluate(() => window.d!.options.click());

    expect(await wrapperVisibility("windowcancel"), "キャンセルが隠れている").not.toBe("hidden");

    const [okValue, isClose] = await page.evaluate(() => {
        const input = document.getElementById("windowok") as HTMLInputElement;
        return [input.value, input.closest(".tb")!.classList.contains("is-close")] as const;
    });
    expect(okValue, "OK が「閉じる」に変わってしまっている").toBe("OK");
    expect(isClose, "確定があるのに閉じるアイコンになっている").toBe(false);
});

test("#io を開いたあとで確定のあるパネルを開いても、前の状態が残らない", async () => {
    await page.evaluate(() => window.d!.io.click());
    await page.evaluate(() => {
        window.d!.window.close();
        window.d!.options.click();
    });

    expect(await wrapperVisibility("windowcancel")).not.toBe("hidden");

    const [okValue, isClose] = await page.evaluate(() => {
        const input = document.getElementById("windowok") as HTMLInputElement;
        return [input.value, input.closest(".tb")!.classList.contains("is-close")] as const;
    });
    expect(okValue).toBe("OK");
    expect(isClose).toBe(false);
});
