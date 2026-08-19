import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { FIXTURES, SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { goldenPath, readGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import { createHarness, type NodeHarness } from "./harness.ts";

// golden はブラウザ側が採ったものが唯一の正。ここでは読むだけ（書かない）。
describe("serializer 特性化（Node / jsdom）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
    });

    afterAll(() => {
        h.close();
    });

    for (const fixture of FIXTURES) {
        test(`golden: ${fixture.name} — ${fixture.purpose}`, () => {
            h.useDatatypes(SERIALIZER_DB);
            h.loadFixture(readFixture(fixture.name));

            const actual = h.toXML();
            assertNoCarriageReturn(actual, `toXML(${fixture.name})`);

            expect(actual).toBe(readGolden(goldenPath("ddl-input", `${fixture.name}.xml`)));
        });

        test(`round-trip: ${fixture.name}`, () => {
            h.useDatatypes(SERIALIZER_DB);
            h.loadFixture(readFixture(fixture.name));

            const first = h.toXML();
            h.loadFixture(first);
            const second = h.toXML();
            h.loadFixture(second);
            const third = h.toXML();

            expect(second).toBe(first);
            expect(third).toBe(second);
        });
    }

    describe("<default> の引用（段階6-4）", () => {
        /*
         * quote 属性は「文字列型の既定値をリテラルとして囲む」ためのもので、6-4 まで
         * **式にも当たっていた** —— PG18 パレットの uuid は quote="'" なので house 既定の
         * DEFAULT uuidv7() が DEFAULT 'uuidv7()' になり、uuid 列に文字列を入れる DDL として
         * PG に弾かれる。§6.2 のテンプレートは既定値に uuidv7() / now() を持つので、
         * 直さずに入れると新規テーブルが必ず壊れた DDL を吐く（CUSTOMIZATIONS.md の段階6-4）。
         *
         * fixture を足していないのは、DDL_FIXTURES に入れると golden が 5 プロファイル分
         * 増えるため。ここで見たいのは「入力値 -> <default> の中身」という 1 対 1 の規則で、
         * 生成 DDL の姿ではない。probe は VARCHAR（quote="'" を両プロファイルが持つ型）で組む。
         *
         * **入力は quote 剥がし（js/io/xml-parser.ts）を通らない値だけ**にしてある ——
         * 剥がされるのは両端が ' の値で、'{}'::jsonb は末尾が b なので当たらない。
         */
        function probeXml(defs: readonly string[]): string {
            const rows = defs.map(
                (def, i) =>
                    `<row name="c${i}" null="0" autoincrement="0">\n` +
                    `<datatype>VARCHAR</datatype>\n` +
                    `<default>${def}</default>\n` +
                    `</row>\n`,
            );
            return (
                `<?xml version="1.0" encoding="utf-8" ?>\n<sql>\n` +
                `<table x="0" y="0" name="probe">\n` +
                rows.join("") +
                `</table>\n</sql>\n`
            );
        }

        /** toXML() が書いた <default> の中身を順に。正規表現を使わないのは値に記号が多いため */
        function defaults(xml: string): string[] {
            return xml
                .split("<default>")
                .slice(1)
                .map((part) => part.slice(0, part.indexOf("</default>")));
        }

        function serializeDefaults(db: string, defs: readonly string[]): string[] {
            h.useDatatypes(db);
            h.loadFixture(probeXml(defs));
            return defaults(h.toXML());
        }

        /** 左が入力、右が strict（postgresql）での <default>。囲まれない = 式と判定された */
        const EXPRESSIONS: ReadonlyArray<readonly [string, string]> = [
            ["0", "0"],
            ["-1.5", "-1.5"],
            ["1e3", "1e3"],
            ["true", "true"],
            ["NULL", "NULL"],
            ["CURRENT_TIMESTAMP", "CURRENT_TIMESTAMP"],
            ["current_date", "current_date"],
            ["now()", "now()"],
            ["uuidv7()", "uuidv7()"],
            ["gen_random_uuid()", "gen_random_uuid()"],
            ["pg_catalog.now()", "pg_catalog.now()"],
            ["'{}'::jsonb", "'{}'::jsonb"],
            ["ARRAY[1,2]", "ARRAY[1,2]"],
        ];

        /** 式と判定されない値。**迷ったら囲む**側に倒れることを押さえる */
        const LITERALS: ReadonlyArray<readonly [string, string]> = [
            ["hello", "'hello'"],
            ["new table", "'new table'"],
            ["now", "'now'"],
            ["()", "'()'"],
        ];

        test("postgresql（strict）: 式は囲まず、文字列は囲む", () => {
            const cases = [...EXPRESSIONS, ...LITERALS];
            expect(
                serializeDefaults(
                    SERIALIZER_DB,
                    cases.map((c) => c[0]),
                ),
            ).toEqual(cases.map((c) => c[1]));
        });

        test("mysql（未現代化）: 6-4 以前のまま CURRENT_TIMESTAMP だけが特例", () => {
            /*
             * 未現代化プロファイルの規則は 1 文字も変えていない（6-8 でこちら側に移る）。
             * ddl/{mysql,mssql,oracle,sqlite} の golden 28 本が 1 バイトも動かないことの
             * 裏付けがこれ —— golden 側は「動かなかった」しか言えないが、ここは
             * 「動かない規則が実際に何か」を書いてある。
             */
            const inputs = ["0", "now()", "uuidv7()", "CURRENT_TIMESTAMP", "hello"];
            expect(serializeDefaults("mysql", inputs)).toEqual([
                "'0'",
                "'now()'",
                "'uuidv7()'",
                "CURRENT_TIMESTAMP",
                "'hello'",
            ]);
        });

        test("式は round-trip する（囲まなくなっても読み直しで変わらない）", () => {
            const inputs = EXPRESSIONS.map((c) => c[0]);
            const first = serializeDefaults(SERIALIZER_DB, inputs);

            h.loadFixture(probeXml(inputs));
            expect(defaults(h.toXML())).toEqual(first);

            h.loadFixture(h.toXML());
            expect(defaults(h.toXML())).toEqual(first);
        });
    });

    test("決定論: 同一モデルから toXML() を 2 回呼ぶと完全に一致する", () => {
        h.useDatatypes(SERIALIZER_DB);
        h.loadFixture(readFixture("house-defaults"));

        expect(h.toXML()).toBe(h.toXML());
    });
});
