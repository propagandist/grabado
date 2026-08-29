import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { convertDesign } from "../../frontend/js/io/convert.ts";
import { buildDdlModel } from "../../frontend/js/io/ddl/shared.ts";
import type { DesignModel } from "../../frontend/js/io/model.ts";
import { generateOrm } from "../../frontend/js/io/orm/generate.ts";
import { TypePalette } from "../../frontend/js/io/palette.ts";
import { parseDesignXml } from "../../frontend/js/io/xml-parser.ts";
import { DB_PROFILES, REPO_ROOT } from "../support/fixtures.ts";

/*
 * 「house 既定が各 DB で何になるか」の表を、実装と docs で突き合わせる（§6 段階6-10b）。
 *
 * 6-7 が「**この表そのものが公開プロダクトの価値情報**」と書きながら、置き場所が無いまま
 * 記録に埋もれていたもの。6-10 のプロファイル変換が「何が失われるか」を出す機能そのものなので、
 * 実装が入ったここで docs に出した。
 *
 * **手で書いた表は必ず腐る**（tests/support/fixtures.ts のコメントが実際に腐っていた）ので、
 * docs/TYPE-MAPPING.md の表を読み、convertDesign の実際の出力と 1 セルずつ比べる。
 * パレットを触れば docs が赤くなり、docs を直せばパレットとの食い違いが赤くなる。
 *
 * ★ **ORM の表も同じ形で足した**（issue #122）。2 度先送りされていたもので、難所は 2 つ ——
 *   **Drizzle は core ごとに型が違う**（列が 3 本要る）ことと、**ORM の出力はコード**なので
 *   セルに何を書くかを決める必要があること。下の ORM_COLUMNS と typeCells がその回答。
 */

const dom = new JSDOM("");
const parser = new dom.window.DOMParser();

const DOC = join(REPO_ROOT, "docs", "TYPE-MAPPING.md");

/** 表のある節。**見出しで区切る**（下の sectionLines の★） */
const DDL_SECTION = "## house 既定 8 型の写り方";
const ORM_SECTION = "## ORM 3 本での写り方";

/** house 既定（CLAUDE.md「スキーマ既定」）で実際に使う型。`<datatype>` の綴りで書く */
const HOUSE_TYPES: ReadonlyArray<{ readonly column: string; readonly datatype: string }> =
    Object.freeze([
        { column: "id", datatype: "UUID" },
        { column: "name", datatype: "TEXT" },
        { column: "amount", datatype: "NUMERIC(12,2)" },
        { column: "count", datatype: "INTEGER" },
        { column: "is_active", datatype: "BOOLEAN" },
        { column: "published_on", datatype: "DATE" },
        { column: "created_at", datatype: "TIMESTAMPTZ" },
        { column: "payload", datatype: "JSONB" },
    ]);

/**
 * ORM 表の列（issue #122）。**JPA と Prisma は 1 列で足りる** —— どちらも正規型（kind）から
 * 型が決まり、**下敷きの DB に依らない**（Prisma の provider は `datasource` ブロックだけ）。
 *
 * ★ **Drizzle だけ 3 列要る。** 型そのものが core 依存で、6-9e の「表 1 つで書ける」という
 *   見立ては 6-9f の実測で外れた。**core は db プロファイルから決まる**ので、列を分ける
 *   にはプロファイルを変えて出すしかない —— それがこの表の `db`。
 */
const ORM_COLUMNS = Object.freeze([
    { head: "JPA (Kotlin)", target: "jpa", db: "postgresql" },
    { head: "Prisma", target: "prisma", db: "postgresql" },
    { head: "Drizzle pg-core", target: "drizzle", db: "postgresql" },
    { head: "Drizzle mysql-core", target: "drizzle", db: "mysql" },
    { head: "Drizzle sqlite-core", target: "drizzle", db: "sqlite" },
]);

function paletteOf(db: string): TypePalette {
    const xml = readFileSync(join(REPO_ROOT, "frontend", "db", db, "datatypes.xml"), "utf8");
    const palette = new TypePalette();
    palette.setRoot(
        parser.parseFromString(xml, "text/xml").documentElement as unknown as Element,
    );
    return palette;
}

/**
 * house 既定の 8 型を 1 列ずつ持つ postgresql の設計。
 *
 * ★ **null 許容を引数にしたのは ORM の表のため**（issue #122）。DDL の型名は null に依らないが、
 *   **JPA と Prisma は型に `?` が付く** —— 表に出したいのは型そのものなので NOT NULL で採る。
 */
function houseDesign(nullable: boolean): DesignModel {
    const rows = HOUSE_TYPES.map(
        (t) =>
            `<row name="${t.column}" null="${nullable ? "1" : "0"}" autoincrement="0">` +
            `<datatype>${t.datatype}</datatype></row>`,
    ).join("");
    const xml = `<sql db="postgresql"><table x="0" y="0" name="t">${rows}</table></sql>`;
    const doc = parser.parseFromString(xml, "text/xml");
    return parseDesignXml(doc.documentElement as unknown as Element, paletteOf("postgresql"));
}

/** そのプロファイルへ変換したときの `<datatype>`（sql 名 ＋ サイズ）を列ごとに */
function mappingFor(db: string): string[] {
    const from = paletteOf("postgresql");
    const to = paletteOf(db);
    const converted = convertDesign(houseDesign(true), from, to);
    return buildDdlModel(converted.model, to)[0]!.rows.map((r) => r.datatype);
}

/**
 * 節の中身（次の `## ` の手前まで）。
 *
 * ★ **見出しで区切るのは、DDL の表と ORM の表で先頭セルが同じだから**（issue #122）——
 *   どちらも house 既定の型名をキーにしているので、文書全体を舐めると後の表が前の表を
 *   黙って上書きする。**見出しが消えたら例外**にしてある（表ごと消えたときに緑にしない）。
 */
function sectionLines(heading: string): string[] {
    const lines = readFileSync(DOC, "utf8").split("\n");
    const start = lines.findIndex((l) => l.startsWith(heading));
    if (start === -1) {
        throw new Error(`docs/TYPE-MAPPING.md に見出しが無い: ${heading}`);
    }
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => l.startsWith("## "));
    return end === -1 ? rest : rest.slice(0, end);
}

/** `| a | b |` を ["a", "b"] に。前後のバッククォートは落とす */
function cellsOf(line: string): string[] {
    return line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim().replace(/^`|`$/g, ""));
}

/**
 * docs の表を読む。`| `TEXT` | `LONGTEXT` | …` の行を、先頭セルをキーにして拾う。
 * 見出し行・区切り行は列数で弾かず**先頭セルが HOUSE_TYPES に無ければ捨てる**
 * （表の前後に散文が増えても壊れない）。
 */
function readDocTable(heading: string): Map<string, string[]> {
    const wanted = new Set(HOUSE_TYPES.map((t) => t.datatype));
    const table = new Map<string, string[]>();
    for (const line of sectionLines(heading)) {
        if (!line.startsWith("|")) {
            continue;
        }
        const cells = cellsOf(line);
        const head = cells[0];
        if (head !== undefined && wanted.has(head)) {
            table.set(head, cells.slice(1));
        }
    }
    return table;
}

/** 節の中の見出し行（`| 設計 …`）のセル */
function readDocHeader(heading: string): string[] {
    const header = sectionLines(heading).find((l) => l.startsWith("| 設計"));
    expect(header, `${heading} に見出し行が無い`).toBeDefined();
    return cellsOf(header!);
}

/**
 * 生成した ORM 定義から、列ごとの型表現を順に抜く（issue #122 の難所 2）。
 *
 * ★ **出荷されるバイト列そのものを見る。** 生成器の内部表（KOTLIN_TYPES ほか）を export して
 *   照合すると、表と実際の出力の間に 1 段挟まる —— DDL 側が `convertDesign` の出力を
 *   見ているのと同じ立場に揃える。
 *
 * ★ **Drizzle は第 1 引数（列名）を落として `fn(args)` の形にする。** 列名は型ではないので
 *   表に出すとノイズになる。**mode / withTimezone は残す** —— 落とすと意味が変わる（6-9f）。
 */
function typeCells(target: string, code: string): string[] {
    const out: string[] = [];
    for (const line of code.split("\n")) {
        if (target === "jpa") {
            const m = /^ {4}var \w+: ([^,]+?)(?: = null)?,$/.exec(line);
            if (m) {
                out.push(m[1]!);
            }
        } else if (target === "prisma") {
            const m = /^ {2}(\w+) (\w+\??)(?: |$)/.exec(line);
            if (m) {
                out.push(m[2]!);
            }
        } else {
            const m = /^ {4}\w+: (\w+)\("(?:[^"\\]|\\.)*"(?:, (\{[^}]*\}))?\)/.exec(line);
            if (m) {
                out.push(m[2] === undefined ? `${m[1]}()` : `${m[1]}(${m[2]})`);
            }
        }
    }
    return out;
}

describe("docs/TYPE-MAPPING.md は実装と一致する", () => {
    const targets = DB_PROFILES.filter((db) => db !== "postgresql");

    test("表に house 既定の 8 型がすべて載っている", () => {
        const table = readDocTable(DDL_SECTION);
        expect([...table.keys()].sort()).toEqual(HOUSE_TYPES.map((t) => t.datatype).sort());
    });

    test("列の並びが DB_PROFILES（postgresql を除く 7 本）と一致する", () => {
        expect(readDocHeader(DDL_SECTION).slice(1)).toEqual([...targets]);
    });

    for (const db of targets) {
        test(`postgresql -> ${db} の 8 セルが実装と一致する`, () => {
            const table = readDocTable(DDL_SECTION);
            const actual = mappingFor(db);
            const at = targets.indexOf(db);
            HOUSE_TYPES.forEach((t, i) => {
                expect(table.get(t.datatype)?.[at], `${db} / ${t.datatype}`).toBe(actual[i]);
            });
        });
    }
});

/*
 * ORM の表（issue #122）。**DDL の表に列を足さない** —— 軸が違う（DDL は「どの DB を下敷きに
 * するか」、ORM は「どの言語・ライブラリで出すか」。6-10b が select を分けたのと同じ整理）。
 */
describe("docs/TYPE-MAPPING.md の ORM 表は実装と一致する", () => {
    test("表に house 既定の 8 型がすべて載っている", () => {
        const table = readDocTable(ORM_SECTION);
        expect([...table.keys()].sort()).toEqual(HOUSE_TYPES.map((t) => t.datatype).sort());
    });

    test("列の並びが ORM_COLUMNS と一致する", () => {
        expect(readDocHeader(ORM_SECTION).slice(1)).toEqual(ORM_COLUMNS.map((c) => c.head));
    });

    ORM_COLUMNS.forEach((col, at) => {
        test(`${col.head} の 8 セルが実装と一致する`, () => {
            const code = generateOrm(
                houseDesign(false),
                paletteOf("postgresql"),
                col.target,
                paletteOf(col.db),
            );
            const actual = typeCells(col.target, code);
            /* 抜き出しが壊れたら、表と比べる前に気づく */
            expect(actual.length, `${col.head}: 型を 8 つ抜けていない`).toBe(HOUSE_TYPES.length);

            const table = readDocTable(ORM_SECTION);
            HOUSE_TYPES.forEach((t, i) => {
                expect(table.get(t.datatype)?.[at], `${col.head} / ${t.datatype}`).toBe(actual[i]);
            });
        });
    });

    /*
     * core の対応表も手で書かない。**出力の import 行から core を読む** —— 対応が無い
     * プロファイルは先頭コメントでそう言い、pg-core の形で出す（6-9f の判断）。
     */
    test("Drizzle の core 対応表が 8 プロファイルとも実装と一致する", () => {
        const written = new Map<string, string>();
        for (const line of sectionLines(ORM_SECTION)) {
            if (!line.startsWith("|")) {
                continue;
            }
            const cells = cellsOf(line);
            if (cells.length === 2 && DB_PROFILES.includes(cells[0]!)) {
                written.set(cells[0]!, cells[1]!);
            }
        }

        const expected = new Map<string, string>();
        for (const db of DB_PROFILES) {
            const code = generateOrm(
                houseDesign(false),
                paletteOf("postgresql"),
                "drizzle",
                paletteOf(db),
            );
            const core = /from "drizzle-orm\/([a-z]+)-core"/.exec(code)?.[1];
            expected.set(
                db,
                code.includes("に対応する Drizzle の core は無い")
                    ? "無い（pg-core で出す）"
                    : `${core!}-core`,
            );
        }
        expect([...written.entries()]).toEqual([...expected.entries()]);
    });
});
