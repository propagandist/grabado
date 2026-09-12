import { describe, expect, test } from "vitest";
import {
    DesignHistory,
    DEFAULT_LIMITS,
    type HistoryLimits,
} from "../../frontend/js/history.ts";

/*
 * 編集の履歴のスタック（#288）。
 *
 * **ハーネスを使わない** —— js/history.ts は import が 0 本で string しか知らないので、
 * jsdom を組まずに直に叩ける（tests/node/template.test.ts と同じ立場）。
 *
 * ここが押さえるのは 4 つ:
 *   1. **同値を弾く**こと —— js/historymanager.ts の commit() を「撒きすぎても害が無い」
 *      操作にしている性質そのもの。これが崩れると、confirm でキャンセルした削除や
 *      snap 未満のドラッグが 1 手として積まれる
 *   2. 新しい手が **redo を捨てる**こと
 *   3. 上限で**古い側から**落ちること、ただし**最低 1 手は残る**こと
 *   4. reset が履歴ごと捨てること（型パレットが差し替わる経路で呼ばれる）
 *
 * 上限は既定（50 手 / 16,000,000 文字）のままでは試せない —— 16MB の文字列を作ることに
 * なるので、**コンストラクタで小さい上限を注入して**確かめる。既定値そのものは
 * 「60 回積んで 50 手」で 1 本だけ見る。
 */

/** 上限を試すとき以外はこれ。件数だけ小さくし、文字数は既定のまま当たらせない */
function small(entries: number, chars: number): HistoryLimits {
    return { entries: entries, chars: chars };
}

describe("同値と redo の破棄", () => {
    test("同じ文字列を push しても 1 手にならない", () => {
        const h = new DesignHistory("a");

        h.push("a");
        h.push("a");

        expect(h.depth()).toBe(0);
        expect(h.canUndo()).toBe(false);
        expect(h.current()).toBe("a");
    });

    test("変わったときだけ積まれる", () => {
        const h = new DesignHistory("a");

        h.push("b");
        h.push("b");
        h.push("c");

        expect(h.depth()).toBe(2);
        expect(h.current()).toBe("c");
    });

    test("undo の後に新しい手を積むと、やり直せる先が消える", () => {
        const h = new DesignHistory("a");
        h.push("b");
        h.push("c");

        h.undo();
        expect(h.canRedo()).toBe(true);

        h.push("d");

        expect(h.canRedo()).toBe(false);
        expect(h.current()).toBe("d");
        /* 枝が分かれたので、戻る先は "b" ではなく "a" -> "b" のまま残る */
        expect(h.undo()).toBe("b");
        expect(h.undo()).toBe("a");
    });

    test("undo してから同じ状態を push しても、やり直せる先は消えない", () => {
        const h = new DesignHistory("a");
        h.push("b");

        h.undo();
        h.push("a");

        /* push が同値で早期 return するので future に触っていない */
        expect(h.canRedo()).toBe(true);
        expect(h.redo()).toBe("b");
    });
});

describe("undo と redo", () => {
    test("積んだ順に戻り、戻した順にやり直せる", () => {
        const h = new DesignHistory("a");
        h.push("b");
        h.push("c");

        expect(h.undo()).toBe("b");
        expect(h.undo()).toBe("a");
        expect(h.current()).toBe("a");

        expect(h.redo()).toBe("b");
        expect(h.redo()).toBe("c");
        expect(h.current()).toBe("c");
    });

    test("空のスタックでは null を返し、状態を動かさない", () => {
        const h = new DesignHistory("a");

        expect(h.undo()).toBeNull();
        expect(h.redo()).toBeNull();
        expect(h.current()).toBe("a");
        expect(h.canUndo()).toBe(false);
        expect(h.canRedo()).toBe(false);
    });

    test("戻りきった後にもう一度 undo しても null", () => {
        const h = new DesignHistory("a");
        h.push("b");

        expect(h.undo()).toBe("a");
        expect(h.undo()).toBeNull();
        /* 失敗した undo が future を汚していないこと */
        expect(h.redo()).toBe("b");
    });
});

describe("上限", () => {
    test("件数の上限を超えると、古い手から落ちる", () => {
        const h = new DesignHistory("0", small(3, DEFAULT_LIMITS.chars));

        for (let i = 1; i <= 5; i++) {
            h.push(String(i));
        }

        expect(h.depth()).toBe(3);
        expect(h.undo()).toBe("4");
        expect(h.undo()).toBe("3");
        expect(h.undo()).toBe("2");
        /* "0" と "1" は落ちている */
        expect(h.undo()).toBeNull();
    });

    test("文字数の上限を超えると、古い手から落ちる", () => {
        const h = new DesignHistory("", small(100, 30));

        h.push("a".repeat(10));
        h.push("b".repeat(10));
        h.push("c".repeat(10));
        /* ここまでで合計 30 文字（past 20 ＋ present 10）。まだ当たらない */
        expect(h.depth()).toBe(3);

        h.push("d".repeat(10));

        /* 合計 40 -> "" と a を捨てて 30 に戻る */
        expect(h.depth()).toBe(2);
        expect(h.undo()).toBe("c".repeat(10));
        expect(h.undo()).toBe("b".repeat(10));
        expect(h.undo()).toBeNull();
    });

    test("★ 1 件だけで上限を超える設計でも、最低 1 手は残る", () => {
        const h = new DesignHistory("", small(100, 10));

        h.push("x".repeat(100));

        /*
         * ここを `length > 0` で回すと past が空になり、**大きい設計で undo が
         * 1 度も効かなくなる**。上限より「直前に戻れること」を優先する。
         */
        expect(h.depth()).toBe(1);
        expect(h.canUndo()).toBe(true);
        expect(h.undo()).toBe("");
    });

    test("上限を超え続けても、残るのは常に直前の 1 手", () => {
        const h = new DesignHistory("", small(100, 10));

        h.push("x".repeat(100));
        h.push("y".repeat(100));

        expect(h.depth()).toBe(1);
        expect(h.undo()).toBe("x".repeat(100));
    });

    test("既定の上限は 50 手", () => {
        const h = new DesignHistory("0");

        for (let i = 1; i <= 60; i++) {
            h.push(String(i));
        }

        expect(h.depth()).toBe(DEFAULT_LIMITS.entries);
    });

    test("捨てられるのは古い側だけで、やり直せる先は数に入る", () => {
        const h = new DesignHistory("0", small(3, DEFAULT_LIMITS.chars));
        h.push("1");
        h.push("2");
        h.push("3");

        h.undo();
        h.undo();

        /* past が 1、future が 2。合計は上限のまま動かない */
        expect(h.depth()).toBe(1);
        expect(h.canRedo()).toBe(true);
        expect(h.redo()).toBe("2");
        expect(h.redo()).toBe("3");
        expect(h.canRedo()).toBe(false);
    });
});

describe("reset", () => {
    test("履歴を捨てて、渡された状態を起点にし直す", () => {
        const h = new DesignHistory("a");
        h.push("b");
        h.push("c");
        h.undo();

        h.reset("z");

        expect(h.current()).toBe("z");
        expect(h.depth()).toBe(0);
        expect(h.canUndo()).toBe(false);
        expect(h.canRedo()).toBe(false);
    });

    test("reset の直後に積んだ手は、reset で渡した状態まで戻る", () => {
        const h = new DesignHistory("a");
        h.push("b");
        h.reset("z");

        h.push("y");

        expect(h.undo()).toBe("z");
        expect(h.undo()).toBeNull();
    });
});
