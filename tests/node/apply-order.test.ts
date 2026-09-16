import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type NodeHarness } from "./harness.ts";
import { SERIALIZER_DB } from "../support/fixtures.ts";
import { applyDesignModel } from "../../frontend/js/io/apply.ts";
import type { DesignModel, RowModel } from "../../frontend/js/io/model.ts";
import type { Designer } from "../../frontend/js/wwwsqldesigner.ts";
import type { Table } from "../../frontend/js/table.ts";

/*
 * apply.ts が Designer に対して行う呼び出しの **順序** を固定する（#318）。
 *
 * ★★ **golden は結果しか見ない。** suspendRedraw / resumeRedraw の括りが外れても、
 *   ff hack が resumeRedraw より前に来ても、relation が hack より先に張られても、
 *   **最終状態は同じ**なので golden は 1 バイトも動かない。
 *   つまり **順序を壊すリファクタは、テストが緑のまま通る**。
 *   同じ構造は #302 が踏んでいる（辺が 1 本も取れなくなる変異を、実ブラウザの棚が緑で通した）。
 *
 * ★★ **ここが見るのは [`apply.ts`](../../frontend/js/io/apply.ts) の★★が宣言している
 *   制約そのもので、実装の写しではない。** **回数は見ない** —— 呼び出しが増えても、
 *   関係が保たれていれば緑。
 *
 * ★ **apply.ts は 1 行も変えない**（#318 の判断）。網が実装に合わせて書かれると、
 *   壊れたときに落ちる保証にならない。
 *
 * ★ **旗そのものを見る側は [`redraw-suspend.test.ts`](redraw-suspend.test.ts)**（#210）。
 *   あちらは `redrawSuspended` という**結果**を見る。こちらは**呼ばれ方**を見る ——
 *   軸が違うので、どちらも要る。
 */

/**
 * 記録する呼び出し。**順序の制約に関わるものだけ**を採る。
 *
 * `sync` は制約を持たない（apply.ts のコメントは何も言っていない）が、
 * #318 が「記録するハーネス」に挙げているので列には入れる。**検査はしない** ——
 * 検査を足せば、それは制約ではなく実装の写しになる。
 */
type CallName =
    | "suspendRedraw"
    | "resumeRedraw"
    | "addTable"
    | "select"
    | "deselect"
    | "addRelation"
    | "sync";

/**
 * Designer と、その Designer が作る Table に記録の口を差す。
 *
 * ★ **戻す口を持たない。** このファイルの中でしか使わず、テストごとに列を空にして使う。
 *   戻す仕掛けを持つと、戻し忘れたときに**他のテストが黙って素通しになる**。
 */
function recordCalls(designer: Designer): CallName[] {
    const calls: CallName[] = [];

    /* ff hack の当て先は「applyDesignModel がこれから作るテーブル」なので、生成の口で捕まえる */
    function watchTable(table: Table): void {
        const select = table.select.bind(table);
        const deselect = table.deselect.bind(table);
        table.select = function (): void {
            calls.push("select");
            select();
        };
        table.deselect = function (): void {
            calls.push("deselect");
            deselect();
        };
    }

    const suspendRedraw = designer.suspendRedraw.bind(designer);
    const resumeRedraw = designer.resumeRedraw.bind(designer);
    const sync = designer.sync.bind(designer);
    const addTable = designer.addTable.bind(designer);
    const addRelation = designer.addRelation.bind(designer);

    designer.suspendRedraw = function (): void {
        calls.push("suspendRedraw");
        suspendRedraw();
    };
    designer.resumeRedraw = function (): void {
        calls.push("resumeRedraw");
        resumeRedraw();
    };
    designer.sync = function (): void {
        calls.push("sync");
        sync();
    };
    designer.addTable = function (name: string, x: number, y: number): Table {
        calls.push("addTable");
        const table = addTable(name, x, y);
        watchTable(table);
        return table;
    };
    designer.addRelation = function (row1, row2) {
        calls.push("addRelation");
        return addRelation(row1, row2);
    };

    return calls;
}

/** `suspendRedraw` を +1、`resumeRedraw` を −1 として読んだときの、各位置での深さ */
function depthAt(calls: readonly CallName[]): number[] {
    let depth = 0;
    return calls.map((call) => {
        if (call === "suspendRedraw") {
            depth += 1;
        } else if (call === "resumeRedraw") {
            depth -= 1;
        }
        return depth;
    });
}

function row(title: string, relations: RowModel["relations"] = []): RowModel {
    return {
        title,
        /* パレットの先頭（範囲内ならどれでもよい。範囲外は下の BROKEN が使う） */
        type: 0,
        size: "",
        def: "",
        nll: false,
        ai: false,
        comment: "",
        relations,
    };
}

/**
 * relation を 1 本持つ最小の設計。
 *
 * ★ **relation が無いと、3 つ目の制約（hack のあとに張る）が空振りしたまま緑になる。**
 *   下のテストは「1 本も張っていない」こと自体を落とす。
 */
const MODEL: DesignModel = {
    tables: [
        {
            title: "parent",
            x: 20,
            y: 20,
            comment: "",
            rows: [row("id")],
            keys: [],
        },
        {
            title: "child",
            x: 320,
            y: 20,
            comment: "",
            rows: [row("parent_id", [{ table: "parent", row: "id" }])],
            keys: [],
        },
    ],
};

/**
 * `applyRow` が途中で落ちる設計（2026-09-10 実測の経路）。
 *
 * パレットの範囲外の型添字で `Row.update()` が TypeError になる。読み込みの関門
 * （#232 / #233）はテーブル名の重複とキーが指す列の不在しか見ておらず、**型添字は見ていない**。
 */
const BROKEN: DesignModel = {
    tables: [
        {
            title: "broken",
            x: 20,
            y: 20,
            comment: "",
            rows: [{ ...row("id"), type: 9999 }],
            keys: [],
        },
    ],
};

describe("apply.ts の副作用の順序（#318）", () => {
    let h: NodeHarness;
    let calls: CallName[];

    beforeAll(async () => {
        h = await createHarness();
        h.useDatatypes(SERIALIZER_DB);
        calls = recordCalls(h.designer);
    }, 60_000);

    /** 1 回流して、その間の呼び出し列を返す */
    function run(model: DesignModel): CallName[] {
        h.designer.clearTables();
        calls.length = 0;
        applyDesignModel(h.designer, model);
        return [...calls];
    }

    it("旗の括りが釣り合う —— 深さが負にならず、最後に 0 へ戻る", () => {
        const order = run(MODEL);
        const depths = depthAt(order);

        expect(order.filter((c) => c === "suspendRedraw").length, "旗を 1 度も立てていない").toBeGreaterThan(0);
        expect(Math.min(...depths), "resumeRedraw が先に来ている（括弧が閉じる前に閉じた）").toBe(0);
        expect(depths[depths.length - 1], "旗が立ったまま抜けている").toBe(0);
    });

    it("ff hack は旗を倒してから走る —— 束ねたまま通すと hack が意味を失う", () => {
        const order = run(MODEL);
        const depths = depthAt(order);

        const hacks = order
            .map((call, i) => ({ call, i }))
            .filter(({ call }) => call === "select" || call === "deselect");

        expect(hacks.length, "ff hack が 1 度も走っていない").toBeGreaterThan(0);

        const suspended = hacks.filter(({ i }) => depths[i]! > 0).map(({ call, i }) => `${call}@${i}`);
        expect(suspended, "旗が立ったまま select / deselect が走っている").toEqual([]);
    });

    it("relation は ff hack のあとに張る —— Relation が offsetLeft を読む", () => {
        const order = run(MODEL);

        const firstRelation = order.indexOf("addRelation");
        const lastHack = Math.max(order.lastIndexOf("select"), order.lastIndexOf("deselect"));

        expect(firstRelation, "relation を 1 本も張っていない —— fixture が制約を試していない").toBeGreaterThan(-1);
        expect(lastHack, "ff hack が 1 度も走っていない").toBeGreaterThan(-1);
        expect(firstRelation, "hack より先に relation を張っている").toBeGreaterThan(lastHack);
    });

    it("applyRow が落ちても旗は戻る —— finally が resumeRedraw を呼ぶ", () => {
        h.designer.clearTables();
        calls.length = 0;

        /*
         * ★ `toThrow(TypeError)` にしない —— 落ちるのは **jsdom の realm** のコードなので、
         *   Node 側の TypeError とは別のコンストラクタになる（redraw-suspend.test.ts と同じ）。
         */
        expect(() => applyDesignModel(h.designer, BROKEN)).toThrow(/parentNode/);

        const order = [...calls];
        const depths = depthAt(order);

        expect(order, "旗を立てていない").toContain("suspendRedraw");
        expect(order, "例外で抜けたときに旗を戻していない").toContain("resumeRedraw");
        expect(depths[depths.length - 1], "旗が立ったまま抜けている").toBe(0);
    });
});
