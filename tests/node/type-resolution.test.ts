import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { TypePalette } from "../../js/io/palette.ts";
import { parseDesignXml } from "../../js/io/xml-parser.ts";
import { DB_PROFILES, FIXTURE_DIR, REPO_ROOT } from "../support/fixtures.ts";

/*
 * 型解決の検査（HANDOVER §6 段階6-2 / 6-3）。
 *
 * ハーネスを使わない —— js/io/palette.ts は js/ のどこにも依存しない（import 0 本）ので、
 * tests/node/conflict.test.ts と同じ立場で直に叩ける。DOM だけ jsdom から借りる。
 *
 * 6-2 はここに「旧規則と違う結果になるのは postgresql の BIGINT だけ」という差分テストを
 * 置き、それを段階の完了判定にしていた。**6-3 で x_real が撤去されてその 1 件が消えた**ので、
 * 差分テストは「**未現代化のプロファイルでは 6-2 以前と 1 件も違わない**」という主張に
 * 引き継いである（6-8 まで有効な安全網）。6-3 が入れた strict 側は別の describe で見る。
 */

const dom = new JSDOM("");
const parser = new dom.window.DOMParser();

function paletteOf(db: string): TypePalette {
    const xml = readFileSync(join(REPO_ROOT, "db", db, "datatypes.xml"), "utf8");
    return paletteFromXml(xml);
}

function paletteFromXml(xml: string): TypePalette {
    const palette = new TypePalette();
    palette.setRoot(
        parser.parseFromString(xml, "text/xml").documentElement as unknown as Element,
    );
    return palette;
}

/** 現代化済み（strict="1"）のプロファイル。段階6-3 時点では postgresql の 1 本 */
const STRICT_PROFILES = DB_PROFILES.filter((db) => paletteOf(db).isStrict());
/** 未現代化。照合規則は 6-2 のまま据え置きで、6-8 でこちら側が空になる */
const LEGACY_PROFILES = DB_PROFILES.filter((db) => !paletteOf(db).isStrict());

/**
 * 段階6-2 以前の照合（js/io/xml-parser.ts の逐語）。
 *
 * 現行は「一致が無ければ添字 0」だったが、ここでは -1 で返す —— 0 に倒すのは呼び手側の
 * フォールバック（known-issue #4。未現代化プロファイルでは今も js/io/xml-parser.ts に
 * 残っている）で、照合そのものの規則ではないため。両者を同じ意味論に揃えないと差分が
 * #4 のぶんだけ水増しされる。
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

/** 照合に掛かりうる型名の全部: 全パレットの sql / re / aka ∪ 全 fixture の <datatype> */
function candidateNames(): string[] {
    const names = new Set<string>();

    for (const db of DB_PROFILES) {
        const xml = readFileSync(join(REPO_ROOT, "db", db, "datatypes.xml"), "utf8");
        for (const tag of xml.match(/<type\s[^>]*?\/>/g) ?? []) {
            const sql = /\ssql="([^"]*)"/.exec(tag)?.[1];
            const re = /\sre="([^"]*)"/.exec(tag)?.[1];
            const aka = /\saka="([^"]*)"/.exec(tag)?.[1];
            if (sql) names.add(sql);
            if (re) names.add(re);
            /* aka は | 区切り（段階6-3） */
            for (const one of aka?.split("|") ?? []) names.add(one);
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

/**
 * 段階6-3 の移行に効く「旧型名 -> 新しい型 id」（db/postgresql/datatypes.xml の aka）。
 *
 * **互換で読む XML の受け口そのもの**なので、リテラルで固定する。左側が消えると
 * upstream 由来の設計 XML と introspection の出力（docs/samples/introspection-postgresql.xml）が
 * 読めなくなる。撤去した 7 型ぶん（1〜3 行目）と sql を直した 4 型ぶん（4〜7 行目）。
 */
const PG_LEGACY_NAMES: ReadonlyArray<readonly [string, string]> = [
    ["SERIAL", "bigint_identity"],
    ["SERIAL4", "bigint_identity"],
    ["BIGSERIAL", "bigint_identity"],
    ["SERIAL8", "bigint_identity"],
    ["CHAR", "text"],
    ["TIMESTAMP", "timestamp_with_time_zone"],
    ["TIMESTAMP WITHOUT TIME ZONE", "timestamp_with_time_zone"],
    ["JSON", "jsonb"],
    ["DECIMAL", "decimal"],
    ["FLOAT", "float"],
    ["DOUBLE", "double"],
    ["TIMESTAMP WITH TIME ZONE", "timestamp_with_time_zone"],
];

describe("型解決（段階6-2 / 6-3）", () => {
    describe("照合規則の差分（未現代化プロファイルは 6-2 のまま）", () => {
        test("未現代化の 4 プロファイルは旧規則と 1 件も違わない", () => {
            /*
             * 6-2 はこの配列が ["postgresql/BIGINT: 6 -> 2"] の 1 件であることを完了判定に
             * していた。**6-3 で x_real（sql="BIGINT" の重複）が撤去され、postgresql が
             * strict 側へ移ったので空になる**。
             *
             * 主張は「6-3 は未現代化プロファイルの照合を 1 バイトも変えていない」。
             * re の先勝ち化・アンカー化は 6-8 の仕事で、そのときここが赤くなる。
             */
            const names = candidateNames();
            const diffs: string[] = [];

            for (const db of LEGACY_PROFILES) {
                const palette = paletteOf(db);
                for (const name of names) {
                    const before = legacyIndexOfTypeName(palette, name);
                    const after = palette.indexOfTypeName(name);
                    if (before !== after) {
                        diffs.push(`${db}/${name}: ${before} -> ${after}`);
                    }
                }
            }

            expect(diffs).toEqual([]);
        });

        test("母集団が空振りしていない（プロファイル 4 本 × 候補名 70 種以上）", () => {
            /* 上の差分テストは母集団が空でも緑になるので、規模だけ別に押さえる */
            expect(LEGACY_PROFILES).toEqual(["mssql", "mysql", "oracle", "sqlite"]);
            expect(candidateNames().length).toBeGreaterThan(70);
        });
    });

    describe("strict の照合（段階6-3）", () => {
        test("現代化済みは postgresql の 1 本だけ（6-8 で残り 4 本が来る）", () => {
            expect(STRICT_PROFILES).toEqual(["postgresql"]);
        });

        test("撤去・改名した型の旧名がすべて新しい型に解決する", () => {
            /*
             * この 12 行が「6-3 が読み込み互換を壊していない」ことの本体。とくに
             * TIMESTAMP WITH TIME ZONE は introspection の実出力で、新 sql が TIMESTAMPTZ に
             * なったぶん aka でしか受けられない。
             */
            const pg = paletteOf("postgresql");
            const resolved = PG_LEGACY_NAMES.map(
                ([name]) => [name, pg.idAt(pg.indexOfTypeName(name))] as const,
            );
            expect(resolved).toEqual(PG_LEGACY_NAMES.map(([n, id]) => [n, id]));
        });

        test("aka はすべて自分自身の型に解決する（他の型に奪われていない）", () => {
            /*
             * 上の表は移行に効く 12 名を名指しで固定するもの。こちらはパレット全体の aka を
             * 機械的に一巡して、**どの別名も書いた型に届く**ことを見る（PG の内部別名
             * INT2 / FLOAT8 / BOOL などもここに入る）。
             */
            const pg = paletteOf("postgresql");
            const types = pg.types();
            const stolen: string[] = [];

            for (let i = 0; i < types.length; i++) {
                const aka = types[i]!.getAttribute("aka");
                for (const name of aka?.split("|") ?? []) {
                    const found = pg.indexOfTypeName(name);
                    if (found !== i) {
                        stolen.push(
                            `${name}: ${pg.idAt(i)} のはずが ${pg.idAt(found)}（${found}）`,
                        );
                    }
                }
            }

            expect(stolen).toEqual([]);
        });

        test("sql の完全一致は aka より優先される（2 段走査）", () => {
            /*
             * TIME WITH TIME ZONE は time_with_time_zone の sql で、
             * timestamp_with_time_zone の aka（TIMESTAMP WITH TIME ZONE）とは別物。
             * 型ごとに sql と aka を同時に見る 1 段走査だと、パレットの並び次第で
             * 前の型の aka が後の型の sql を奪える。
             */
            const pg = paletteOf("postgresql");
            expect(pg.idAt(pg.indexOfTypeName("TIME WITH TIME ZONE"))).toBe(
                "time_with_time_zone",
            );

            /* aka が先に並ぶ人工パレットでも sql が勝つことを直接見る */
            const artificial = paletteFromXml(
                `<datatypes db="x" strict="1"><group label="g">` +
                    `<type id="a" label="A" sql="AAA" aka="BBB" quote="" />` +
                    `<type id="b" label="B" sql="BBB" quote="" />` +
                    `</group></datatypes>`,
            );
            expect(artificial.idAt(artificial.indexOfTypeName("BBB"))).toBe("b");
        });

        test("大文字小文字を無視する（known-issue #10 の欠陥2 を持ち込まない）", () => {
            const pg = paletteOf("postgresql");
            expect(pg.idAt(pg.indexOfTypeName("numeric"))).toBe("decimal");
            expect(pg.idAt(pg.indexOfTypeName("Timestamptz"))).toBe(
                "timestamp_with_time_zone",
            );
            expect(pg.idAt(pg.indexOfTypeName("serial"))).toBe("bigint_identity");
        });

        test("部分一致しない（known-issue #10 の欠陥1 を持ち込まない）", () => {
            /*
             * 6-2 時点の postgresql は integer が re="INT" で BIGINT / SMALLINT / INTERVAL
             * すべてに部分一致していた。aka="INT" は完全一致なので INT だけに当たる。
             */
            const pg = paletteOf("postgresql");
            expect(pg.idAt(pg.indexOfTypeName("INT"))).toBe("integer");
            expect(pg.idAt(pg.indexOfTypeName("BIGINT"))).toBe("bigint");
            expect(pg.idAt(pg.indexOfTypeName("SMALLINT"))).toBe("smallint");
            expect(pg.idAt(pg.indexOfTypeName("INTERVAL"))).toBe("interval");
        });

        test("re は見ない（未現代化との規則の違いを直接押さえる）", () => {
            /* 現行 PG パレットに re は 1 つも無いので、人工パレットで規則そのものを見る */
            const xml =
                `<datatypes db="x" STRICT><group label="g">` +
                `<type id="a" label="A" sql="AAA" quote="" />` +
                `<type id="b" label="B" sql="BBB" re="AAA" quote="" />` +
                `</group></datatypes>`;

            const strict = paletteFromXml(xml.replace("STRICT", 'strict="1"'));
            expect(strict.idAt(strict.indexOfTypeName("AAA"))).toBe("a");

            /* 同じパレットを非 strict にすると、後ろの re が sql の完全一致を上書きする */
            const legacy = paletteFromXml(xml.replace("STRICT", ""));
            expect(legacy.idAt(legacy.indexOfTypeName("AAA"))).toBe("b");
        });

        test("一致が無ければ -1（例外にするのは呼び手 = xml-parser の判断）", () => {
            /* mysql の型。PG パレットには無い */
            expect(paletteOf("postgresql").indexOfTypeName("MEDIUMTEXT")).toBe(-1);
        });

        test("UUID が解決する（known-issue #4 の実害が消えたこと）", () => {
            /*
             * 6-3 まで PG パレットに uuid が無く、house 既定の PK（uuidv7）が黙って
             * INTEGER に落ちていた。#4 の移設先は tests/browser/types.spec.ts で、
             * ここは照合の面から同じことを押さえる。
             */
            const pg = paletteOf("postgresql");
            expect(pg.idAt(pg.indexOfTypeName("UUID"))).toBe("uuid");
            expect(pg.indexOfId("uuid")).toBeGreaterThan(-1);
        });
    });

    describe("indexOfTypeName（未現代化プロファイル）", () => {
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
            /* mysql の int は re="INT"。SMALLINT にも部分一致する（後ろの sql 一致が勝つ） */
            const mysql = paletteOf("mysql");
            expect(mysql.idAt(mysql.indexOfTypeName("INT"))).toBe("int");
            expect(mysql.idAt(mysql.indexOfTypeName("SMALLINT"))).toBe("smallint");
        });

        test("sql の完全一致が複数あれば最初が勝つ（known-issue #3 の直り方）", () => {
            /*
             * 6-2 が直した規則。当時の実データは db/postgresql/datatypes.xml の
             * sql="BIGINT"（bigint と x_real）だったが、**6-3 でその重複ごと撤去した**ので
             * 現存 5 パレットに sql の重複は 1 つも無い（palette-id.test.ts が固定している）。
             * 規則自体は未現代化プロファイルに残るので、人工パレットで押さえる。
             */
            const dup = paletteFromXml(
                `<datatypes db="x"><group label="g">` +
                    `<type id="first" label="First" sql="SAME" quote="" />` +
                    `<type id="second" label="Second" sql="SAME" quote="" />` +
                    `</group></datatypes>`,
            );
            expect(dup.idAt(dup.indexOfTypeName("SAME"))).toBe("first");
        });

        test("一致が無ければ -1（先頭型へのフォールバックは呼び手の責任）", () => {
            /* PG の型。mysql パレットには無い。0 に倒すのは js/io/xml-parser.ts（#4・6-8 で解消） */
            expect(paletteOf("mysql").indexOfTypeName("BYTEA")).toBe(-1);
        });
    });

    describe("fkIndexFor", () => {
        test("fk を持つ型は id で引いた添字を返す", () => {
            /* 6-3 で serial / bigserial が bigint_identity 1 本になった（fk="bigint"） */
            const pg = paletteOf("postgresql");
            expect(pg.fkIndexFor(pg.indexOfId("bigint_identity"))).toBe(
                pg.indexOfId("bigint"),
            );
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
            const identity = palette.indexOfId("bigint_identity");
            expect(palette.fkIndexFor(identity)).toBe(palette.indexOfId("bigint"));

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
            const legacy = paletteFromXml(
                `<datatypes db="postgresql">` +
                    `<group label="Numeric"><type label="Integer" sql="INTEGER" quote="" />` +
                    `<type label="Serial" sql="SERIAL" fk="integer" quote="" /></group>` +
                    `</datatypes>`,
            );
            expect(legacy.fkIndexFor(1)).toBe(1);
        });
    });

    describe("hasSize（段階6-3 で length を読む契約にした）", () => {
        test("PG18 パレットの length が PG の実際に合っている", () => {
            /*
             * length は 6-3 まで js/ のどこからも読まれない死んだ属性で、upstream の値が
             * そのまま残っていた（bytea / xml が 1、timetz / timestamptz が 0）。
             * 読む契約にしたので PG18 に合わせて直してある。ここが赤くなるのは
             * 「サイズを取らない型に size を許した」か、その逆。
             */
            const pg = paletteOf("postgresql");
            const sized = [...Array(pg.types().length).keys()]
                .filter((i) => pg.hasSize(i))
                .map((i) => pg.idAt(i));

            expect(sized).toEqual([
                "decimal",
                "varchar",
                "time",
                "time_with_time_zone",
                "interval",
                "timestamp_with_time_zone",
                "bit",
                "varbit",
            ]);
        });

        test("length 属性が無ければ true（旧パレットと未現代化プロファイル）", () => {
            const legacy = paletteFromXml(
                `<datatypes db="x"><group label="g">` +
                    `<type id="a" label="A" sql="AAA" quote="" />` +
                    `</group></datatypes>`,
            );
            expect(legacy.hasSize(0)).toBe(true);
        });
    });

    describe("読み込み側の帰結（js/io/xml-parser.ts・段階6-3）", () => {
        /*
         * xml-parser は import type しか持たない（js/ の実行時依存が 0 本）ので、
         * palette.ts と同じくハーネス無しで直に叩ける。golden はここを間接的にしか
         * 通らないので、規則そのものを近くで押さえる。
         */
        function parseOneRow(datatype: string, db: string) {
            const xml =
                `<sql><table x="0" y="0" name="t">` +
                `<row name="c" null="1" autoincrement="0"><datatype>${datatype}</datatype></row>` +
                `</table></sql>`;
            const doc = parser.parseFromString(xml, "text/xml");
            return parseDesignXml(
                doc.documentElement as unknown as Element,
                paletteOf(db),
            ).tables[0]!.rows[0]!;
        }

        test("strict では未知の型が例外になる（known-issue #4 の解消）", () => {
            expect(() => parseOneRow("MEDIUMTEXT", "postgresql")).toThrow(
                /型 "MEDIUMTEXT" が現在の型パレット（db=postgresql）に無い/,
            );
        });

        test("未現代化プロファイルでは未知の型が黙って先頭型になる（#4 が残る）", () => {
            /* mysql に BYTEA は無い。添字 0（TINYINT）に落ちる。6-8 でここが例外になる */
            const row = parseOneRow("BYTEA", "mysql");
            expect(row.type).toBe(0);
        });

        test("寄せ先がサイズを取らない型なら size を捨てる", () => {
            /* CHAR(10) -> text。残すと js/io/ddl-xml.ts が TEXT(10) を吐く */
            const row = parseOneRow("CHAR(10)", "postgresql");
            expect(paletteOf("postgresql").idAt(row.type)).toBe("text");
            expect(row.size).toBe("");
        });

        test("寄せ先がサイズを取るなら size を残す", () => {
            /* TIMESTAMP(3) -> timestamptz(3)。PG の timestamptz は秒精度を取れる */
            const row = parseOneRow("TIMESTAMP(3)", "postgresql");
            expect(paletteOf("postgresql").idAt(row.type)).toBe(
                "timestamp_with_time_zone",
            );
            expect(row.size).toBe("3");
        });

        test("未現代化プロファイルでは size を捨てない（6-3 は PG 以外を触っていない）", () => {
            /* mysql の text は length="0" だが、strict ではないので size はそのまま残る */
            const row = parseOneRow("TEXT(10)", "mysql");
            expect(row.size).toBe("10");
        });
    });

    describe("isStrict", () => {
        test("属性が無ければ false（未現代化プロファイルと旧パレット）", () => {
            expect(paletteOf("mysql").isStrict()).toBe(false);
            expect(
                paletteFromXml(`<datatypes db="x"><group label="g"/></datatypes>`).isStrict(),
            ).toBe(false);
        });

        test("strict=\"1\" のときだけ true（他の値は false）", () => {
            expect(paletteOf("postgresql").isStrict()).toBe(true);
            expect(
                paletteFromXml(
                    `<datatypes db="x" strict="0"><group label="g"/></datatypes>`,
                ).isStrict(),
            ).toBe(false);
        });
    });
});
