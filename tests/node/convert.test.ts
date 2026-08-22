import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { KIND_FALLBACKS, convertDesign, fallbackIndex } from "../../js/io/convert.ts";
import type { DesignModel } from "../../js/io/model.ts";
import { TypePalette, type TypeKind } from "../../js/io/palette.ts";
import { parseDesignXml } from "../../js/io/xml-parser.ts";
import { DB_PROFILES, REPO_ROOT, readFixture } from "../support/fixtures.ts";

/*
 * プロファイル変換の検査（HANDOVER §6 段階6-10a）。
 *
 * ハーネスを使わない —— js/io/convert.ts が触るのは palette / model / template だけで、
 * どれも js/ の描画側に依存しない（tests/node/type-resolution.test.ts と同じ立場）。
 * DOM は jsdom から借りる。
 *
 * **golden から読み取れないものをここで押さえる。** tests/browser/convert.spec.ts の
 * golden 14 本は「PG の設計を各プロファイル向けに出すとこの DDL になる」を固定するが、
 * *なぜ*その型に寄ったのかは写らない。とくに次の 2 つは golden では見えない:
 *
 *   - **逆向きの劣化を作っていないこと**（timestamp -> date のように情報が黙って消える向き）
 *   - **同じ db なら恒等**であること（既存 golden 56 + 28 本が動かない根拠そのもの）
 */

const dom = new JSDOM("");
const parser = new dom.window.DOMParser();

function paletteOf(db: string): TypePalette {
    const xml = readFileSync(join(REPO_ROOT, "db", db, "datatypes.xml"), "utf8");
    const palette = new TypePalette();
    palette.setRoot(
        parser.parseFromString(xml, "text/xml").documentElement as unknown as Element,
    );
    return palette;
}

/** fixture を読んでモデルにする（そのプロファイルの fixture を、そのパレットで読む） */
function modelOf(db: string, fixture: string): DesignModel {
    const doc = parser.parseFromString(readFixture(db, fixture), "text/xml");
    return parseDesignXml(doc.documentElement as unknown as Element, paletteOf(db));
}

/**
 * 1 テーブル 1 列の設計を組む。**サイズは datatype の括弧で書く**（fixture と同じ形。
 * <size> 要素は無く、js/io/xml-parser.ts が `VARCHAR(255)` から抜き出す）。
 */
function oneColumn(db: string, datatype: string): DesignModel {
    const xml =
        `<sql db="${db}"><table x="0" y="0" name="t">` +
        `<row name="c" null="1" autoincrement="0">` +
        `<datatype>${datatype}</datatype></row>` +
        `</table></sql>`;
    const doc = parser.parseFromString(xml, "text/xml");
    return parseDesignXml(doc.documentElement as unknown as Element, paletteOf(db));
}

function sqlNameAt(palette: TypePalette, index: number): string {
    return palette.typeAt(index).getAttribute("sql") ?? "";
}

/** 変換後の 1 列目の型を人が読める形で */
function firstColumn(
    model: DesignModel,
    palette: TypePalette,
): { sql: string; kind: TypeKind | null; size: string } {
    const row = model.tables[0]!.rows[0]!;
    return {
        sql: sqlNameAt(palette, row.type),
        kind: palette.kindAt(row.type),
        size: row.size,
    };
}

const OTHERS = DB_PROFILES.filter((db) => db !== "postgresql");

describe("同じ db なら恒等", () => {
    /*
     * **これが既存 golden（ddl 56 / orm 28）が 1 バイトも動かない根拠。** 寄せ先の
     * 選び方を素直に通すと「同じ kind の先頭型」に寄って別の型になりうる
     * （postgresql の varchar と text はどちらも string）ので、早期リターンで切っている。
     */
    test("同じインスタンスを渡すとモデルがそのまま返る", () => {
        const palette = paletteOf("postgresql");
        const model = modelOf("postgresql", "house-defaults");
        const result = convertDesign(model, palette, palette);
        expect(result.model).toBe(model);
        expect(result.losses).toEqual([]);
    });

    test("db が同じなら別インスタンスでも恒等", () => {
        const model = modelOf("postgresql", "types-matrix");
        const result = convertDesign(model, paletteOf("postgresql"), paletteOf("postgresql"));
        expect(result.model).toBe(model);
        expect(result.losses).toEqual([]);
    });

    test("8 プロファイルすべてで自分自身への変換が恒等", () => {
        for (const db of DB_PROFILES) {
            const model = modelOf(db, "types-matrix");
            const result = convertDesign(model, paletteOf(db), paletteOf(db));
            expect(result.model, db).toBe(model);
            expect(result.losses, db).toEqual([]);
        }
    });
});

describe("寄せ先の決め方", () => {
    test("同じ id があればそれに寄る（6-7 が全プロファイルで id を共有させた成果）", () => {
        /* postgresql の uuid と h2 の uuid は同じ id なので、kind を見るまでもなく決まる */
        const from = paletteOf("postgresql");
        const to = paletteOf("h2");
        const result = convertDesign(oneColumn("postgresql", "UUID"), from, to);
        const col = firstColumn(result.model, to);
        expect(col.sql).toBe("UUID");
        expect(result.losses).toEqual([]);
    });

    test("id が無くても同じ kind があればそこに寄る", () => {
        /* postgresql の JSONB は mysql に同じ id が無いが、mysql も json kind を持つ */
        const to = paletteOf("mysql");
        const result = convertDesign(
            oneColumn("postgresql", "JSONB"),
            paletteOf("postgresql"),
            to,
        );
        const col = firstColumn(result.model, to);
        expect(col.kind).toBe("json");
        expect(result.losses).toEqual([]);
    });

    test("**Oracle の DATE の罠を踏まない** —— 名前が同じでも値の域が違えば寄せない", () => {
        /*
         * 6-9c の「名前ではなく値の域で決める」の実体。oracle の DATE は時刻を含むので
         * kind は timestamp。postgresql の DATE（kind=date）を名前で寄せると
         * **黙って時刻付きになる**。oracle に date kind は無いので kind-widened で
         * 記録されなければならない（素通ししない）。
         */
        const to = paletteOf("oracle");
        const result = convertDesign(
            oneColumn("postgresql", "DATE"),
            paletteOf("postgresql"),
            to,
        );
        expect(to.candidatesForKind("date")).toEqual([]);
        expect(result.losses.map((l) => l.reason)).toEqual(["kind-widened"]);
        expect(firstColumn(result.model, to).kind).toBe("timestamp");
    });

    test("寄せ先が無ければ落とし先に落ちて unmappable", () => {
        /* postgresql の INET は kind=other。other は逃げ道を持たないのでここで止まる */
        const to = paletteOf("mysql");
        const result = convertDesign(
            oneColumn("postgresql", "INET"),
            paletteOf("postgresql"),
            to,
        );
        expect(result.losses.map((l) => l.reason)).toEqual(["unmappable"]);
        expect(result.model.tables[0]!.rows[0]!.type).toBe(fallbackIndex(to));
    });

    test("サイズを取る型どうしが優先される", () => {
        /* VARCHAR(255) は mysql でもサイズを取る型に寄る（TEXT に落ちてサイズを失わない） */
        const to = paletteOf("mysql");
        const result = convertDesign(
            oneColumn("postgresql", "VARCHAR(255)"),
            paletteOf("postgresql"),
            to,
        );
        const col = firstColumn(result.model, to);
        expect(to.hasSize(result.model.tables[0]!.rows[0]!.type)).toBe(true);
        expect(col.size).toBe("255");
        expect(result.losses).toEqual([]);
    });

    test("寄せ先がサイズを取らなければ捨てて size-dropped", () => {
        /* sqlite は全型が length="0"。TEXT(255) という STRICT が拒む DDL を出さない */
        const to = paletteOf("sqlite");
        const result = convertDesign(
            oneColumn("postgresql", "VARCHAR(255)"),
            paletteOf("postgresql"),
            to,
        );
        expect(firstColumn(result.model, to).size).toBe("");
        expect(result.losses.map((l) => l.reason)).toContain("size-dropped");
    });

    test("kind を持たない旧パレットは名前で寄せる", () => {
        /*
         * 段階4-2b 以前の設計 XML が同梱していた <datatypes> には kind も id も無い。
         * 値の域が分からないので上の罠も判定できず、名前一致に賭けるほうが害が小さい。
         */
        const legacy = new TypePalette();
        legacy.setRoot(
            parser.parseFromString(
                '<datatypes db="legacy"><group label="g" color="#fff">' +
                    '<type label="Text" sql="TEXT" quote="\'" /></group></datatypes>',
                "text/xml",
            ).documentElement as unknown as Element,
        );
        const doc = parser.parseFromString(
            '<sql db="legacy"><table x="0" y="0" name="t">' +
                '<row name="c" null="1" autoincrement="0"><datatype>TEXT</datatype></row>' +
                "</table></sql>",
            "text/xml",
        );
        const model = parseDesignXml(doc.documentElement as unknown as Element, legacy);

        const to = paletteOf("postgresql");
        const result = convertDesign(model, legacy, to);
        expect(firstColumn(result.model, to).sql).toBe("TEXT");
        expect(result.losses).toEqual([]);
    });
});

describe("劣化の向き", () => {
    /*
     * **KIND_FALLBACKS は「値が保たれる」か「劣化が明白で表現はできる」向きしか
     * 持ってはいけない。** 逆向き（timestamp -> date、float64 -> float32）が 1 つでも
     * 入ると、変換が「開いたら別の意味になっていた」を作る側に回る。
     */
    const NARROWING: ReadonlyArray<readonly [TypeKind, TypeKind]> = [
        ["timestamp", "date"],
        ["timestamp_tz", "time"],
        ["timestamp_tz", "date"],
        ["time_tz", "date"],
        ["float64", "float32"],
        ["decimal", "float64"],
        ["decimal", "float32"],
        ["int64", "int32"],
        ["int64", "int16"],
        ["int32", "int16"],
        ["int16", "int8"],
        ["string", "int32"],
        ["string", "uuid"],
    ];

    test("情報が消える向きは 1 つも入っていない", () => {
        for (const [from, to] of NARROWING) {
            const kinds = KIND_FALLBACKS[from].map((f) => f.kind);
            expect(kinds, `${from} -> ${to}`).not.toContain(to);
        }
    });

    test("逃げ道は 21 語の語彙の中で閉じている", () => {
        const vocabulary = new Set(Object.keys(KIND_FALLBACKS));
        expect(vocabulary.size).toBe(21);
        for (const [kind, fallbacks] of Object.entries(KIND_FALLBACKS)) {
            for (const one of fallbacks) {
                expect(vocabulary.has(one.kind), `${kind} -> ${one.kind}`).toBe(true);
                expect(one.kind, kind).not.toBe(kind);
            }
        }
    });

    test("other は逃げ道を持たない（「写せない」の主張だから）", () => {
        expect(KIND_FALLBACKS.other).toEqual([]);
    });
});

describe("8 プロファイルへの変換（全型）", () => {
    /*
     * postgresql の types-matrix（全 24 型が 1 列ずつ）を 7 プロファイルへ流し、
     * **どの列も「同じ kind」「宣言した逃げ道の kind」「既定型」のどれかに着地する**
     * ことを見る。golden では *結果* しか見えないので、規則の側をここで押さえる。
     */
    const from = paletteOf("postgresql");
    const source = modelOf("postgresql", "types-matrix");

    for (const db of OTHERS) {
        test(`postgresql -> ${db}: 着地点がすべて説明できる`, () => {
            const to = paletteOf(db);
            const result = convertDesign(source, from, to);
            const fallbackTo = fallbackIndex(to);

            const sourceRows = source.tables[0]!.rows;
            const rows = result.model.tables[0]!.rows;
            expect(rows.length).toBe(sourceRows.length);

            rows.forEach((row, i) => {
                const before = from.kindAt(sourceRows[i]!.type);
                const after = to.kindAt(row.type);
                const where = `${db} / ${row.title}`;

                /* 添字は寄せ先パレットの有効範囲に収まっていること */
                expect(row.type, where).toBeGreaterThanOrEqual(0);
                expect(row.type, where).toBeLessThan(to.types().length);

                if (before !== null && after === before) {
                    return;
                }
                if (before !== null && KIND_FALLBACKS[before].some((f) => f.kind === after)) {
                    return;
                }
                /* 説明が付かないなら既定型に落ちた（＝ unmappable）はず */
                expect(row.type, where).toBe(fallbackTo);
            });
        });

        test(`postgresql -> ${db}: 落ちた列だけが losses に出る`, () => {
            const to = paletteOf(db);
            const result = convertDesign(source, from, to);

            const sourceRows = source.tables[0]!.rows;
            const rows = result.model.tables[0]!.rows;
            const noted = new Set(result.losses.map((l) => l.column));

            rows.forEach((row, i) => {
                const before = from.kindAt(sourceRows[i]!.type);
                const sizeLost = sourceRows[i]!.size !== "" && row.size === "";
                /* 寄せ先の文字列型がサイズを要求するのに設計側に無い（mssql の nvarchar） */
                const needsSize =
                    row.size === "" &&
                    to.hasSize(row.type) &&
                    to.kindAt(row.type) === "string";
                const changed = before !== to.kindAt(row.type) || sizeLost || needsSize;
                expect(noted.has(row.title), `${db} / ${row.title}`).toBe(changed);
            });
        });
    }

    test("losses は設計の順に並ぶ（決定論）", () => {
        const to = paletteOf("sqlite");
        const first = convertDesign(source, from, to);
        const second = convertDesign(source, from, to);
        expect(JSON.stringify(second.losses)).toBe(JSON.stringify(first.losses));
        expect(JSON.stringify(second.model)).toBe(JSON.stringify(first.model));
    });
});

describe("型以外は写さない", () => {
    const from = paletteOf("postgresql");
    const to = paletteOf("mysql");
    const source = modelOf("postgresql", "house-defaults");
    const result = convertDesign(source, from, to);

    test("テーブル名・座標・コメント・キー・関係がそのまま", () => {
        result.model.tables.forEach((table, i) => {
            const before = source.tables[i]!;
            expect(table.title).toBe(before.title);
            expect(table.x).toBe(before.x);
            expect(table.y).toBe(before.y);
            expect(table.comment).toBe(before.comment);
            expect(table.keys).toBe(before.keys);
            table.rows.forEach((row, j) => {
                expect(row.title).toBe(before.rows[j]!.title);
                expect(row.relations).toBe(before.rows[j]!.relations);
            });
        });
    });

    test("**既定値は 1 文字も触らない**（関数名の対応表を持たない判断）", () => {
        /*
         * uuidv7() は mysql に無い。それでもここでは書き換えず、DDL がそのまま出て
         * DB が拒む側に倒してある —— 黙って別の関数に変えるより気づける。
         */
        const defs = result.model.tables.flatMap((t) => t.rows.map((r) => r.def));
        const before = source.tables.flatMap((t) => t.rows.map((r) => r.def));
        expect(defs).toEqual(before);
        expect(defs).toContain("uuidv7()");
    });

    test("null 許可と autoincrement もそのまま", () => {
        result.model.tables.forEach((table, i) => {
            table.rows.forEach((row, j) => {
                const before = source.tables[i]!.rows[j]!;
                expect(row.nll).toBe(before.nll);
                expect(row.ai).toBe(before.ai);
            });
        });
    });
});
