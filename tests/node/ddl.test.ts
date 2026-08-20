import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DB_PROFILES, DDL_FIXTURES, SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { goldenPath, readGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import { createHarness, type NodeHarness } from "./harness.ts";

/**
 * DDL 生成の回帰（HANDOVER §7 の特性化テスト）。実ブラウザが採った golden と突き合わせる。
 *
 * **段階6-5a まで、ここは Node に XSLTProcessor が無いことの回避策だった。**
 * db/<db>/output.xsl を xslt-processor（純 JS の XSLT 1.0 実装）で実行し、エンジンの
 * 非準拠を 2 本の adapter で補い（XML 1.0 の line-end normalization と、method="text"
 * でも & < > をエスケープしてしまう癖）、それでも解決できない oracle を
 * parity 例外としてブラウザ側専任にしていた。
 *
 * **6-5a で DDL 生成が TS になり、その 3 つがまとめて不要になった。**
 * ブラウザと Node で同じ js/io/ddl/generate.ts が動くのでエンジン差そのものが無く、
 * **oracle も含めた 5 プロファイル × 7 fixture = 35 件がここで回る**（それまでは
 * oracle の 7 件が skip されていた）。golden を書けるのは今もブラウザ側だけで
 * （tests/support/golden.ts の UPDATE_GOLDEN）、ここは読むだけという分担も変わらない。
 */
describe("DDL golden（Node）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
    });

    afterAll(() => {
        h.close();
    });

    for (const db of DB_PROFILES) {
        describe(db, () => {
            for (const fixture of DDL_FIXTURES) {
                test(`${db} / ${fixture.name}`, () => {
                    h.useDatatypes(db);
                    h.loadFixture(readFixture(fixture.name));

                    const actual = h.toDdl();
                    assertNoCarriageReturn(actual, `DDL(${db}/${fixture.name})`);

                    expect(actual).toBe(readGolden(goldenPath("ddl", db, `${fixture.name}.sql`)));
                });
            }
        });
    }

    describe("DEFAULT の引用（段階6-4 の規則を 6-5a がそのまま引き取った）", () => {
        /*
         * quote 属性は「文字列型の既定値をリテラルとして囲む」ためのもので、6-4 まで
         * **式にも当たっていた** —— PG18 パレットの uuid は quote="'" なので house 既定の
         * DEFAULT uuidv7() が DEFAULT 'uuidv7()' になり、uuid 列に文字列を入れる DDL として
         * PG に弾かれる。§6.2 のテンプレートは既定値に uuidv7() / now() を持つので、
         * 直さずに入れると新規テーブルが必ず壊れた DDL を吐く（CUSTOMIZATIONS.md の段階6-4）。
         *
         * **段階6-5a まで、この表は tests/node/serialize.test.ts が <default> 要素の中身と
         * して見ていた。** XML の書き出しごと消えたので、観測面を生成 DDL に移してある
         * （規則そのものは js/io/ddl/shared.ts へ 1 文字も変えずに移設した）。
         *
         * fixture を足していないのは、DDL_FIXTURES に入れると golden が 5 プロファイル分
         * 増えるため。ここで見たいのは「入力値 -> DEFAULT の中身」という 1 対 1 の規則で、
         * 生成 DDL 全体の姿ではない。probe は VARCHAR（quote="'" を両プロファイルが持つ型）で組む。
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

        /**
         * 生成 DDL から各列の DEFAULT を順に取り出す。**DEFAULT 句そのものが出なければ
         * null**（postgresql は default = 'NULL' を捨てる分岐を持つ。XSLT からの逐語）。
         * 正規表現を使わないのは値に記号が多いため。
         */
        function defaultsOf(ddl: string, count: number): (string | null)[] {
            const lines = ddl.split("\n");
            return Array.from({ length: count }, (_, i) => {
                const line = lines.find((l) => l.includes(`c${i} `) || l.includes(`\`c${i}\` `));
                if (line === undefined) {
                    throw new Error(`列 c${i} が DDL に無い:\n${ddl}`);
                }
                const at = line.indexOf(" DEFAULT ");
                if (at === -1) {
                    return null;
                }
                const value = line.slice(at + " DEFAULT ".length);
                return value.endsWith(",") ? value.slice(0, -1) : value;
            });
        }

        function ddlDefaults(db: string, defs: readonly string[]): (string | null)[] {
            h.useDatatypes(db);
            h.loadFixture(probeXml(defs));
            return defaultsOf(h.toDdl(), defs.length);
        }

        /**
         * 左が入力、右が strict（postgresql）の DDL に出る DEFAULT。囲まれない = 式と判定された。
         * NULL だけ null なのは引用の規則ではなく、**PG の出力側**が default = 'NULL' のとき
         * 句ごと落とすため（db/postgresql/output.xsl:58-64 の逐語。式と判定されて囲まれない
         * からこそ 'NULL' ではなく NULL のままここに当たる）。
         */
        const EXPRESSIONS: ReadonlyArray<readonly [string, string | null]> = [
            ["0", "0"],
            ["-1.5", "-1.5"],
            ["1e3", "1e3"],
            ["true", "true"],
            ["NULL", null],
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
                ddlDefaults(
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
             *
             * NULL が 'NULL' として出るのは mysql が PG の default != 'NULL' 分岐を
             * 持たないため。囲む側の規則（未現代化なので CURRENT_TIMESTAMP 以外は囲む）と
             * 出力側の規則（句を落とすか）が別物であることがここに出ている。
             */
            const inputs = ["0", "now()", "uuidv7()", "CURRENT_TIMESTAMP", "NULL", "hello"];
            expect(ddlDefaults("mysql", inputs)).toEqual([
                "'0'",
                "'now()'",
                "'uuidv7()'",
                "CURRENT_TIMESTAMP",
                "'NULL'",
                "'hello'",
            ]);
        });

        test("式は round-trip する（囲まなくなっても読み直しで変わらない）", () => {
            const inputs = EXPRESSIONS.map((c) => c[0]);
            const first = ddlDefaults(SERIALIZER_DB, inputs);

            /* 同じ入力をもう一度読み直しても同じ DDL になる */
            h.loadFixture(probeXml(inputs));
            expect(defaultsOf(h.toDdl(), inputs.length)).toEqual(first);

            /* 正本フォーマット（JSON）を往復させても変わらない */
            h.loadJson(h.toJson());
            expect(defaultsOf(h.toDdl(), inputs.length)).toEqual(first);
        });
    });
});
