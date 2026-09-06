import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../support/fixtures.ts";

/*
 * HTML の静的な a11y 属性（#175）。**ブラウザも jsdom も要らない**
 * （tests/node/forbidden-api.test.ts / csp.test.ts と同じ型）。
 *
 * ★ ここが見る 4 枚の <table> は、**実行時には document から見えない** ——
 *   #opts / #io / #keys / #table はコンストラクタで DOM から外れる（#167 の調査）。
 *   **ブラウザ側（tests/browser/a11y.spec.ts）はカードの分だけを見る**ので、
 *   静的な分はソースで押さえるしかない。
 */

const html = readFileSync(join(REPO_ROOT, "frontend/index.html"), "utf8");

describe("index.html の a11y 属性（#175）", () => {
    test("レイアウト用の <table> が全部 role=presentation を持つ", () => {
        /* 属性の無い <table> が 1 つも無いこと。増えたときに素通りさせない */
        expect(html).not.toMatch(/<table>/);
        expect([...html.matchAll(/<table\s+role="presentation">/g)]).toHaveLength(4);
    });

    test("aria-describedby が実在する id を指す", () => {
        const refs = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map((m) => m[1]!);
        expect(refs).toEqual(["optionsnapnotice", "optionpatternnotice"]);
        for (const id of refs) {
            expect(html, `${id} が HTML に無い`).toContain(`id="${id}"`);
        }
    });

    test("モーダルが aria-labelledby で名前を持ち、その id が実在する", () => {
        const m = html.match(/<dialog id="window" aria-labelledby="([^"]+)">/);
        expect(m, "<dialog id=window> に aria-labelledby が無い").not.toBeNull();
        expect(html).toContain(`id="${m![1]}"`);
    });

    test("role=toolbar と aria-disabled は使わない（#175 の判断）", () => {
        /*
         * ★ **付けないことを固定する。** role="toolbar" は「矢印キーで移動する
         *   1 タブストップ」を含意し、**roving tabindex を実装しないなら半端な role を
         *   付けるほうが悪い**。aria-disabled は**ネイティブの disabled が既に
         *   アクセシビリティツリーに現れる**ので二重管理になる。
         */
        expect(html).not.toContain('role="toolbar"');
        expect(html).not.toContain("aria-disabled");
    });
});
