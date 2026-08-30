import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { TypePalette } from "../../frontend/js/io/palette.ts";
import { parseDesignXml } from "../../frontend/js/io/xml-parser.ts";
import { DB_PROFILES, REPO_ROOT, fixtureDir } from "../support/fixtures.ts";

/*
 * 型解決の検査（HANDOVER §6 段階6-2 / 6-3）。
 *
 * ハーネスを使わない —— js/io/palette.ts は js/ のどこにも依存しない（import 0 本）ので、
 * tests/node/conflict.test.ts と同じ立場で直に叩ける。DOM だけ jsdom から借りる。
 *
 * 6-2 はここに「旧規則と違う結果になるのは postgresql の BIGINT だけ」という差分テストを
 * 置き、それを段階の完了判定にしていた。6-3 でその 1 件が消えた後は「**未現代化の
 * プロファイルでは 6-2 以前と 1 件も違わない**」という主張に引き継いでいたが、**段階6-8d で
 * 未現代化が 0 本になり、比較相手（indexOfTypeNameLegacy）もコードから消えた**。
 *
 * 差分テストの**機構は捨てていない** —— candidateNames() の全数掃きはそのまま残し、
 * 「8 プロファイル × 全候補名で、解決先が必ずその名前を sql か aka に持つ型である」という
 * 不変条件テストに作り直した。#10（re の後勝ち）も #4（先頭型フォールバック）も、
 * 再発すればここが赤くなる。
 */

const dom = new JSDOM("");
const parser = new dom.window.DOMParser();

function paletteOf(db: string): TypePalette {
    const xml = readFileSync(join(REPO_ROOT, "frontend", "db", db, "datatypes.xml"), "utf8");
    return paletteFromXml(xml);
}

function paletteFromXml(xml: string): TypePalette {
    const palette = new TypePalette();
    palette.setRoot(
        parser.parseFromString(xml, "text/xml").documentElement as unknown as Element,
    );
    return palette;
}

/** その型が name を sql か aka に持っているか（照合が「書いた型に届く」ことの定義） */
function declares(palette: TypePalette, index: number, name: string): boolean {
    const upper = name.toUpperCase();
    const type = palette.typeAt(index);
    return (
        type.getAttribute("sql")?.toUpperCase() === upper ||
        (type.getAttribute("aka") ?? "").toUpperCase().split("|").includes(upper)
    );
}

/** 照合に掛かりうる型名の全部: 全パレットの sql / re / aka ∪ 全 fixture の <datatype> */
function candidateNames(): string[] {
    const names = new Set<string>();

    for (const db of DB_PROFILES) {
        const xml = readFileSync(join(REPO_ROOT, "frontend", "db", db, "datatypes.xml"), "utf8");
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

    /* 段階6-6a で fixture は DB 別になった —— 母集団は全プロファイルの和集合 */
    const fixtureDirs = [
        ...DB_PROFILES.map((db) => fixtureDir(db)),
        join(REPO_ROOT, "tests", "known-issues", "fixtures"),
    ];
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
    describe("照合の全数掃き（差分テストから引き継いだ機構）", () => {
        test("8 プロファイル × 全候補名: 解決先は必ずその名前を sql か aka に持つ型", () => {
            /*
             * **これが 6-8d 以降の安全網。** 6-8c までは「未現代化プロファイルは 6-2 以前と
             * 1 件も違わない」という差分テストだったが、比較相手の規則がコードから消えた。
             *
             * 主張を裏返すと同じ母集団がそのまま使える —— 解決が成立したなら、その型は
             * その名前を**自分で宣言している**はずである。#10（re が他の型の完全一致を
             * 後勝ちで奪う）も #4（一致が無いのに添字 0 を返す）も、この形を破る。
             */
            const names = candidateNames();
            const wrong: string[] = [];

            for (const db of DB_PROFILES) {
                const palette = paletteOf(db);
                for (const name of names) {
                    const found = palette.indexOfTypeName(name);
                    if (found === -1) {
                        continue;
                    }
                    if (!declares(palette, found, name)) {
                        wrong.push(`${db}/${name} -> ${palette.idAt(found)}`);
                    }
                }
            }

            expect(wrong).toEqual([]);
        });

        test("母集団が空振りしていない（8 プロファイル × 候補名 70 種以上）", () => {
            /* 上の掃きは母集団が空でも緑になるので、規模だけ別に押さえる */
            expect(DB_PROFILES.length).toBe(8);
            expect(candidateNames().length).toBeGreaterThan(70);
        });
    });

    describe("strict の照合（段階6-3）", () => {
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
             * INT2 / FLOAT8 / BOOL、sqlite の affinity 規則の展開などもここに入る）。
             * **段階6-8d で 8 プロファイルに広げた**（6-8c まで postgresql だけだった）。
             */
            const stolen: string[] = [];

            for (const db of DB_PROFILES) {
                const palette = paletteOf(db);
                const types = palette.types();
                for (let i = 0; i < types.length; i++) {
                    const aka = types[i]!.getAttribute("aka");
                    for (const name of aka?.split("|") ?? []) {
                        const found = palette.indexOfTypeName(name);
                        if (found !== i) {
                            stolen.push(
                                `${db}/${name}: ${palette.idAt(i)} のはずが ${palette.idAt(found)}`,
                            );
                        }
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

        test("re はどのパレットでも読まれない（規則ごと消えたこと）", () => {
            /*
             * **indexOfTypeNameLegacy の撤去を押さえているのはこの 1 本だけ**（段階6-8d）。
             * 6-8c まではここが「strict は re を見ない / 非 strict は後勝ちで見る」という
             * **違い**の主張で、下段の期待値は "b" だった。8 本すべてが strict になって
             * 規則ごと落としたので、**strict 属性の有無に関わらず sql の完全一致が勝つ**。
             *
             * 実データで再発を止められないのが要点 —— re 属性を持つパレットは 1 つも無い
             * （下の別テストが固定している）ので、誰かが re 照合を戻してもここしか赤くならない。
             */
            const xml =
                `<datatypes db="x" STRICT><group label="g">` +
                `<type id="a" label="A" sql="AAA" quote="" />` +
                `<type id="b" label="B" sql="BBB" re="AAA" quote="" />` +
                `</group></datatypes>`;

            const strict = paletteFromXml(xml.replace("STRICT", 'strict="1"'));
            expect(strict.idAt(strict.indexOfTypeName("AAA"))).toBe("a");

            /* strict 属性を持たない旧パレットでも同じ規則が当たる */
            const legacy = paletteFromXml(xml.replace("STRICT", ""));
            expect(legacy.idAt(legacy.indexOfTypeName("AAA"))).toBe("a");
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

    describe("indexOfTypeName（照合規則）", () => {
        /*
         * **known-issue #10 は 6-8c で実例が尽き、6-8d で規則ごと消えた。**
         *
         * 6-8a / 6-8b / 6-8c で mysql / mssql / oracle が strict になって re 属性を持つ
         * パレットが 0 本になり（最後に残った sqlite は元から re を持たない）、6-8d で
         * js/io/palette.ts の indexOfTypeNameLegacy 自体が消えた。
         *
         * ここに在った 2 本（oracle の INTEGER が NUMBER に化ける／re がアンカーされていない）は
         * **直った側の主張**に書き換えてある。
         */
        test("oracle の INTEGER は integer に解決する（known-issue #10 が消えた）", () => {
            /*
             * 6-8c まで number の re="INT" が integer の sql 完全一致を上書きし、
             * **このパレットで integer 型に到達する書き方が無かった**。strict は re を
             * 見ないので、書いた型がそのまま出る。
             */
            const oracle = paletteOf("oracle");
            expect(oracle.idAt(oracle.indexOfTypeName("INTEGER"))).toBe("integer");
            expect(oracle.idAt(oracle.indexOfTypeName("NUMBER"))).toBe("number");
        });

        test("re 属性を持つパレットはもう 1 つも無い（#10 の実例が尽きた）", () => {
            const withRe = DB_PROFILES.filter((db) =>
                readFileSync(join(REPO_ROOT, "frontend", "db", db, "datatypes.xml"), "utf8").includes(' re="'),
            );

            expect(withRe).toEqual([]);
        });

        test("sql の完全一致が複数あれば最初が勝つ（known-issue #3 の直り方）", () => {
            /*
             * 6-2 が直した規則。当時の実データは db/postgresql/datatypes.xml の
             * sql="BIGINT"（bigint と x_real）だったが、**6-3 でその重複ごと撤去した**ので
             * 現存 8 パレットに sql の重複は 1 つも無い（palette-id.test.ts が固定している）。
             * 実データが無いので人工パレットで押さえる。**strict 属性の有無に関わらず
             * 先勝ち**（この人工パレットは属性を持たないが、6-8d 以降は同じ規則に当たる）。
             */
            const dup = paletteFromXml(
                `<datatypes db="x"><group label="g">` +
                    `<type id="first" label="First" sql="SAME" quote="" />` +
                    `<type id="second" label="Second" sql="SAME" quote="" />` +
                    `</group></datatypes>`,
            );
            expect(dup.idAt(dup.indexOfTypeName("SAME"))).toBe("first");
        });

        test("一致が無ければ -1（例外にするのは呼び手の責任）", () => {
            /*
             * PG の型。**sqlite パレットには無い**（aka は SQLite 自身の affinity 規則の
             * 展開だけで、BYTEA は SQLite が認めない綴り）。6-8c まではここで添字 0 に
             * 落ちていた（known-issue #4）が、6-8d で呼び手が例外にする。
             */
            expect(paletteOf("sqlite").indexOfTypeName("BYTEA")).toBe(-1);
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

            /*
             * fk 属性を 1 つも持たないプロファイルでは全型が恒等。**寄せ先は 6-8c で sqlite へ
             * 移り、6-8d のパレット差し替えでも動かなくて済んだ** —— SQLite に identity 型が
             * 無く、AUTOINCREMENT は型ではなく列の属性なので、fk を持つ型が 1 つも要らない。
             */
            const sqlite = paletteOf("sqlite");
            const identity = [...Array(sqlite.types().length).keys()].every(
                (i) => sqlite.fkIndexFor(i) === i,
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
                join(REPO_ROOT, "frontend", "db", "postgresql", "datatypes.xml"),
                "utf8",
            );
            const mysqlXml = readFileSync(
                join(REPO_ROOT, "frontend", "db", "mysql", "datatypes.xml"),
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

        test("length 属性が無ければ true（旧パレット互換）", () => {
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
        function parseOneRow(datatype: string, palette: TypePalette) {
            const xml =
                `<sql><table x="0" y="0" name="t">` +
                `<row name="c" null="1" autoincrement="0"><datatype>${datatype}</datatype></row>` +
                `</table></sql>`;
            const doc = parser.parseFromString(xml, "text/xml");
            return parseDesignXml(
                doc.documentElement as unknown as Element,
                palette,
            ).tables[0]!.rows[0]!;
        }

        /** length="0" の型 1 つだけを持つ、strict 属性の無いパレット（旧 XML 同梱の形） */
        function legacyPalette(): TypePalette {
            return paletteFromXml(
                `<datatypes db="x"><group label="g">` +
                    `<type id="a" label="A" length="0" sql="AAA" quote="" />` +
                    `</group></datatypes>`,
            );
        }

        test("未知の型は例外になる（known-issue #4 の解消）", () => {
            expect(() => parseOneRow("MEDIUMTEXT", paletteOf("postgresql"))).toThrow(
                /型 "MEDIUMTEXT" が現在の型パレット（db=postgresql）に無い/,
            );
        });

        test("strict 属性を持たないパレットでも未知の型は例外（#4 のフォールバックが消えた）", () => {
            /*
             * **xml-parser のフォールバック撤去を押さえているのはこの 1 本だけ**（段階6-8d）。
             * 6-8c まで「一致が無ければ添字 0 のまま」という分岐が非 strict 側に残っており、
             * sqlite がその最後の実例だった。実プロファイルからは消えたが、**旧 XML 同梱の
             * <datatypes> を読む経路（Designer.fromXML）は実アプリに生きている**ので、
             * 人工パレットで規則を押さえておく。黙って別の型で開くより落ちて気づく側に倒す。
             */
            expect(() => parseOneRow("BYTEA", legacyPalette())).toThrow(
                /型 "BYTEA" が現在の型パレット（db=x）に無い/,
            );
        });

        test("寄せ先がサイズを取らない型なら size を捨てる", () => {
            /* CHAR(10) -> text。残すと js/io/ddl/shared.ts が TEXT(10) を吐く */
            const row = parseOneRow("CHAR(10)", paletteOf("postgresql"));
            expect(paletteOf("postgresql").idAt(row.type)).toBe("text");
            expect(row.size).toBe("");
        });

        test("寄せ先がサイズを取るなら size を残す", () => {
            /* TIMESTAMP(3) -> timestamptz(3)。PG の timestamptz は秒精度を取れる */
            const row = parseOneRow("TIMESTAMP(3)", paletteOf("postgresql"));
            expect(paletteOf("postgresql").idAt(row.type)).toBe(
                "timestamp_with_time_zone",
            );
            expect(row.size).toBe("3");
        });

        test("strict 属性を持たないパレットでも length=\"0\" なら size を捨てる", () => {
            /*
             * 上と対の、段階6-8d で規則が 1 つになったことの押さえ（6-8c までは strict の
             * ときだけ捨てていた）。**sqlite は全型 length="0"** なので、規則が分かれたままだと
             * UI で打った size が TEXT(255) として出て STRICT SQLite に必ず拒まれる。
             */
            const row = parseOneRow("AAA(10)", legacyPalette());
            expect(row.size).toBe("");
        });
    });
});
