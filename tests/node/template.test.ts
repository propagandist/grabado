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
 *   1. 各プロファイルが house 既定を最も近く表す 3 列を返すこと（何を失うかがここに出る）
 *   2. <template> を持たないパレットでは空 = 呼び手が従来経路に落ちること
 *      （**段階6-8d で 8 本すべてが持つようになった**ので、これは旧 XML 同梱パレット向け）
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

/** <template> を持たないパレット（旧 XML 同梱の形）。段階6-8d 以降、実プロファイルには無い */
function templatelessPalette(): TypePalette {
    return paletteFromXml(
        '<datatypes db="x"><group label="g">' +
            '<type id="a" label="A" sql="AAA" quote="" /></group></datatypes>'
    );
}

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
    test("8 プロファイルすべてが <template> と newrowtype を持つ", () => {
        /*
         * **段階6-8d で反転した主張。** 6-8c まではここが「未現代化の N 本は持たない」を
         * 数える形で、現代化のたびに N が減っていた（6-4 で postgresql、6-7a〜6-7c で新設
         * 3 本、6-8a〜6-8d で既存 4 本）。sqlite が最後の 1 本。
         *
         * 空振り防止（検査対象が 1 本もないのに緑になる）の役目はそのまま引き継いでいる。
         */
        const missing = DB_PROFILES.filter((db) => {
            const palette = paletteOf(db);
            return (
                readTemplate(palette).length === 0 ||
                !palette.element().getAttribute("newrowtype")
            );
        });

        expect(missing).toEqual([]);
        expect(DB_PROFILES.length).toBe(8);
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

    /*
     * sqlite（段階6-8d）。**STRICT テーブルには 5 型しか無く、uuid 生成関数も日時型も無い**ので、
     * house 既定の PK は TEXT で既定値を持たない（sql-standard に続く 2 本目）。監査列も TEXT。
     * 「テンプレートは各プロファイルが house 既定を最も近く表す形で持つ」の、いちばん厳しい側。
     */
    test("sqlite の PK は TEXT で既定値を持たない（生成関数が無い）", () => {
        const palette = paletteOf("sqlite");
        const rows = readTemplate(palette);

        expect(rows.map((r) => r.name)).toEqual(["id", "created_at", "updated_at"]);
        expect(rows[0]).toEqual({
            name: "id",
            data: {
                type: palette.indexOfId("text"),
                size: "",
                def: "",
                nll: false,
                ai: false,
            },
            primary: true,
        });
        /* 監査列も TEXT。STRICT に日時型がそもそも無い */
        for (const row of rows.slice(1)) {
            expect(row.data.type).toBe(palette.indexOfId("text"));
            expect(row.data.def).toBe("CURRENT_TIMESTAMP");
            expect(row.primary).toBe(false);
        }
    });

    test("<template> を持たないパレットは空を返し、呼び手が従来経路に落ちる", () => {
        /*
         * **段階6-8d で寄せ先が実プロファイルから人工パレットに移った。** 8 本すべてが
         * <template> を持つようになったが、**旧 XML 同梱の <datatypes> を読む経路
         * （Designer.fromXML）は実アプリに生きている**ので、その形を無防備にしない。
         * js/tablemanager.ts はここが false のときだけ従来の「id 1 列 ＋ autoincrement」を作る。
         */
        expect(readTemplate(templatelessPalette())).toEqual([]);
        expect(applyTemplate(recordingTable().table, templatelessPalette())).toBe(false);
    });

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

        test("sqlite は text を指す（添字 0 は integer）", () => {
            const palette = paletteOf("sqlite");
            expect(newRowType(palette)).toBe(palette.indexOfId("text"));
            expect(newRowType(palette)).not.toBe(0);
        });

        test("属性を持たないパレットは添字 0（旧パレット互換）", () => {
            /* 段階6-8d で寄せ先が実プロファイルから人工パレットに移った（上の <template> と同じ） */
            expect(newRowType(templatelessPalette())).toBe(0);
        });

        test("実在しない id を指していれば例外", () => {
            const palette = paletteFromXml(
                '<datatypes db="probe" newrowtype="nope">' +
                    '<type id="t" label="T" sql="T" /></datatypes>'
            );
            expect(() => newRowType(palette)).toThrow(/nope/);
        });
    });
});
