import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { TypePalette } from "../../js/io/palette.ts";
import { DB_PROFILES, FIXTURE_DIR, REPO_ROOT } from "../support/fixtures.ts";

/*
 * 型解決の検査（HANDOVER §6 段階6-2）。
 *
 * ハーネスを使わない —— js/io/palette.ts は js/ のどこにも依存しない（import 0 本）ので、
 * tests/node/conflict.test.ts と同じ立場で直に叩ける。DOM だけ jsdom から借りる。
 *
 * この段階が主張するのは「照合規則を変えたが、動くのは known-issue #3 の 1 点だけ」。
 * その主張を golden より手前で機械的に固定するのが本ファイルの役目で、下の差分テストが
 * **段階の完了判定そのもの**になっている。
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

/**
 * 段階6-2 以前の照合（js/io/xml-parser.ts の逐語）。
 *
 * 現行は「一致が無ければ添字 0」だったが、ここでは -1 で返す —— 0 に倒すのは呼び手側の
 * フォールバック（known-issue #4。今も js/io/xml-parser.ts に残っている）で、照合そのものの
 * 規則ではないため。両者を同じ意味論に揃えないと差分が #4 のぶんだけ水増しされる。
 */
function legacyIndexOfTypeName(palette: TypePalette, name: string): number {
    let index = -1;
    const types = palette.types();
    for (let i = 0; i < types.length; i++) {
        const sql = types[i]!.getAttribute("sql");
        const re = types[i]!.getAttribute("re");
        /* break を入れない —— 最後の一致が勝つ（known-issue #3 の本体） */
        if (sql == name || (re && new RegExp(re).exec(name))) {
            index = i;
        }
    }
    return index;
}

/** 照合に掛かりうる型名の全部: 全パレットの sql / re ∪ 全 fixture の <datatype> */
function candidateNames(): string[] {
    const names = new Set<string>();

    for (const db of DB_PROFILES) {
        const xml = readFileSync(join(REPO_ROOT, "db", db, "datatypes.xml"), "utf8");
        for (const tag of xml.match(/<type\s[^>]*?\/>/g) ?? []) {
            const sql = /\ssql="([^"]*)"/.exec(tag)?.[1];
            const re = /\sre="([^"]*)"/.exec(tag)?.[1];
            if (sql) names.add(sql);
            if (re) names.add(re);
        }
    }

    const fixtureDirs = [FIXTURE_DIR, join(REPO_ROOT, "tests", "known-issues", "fixtures")];
    for (const dir of fixtureDirs) {
        for (const file of readdirSync(dir).filter((f) => f.endsWith(".xml"))) {
            const xml = readFileSync(join(dir, file), "utf8");
            for (const m of xml.matchAll(/<datatype>([^<]*)<\/datatype>/g)) {
                /* js/io/xml-parser.ts と同じくサイズを外した部分だけが照合に掛かる */
                names.add(m[1]!.replace(/\(.*$/, ""));
            }
        }
    }

    return [...names].sort();
}

describe("型解決（段階6-2）", () => {
    describe("照合規則の差分（この段階の完了判定）", () => {
        test("旧規則と違う結果になるのは postgresql の BIGINT だけ", () => {
            const names = candidateNames();
            const diffs: string[] = [];

            for (const db of DB_PROFILES) {
                const palette = paletteOf(db);
                for (const name of names) {
                    const before = legacyIndexOfTypeName(palette, name);
                    const after = palette.indexOfTypeName(name);
                    if (before !== after) {
                        diffs.push(`${db}/${name}: ${before} -> ${after}`);
                    }
                }
            }

            /*
             * db/postgresql/datatypes.xml だけが sql="BIGINT" を 2 か所（bigint と x_real）に
             * 持つ。先勝ちにしたので添字 6（Real）ではなく 2（Big Integer）が返る＝ #3 が直る。
             *
             * **6-3 で x_real を撤去するとこの配列は空になり、ここが赤くなる。** そのとき
             * 消してよい —— 直す対象そのものが消えるので。tests/node/palette-id.test.ts の
             * x_ 検査と同じ「静かに変わらない」ための仕掛け。
             */
            expect(diffs).toEqual(["postgresql/BIGINT: 6 -> 2"]);
        });

        test("候補名の母集団が空振りしていない", () => {
            /* 上の差分テストは母集団が空でも緑になるので、規模だけ別に押さえる（実測 82 種） */
            expect(candidateNames().length).toBeGreaterThan(70);
        });
    });

    describe("indexOfTypeName", () => {
        test("sql の完全一致が複数あれば最初が勝つ（known-issue #3）", () => {
            const pg = paletteOf("postgresql");
            expect(pg.idAt(pg.indexOfTypeName("BIGINT"))).toBe("bigint");
        });

        test("一致が無ければ -1（先頭型へのフォールバックは呼び手の責任）", () => {
            /* UUID は現行 PG パレットに無い。0 に倒すのは js/io/xml-parser.ts（#4・6-3 で解消） */
            expect(paletteOf("postgresql").indexOfTypeName("UUID")).toBe(-1);
        });

        test("re は後勝ちのまま（known-issue #10・6-8 で直す）", () => {
            /*
             * oracle は integer と number が両方 re="INT" を持つ。入力 INTEGER は integer の
             * sql に完全一致するが、後ろの number が re の部分一致で上書きする。
             * 素朴に先勝ちへ倒すと mssql が INTEGER -> tinyint と縮むので、直す場所は 6-8。
             */
            const oracle = paletteOf("oracle");
            expect(oracle.idAt(oracle.indexOfTypeName("INTEGER"))).toBe("number");
        });

        test("re はアンカーされていない（known-issue #10・6-8 で直す）", () => {
            /* postgresql の integer は re="INT"。SMALLINT にも部分一致する（後ろの sql 一致が勝つ） */
            const pg = paletteOf("postgresql");
            expect(pg.indexOfTypeName("INT")).toBe(pg.indexOfId("integer"));
            expect(pg.idAt(pg.indexOfTypeName("SMALLINT"))).toBe("smallint");
        });
    });

    describe("fkIndexFor", () => {
        test("fk を持つ型は id で引いた添字を返す", () => {
            const pg = paletteOf("postgresql");
            expect(pg.fkIndexFor(pg.indexOfId("serial"))).toBe(pg.indexOfId("integer"));
            expect(pg.fkIndexFor(pg.indexOfId("bigserial"))).toBe(pg.indexOfId("bigint"));
        });

        test("fk を持たない型は自分自身", () => {
            const pg = paletteOf("postgresql");
            expect(pg.fkIndexFor(pg.indexOfId("text"))).toBe(pg.indexOfId("text"));

            /* fk 属性を 1 つも持たないプロファイルでは全型が恒等 */
            const mysql = paletteOf("mysql");
            const identity = [...Array(mysql.types().length).keys()].every(
                (i) => mysql.fkIndexFor(i) === i,
            );
            expect(identity).toBe(true);
        });

        test("パレットを差し替えたら新しいパレットに従う（旧キャッシュ寿命の回帰）", () => {
            /*
             * 段階6-2 以前は Designer.fkTypeFor が一度作られたら二度と捨てられず、
             * postgresql で FK を作った後に mysql へ差し替えると mysql の BIGINT の FK が
             * SMALLINT になっていた（実測は CUSTOMIZATIONS.md の段階6-2）。
             * 差し替え口は 1 つ（setRoot）なので、ここが緑ならその経路は塞がっている。
             */
            const palette = new TypePalette();
            const pgXml = readFileSync(
                join(REPO_ROOT, "db", "postgresql", "datatypes.xml"),
                "utf8",
            );
            const mysqlXml = readFileSync(
                join(REPO_ROOT, "db", "mysql", "datatypes.xml"),
                "utf8",
            );

            palette.setRoot(
                parser.parseFromString(pgXml, "text/xml").documentElement as unknown as Element,
            );
            const serial = palette.indexOfId("serial");
            expect(palette.fkIndexFor(serial)).toBe(palette.indexOfId("integer"));

            palette.setRoot(
                parser.parseFromString(mysqlXml, "text/xml")
                    .documentElement as unknown as Element,
            );
            const mysqlBigint = palette.indexOfId("bigint");
            expect(palette.fkIndexFor(mysqlBigint)).toBe(mysqlBigint);
            /* 旧実装はここで PG の fkTypeFor[5]=2（smallint）を返していた */
            expect(palette.idAt(palette.fkIndexFor(mysqlBigint))).toBe("bigint");
        });

        test("id を持たない旧パレットでも落ちず自分自身を返す", () => {
            /* 段階4-2b 以前の設計 XML に同梱された <datatypes>（id 属性が無い） */
            const legacy = new TypePalette();
            legacy.setRoot(
                parser.parseFromString(
                    `<datatypes db="postgresql">` +
                        `<group label="Numeric"><type label="Integer" sql="INTEGER" quote="" />` +
                        `<type label="Serial" sql="SERIAL" fk="integer" quote="" /></group>` +
                        `</datatypes>`,
                    "text/xml",
                ).documentElement as unknown as Element,
            );
            expect(legacy.fkIndexFor(1)).toBe(1);
        });
    });
});
