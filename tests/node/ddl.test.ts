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

        /**
         * 式と判定されない値。**迷ったら囲む**側に倒れることを押さえる。
         *
         * 下 2 件は **known-issues #11 の移設先**（段階6-5b）。6-5a まで囲む側は値の中を
         * 一度も見ておらず、O'Brien を打つと DEFAULT 'O'Brien' という壊れた DDL が出ていた。
         * §6.2 のテンプレートで「文字列の既定値を打つ」が house 既定に入ったぶん実際に踏む。
         */
        const LITERALS: ReadonlyArray<readonly [string, string]> = [
            ["hello", "'hello'"],
            ["new table", "'new table'"],
            ["now", "'now'"],
            ["()", "'()'"],
            ["O'Brien", "'O''Brien'"],
            ["it's a 'test'", "'it''s a ''test'''"],
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
            const inputs = [
                "0",
                "now()",
                "uuidv7()",
                "CURRENT_TIMESTAMP",
                "NULL",
                "hello",
                "O'Brien",
            ];
            expect(ddlDefaults("mysql", inputs)).toEqual([
                "'0'",
                "'now()'",
                "'uuidv7()'",
                "CURRENT_TIMESTAMP",
                "'NULL'",
                "'hello'",
                /* known-issues #11 は未現代化プロファイルには**残っている**（6-8 で移る）。
                   28 本の golden が動かないことの規則側の裏付けがこの 1 行 */
                "'O'Brien'",
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

    /*
     * §6.3 の命名規約と識別子の引用（段階6-5b）。
     *
     * **golden はこの規則を説明できない。** house-defaults.sql は「fixture が名前を持つとき
     * どう出るか」しか言えず、fixture 11 個すべてが key/@name を持つので「名前が空のときの
     * 規約」は 35 本のどこにも現れない。識別子の引用も、fixture の識別子に予約語が 1 つも
     * 無いので予約語の分岐が golden に写らない。CREATE INDEX に至っては INDEX / FULLTEXT を
     * 持つ fixture が 0 本で 1 行も出ない。
     *
     * fixture を足さないのは 6-5a と同じ理由 —— DDL_FIXTURES に 1 本足すと golden が
     * 5 プロファイル分増え、「動いた行を 1 行ずつ説明する」という段階の完了判定がぼやける。
     * 上の probeXml() と同じ形で、テスト内に XML を組み立てて食わせる。
     */
    describe("§6.3 の命名規約と識別子の引用（段階6-5b）", () => {
        /** XML 属性値のエスケープ（識別子に " や & を入れるため） */
        function attr(value: string): string {
            return value
                .split("&")
                .join("&amp;")
                .split("<")
                .join("&lt;")
                .split('"')
                .join("&quot;");
        }

        interface ProbeKey {
            readonly type: string;
            /** 省略すると name 属性ごと出さない（＝ 属性の無い <key>） */
            readonly name?: string;
            readonly parts: readonly string[];
        }

        /** 任意のテーブル名・列名・キーで 1 テーブルを組む */
        function tableXml(
            table: string,
            columns: readonly string[],
            keys: readonly ProbeKey[] = [],
        ): string {
            const rows = columns.map(
                (name) =>
                    `<row name="${attr(name)}" null="1" autoincrement="0">\n` +
                    `<datatype>TEXT</datatype>\n` +
                    `</row>\n`,
            );
            const ks = keys.map((k) => {
                const name = k.name === undefined ? "" : ` name="${attr(k.name)}"`;
                const parts = k.parts.map((p) => `<part>${attr(p)}</part>\n`).join("");
                return `<key type="${k.type}"${name}>\n${parts}</key>\n`;
            });
            return (
                `<?xml version="1.0" encoding="utf-8" ?>\n<sql>\n` +
                `<table x="0" y="0" name="${attr(table)}">\n` +
                rows.join("") +
                ks.join("") +
                `</table>\n</sql>\n`
            );
        }

        function ddlOf(db: string, xml: string): string {
            h.useDatatypes(db);
            h.loadFixture(xml);
            return h.toDdl();
        }

        test("name が空のキーは §6.3 の規約で名前を組む（known-issue #6 の移設先）", () => {
            const ddl = ddlOf(
                SERIALIZER_DB,
                tableXml(
                    "probe",
                    ["c0", "c1"],
                    [
                        { type: "PRIMARY", name: "", parts: ["c0"] },
                        { type: "UNIQUE", name: "", parts: ["c1"] },
                        { type: "INDEX", name: "", parts: ["c0", "c1"] },
                        { type: "FULLTEXT", name: "", parts: ["c1"] },
                    ],
                ),
            );

            /*
             * PRIMARY と UNIQUE が同じテーブルにあっても名前が衝突しない ＝ #6 そのもの。
             * 6-5a まではどちらも probe_pkey で、PG が 2 つ目を弾いていた。
             */
            expect(ddl).toContain("ALTER TABLE probe ADD CONSTRAINT probe_pkey PRIMARY KEY (c0);");
            expect(ddl).toContain("ALTER TABLE probe ADD CONSTRAINT probe_c1_key UNIQUE (c1);");

            /* PRIMARY / UNIQUE 以外は PG に無い KEY (...) ではなく CREATE INDEX へ */
            expect(ddl).toContain("CREATE INDEX idx_probe_c0_c1 ON probe (c0, c1);");
            expect(ddl).toContain("CREATE INDEX idx_probe_c1 ON probe (c1);");
            /* 6-5a まで INDEX / FULLTEXT が落ちていた ADD CONSTRAINT <name> KEY (...) の形 */
            expect(ddl).not.toMatch(/ADD CONSTRAINT \S+ KEY \(/);
        });

        test("key/@name があれば規約より優先する", () => {
            const ddl = ddlOf(
                SERIALIZER_DB,
                tableXml(
                    "probe",
                    ["c0", "c1"],
                    [
                        { type: "PRIMARY", name: "pk_probe", parts: ["c0"] },
                        { type: "INDEX", name: "probe_lookup", parts: ["c1"] },
                    ],
                ),
            );

            expect(ddl).toContain("ADD CONSTRAINT pk_probe PRIMARY KEY (c0);");
            expect(ddl).toContain("CREATE INDEX probe_lookup ON probe (c1);");
            expect(ddl).not.toContain("probe_pkey");
            expect(ddl).not.toContain("idx_probe_c1");
        });

        test("列を 1 つも持たないキーは 1 文字も出さない", () => {
            /*
             * KeyManager.add() は name も parts も空のキーを作る（UI から到達可能）。
             * 6-5a まで PRIMARY KEY (); という構文エラーが出ていた。規約名も cols が空だと
             * probe__key / idx_probe_ に退化するので、出力そのものを止める。
             */
            const ddl = ddlOf(
                SERIALIZER_DB,
                tableXml("probe", ["c0"], [{ type: "INDEX", name: "", parts: [] }]),
            );

            expect(ddl).not.toContain("CREATE INDEX");
            expect(ddl).not.toContain("ADD CONSTRAINT");
        });

        /**
         * 左が識別子、右が DDL に出る形。**裸のままであることも押さえる** ——
         * 引用しすぎる側に倒れると house 標準の snake_case まで "users" になり、
         * golden が動かないぶんテストでしか捕まらない。
         */
        const IDENTIFIERS: ReadonlyArray<readonly [string, string]> = [
            /* 裸で出る側（house 標準はここに収まる） */
            ["plain_name", "plain_name"],
            ["_leading", "_leading"],
            ["c1", "c1"],
            /* 予約語（catcode R / T）。裸で出すと壊れる */
            ["order", '"order"'],
            ["user", '"user"'],
            ["select", '"select"'],
            ["left", '"left"'],
            ["is", '"is"'],
            /* 予約語でない語（catcode C / U）は裸のまま */
            ["integer", "integer"],
            ["between", "between"],
            /* 形が裸に収まらない側 */
            ["Table", '"Table"'],
            ["氏名", '"氏名"'],
            ["with space", '"with space"'],
            ["1st", '"1st"'],
            ['say "hi"', '"say ""hi"""'],
        ];

        test("識別子は必要なときだけ囲む（列名）", () => {
            const ddl = ddlOf(
                SERIALIZER_DB,
                tableXml(
                    "probe",
                    IDENTIFIERS.map((c) => c[0]),
                ),
            );
            const lines = ddl.split("\n");

            for (const [name, expected] of IDENTIFIERS) {
                const line = lines.find((l) => l.startsWith(` ${expected} TEXT`));
                expect(line, `列 ${name} が ${expected} として出ていない:\n${ddl}`).toBeDefined();
            }
        });

        test("識別子は必要なときだけ囲む（テーブル名・制約名）", () => {
            const ddl = ddlOf(
                SERIALIZER_DB,
                tableXml(
                    "order",
                    ["氏名"],
                    [{ type: "PRIMARY", name: "顧客_pkey", parts: ["氏名"] }],
                ),
            );

            expect(ddl).toContain('CREATE TABLE "order" (');
            /* 制約名も識別子。名前を組んでから囲む（naming.ts の順序規約） */
            expect(ddl).toContain(
                'ALTER TABLE "order" ADD CONSTRAINT "顧客_pkey" PRIMARY KEY ("氏名");',
            );
        });

        test("name 属性の無い <key> は null という名前を作らない", () => {
            /*
             * 属性が無いと getAttribute は null を返す。6-5a まで shared.ts が String() で
             * 受けていたので "null" という文字列の制約名になり、mssql は CONSTRAINT null を、
             * sqlite は CREATE INDEX 'null' を実際に出していた（upstream 由来）。
             * 6-5b で xml-parser.ts が "" に正規化するので、PG は規約名に落ちる。
             *
             * fixture 11 個すべてが name 属性を持つため **golden はこれを 1 行も説明しない**。
             */
            const xml = tableXml("probe", ["c0"], [{ type: "PRIMARY", parts: ["c0"] }]);

            expect(ddlOf(SERIALIZER_DB, xml)).toContain(
                "ADD CONSTRAINT probe_pkey PRIMARY KEY (c0);",
            );

            /* 未現代化プロファイルでも "null" は出ない（6-5b が源流を直したので全 5 本に効く） */
            expect(ddlOf("mssql", xml)).not.toContain("null");
        });
    });
});
