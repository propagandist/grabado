import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type NodeHarness } from "./harness.ts";
import { SERIALIZER_DB, readFixture } from "../support/fixtures.ts";

/*
 * 読み込みの関門（#232 / #233）。
 *
 * ★★ **読み込みが保存より緩いのは不具合だった。** 保存側（json-serializer.ts）は同名テーブルを
 *   「1 バイトも書かずに落ちる」と決めていたのに読み込み側が空いており、
 *   **「読めて、黙って別の設計になり、保存だけができない」行き止まり**ができていた（#233）。
 *
 * ★★ **落ちる場所が要件。** clearTables() より前で落ちないと、**今開いている設計を消してから**
 *   失敗することになる。Designer.fromJson が parse を clear の前に置いている理由と同じ。
 */

const J = (tables: unknown[]): string =>
    /* 末尾 LF は serializer が付ける（json-serializer.ts）。往復比較で要る */
    JSON.stringify({ formatVersion: 2, db: SERIALIZER_DB, tables }, null, 2) + "\n";

const ONE_TABLE = J([
    {
        name: "keeper",
        x: 20,
        y: 20,
        columns: [{ name: "id", type: "integer" }],
    },
]);

/*
 * ★ jsdom の中で投げられた Error は **Node の Error とは別のコンストラクタ**
 *   （realm が違う）。toBeInstanceOf(Error) は通らないので、message を見る。
 */
function errorMessage(thrown: unknown): string | null {
    if (thrown && typeof (thrown as { message?: unknown }).message === "string") {
        return (thrown as { message: string }).message;
    }
    return null;
}

describe("読み込みの関門", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
        h.useDatatypes(SERIALIZER_DB);
    });

    /** 「今開いている設計」を作ってから壊れた入力を食わせ、残っているかを見る */
    const withOpenDesign = (load: () => void): unknown => {
        h.loadJson(ONE_TABLE);
        let thrown: unknown = null;
        try {
            load();
        } catch (e) {
            thrown = e;
        }
        return thrown;
    };

    describe("キーが存在しない列を指している（#232）", () => {
        const BAD = J([
            {
                name: "t",
                x: 20,
                y: 20,
                columns: [{ name: "a", type: "integer" }],
                keys: [{ type: "PRIMARY", columns: ["a", "ghost"] }],
            },
        ]);

        it("例外になる（現行は黙って捨てて読めてしまう）", () => {
            const thrown = withOpenDesign(() => h.loadJson(BAD));
            expect(errorMessage(thrown)).not.toBe(null);
            expect(errorMessage(thrown)).toContain("ghost");
        });

        it("メッセージが位置を指す", () => {
            const thrown = withOpenDesign(() => h.loadJson(BAD));
            expect(errorMessage(thrown)).toContain("tables[0].keys[0].columns[1]");
        });

        it("今開いている設計が残っている", () => {
            withOpenDesign(() => h.loadJson(BAD));
            expect(h.designer.tables.length).toBe(1);
            expect(h.designer.tables[0]!.getTitle()).toBe("keeper");
        });

        it("実在する列だけのキーは通る", () => {
            const good = J([
                {
                    name: "t",
                    x: 20,
                    y: 20,
                    columns: [
                        { name: "a", type: "integer" },
                        { name: "b", type: "integer" },
                    ],
                    keys: [{ type: "PRIMARY", columns: ["a", "b"] }],
                },
            ]);
            expect(() => h.loadJson(good)).not.toThrow();
            expect(h.toJson()).toBe(good);
        });

        it("他のテーブルの列名は通らない（テーブルをまたげない）", () => {
            const cross = J([
                {
                    name: "t1",
                    x: 20,
                    y: 20,
                    columns: [{ name: "a", type: "integer" }],
                    keys: [{ type: "INDEX", columns: ["b"] }],
                },
                {
                    name: "t2",
                    x: 400,
                    y: 20,
                    columns: [{ name: "b", type: "integer" }],
                },
            ]);
            const thrown = withOpenDesign(() => h.loadJson(cross));
            expect(errorMessage(thrown)).not.toBe(null);
            expect(errorMessage(thrown)).toContain('"t1"');
        });
    });

    describe("同名のテーブルがある（#233）", () => {
        const DUP = J([
            {
                name: "dup",
                x: 20,
                y: 20,
                columns: [
                    { name: "id", type: "integer" },
                    {
                        name: "ref",
                        type: "integer",
                        references: [{ table: "dup", column: "id" }],
                    },
                ],
            },
            {
                name: "dup",
                x: 400,
                y: 20,
                columns: [{ name: "id", type: "integer" }],
            },
        ]);

        it("例外になる（現行は読めるのに保存できない行き止まりになる）", () => {
            const thrown = withOpenDesign(() => h.loadJson(DUP));
            expect(errorMessage(thrown)).not.toBe(null);
            expect(errorMessage(thrown)).toContain('"dup"');
        });

        it("今開いている設計が残っている", () => {
            withOpenDesign(() => h.loadJson(DUP));
            expect(h.designer.tables.length).toBe(1);
            expect(h.designer.tables[0]!.getTitle()).toBe("keeper");
        });

        it("保存側と同じ規則を見ている（読めたものは保存できる）", () => {
            /* 通った設計は必ず書き戻せる ―― 非対称が消えたことの実体 */
            const ok = J([
                { name: "a", x: 20, y: 20, columns: [{ name: "id", type: "integer" }] },
                { name: "b", x: 400, y: 20, columns: [{ name: "id", type: "integer" }] },
            ]);
            h.loadJson(ok);
            expect(h.toJson()).toBe(ok);
        });
    });

    describe("XML 互換読み込みにも同じ関門が掛かる（#233 の判断）", () => {
        it("同梱パレットを持たない XML で、壊れていれば今の設計が残る", () => {
            const xml =
                '<?xml version="1.0" encoding="utf-8" ?>\n' +
                "<sql>\n" +
                '<table name="dup" x="20" y="20"><row name="id" null="0" autoincrement="0">' +
                '<datatype>INTEGER</datatype><default>NULL</default></row></table>\n' +
                '<table name="dup" x="400" y="20"><row name="id" null="0" autoincrement="0">' +
                '<datatype>INTEGER</datatype><default>NULL</default></row></table>\n' +
                "</sql>\n";
            h.loadJson(ONE_TABLE);
            let thrown: unknown = null;
            try {
                h.loadFixture(xml);
            } catch (e) {
                thrown = e;
            }
            expect(errorMessage(thrown)).not.toBe(null);
            expect(h.designer.tables.length).toBe(1);
            expect(h.designer.tables[0]!.getTitle()).toBe("keeper");
        });

        it("正しい XML は今までどおり読める", () => {
            expect(() =>
                h.loadFixture(readFixture(SERIALIZER_DB, "relations"))
            ).not.toThrow();
            expect(h.designer.tables.length).toBe(4);
        });
    });
});
