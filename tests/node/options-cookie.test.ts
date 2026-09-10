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

    /*
     * ★★ 元は 1 本で「cookie が空でも既定値に落ちる」だった（#172 で 2 本に割った）。
     *   あれは **jsdom に window.matchMedia が無いおかげで偶然緑だった** ——
     *   既定は #172 から「保存された値が無ければ OS に従う」になっている。
     *   **偶然を契約に変える**: 不在なら material-inspired、ダークを望むなら material-dark。
     */
    test("cookie が空で matchMedia も無いなら material-inspired（jsdom の既定）", () => {
        expect(typeof h.window.matchMedia).not.toBe("function");
        expect(h.io.owner.getOption("style")).toBe("material-inspired");
    });

    test("cookie が空で OS がダークを望むなら material-dark", () => {
        const win = h.window as unknown as { matchMedia?: unknown };
        const saved = win.matchMedia;
        win.matchMedia = (q: string) => ({ matches: q.includes("dark"), media: q });
        try {
            expect(h.io.owner.getOption("style")).toBe("material-dark");
        } finally {
            if (saved === undefined) delete win.matchMedia;
            else win.matchMedia = saved;
        }
    });

    describe("テーマの「OS に従う」（#235）", () => {
        /*
         * ★★ **jsdom には window.matchMedia が無い**（Designer.prefersDark の KDoc）。
         *   よって prefersDark() は常に false で、"auto" は必ず material-inspired に
         *   解決する。**OS を実際に切り替えて見るのは tests/browser/theme.spec.ts の側。**
         *   ここが見るのは**保存される値**と、**解決と保存が別物であること**。
         */
        test("cookie が無いとき、保存されている値は auto（実効テーマではない）", () => {
            expect(h.io.owner.storedStyle()).toBe("auto");
            /* 描くときは実在のテーマに解決される */
            expect(h.io.owner.getOption("style")).toBe("material-inspired");
        });

        test("auto を保存しても、描くのは実在のテーマ", () => {
            h.io.owner.setOption("style", "auto");

            expect(h.window.document.cookie).toContain("auto");
            expect(h.io.owner.storedStyle()).toBe("auto");
            expect(h.io.owner.getOption("style")).toBe("material-inspired");
        });

        test("具体のテーマを選ぶと、そのまま保存されて返る", () => {
            h.io.owner.setOption("style", "material-dark");

            expect(h.io.owner.storedStyle()).toBe("material-dark");
            expect(h.io.owner.getOption("style")).toBe("material-dark");
        });

        test("★ 焼いたあとに auto へ戻せる（cookie を消さずに）", () => {
            /* #235 の中心 —— 片道だった扉に戻り口を付けた */
            h.io.owner.setOption("style", "material-dark");
            expect(h.io.owner.storedStyle()).toBe("material-dark");

            h.io.owner.setOption("style", "auto");

            expect(h.io.owner.storedStyle()).toBe("auto");
            expect(h.io.owner.getOption("style")).toBe("material-inspired");
        });

        test("他の設定は巻き添えにならない", () => {
            h.io.owner.setOption("snap", "20");
            h.io.owner.setOption("style", "material-dark");
            h.io.owner.setOption("style", "auto");

            expect(h.io.owner.getOption("snap")).toBe("20");
        });
    });
});
