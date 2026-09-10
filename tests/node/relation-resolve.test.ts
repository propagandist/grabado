import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type NodeHarness } from "./harness.ts";
import { SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { applyDesignModel } from "../../frontend/js/io/apply.ts";
import type { DesignModel, RowModel } from "../../frontend/js/io/model.ts";

/*
 * 読み込み時のリレーション解決（#208）。
 *
 * ★★ **索引化しても解決先が 1 つも変わらないことを固定する棚。** golden は
 *   「読んで書き戻したバイト列」を押さえるが、**どの実体に繋がったか**は写さない
 *   （tests/support/state.ts が relation を採るのは「どの Row に繋がったか」までで、
 *   同名が絡む壊れ方は正常系の fixture に出てこない）。
 *
 * ★★ **applyDesignModel を直に import する。** js/io/apply.ts は実行時 import が
 *   0 本（型だけ）なので、Node 側からそのまま呼べる（tests/node/apply-patch.test.ts と
 *   同じ立場）。**これは近道ではなく、必要**な経路 —— 同名テーブルは #232 / #233 の
 *   関門が XML / JSON の読み込みで拒むので、**その関門を通らない呼び手**
 *   （AI パッチの適用と introspection の取り込み。js/io.ts:1060 / :1194）でしか
 *   到達できない。
 *
 * ★ **fixture を足さない**（tests/node/live-tree.test.ts と同じ理由）。
 */

/** 最小の行モデル。relations だけを呼び手が変える */
function row(title: string, relations: RowModel["relations"] = []): RowModel {
    return {
        title,
        type: 0,
        size: "",
        def: "",
        nll: false,
        ai: false,
        comment: "",
        relations,
    };
}

function table(
    title: string,
    x: number,
    rows: RowModel[],
): DesignModel["tables"][number] {
    return { title, x, y: 20, comment: "", rows, keys: [] };
}

describe("リレーション解決（#208）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
        h.useDatatypes(SERIALIZER_DB);
    }, 60_000);

    describe("先勝ち —— 同名があると先頭の一致に解決される", () => {
        /*
         * ★★ **訂正**（#263。2026-09-10）—— 元はここが
         *   「同名の行があると、参照は先頭の行に繋がる」を **XML の読み込みで**固定していた。
         *   **#263 が行名の重複を関門に足したので、その経路は閉じた。**
         *
         *   **黙って消さない。** 先勝ちそのものは下の 3 本目で残してある ——
         *   **関門を通らない呼び手**（AI パッチの適用と introspection の取り込み）では
         *   今も踏めるので、索引化が「先勝ち」を保っていることの検査は生きたまま。
         */
        it("同名の行がある設計は、読み込みの関門が拒む（#263）", () => {
            h.designer.clearTables();
            expect(() =>
                h.loadFixture(`<?xml version="1.0" encoding="utf-8" ?>
<sql>
<table x="20" y="20" name="parent">
<row name="id" null="0" autoincrement="0"><datatype>INTEGER</datatype></row>
<row name="id" null="0" autoincrement="0"><datatype>TEXT</datatype></row>
</table>
<table x="320" y="20" name="child">
<row name="parent_id" null="0" autoincrement="0">
<datatype>INTEGER</datatype>
<relation table="parent" row="id" />
</row>
</table>
</sql>`)
            ).toThrow(/重複/);
        });

        it("関門を通らない経路では、参照が先頭の行に繋がる（先勝ちは保たれている）", () => {
            h.designer.clearTables();
            applyDesignModel(h.designer, {
                tables: [
                    table("parent", 20, [row("id"), row("id")]),
                    table("child", 320, [
                        row("parent_id", [{ table: "parent", row: "id" }]),
                    ]),
                ],
            });

            const parent = h.designer.tables[0]!;
            expect(parent.rows.length).toBe(2);
            expect(h.designer.relations.length).toBe(1);
            /* 2 本目ではなく 1 本目 */
            expect(h.designer.relations[0]!.row1).toBe(parent.rows[0]);
        });

        it("同名のテーブルがあると、子側の端まで先頭のテーブルへ寄る", () => {
            /*
             * ★ **これが「同名テーブルで relation が壊れる」の本体。** 子側（row2）も
             *   名前で引き直すので、2 本目の `t` にある行の参照が **1 本目の `t` の行**に
             *   繋がる。索引化は「先勝ち」を保つので、この壊れ方もそのまま残る ——
             *   **性能の変更に機能の変更を混ぜない**（`formatVersion` の判断）。
             */
            h.designer.clearTables();
            applyDesignModel(h.designer, {
                tables: [
                    table("t", 20, [row("id")]),
                    table("t", 320, [row("id", [{ table: "other", row: "pk" }])]),
                    table("other", 620, [row("pk")]),
                ],
            });

            const first = h.designer.tables[0]!;
            const second = h.designer.tables[1]!;
            expect(h.designer.relations.length).toBe(1);
            expect(h.designer.relations[0]!.row2).toBe(first.rows[0]);
            expect(h.designer.relations[0]!.row2).not.toBe(second.rows[0]);
        });

        it("引き直した先に行が無ければ、参照は黙って捨てられる", () => {
            h.designer.clearTables();
            applyDesignModel(h.designer, {
                tables: [
                    table("t", 20, [row("id")]),
                    table("t", 320, [row("ref", [{ table: "t", row: "id" }])]),
                ],
            });
            /* 2 本目の `t` の `ref` は 1 本目の `t` に無いので continue に落ちる */
            expect(h.designer.relations.length).toBe(0);
        });
    });

    describe("並びと本数", () => {
        it("addRelation の呼び出し順が入力の順のまま", () => {
            h.designer.clearTables();
            h.loadFixture(readFixture(SERIALIZER_DB, "relations"));

            const seen = h.designer.relations.map(
                (r) =>
                    `${r.row2.owner.getTitle()}.${r.row2.getTitle()}` +
                    ` -> ${r.row1.owner.getTitle()}.${r.row1.getTitle()}`,
            );
            expect(seen).toEqual([
                "employees.manager_id -> employees.id",
                "projects.owner_id -> employees.id",
                "projects.team_id -> teams.id",
                "employee_projects.employee_id -> employees.id",
                "employee_projects.project_id -> projects.id",
            ]);
        });
    });

    describe("名前の線形走査を索引に置き換えた（#208）", () => {
        /**
         * findNamedTable / findNamedRow の呼び出し回数を run の間だけ数える。
         *
         * プロトタイプは**生きている実体から辿る**（tests/support/probe.ts と同じ形。
         * アプリに計装用の面を足さない）。
         */
        function countLookups(run: () => void): { table: number; row: number } {
            const dProto = Object.getPrototypeOf(h.designer) as {
                findNamedTable: (n: string | null) => unknown;
            };
            const tProto = Object.getPrototypeOf(h.designer.tables[0]!) as {
                findNamedRow: (n: string | null) => unknown;
            };
            const wasTable = dProto.findNamedTable;
            const wasRow = tProto.findNamedRow;
            const counts = { table: 0, row: 0 };
            dProto.findNamedTable = function (this: unknown, n: string | null) {
                counts.table++;
                return wasTable.call(this, n);
            };
            tProto.findNamedRow = function (this: unknown, n: string | null) {
                counts.row++;
                return wasRow.call(this, n);
            };
            try {
                run();
            } finally {
                dProto.findNamedTable = wasTable;
                tProto.findNamedRow = wasRow;
            }
            return counts;
        }

        /*
         * relations fixture は relation 5 本・<part> 5 個（PRIMARY が 3 本 x 1 列 ＋
         * 複合 PK 1 本 x 2 列）。索引化の前は relation 1 本につき findNamedTable を 2 回・
         * findNamedRow を 2 回引いていた（R x (N + C) の線形走査）。
         */
        it("relation の復元は findNamedTable を 1 度も引かない", () => {
            h.designer.clearTables();
            /* プロトタイプを辿るために、計装の前に 1 本立てておく */
            h.loadFixture(readFixture(SERIALIZER_DB, "minimal"));

            const xml = readFixture(SERIALIZER_DB, "relations");
            const counts = countLookups(() => {
                h.loadFixture(xml);
            });

            expect(h.designer.relations.length).toBe(5);
            expect(counts.table).toBe(0);
            /* 残るのは applyKey の <part> 5 個ぶんだけ（キーは索引化しない） */
            expect(counts.row).toBe(5);
        });
    });
});
