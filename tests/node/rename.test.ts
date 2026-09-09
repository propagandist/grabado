import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type NodeHarness } from "./harness.ts";
import { SERIALIZER_DB } from "../support/fixtures.ts";

/*
 * リネームの伝播（#213）。
 *
 * ★★ **置換の両側がユーザー入力**だった。旧名は正規表現へ、新名は置換文字列へ、
 *   どちらも生のまま渡されていた（js/table.ts と js/row.ts の setTitle）。
 *
 * ★★ **壊れ方は 3 通りある**（2026-09-09 実測）。issue のタイトルは crash だけを挙げて
 *   いるが、**例に挙がっている `Products (old)` は crash しない** —— `(old)` は
 *   キャプチャグループとして構文的に valid で、`Products old` を探すことになるので
 *   **黙って追随しない**ほうに落ちる。
 *
 *   | 入力 | 現行 |
 *   |---|---|
 *   | `a(b` / `a[b` / `*x` / `+x` / `?x` / `a)b` / `a{2,1}` | **SyntaxError で落ちる** |
 *   | `Products (old)` / `price+tax` | valid だが**自分自身に当たらない**（追随しない） |
 *   | `user.name` | `.` が任意 1 文字に当たり**誤置換** |
 *   | 新名に `$&` `$1` `` $` `` | 置換文字列として**展開される** |
 *
 * ★ **読み込み経路ではこのループが 1 度も走らない**（js/io/apply.ts が relation を張る前に
 *   setTitle を呼ぶ）。だから golden は 1 バイトも動かず、**この経路を見ているテストは
 *   #213 まで 1 本も無かった**。
 */

const J = (tables: unknown[]): string =>
    JSON.stringify({ formatVersion: 2, db: SERIALIZER_DB, tables }, null, 2);

/** 親テーブル 1 本と、その列を参照する子テーブル 1 本 */
function twoTables(
    parentTable: string,
    parentColumn: string,
    childColumn: string
): string {
    return J([
        {
            name: parentTable,
            x: 20,
            y: 20,
            columns: [{ name: parentColumn, type: "integer" }],
        },
        {
            name: "orders",
            x: 400,
            y: 20,
            columns: [
                {
                    name: childColumn,
                    type: "integer",
                    references: [{ table: parentTable, column: parentColumn }],
                },
            ],
        },
    ]);
}

describe("リネームの伝播（#213）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
        h.useDatatypes(SERIALIZER_DB);
    });

    describe("落ちない", () => {
        /* 未閉じの括弧・先頭の量指定子。打ち間違いで作れる形 */
        const CRASHING = ["Products (old", "items)", "*draft", "col[1"];

        for (const name of CRASHING) {
            it(`テーブル名 ${JSON.stringify(name)}`, () => {
                h.loadJson(twoTables(name, "id", "child_id"));
                const table = h.designer.tables[0]!;
                expect(() => table.setTitle("renamed")).not.toThrow();
                expect(table.getTitle()).toBe("renamed");
            });

            it(`行名 ${JSON.stringify(name)}`, () => {
                h.loadJson(twoTables("t", name, "child_id"));
                const parent = h.designer.tables[0]!.rows[0]!;
                expect(() => parent.setTitle("renamed")).not.toThrow();
                expect(parent.getTitle()).toBe("renamed");
            });
        }
    });

    describe("リテラルとして当てる", () => {
        it("メタ文字を含むテーブル名が、それを含む自分の行に当たる（issue の例）", () => {
            /*
             * Table.setTitle が書き換えるのは**自テーブルの行**（参照される側になっている
             * もの）。FK の既定命名パターン %R_%T が親テーブル名を含むので、この形は
             * house 既定に沿って作った設計でそのまま出る。
             *
             * /Products (old)/ は「Products old」を探すので、現行は当たらない。
             */
            h.loadJson(
                twoTables("Products (old)", "Products (old)_id", "child_ref")
            );
            const row = h.designer.tables[0]!.rows[0]!;
            h.designer.tables[0]!.setTitle("products");
            expect(row.getTitle()).toBe("products_id");
        });

        it("ドットが任意 1 文字として当たらない", () => {
            h.loadJson(twoTables("t", "user.name", "userXname"));
            const parent = h.designer.tables[0]!.rows[0]!;
            const child = h.designer.tables[1]!.rows[0]!;
            parent.setTitle("customer_name");
            /* 現行は customer_name に書き換わる */
            expect(child.getTitle()).toBe("userXname");
        });

        it("ドットを含む名前そのものには当たる", () => {
            h.loadJson(twoTables("t", "user.name", "t_user.name"));
            const parent = h.designer.tables[0]!.rows[0]!;
            const child = h.designer.tables[1]!.rows[0]!;
            parent.setTitle("customer");
            expect(child.getTitle()).toBe("t_customer");
        });

        it("旧名と一致する子行は、これまでどおり追随する", () => {
            h.loadJson(twoTables("t", "user_id", "orders_user_id"));
            const parent = h.designer.tables[0]!.rows[0]!;
            const child = h.designer.tables[1]!.rows[0]!;
            parent.setTitle("member_id");
            expect(child.getTitle()).toBe("orders_member_id");
        });

        it("一致が無ければ子行は動かない", () => {
            h.loadJson(twoTables("t", "user_id", "unrelated"));
            const parent = h.designer.tables[0]!.rows[0]!;
            const child = h.designer.tables[1]!.rows[0]!;
            parent.setTitle("member_id");
            expect(child.getTitle()).toBe("unrelated");
        });
    });

    describe("置換文字列を展開しない", () => {
        for (const to of ["$&x", "$1x", "$`x", "$'x", "$$x"]) {
            it(`新名 ${JSON.stringify(to)} がそのまま入る`, () => {
                h.loadJson(twoTables("t", "id", "t_id"));
                const parent = h.designer.tables[0]!.rows[0]!;
                const child = h.designer.tables[1]!.rows[0]!;
                parent.setTitle(to);
                expect(child.getTitle()).toBe(`t_${to}`);
            });
        }
    });
});
