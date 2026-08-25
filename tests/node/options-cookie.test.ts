import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createHarness, type NodeHarness } from "./harness.ts";

/*
 * オプションを持ち回る cookie の読み書き（§2 段階2-2）。
 *
 * 旧実装は `{k:'v'}` という JSON でない書式を eval で読み戻していた。CSP の `script-src` に
 * `'unsafe-eval'` を足さない限り動かない形なので、CSP を入れる前に撤去した（issue #89）。
 *
 * ここが見るのは 2 つ。**旧書式のまま来た cookie でオプションが失われないこと**（撤去の
 * 互換）と、**記号を含む値が往復すること**（旧書式は値をエスケープしておらず、`'` や `,` を
 * 入れると読み戻しが壊れていた —— eval を消すだけの置き換えでは、この弱さは残っていた）。
 *
 * cookie は jsdom が持つ（ハーネスの url は http オリジン）。属性（SameSite）は
 * document.cookie から読めないので、ここでは見ない。
 */

const COOKIE = "wwwsqldesigner";

describe("オプションの cookie（Node / jsdom）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
    });

    afterAll(() => {
        h.close();
    });

    beforeEach(() => {
        h.window.document.cookie = `${COOKIE}=; path=/; max-age=0`;
    });

    test("段階2-2 以前の書式 {k:'v'} を読める（撤去の互換）", () => {
        h.window.document.cookie = `${COOKIE}={style:'original',db:'mysql'}`;

        expect(h.io.owner.getOption("style")).toBe("original");
        expect(h.io.owner.getOption("db")).toBe("mysql");
    });

    test("旧書式を読んだ後の保存で JSON になる（書き戻しで移行する）", () => {
        h.window.document.cookie = `${COOKIE}={style:'original'}`;

        h.io.owner.setOption("snap", "20");

        /* encodeURIComponent された JSON。旧書式なら "{" が生で入っている */
        expect(h.window.document.cookie).toContain("%7B%22");
        expect(h.io.owner.getOption("style")).toBe("original");
        expect(h.io.owner.getOption("snap")).toBe("20");
    });

    test("記号を含む値が往復する（旧書式では壊れていた）", () => {
        /* pattern はユーザーがテキスト入力できる（js/options.ts の #optionpattern） */
        const pattern = `it's, a "test" {value}`;

        h.io.owner.setOption("pattern", pattern);

        expect(h.io.owner.getOption("pattern")).toBe(pattern);
    });

    test("cookie が空でも既定値に落ちる", () => {
        expect(h.io.owner.getOption("style")).toBe("material-inspired");
    });
});
