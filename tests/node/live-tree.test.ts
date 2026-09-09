import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type NodeHarness } from "./harness.ts";
import { SERIALIZER_DB } from "../support/fixtures.ts";
import type { Key } from "../../frontend/js/key.ts";
import type { Row } from "../../frontend/js/row.ts";
import type { Designer } from "../../frontend/js/wwwsqldesigner.ts";

/*
 * 描画エンジンのライブツリー（js/row.ts / table.ts / key.ts / relation.ts）を直に叩く棚。
 *
 * ★★ **ここは golden が 1 ビットも押さえない層。** tests/support/state.ts は読み込み後の
 *   スナップショットを採るが、**行やキーを壊す操作**（destroy / removeRow）は golden の
 *   経路に出てこない —— fixture を読んで書き出すだけだから。
 *
 * ★ この棚を作った時点で、js/ 直下の relation.ts / key.ts / map.ts / rubberband.ts /
 *   keymanager.ts / window.ts / toggle.ts は**テストからの参照が 0 本**だった（2026-09-09 実測）。
 *
 * ★ **fixture を足さない。** tests/fixtures/ に置くと 8 プロファイル分が必要になり
 *   （tests/node/fixture-set.test.ts が格子を機械的に見る）DDL golden が 8 本連動する。
 *   必要な形は設計 JSON をテスト内で組む。
 */

const J = (tables: unknown[]): string =>
    JSON.stringify({ formatVersion: 2, db: SERIALIZER_DB, tables }, null, 2);

/** 列と、そのうち何本かを共有するキーを持つ 1 テーブル */
function oneTable(
    columns: string[],
    keys: { type: string; columns: string[] }[]
): string {
    return J([
        {
            name: "memberships",
            x: 20,
            y: 20,
            columns: columns.map((name) => ({ name, type: "integer" })),
            keys,
        },
    ]);
}

/** 双方向リンク（k in row.keys <=> row in k.rows）が全キー・全行で成り立つか */
function keyLinkAsymmetries(d: Designer): string[] {
    const bad: string[] = [];
    for (const t of d.tables) {
        for (const k of t.keys) {
            for (const r of k.rows) {
                if (r.keys.indexOf(k) === -1) {
                    bad.push(`${k.getLabel()}.rows に ${r.getTitle()} があるが、行側に無い`);
                }
            }
        }
        for (const r of t.rows) {
            for (const k of r.keys) {
                if (k.rows.indexOf(r) === -1) {
                    bad.push(`${r.getTitle()}.keys に ${k.getLabel()} があるが、キー側に無い`);
                }
            }
        }
    }
    return bad;
}

/** キーに載っている列名（保存されるのはこの値） */
const partsOf = (k: Key): string[] => k.rows.map((r: Row) => r.getTitle());

describe("ライブツリー", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
        h.useDatatypes(SERIALIZER_DB);
    });

    describe("行を壊すとキーからも消える（#216）", () => {
        it("2 つのキーに属する行が、どちらからも消える", () => {
            h.loadJson(
                oneTable(
                    ["org_id", "user_id", "role"],
                    [
                        { type: "PRIMARY", columns: ["org_id", "user_id"] },
                        { type: "UNIQUE", columns: ["user_id", "role"] },
                    ]
                )
            );
            const table = h.designer.tables[0]!;
            const userId = table.rows[1]!;
            expect(userId.getTitle()).toBe("user_id");
            expect(userId.keys.length).toBe(2);

            table.removeRow(userId);

            /* 修正前は UNIQUE 側に user_id が残る（前進走査中に splice するため） */
            expect(partsOf(table.keys[0]!)).toEqual(["org_id"]);
            expect(partsOf(table.keys[1]!)).toEqual(["role"]);
            expect(keyLinkAsymmetries(h.designer)).toEqual([]);
        });

        it("3 つのキーに属する行でも、全部から消える", () => {
            h.loadJson(
                oneTable(
                    ["a", "b", "c"],
                    [
                        { type: "PRIMARY", columns: ["a", "b"] },
                        { type: "UNIQUE", columns: ["b", "c"] },
                        { type: "INDEX", columns: ["b"] },
                    ]
                )
            );
            const table = h.designer.tables[0]!;
            const b = table.rows[1]!;
            expect(b.keys.length).toBe(3);

            table.removeRow(b);

            expect(partsOf(table.keys[0]!)).toEqual(["a"]);
            expect(partsOf(table.keys[1]!)).toEqual(["c"]);
            expect(partsOf(table.keys[2]!)).toEqual([]);
            expect(keyLinkAsymmetries(h.designer)).toEqual([]);
        });

        it("キー 1 本だけの行は、これまでどおり消える", () => {
            h.loadJson(
                oneTable(["a", "b"], [{ type: "PRIMARY", columns: ["a", "b"] }])
            );
            const table = h.designer.tables[0]!;
            table.removeRow(table.rows[0]!);
            expect(partsOf(table.keys[0]!)).toEqual(["b"]);
        });
    });

    describe("消えた列は保存にも出ない（#216）", () => {
        it("残骸がバイト列に出てこない", () => {
            h.loadJson(
                oneTable(
                    ["org_id", "user_id", "role"],
                    [
                        { type: "PRIMARY", columns: ["org_id", "user_id"] },
                        { type: "UNIQUE", columns: ["user_id", "role"] },
                    ]
                )
            );
            const table = h.designer.tables[0]!;
            table.removeRow(table.rows[1]!);
            /* io/extract.ts は key.rows[i].getTitle() を読むので、残骸はそのまま出力に出る */
            expect(h.toJson()).not.toContain("user_id");
        });

        it("テーブルごと壊しても残骸が出ない", () => {
            h.loadJson(
                oneTable(
                    ["a", "b", "c"],
                    [
                        { type: "PRIMARY", columns: ["a", "b"] },
                        { type: "UNIQUE", columns: ["b", "c"] },
                    ]
                )
            );
            const table = h.designer.tables[0]!;
            /* Table.destroy を直に呼ばない —— Designer.tables から外れず、次の
               clearTables() が二重に壊す（dom.mini.parentNode が null になる） */
            h.designer.removeTable(table);
            expect(table.rows.length).toBe(0);
            for (const k of table.keys) {
                expect(partsOf(k)).toEqual([]);
            }
        });

        it("clearTables() でも残骸が出ない", () => {
            h.loadJson(
                oneTable(
                    ["a", "b", "c"],
                    [
                        { type: "PRIMARY", columns: ["a", "b"] },
                        { type: "UNIQUE", columns: ["b", "c"] },
                    ]
                )
            );
            h.designer.clearTables();
            expect(h.designer.tables.length).toBe(0);
            expect(keyLinkAsymmetries(h.designer)).toEqual([]);
        });
    });

    /*
     * ★★ **`while (this.keys.length)` が止まる根拠**は「removeRow が必ず縮める」ことだが、
     *   Key.removeRow は indexOf で早期 return するので**無条件には成り立たない**。
     *   成り立つのは双方向リンクの不変条件があるとき —— それをここで見張る。
     *   実行時ガードを足さないイディオム C（js/row.ts の KDoc）に従い、
     *   コードではなくテストで担保する。
     */
    describe("キーと行の双方向リンク", () => {
        it("addRow は両側を対称に増やす", () => {
            h.loadJson(oneTable(["a"], []));
            const table = h.designer.tables[0]!;
            const k = table.addKey("INDEX");
            const a = table.rows[0]!;
            expect(a.keys.length).toBe(0);

            k.addRow(a);

            expect(k.rows).toContain(a);
            expect(a.keys).toContain(k);
            expect(keyLinkAsymmetries(h.designer)).toEqual([]);
        });

        it("removeRow は両側を必ず 1 ずつ減らす", () => {
            h.loadJson(oneTable(["a"], [{ type: "INDEX", columns: ["a"] }]));
            const table = h.designer.tables[0]!;
            const k = table.keys[0]!;
            const a = table.rows[0]!;
            const before = [k.rows.length, a.keys.length];

            k.removeRow(a);

            expect([k.rows.length, a.keys.length]).toEqual([
                before[0]! - 1,
                before[1]! - 1,
            ]);
        });

        it("載っていない行を removeRow しても縮まない", () => {
            h.loadJson(oneTable(["a", "b"], [{ type: "INDEX", columns: ["a"] }]));
            const table = h.designer.tables[0]!;
            const k = table.keys[0]!;

            k.removeRow(table.rows[1]!);

            expect(partsOf(k)).toEqual(["a"]);
        });

        it("他テーブルの行は addRow で弾かれる", () => {
            h.loadJson(
                J([
                    {
                        name: "t1",
                        x: 20,
                        y: 20,
                        columns: [{ name: "a", type: "integer" }],
                    },
                    {
                        name: "t2",
                        x: 400,
                        y: 20,
                        columns: [{ name: "b", type: "integer" }],
                    },
                ])
            );
            const t1 = h.designer.tables[0]!;
            const t2 = h.designer.tables[1]!;
            const k = t1.addKey("INDEX");

            k.addRow(t2.rows[0]!);

            expect(partsOf(k)).toEqual([]);
            expect(t2.rows[0]!.keys.length).toBe(0);
        });

        it("Key.destroy は逆向きの非対称を残す（key.rows は縮まない）", () => {
            /*
             * 無限ループの原因にはならない —— 行側から見ると消えているので、
             * Row.destroy が回す this.keys には現れない。現行の挙動として固定する。
             */
            h.loadJson(oneTable(["a", "b"], [{ type: "INDEX", columns: ["a", "b"] }]));
            const table = h.designer.tables[0]!;
            const k = table.keys[0]!;
            const [a, b] = [table.rows[0]!, table.rows[1]!];

            k.destroy();

            expect(k.rows).toEqual([a, b]);
            expect(a.keys).toEqual([]);
            expect(b.keys).toEqual([]);
        });
    });

    /*
     * FK の型伝播とリネームの伝播（#212 / #231）。
     *
     * ★★ どちらも **相互 FK でサイクルになる**。foreignconnect は isUnique() の行しか
     *   繋げないので**両端は PK 列**で、house 既定なら**どちらも `id`** ―― 相互 FK は
     *   SQL として正当な設計で、UI からも作れる（rowClick が弾くのは r1 == r2 だけ）。
     */
    describe("FK の伝播がサイクルで止まる（#212 / #231）", () => {
        /** 相互 FK。a.id -> b.id かつ b.id -> a.id */
        const MUTUAL = J([
            {
                name: "a",
                x: 20,
                y: 20,
                columns: [
                    {
                        name: "id",
                        type: "integer",
                        references: [{ table: "b", column: "id" }],
                    },
                ],
            },
            {
                name: "b",
                x: 400,
                y: 20,
                columns: [
                    {
                        name: "id",
                        type: "integer",
                        references: [{ table: "a", column: "id" }],
                    },
                ],
            },
        ]);

        it("相互 FK は読み込める（relation は 2 本）", () => {
            h.loadJson(MUTUAL);
            expect(h.designer.relations.length).toBe(2);
        });

        it("相互 FK で型を変えても返る（#212）", () => {
            h.loadJson(MUTUAL);
            const a = h.designer.tables[0]!.rows[0]!;
            const bigint = h.designer.palette.indexOfId("bigint");
            expect(bigint).toBeGreaterThanOrEqual(0);
            /* 修正前は RangeError: Maximum call stack size exceeded */
            expect(() => a.update({ type: bigint })).not.toThrow();
        });

        it("止まったとき、編集した行の型が残る（#212）", () => {
            h.loadJson(MUTUAL);
            const a = h.designer.tables[0]!.rows[0]!;
            const b = h.designer.tables[1]!.rows[0]!;
            const bigint = h.designer.palette.indexOfId("bigint");
            a.update({ type: bigint });
            /* 伝播は 1 段で止まり、選んだ値が編集した行に残る */
            expect(a.data.type).toBe(bigint);
            expect(b.data.type).toBe(h.designer.palette.fkIndexFor(bigint));
        });

        it("相互 FK で行をリネームしても返る（#231）", () => {
            h.loadJson(MUTUAL);
            const a = h.designer.tables[0]!.rows[0]!;
            const b = h.designer.tables[1]!.rows[0]!;
            expect([a.getTitle(), b.getTitle()]).toEqual(["id", "id"]);
            /* 修正前は RangeError */
            expect(() => a.setTitle("id2")).not.toThrow();
            expect(a.getTitle()).toBe("id2");
        });

        it("自己ループでも止まる", () => {
            h.loadJson(
                J([
                    {
                        name: "t",
                        x: 20,
                        y: 20,
                        columns: [
                            {
                                name: "id",
                                type: "integer",
                                references: [{ table: "t", column: "id" }],
                            },
                        ],
                    },
                ])
            );
            const id = h.designer.tables[0]!.rows[0]!;
            const bigint = h.designer.palette.indexOfId("bigint");
            expect(() => id.update({ type: bigint })).not.toThrow();
            expect(() => id.setTitle("id2")).not.toThrow();
        });
    });

    /*
     * ★★ **サイクル検出は「訪問済み集合」ではなく「経路上の集合」でなければならない。**
     *
     *   大域の visited にすると、**非循環でも訪問回数が減る** —— ダイヤモンド
     *   （A->B, A->C, B->C）では C が 2 回更新されるのが現行の挙動で、visited だと 1 回になる。
     *   経路上の集合（再帰前に add / 再帰後に delete）なら DAG で枝刈りが 1 つも起きず、
     *   **値だけでなく redraw() の回数まで不変**になる（#207 / #210 が数えているのがそれ）。
     *
     *   ここの 2 本は**修正前から緑**である必要がある —— それが「挙動を変えていない」の実体。
     */
    describe("非循環では伝播の回数が変わらない", () => {
        /** ダイヤモンド: a.id -> b.y、a.id -> c.x、b.y -> c.x */
        const DIAMOND = J([
            { name: "a", x: 20, y: 20, columns: [{ name: "id", type: "integer" }] },
            {
                name: "b",
                x: 400,
                y: 20,
                columns: [
                    {
                        name: "y",
                        type: "integer",
                        references: [{ table: "a", column: "id" }],
                    },
                ],
            },
            {
                name: "c",
                x: 700,
                y: 20,
                columns: [
                    {
                        name: "x",
                        type: "integer",
                        references: [
                            { table: "a", column: "id" },
                            { table: "b", column: "y" },
                        ],
                    },
                ],
            },
        ]);

        it("ダイヤモンドの合流点は 2 回更新される", () => {
            h.loadJson(DIAMOND);
            const a = h.designer.tables[0]!.rows[0]!;
            const c = h.designer.tables[2]!.rows[0]!;

            let calls = 0;
            const original = c.update.bind(c);
            (c as unknown as { update: typeof c.update }).update = ((
                ...args: Parameters<typeof original>
            ) => {
                calls++;
                return original(...args);
            }) as typeof c.update;

            a.update({ type: h.designer.palette.indexOfId("bigint") });

            expect(calls).toBe(2);
        });

        it("3 段のチェーンで型と size が末端まで届く", () => {
            h.loadJson(
                J([
                    {
                        name: "a",
                        x: 20,
                        y: 20,
                        columns: [{ name: "id", type: "varchar", size: "10" }],
                    },
                    {
                        name: "b",
                        x: 400,
                        y: 20,
                        columns: [
                            {
                                name: "a_id",
                                type: "varchar",
                                size: "10",
                                references: [{ table: "a", column: "id" }],
                            },
                        ],
                    },
                    {
                        name: "c",
                        x: 700,
                        y: 20,
                        columns: [
                            {
                                name: "b_id",
                                type: "varchar",
                                size: "10",
                                references: [{ table: "b", column: "a_id" }],
                            },
                        ],
                    },
                ])
            );
            const a = h.designer.tables[0]!.rows[0]!;
            const b = h.designer.tables[1]!.rows[0]!;
            const c = h.designer.tables[2]!.rows[0]!;

            a.update({ type: h.designer.palette.indexOfId("varchar"), size: "42" });

            expect(b.data.size).toBe("42");
            expect(c.data.size).toBe("42");
        });

        it("非循環のリネームは末端まで届く", () => {
            h.loadJson(
                J([
                    { name: "a", x: 20, y: 20, columns: [{ name: "id", type: "integer" }] },
                    {
                        name: "b",
                        x: 400,
                        y: 20,
                        columns: [
                            {
                                name: "id_ref",
                                type: "integer",
                                references: [{ table: "a", column: "id" }],
                            },
                        ],
                    },
                ])
            );
            const a = h.designer.tables[0]!.rows[0]!;
            const b = h.designer.tables[1]!.rows[0]!;

            a.setTitle("key");

            expect(b.getTitle()).toBe("key_ref");
        });
    });

    /*
     * ★ **相互 FK は正当な設計なので、作成の側は塞がない**（#212 の判断）。
     *   rowClick が弾くのは r1 == r2 だけ ―― この issue の前は目視でしか確かめられなかった。
     */
    describe("相互 FK は引き続き作れる", () => {
        it("UI の経路（rowClick）で 2 方向とも繋がる", () => {
            h.loadJson(
                J([
                    { name: "a", x: 20, y: 20, columns: [{ name: "id", type: "integer" }] },
                    { name: "b", x: 400, y: 20, columns: [{ name: "id", type: "integer" }] },
                ])
            );
            const d = h.designer;
            const a = d.tables[0]!.rows[0]!;
            const b = d.tables[1]!.rows[0]!;
            expect(d.relations.length).toBe(0);

            const connect = (from: Row, to: Row): void => {
                d.rowManager.select(from);
                d.rowManager.connecting = true;
                d.rowManager.rowClick({ target: to, data: null });
                d.rowManager.connecting = false;
            };

            connect(a, b);
            connect(b, a);

            expect(d.relations.length).toBe(2);
            /* できた相互 FK を操作しても固まらない */
            expect(() => a.update({ type: d.palette.indexOfId("bigint") })).not.toThrow();
            expect(() => a.setTitle("id2")).not.toThrow();
        });

        it("同じ行どうしは繋がらない（現行のまま）", () => {
            h.loadJson(
                J([{ name: "a", x: 20, y: 20, columns: [{ name: "id", type: "integer" }] }])
            );
            const d = h.designer;
            const a = d.tables[0]!.rows[0]!;

            d.rowManager.select(a);
            d.rowManager.connecting = true;
            d.rowManager.rowClick({ target: a, data: null });
            d.rowManager.connecting = false;

            expect(d.relations.length).toBe(0);
        });
    });
});
