import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { convertDesign } from "../../frontend/js/io/convert.ts";
import { buildDdlModel } from "../../frontend/js/io/ddl/shared.ts";
import type { DesignModel } from "../../frontend/js/io/model.ts";
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
 */

const dom = new JSDOM("");
const parser = new dom.window.DOMParser();

const DOC = join(REPO_ROOT, "docs", "TYPE-MAPPING.md");

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

function paletteOf(db: string): TypePalette {
    const xml = readFileSync(join(REPO_ROOT, "frontend", "db", db, "datatypes.xml"), "utf8");
    const palette = new TypePalette();
    palette.setRoot(
        parser.parseFromString(xml, "text/xml").documentElement as unknown as Element,
    );
    return palette;
}

/** house 既定の 8 型を 1 列ずつ持つ postgresql の設計 */
function houseDesign(): DesignModel {
    const rows = HOUSE_TYPES.map(
        (t) =>
            `<row name="${t.column}" null="1" autoincrement="0">` +
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
    const converted = convertDesign(houseDesign(), from, to);
    return buildDdlModel(converted.model, to)[0]!.rows.map((r) => r.datatype);
}

/**
 * docs の表を読む。`| `TEXT` | `LONGTEXT` | …` の行を、先頭セルをキーにして拾う。
 * 見出し行・区切り行は列数で弾かず**先頭セルが HOUSE_TYPES に無ければ捨てる**
 * （表の前後に散文が増えても壊れない）。
 */
function readDocTable(): Map<string, string[]> {
    const wanted = new Set(HOUSE_TYPES.map((t) => t.datatype));
    const table = new Map<string, string[]>();
    for (const line of readFileSync(DOC, "utf8").split("\n")) {
        if (!line.startsWith("|")) {
            continue;
        }
        const cells = line
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim().replace(/^`|`$/g, ""));
        const head = cells[0];
        if (head !== undefined && wanted.has(head)) {
            table.set(head, cells.slice(1));
        }
    }
    return table;
}

describe("docs/TYPE-MAPPING.md は実装と一致する", () => {
    const targets = DB_PROFILES.filter((db) => db !== "postgresql");

    test("表に house 既定の 8 型がすべて載っている", () => {
        const table = readDocTable();
        expect([...table.keys()].sort()).toEqual(HOUSE_TYPES.map((t) => t.datatype).sort());
    });

    test("列の並びが DB_PROFILES（postgresql を除く 7 本）と一致する", () => {
        const header = readFileSync(DOC, "utf8")
            .split("\n")
            .find((l) => l.startsWith("| 設計"));
        expect(header, "見出し行が見つからない").toBeDefined();
        const cells = header!
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim().replace(/^`|`$/g, ""));
        expect(cells.slice(1)).toEqual([...targets]);
    });

    for (const db of targets) {
        test(`postgresql -> ${db} の 8 セルが実装と一致する`, () => {
            const table = readDocTable();
            const actual = mappingFor(db);
            const at = targets.indexOf(db);
            HOUSE_TYPES.forEach((t, i) => {
                expect(table.get(t.datatype)?.[at], `${db} / ${t.datatype}`).toBe(actual[i]);
            });
        });
    }
});
