import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { TypePalette } from "../../js/io/palette.ts";
import {
    applyTemplate,
    newRowType,
    readTemplate,
} from "../../js/io/template.ts";
import type { Table } from "../../js/table.ts";
import type { Row, RowData } from "../../js/row.ts";
import { DB_PROFILES, REPO_ROOT } from "../support/fixtures.ts";

/*
 * §6.2 初期テーブルテンプレートの検査（HANDOVER §6 段階6-4）。
 *
 * ハーネスを使わない —— js/io/template.ts の import は型だけなので、
 * tests/node/type-resolution.test.ts と同じ立場で直に叩ける。DOM だけ jsdom から借りる。
 *
 * ここが押さえるのは 3 つ:
 *   1. postgresql が §6.2 の 3 列を返すこと（house 既定そのもの）
 *   2. 未現代化の 4 本では空 = 呼び手が従来経路に落ちること（6-8 まで有効な安全網）
 *   3. applyTemplate が Table に対して呼ぶ順序（PK を先に作り、key の行が対応すること）
 *
 * 型 id が実在することは tests/node/palette-id.test.ts が全プロファイルで見る。
 */

const dom = new JSDOM("");
const parser = new dom.window.DOMParser();

function paletteOf(db: string): TypePalette {
    return paletteFromXml(
        readFileSync(join(REPO_ROOT, "db", db, "datatypes.xml"), "utf8")
    );
}

function paletteFromXml(xml: string): TypePalette {
    const palette = new TypePalette();
    palette.setRoot(
        parser.parseFromString(xml, "text/xml")
            .documentElement as unknown as Element
    );
    return palette;
}

const STRICT_PROFILES = DB_PROFILES.filter((db) => paletteOf(db).isStrict());
const LEGACY_PROFILES = DB_PROFILES.filter((db) => !paletteOf(db).isStrict());

/** 呼ばれた順に記録するだけの Table。実体を使わないのは描画 DOM を要求するため */
interface Recorded {
    readonly calls: string[];
    readonly table: Table;
}

function recordingTable(): Recorded {
    const calls: string[] = [];
    const keyRows: string[] = [];
    const table = {
        addRow(title: string, data?: Partial<RowData>): Row {
            calls.push(
                `row ${title} type=${data?.type} def=${data?.def} nll=${data?.nll} ai=${data?.ai}`
            );
            return { title } as unknown as Row;
        },
        addKey(type?: string) {
            calls.push(`key ${type}`);
            return {
                addRow(r: Row) {
                    keyRows.push((r as unknown as { title: string }).title);
                    calls.push(`key.addRow ${(r as unknown as { title: string }).title}`);
                },
            };
        },
    };
    return { calls, table: table as unknown as Table };
}

describe("初期テーブルテンプレート（段階6-4）", () => {
    test("検査対象のプロファイルがある（空振りしていないこと）", () => {
        /*
         * 新設 3 本（6-7a sql-standard / 6-7b h2 / 6-7c mariadb）はすべて strict。
         * **6-8 で 1 本ずつ既存プロファイルが移り、4 本とも移ると LEGACY が空になる**
         * （そのとき下の「テンプレートを持たない」テストごと消える）。6-8a で mysql が移った。
         */
        expect(STRICT_PROFILES).toEqual([
            "h2",
            "mariadb",
            "mssql",
            "mysql",
            "postgresql",
            "sql-standard",
        ]);
        expect(LEGACY_PROFILES.length).toBe(2);
    });

    test("postgresql は §6.2 の 3 列を返す", () => {
        const palette = paletteOf("postgresql");
        const rows = readTemplate(palette);

        expect(rows.map((r) => r.name)).toEqual([
            "id",
            "created_at",
            "updated_at",
        ]);
        /* uuidv7 PK。null="0" なので nll は false（NOT NULL）、identity ではない */
        expect(rows[0]).toEqual({
            name: "id",
            data: {
                type: palette.indexOfId("uuid"),
                size: "",
                def: "uuidv7()",
                nll: false,
                ai: false,
            },
            primary: true,
        });
        /* 監査列は timestamptz NOT NULL DEFAULT now()。PK には入らない */
        for (const row of rows.slice(1)) {
            expect(row.data.type).toBe(
                palette.indexOfId("timestamp_with_time_zone")
            );
            expect(row.data.def).toBe("now()");
            expect(row.data.nll).toBe(false);
            expect(row.primary).toBe(false);
        }
    });

    /*
     * sql-standard（段階6-7a）。**標準に UUID 型も生成関数も無い**ので、house 既定の PK は
     * CHARACTER(36) で既定値を持たない —— 「テンプレートは各プロファイルが house 既定を
     * 最も近く表す形で持つ」という 6-7a の判断が、いちばんはっきり出るのがこの 1 行。
     */
    test("sql-standard の PK は CHARACTER(36) で既定値を持たない", () => {
        const palette = paletteOf("sql-standard");
        const rows = readTemplate(palette);

        expect(rows.map((r) => r.name)).toEqual(["id", "created_at", "updated_at"]);
        expect(rows[0]).toEqual({
            name: "id",
            data: {
                type: palette.indexOfId("char"),
                size: "36",
                def: "",
                nll: false,
                ai: false,
            },
            primary: true,
        });
        /* 監査列は標準の TIMESTAMP WITH TIME ZONE ＋ CURRENT_TIMESTAMP（tz を失わない） */
        for (const row of rows.slice(1)) {
            expect(row.data.type).toBe(palette.indexOfId("timestamp_with_time_zone"));
            expect(row.data.def).toBe("CURRENT_TIMESTAMP");
            expect(row.primary).toBe(false);
        }
    });

    for (const db of LEGACY_PROFILES) {
        test(`${db} はテンプレートを持たない（従来経路に落ちる）`, () => {
            expect(readTemplate(paletteOf(db))).toEqual([]);
            expect(applyTemplate(recordingTable().table, paletteOf(db))).toBe(
                false
            );
        });
    }

    test("applyTemplate は PRIMARY を先に作り、key の行だけを入れる", () => {
        const rec = recordingTable();
        expect(applyTemplate(rec.table, paletteOf("postgresql"))).toBe(true);

        const uuid = paletteOf("postgresql").indexOfId("uuid");
        const ts = paletteOf("postgresql").indexOfId("timestamp_with_time_zone");
        expect(rec.calls).toEqual([
            "key PRIMARY",
            `row id type=${uuid} def=uuidv7() nll=false ai=false`,
            "key.addRow id",
            `row created_at type=${ts} def=now() nll=false ai=false`,
            `row updated_at type=${ts} def=now() nll=false ai=false`,
        ]);
    });

    test("key を持つ行が無ければ PRIMARY を作らない", () => {
        const palette = paletteFromXml(
            '<datatypes db="probe"><template>' +
                '<row name="note" type="t" null="1" />' +
                '</template><type id="t" label="T" sql="T" /></datatypes>'
        );
        const rec = recordingTable();

        expect(applyTemplate(rec.table, palette)).toBe(true);
        expect(rec.calls).toEqual(["row note type=0 def= nll=true ai=false"]);
    });

    test("型 id がパレットに無ければ例外（黙って先頭型に落とさない）", () => {
        const palette = paletteFromXml(
            '<datatypes db="probe"><template>' +
                '<row name="id" type="does_not_exist" />' +
                '</template><type id="t" label="T" sql="T" /></datatypes>'
        );
        expect(() => readTemplate(palette)).toThrow(/does_not_exist/);
    });

    describe("newrowtype（Add row の既定型）", () => {
        test("postgresql は text を指す", () => {
            const palette = paletteOf("postgresql");
            expect(newRowType(palette)).toBe(palette.indexOfId("text"));
            /* text が添字 0 でないこと = この属性が実際に効いていること */
            expect(newRowType(palette)).not.toBe(0);
        });

        for (const db of LEGACY_PROFILES) {
            test(`${db} は属性を持たず添字 0（従来どおり）`, () => {
                expect(newRowType(paletteOf(db))).toBe(0);
            });
        }

        test("実在しない id を指していれば例外", () => {
            const palette = paletteFromXml(
                '<datatypes db="probe" newrowtype="nope">' +
                    '<type id="t" label="T" sql="T" /></datatypes>'
            );
            expect(() => newRowType(palette)).toThrow(/nope/);
        });
    });
});
