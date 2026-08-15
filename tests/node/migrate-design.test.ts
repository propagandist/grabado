import { describe, expect, test } from "vitest";
import {
    migrateDesignJson,
    readPalette,
} from "../../tools/migrate-design.mjs";
import { SERIALIZER_DB } from "../support/fixtures.ts";

/*
 * 設計 JSON の移行ツールの検査（HANDOVER §4 段階4-2b）。
 *
 * ツールが serializer と同じバイト列を書くことは、json の golden テスト
 * （tests/node/json.test.ts と tests/browser/json.spec.ts）が証明する ——
 * tests/golden/json/ の 7 本は**このツールで移行したもの**で、
 * それが serializer の出力と一致するかを golden テストが毎回見ている。
 * ここで押さえるのは変換そのものの規則（冪等・正規形の要求・移行できない入力の扱い）。
 */

const palettes = new Map<string, ReturnType<typeof readPalette>>();
const loadPalette = (db: string) => {
    if (!palettes.has(db)) {
        palettes.set(db, readPalette(db));
    }
    return palettes.get(db)!;
};

/** serializer が書く形（2 スペース・末尾 LF 1 つ）で v1 を組む */
function v1(design: unknown): string {
    return `${JSON.stringify(design, null, 2)}\n`;
}

const MINIMAL_V1 = v1({
    formatVersion: 1,
    db: "postgresql",
    tables: [
        {
            name: "things",
            x: 10,
            y: 20,
            columns: [{ name: "id", type: "Integer" }],
        },
    ],
});

describe("設計 JSON の移行（v1 -> v2）", () => {
    test("label を同じ <type> の id に置き換え、版を 2 に上げる", () => {
        const out = migrateDesignJson(MINIMAL_V1, loadPalette);

        expect(out.changed).toBe(true);
        expect(JSON.parse(out.text)).toEqual({
            formatVersion: 2,
            db: "postgresql",
            tables: [
                {
                    name: "things",
                    x: 10,
                    y: 20,
                    columns: [{ name: "id", type: "integer" }],
                },
            ],
        });
    });

    test("type 以外のキーは位置も値も動かさない", () => {
        /*
         * 移行コミットの diff が type 行と formatVersion 行だけになることの根拠。
         * キーの順序が保たれるので、行単位の diff が最小になる。
         */
        const before = v1({
            formatVersion: 1,
            db: "postgresql",
            tables: [
                {
                    name: "t",
                    x: 1,
                    y: 2,
                    comment: "コメント",
                    columns: [
                        {
                            name: "c",
                            type: "Varchar",
                            size: "10",
                            nullable: true,
                            autoincrement: true,
                            default: "x",
                            comment: "列",
                            references: [{ table: "t", column: "c" }],
                        },
                    ],
                    keys: [{ type: "PRIMARY", name: "t_pkey", columns: ["c"] }],
                },
            ],
        });

        const after = migrateDesignJson(before, loadPalette).text;

        const changed = after
            .split("\n")
            .filter((line, i) => line !== before.split("\n")[i]);
        expect(changed).toEqual([
            '  "formatVersion": 2,',
            '          "type": "varchar",',
        ]);
    });

    test("冪等: すでに v2 なら入力をそのまま返す", () => {
        const once = migrateDesignJson(MINIMAL_V1, loadPalette);
        const twice = migrateDesignJson(once.text, loadPalette);

        expect(twice.changed).toBe(false);
        expect(twice.text).toBe(once.text);
    });

    test("db キーが無ければ --db で補う", () => {
        const noDb = v1({
            formatVersion: 1,
            tables: [
                {
                    name: "t",
                    x: 0,
                    y: 0,
                    columns: [{ name: "c", type: "Integer" }],
                },
            ],
        });

        expect(() => migrateDesignJson(noDb, loadPalette)).toThrow(/--db/);
        expect(
            JSON.parse(
                migrateDesignJson(noDb, loadPalette, { db: SERIALIZER_DB }).text,
            ).db,
        ).toBe(SERIALIZER_DB);
    });

    test("serializer が書いた正規形でなければ変換せずに落とす", () => {
        /*
         * 手編集されたファイルを黙って書き直すと、移行コミットに意図しない差分
         * （数値リテラルの表記揺れ・キー順の入れ替え・インデントの違い）が紛れ込む。
         * それは「移行だけが入っている」という PR の主張を壊す。
         */
        const fourSpaces = JSON.stringify(JSON.parse(MINIMAL_V1), null, 4) + "\n";
        expect(() => migrateDesignJson(fourSpaces, loadPalette)).toThrow(/正規形/);

        const noTrailingLf = MINIMAL_V1.trimEnd();
        expect(() => migrateDesignJson(noTrailingLf, loadPalette)).toThrow(/正規形/);
    });

    test("パレットに無い label は位置つきで落とす（勝手に寄せない）", () => {
        const unknown = v1({
            formatVersion: 1,
            db: "postgresql",
            tables: [
                {
                    name: "t",
                    x: 0,
                    y: 0,
                    columns: [{ name: "c", type: "存在しない型" }],
                },
            ],
        });

        expect(() => migrateDesignJson(unknown, loadPalette)).toThrow(
            /tables\[0\]\.columns\[0\]\.type/,
        );
    });

    test("版が 1 でも 2 でもなければ落とす", () => {
        const v3 = v1({ formatVersion: 3, db: "postgresql", tables: [] });
        expect(() => migrateDesignJson(v3, loadPalette)).toThrow(/formatVersion/);
    });
});

describe("移行ツールが読む型パレット", () => {
    test("label -> id が全 <type> ぶん引ける", () => {
        const pg = readPalette("postgresql");

        expect(pg.labelToId.get("Integer")).toBe("integer");
        expect(pg.labelToId.get("Big Integer")).toBe("bigint");
        expect(pg.labelToId.get("Timestamp w/ TZ")).toBe(
            "timestamp_with_time_zone",
        );
        /* known-issue #3 の本体。sql が BIGINT で重複しているので x_ が付く */
        expect(pg.labelToId.get("Real")).toBe("x_real");
        expect(pg.ids.size).toBe(pg.labelToId.size);
    });
});
