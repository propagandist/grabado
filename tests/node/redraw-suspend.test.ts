import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type NodeHarness } from "./harness.ts";
import { SERIALIZER_DB } from "../support/fixtures.ts";
import { applyDesignModel } from "../../frontend/js/io/apply.ts";
import type { DesignModel } from "../../frontend/js/io/model.ts";

/*
 * 読み込み中だけ描き直しを溜める旗（#210）。
 *
 * ★★ **この旗が UI 操作の経路に漏れると、FK 作成モードが解除されなくなる。**
 *   RowManager.redraw() は endCreate() / endConnect() という副作用を持っており、
 *   解除が実際にこの経路で起きている（rowmanager.ts の tableClick -> addRow ->
 *   Row.redraw -> rowManager.redraw -> endCreate）。
 *
 * ★★ **旗が立ったまま抜けると、以後すべての描画が止まる。** 画面が固まったように見えて、
 *   原因が読み込み 1 回前に遡る。**例外で抜ける経路が実在する**ので、そこを直接踏む。
 */

const DESIGN = JSON.stringify(
    {
        formatVersion: 2,
        db: SERIALIZER_DB,
        tables: [
            {
                name: "parent",
                x: 20,
                y: 20,
                columns: [{ name: "id", type: "integer" }],
                keys: [{ type: "PRIMARY", name: "parent_pkey", columns: ["id"] }],
            },
            {
                name: "child",
                x: 320,
                y: 20,
                columns: [{ name: "id", type: "integer" }],
                keys: [{ type: "PRIMARY", name: "child_pkey", columns: ["id"] }],
            },
        ],
    },
    null,
    2,
);

describe("読み込み中の再描画を束ねる（#210）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
        h.useDatatypes(SERIALIZER_DB);
    }, 60_000);

    it("読み込みが終わったら旗は倒れている", () => {
        h.designer.clearTables();
        h.loadJson(DESIGN);
        expect(h.designer.redrawSuspended).toBe(false);
    });

    it("例外で抜けても旗が倒れる（try / finally）", () => {
        h.designer.clearTables();

        /*
         * ★ **パレットの範囲外の型添字**で Row.update() が落ちる（2026-09-10 実測。
         *   getColor() が typeAt(index) の undefined を辿って TypeError）。
         *   読み込みの関門（#232 / #233）が見るのはテーブル名の重複とキーが指す列の不在の
         *   2 つで、**型添字は見ていない** —— 関門を通る経路でも届く。
         *
         * ★ **<part> の欠落では落ちない**（同日実測）。findNamedRow が返す false は
         *   Key.addRow の `r.owner != this.owner` で早期 return に落ちるだけで、
         *   TypeError にならない（apply.ts の applyKey のコメントを同じ PR で直した）。
         */
        const broken: DesignModel = {
            tables: [
                {
                    title: "t",
                    x: 20,
                    y: 20,
                    comment: "",
                    rows: [
                        {
                            title: "id",
                            type: 9999,
                            size: "",
                            def: "",
                            nll: false,
                            ai: false,
                            comment: "",
                            relations: [],
                        },
                    ],
                    keys: [],
                },
            ],
        };

        /*
         * ★ `toThrow(TypeError)` にしない —— 落ちるのは **jsdom の realm** のコードなので、
         *   Node 側の TypeError とは別のコンストラクタになる（instanceof が成立しない）。
         */
        expect(() => applyDesignModel(h.designer, broken)).toThrow(/parentNode/);
        expect(h.designer.redrawSuspended).toBe(false);
    });

    it("旗が倒れていれば、その後の読み込みは普通に描かれる", () => {
        h.designer.clearTables();
        h.loadJson(DESIGN);
        /* style.left は redraw() が x から作る（レイアウト非依存なので jsdom でも入る） */
        for (const t of h.designer.tables) {
            expect(t.dom.container.style.left, t.getTitle()).not.toBe("");
            expect(t.dom.mini.style.width, `${t.getTitle()} の mini`).not.toBe("");
        }
    });

    it("FK 作成モードの解除は効いたまま（旗を UI 経路に入れていない）", () => {
        h.designer.clearTables();
        h.loadJson(DESIGN);

        const d = h.designer;
        const parent = d.tables[0]!;
        const child = d.tables[1]!;
        const before = child.rows.length;

        /* rowManager.tableClick は「行を選んで creating 中に別テーブルを叩く」実経路 */
        d.rowManager.select(parent.rows[0]!);
        d.rowManager.creating = true;
        d.rowManager.tableClick({ target: child, data: null });

        expect(child.rows.length).toBe(before + 1);
        /* addRow -> Row.redraw -> rowManager.redraw -> endCreate をたどって落ちる */
        expect(d.rowManager.creating).toBe(false);
    });
});
