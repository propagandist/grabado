import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
    migrateDesignJson,
    readPalette,
} from "../../tools/migrate-design.mjs";
import { REPO_ROOT, SERIALIZER_DB } from "../support/fixtures.ts";

/*
 * 設計 JSON の移行ツールの検査（HANDOVER §4 段階4-2b ＋ §6 段階6-3）。
 *
 * ツールが serializer と同じバイト列を書くことは、json の golden テスト
 * （tests/node/json.test.ts と tests/browser/json.spec.ts）が証明する ——
 * tests/golden/json/ の 7 本は**このツールで移行したもの**で、
 * それが serializer の出力と一致するかを golden テストが毎回見ている。
 * ここで押さえるのは変換そのものの規則（冪等・正規形の要求・移行できない入力の扱い）。
 *
 * 移行は 2 種類ある（tools/migrate-design.mjs の冒頭）。**A. 形式 v1 -> v2**（4-2b。
 * 型キーが label から id になった）と **B. 型 id の移行**（6-3。PG18 パレット差し替えで
 * 型が消える / 意味が変わる）。B は意味的判断を含むので、表そのものをここでリテラルで固定する。
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
        /* 6-3 で label が Timestamp w/ TZ から変わった（label は §6 が動かしてよい） */
        expect(pg.labelToId.get("Timestamptz")).toBe("timestamp_with_time_zone");
        /* 6-3 の新設 2 型 */
        expect(pg.labelToId.get("UUID")).toBe("uuid");
        expect(pg.labelToId.get("Big Integer (identity)")).toBe("bigint_identity");
        expect(pg.ids.size).toBe(pg.labelToId.size);
    });
});

/* ------------------------- 型 id の移行（段階6-3） ------------------------- */

/** serializer が書く形で v2 を組む */
function v2(design: unknown): string {
    return `${JSON.stringify(design, null, 2)}\n`;
}

/** db/<db>/datatypes.xml の <type id="..."> が持つ length 属性（無ければ undefined） */
function paletteLength(db: string, id: string): string | undefined {
    const xml = readFileSync(join(REPO_ROOT, "frontend", "db", db, "datatypes.xml"), "utf8");
    for (const tag of xml.match(/<type\s[^>]*?\/>/g) ?? []) {
        if (/\sid="([^"]*)"/.exec(tag)?.[1] === id) {
            return /\slength="([^"]*)"/.exec(tag)?.[1];
        }
    }
    throw new Error(`${db} に型 id ${id} が無い`);
}

/** 1 列だけの v2 設計。type / size を差し替えて使う */
function oneColumn(column: Record<string, unknown>): string {
    return v2({
        formatVersion: 2,
        db: "postgresql",
        tables: [{ name: "t", x: 0, y: 0, columns: [column] }],
    });
}

function migratedType(column: Record<string, unknown>): Record<string, unknown> {
    const out = migrateDesignJson(oneColumn(column), loadPalette);
    return JSON.parse(out.text).tables[0].columns[0];
}

/**
 * 段階6-3 の移行表（CUSTOMIZATIONS.md の 6-0 で設計、6-3 で実装）。
 *
 * **ここが唯一「意味的判断」を固定している場所。** 表を動かすと git 管理下の設計ファイルが
 * 別の型で開くので、変えるときは移行の再実行が要る。
 */
const TYPE_MIGRATION_TABLE: ReadonlyArray<readonly [string, string]> = [
    ["serial", "bigint_identity"],
    ["bigserial", "bigint_identity"],
    ["x_real", "bigint"],
    ["char", "text"],
    ["timestamp", "timestamp_with_time_zone"],
    ["timestamp_without_time_zone", "timestamp_with_time_zone"],
    ["json", "jsonb"],
];

describe("設計 JSON の移行（型 id・段階6-3）", () => {
    test("撤去された 7 型が寄せ先の id になる", () => {
        const actual = TYPE_MIGRATION_TABLE.map(
            ([from]) => [from, migratedType({ name: "c", type: from }).type] as const,
        );
        expect(actual).toEqual(TYPE_MIGRATION_TABLE.map(([f, t]) => [f, t]));
    });

    test("寄せ先がサイズを取らない型なら size キーを落とす", () => {
        /*
         * char(10) -> text は length="1" から "0" への移動。size を残すと TEXT(10) という
         * 構文として壊れた DDL が出る（情報の損失は移行表に明記。CUSTOMIZATIONS.md の 6-0）。
         * 同じ判断は読み込み側（js/io/xml-parser.ts）にもあり、一致は golden が見る。
         */
        expect(migratedType({ name: "c", type: "char", size: "10" })).toEqual({
            name: "c",
            type: "text",
        });
    });

    test("寄せ先がサイズを取るなら size を残す", () => {
        /*
         * timestamp(3) -> timestamptz(3)。**6-0 の移行表はここを「落ちる」側に書いていたが、
         * PG の timestamptz(p) は秒精度を取れる**ので保つほうが情報を失わない（6-3 で訂正。
         * パレット側も length="0" -> "1" に直してある）。
         */
        expect(migratedType({ name: "c", type: "timestamp", size: "3" })).toEqual({
            name: "c",
            type: "timestamp_with_time_zone",
            size: "3",
        });

        /* serial / bigserial / x_real / json は length="0" 同士なので size は元から無い */
        expect(migratedType({ name: "c", type: "serial" })).toEqual({
            name: "c",
            type: "bigint_identity",
        });
        /* 移行対象でない型の size は当然そのまま */
        expect(migratedType({ name: "c", type: "decimal", size: "12,2" })).toEqual({
            name: "c",
            type: "decimal",
            size: "12,2",
        });
    });

    test("type と size 以外のキーは位置も値も動かさない", () => {
        const before = v2({
            formatVersion: 2,
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
                            type: "json",
                            nullable: true,
                            default: "'{}'",
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
        /* formatVersion は動かない（6-3 は版を上げない） */
        expect(changed).toEqual(['          "type": "jsonb",']);
    });

    test("冪等: 移行対象が無ければ入力をそのまま返す", () => {
        const once = migrateDesignJson(oneColumn({ name: "c", type: "json" }), loadPalette);
        const twice = migrateDesignJson(once.text, loadPalette);

        expect(once.changed).toBe(true);
        expect(twice.changed).toBe(false);
        expect(twice.text).toBe(once.text);
    });

    test("移行対象が無い v2 は正規形でなくても触らない（4-2b の挙動を保つ）", () => {
        /*
         * glob でコマンドを当てたときに、移行するものが無いファイルを「正規形ではない」で
         * 落とさない。検査は**これから書き換えるファイル**にだけ掛ける。
         */
        const fourSpaces =
            JSON.stringify(JSON.parse(oneColumn({ name: "c", type: "text" })), null, 4) + "\n";
        const out = migrateDesignJson(fourSpaces, loadPalette);
        expect(out.changed).toBe(false);
        expect(out.text).toBe(fourSpaces);
    });

    test("移行対象を持つ v2 は正規形でなければ落とす", () => {
        const fourSpaces =
            JSON.stringify(JSON.parse(oneColumn({ name: "c", type: "json" })), null, 4) + "\n";
        expect(() => migrateDesignJson(fourSpaces, loadPalette)).toThrow(/正規形/);
    });

    test("移行表とパレットが食い違えば位置つきで落とす", () => {
        /*
         * 表とパレットは同じ PR に入る決まりだが、片方だけ動いたときに**黙って読めない
         * ファイルを書く**のが最悪の失敗。ツール側でも止める（js/io/json-parser.ts の
         * 未知 id throw と二重化）。移行先を持たないパレットを渡して再現する。
         */
        const brokenPalette = () => ({
            labelToId: new Map([["Text", "text"]]),
            ids: new Set(["text"]),
        });
        expect(() =>
            migrateDesignJson(oneColumn({ name: "c", type: "json" }), brokenPalette),
        ).toThrow(/移行先 "jsonb" が型パレットに無い/);
    });

    test("移行表に無い未知の id はツールが通す（読み込み側が落とす）", () => {
        /*
         * ツールは「表に載っている型」だけを動かす。表にも現行パレットにも無い id は
         * そのまま残り、js/io/json-parser.ts が読み込み時に位置つきで throw する
         * （4-2b から一貫している「正本を黙って別の型で開かない」）。
         * ツールが勝手に寄せると、移行表に無い判断を静かに下すことになる。
         */
        const out = migrateDesignJson(oneColumn({ name: "c", type: "mediumtext" }), loadPalette);
        expect(out.changed).toBe(false);
        expect(JSON.parse(out.text).tables[0].columns[0].type).toBe("mediumtext");
    });

    test("db ごとに表を引く（他プロファイルの同名 id を巻き込まない）", () => {
        /*
         * 型 id はプロファイル内で一意なだけ。**postgresql の char は text に寄るが、
         * mysql / mssql / oracle の char はどれも現役の型**なので 1 バイトも動かない。
         * 6-9a で 4 プロファイルぶんの表がそろったぶん、この分離が実際に効くようになった。
         */
        for (const db of ["mysql", "mssql", "oracle"]) {
            const design = v2({
                formatVersion: 2,
                db,
                tables: [{ name: "t", x: 0, y: 0, columns: [{ name: "c", type: "char" }] }],
            });
            const out = migrateDesignJson(design, loadPalette);
            expect([db, out.changed, out.text]).toEqual([db, false, design]);
        }
    });
});

/* ------------------ 6-8a〜6-8d の現代化ぶん（段階6-9a） ------------------ */

/**
 * 段階6-9a の移行表。**6-8a〜6-8c は撤去した型 id があるのに表を入れていなかった**ので、
 * 旧い設計 JSON がその 3 プロファイルで移行できない状態だった（sqlite は 6-8d で入れてある）。
 *
 * 6-3 の表と同じく、**ここが唯一「意味的判断」を固定している場所**。寄せ先の根拠は
 * 各プロファイルの新パレットの `aka`（旧 sql 名 -> 新型）で、表と aka が同じ判断を
 * 指していることを目で確かめられるようにしてある。判断の記録は CUSTOMIZATIONS.md の段階6-9a。
 */
const MODERNIZED_MIGRATIONS: ReadonlyArray<readonly [string, string, string]> = [
    /* 6-8a mysql */
    ["mysql", "int", "integer"],
    ["mysql", "mediumtext", "text"],
    ["mysql", "blob", "bytea"],
    /* 6-8b mssql —— 撤去 10 型。大半が SQL Server 側で非推奨だったもの */
    ["mssql", "int", "integer"],
    ["mssql", "money", "decimal"],
    ["mssql", "smallmoney", "decimal"],
    ["mssql", "numeric", "decimal"],
    ["mssql", "text", "nvarchar"],
    ["mssql", "ntext", "nvarchar"],
    ["mssql", "bit", "boolean"],
    ["mssql", "image", "varbinary"],
    /* **T-SQL の timestamp は日時ではない**（rowversion の旧称）。datetime2 に寄せると意味が変わる */
    ["mssql", "timestamp", "rowversion"],
    ["mssql", "uniqueidentifier", "uuid"],
    /* id は変わらないが 6-8b が length="1" -> "0" に直したので size だけ落ちる */
    ["mssql", "sql_variant", "sql_variant"],
    /* 6-8c oracle —— 撤去は 1 型だけ（6-8c は新設が 9 型の段階だった） */
    ["oracle", "double_precision", "float"],
    /* 6-8d sqlite */
    ["sqlite", "numeric", "any"],
    ["sqlite", "none", "any"],
    ["sqlite", "text", "text"],
];

describe("設計 JSON の移行（型 id・段階6-8a〜6-8d ぶん）", () => {
    function migratedIn(db: string, column: Record<string, unknown>) {
        const design = v2({
            formatVersion: 2,
            db,
            tables: [{ name: "t", x: 0, y: 0, columns: [column] }],
        });
        return JSON.parse(migrateDesignJson(design, loadPalette).text).tables[0].columns[0];
    }

    test("撤去・改名された 17 型が寄せ先の id になる", () => {
        const actual = MODERNIZED_MIGRATIONS.map(
            ([db, from]) => [db, from, migratedIn(db, { name: "c", type: from }).type] as const,
        );
        expect(actual).toEqual(MODERNIZED_MIGRATIONS.map(([db, f, t]) => [db, f, t]));
    });

    test("**移行表の dropSize が寄せ先パレットの length と一致している**", () => {
        /*
         * tools/migrate-design.mjs の冒頭が「判断は db/<db>/datatypes.xml の length と
         * 一致していなければならない」と宣言している契約を、機械で見る（段階6-9a で足した）。
         * それまでは golden 経由の間接的な検査しか無く、**表を手で書くたびに漏れうる形**
         * だった —— 実際 6-9a は 17 件のうち 8 件で dropSize が要ることに、この検査を
         * 書いて初めて気づける状態にした。
         *
         * 見方: size を持つ列を移行させ、寄せ先が length="0" なら size キーが消えること、
         * length="1" なら残ることを、表の全件について確かめる。
         */
        const wrong: string[] = [];

        for (const [db, from] of MODERNIZED_MIGRATIONS) {
            const out = migratedIn(db, { name: "c", type: from, size: "10" });
            const takesSize = paletteLength(db, out.type) !== "0";
            const kept = out.size !== undefined;
            if (takesSize !== kept) {
                wrong.push(
                    `${db}/${from} -> ${out.type}: length="${paletteLength(db, out.type)}" なのに ` +
                        (kept ? "size が残っている" : "size が落ちている"),
                );
            }
        }

        expect(wrong).toEqual([]);
    });
});
