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
                    h.loadFixture(readFixture(db, fixture.name));

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
         * 生成 DDL 全体の姿ではない。probe は **CHAR** で組む —— quote="'" を両プロファイルが
         * 持つ型で、**oracle には VARCHAR が無い**（VARCHAR2）ため。6-8a で寄せ先が mysql から
         * oracle へ動いたとき、VARCHAR では先頭型（INTEGER・quote=""）に落ちて空振りした。
         *
         * **入力は quote 剥がし（js/io/xml-parser.ts）を通らない値だけ**にしてある ——
         * 剥がされるのは両端が ' の値で、'{}'::jsonb は末尾が b なので当たらない。
         */
        function probeXml(defs: readonly string[]): string {
            const rows = defs.map(
                (def, i) =>
                    `<row name="c${i}" null="0" autoincrement="0">\n` +
                    `<datatype>CHAR</datatype>\n` +
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
                /*
                 * 列の見つけ方が 3 通りあるのは、プロファイルごとに識別子の囲み方が違うため
                 * （裸 / バッククォート / 二重引用符）。**6-8a で寄せ先が oracle になって
                 * 3 つ目が要った。**
                 */
                const line = lines.find(
                    (l) =>
                        l.includes(`c${i} `) ||
                        l.includes(`\`c${i}\` `) ||
                        l.includes(`"c${i}"`),
                );
                if (line === undefined) {
                    throw new Error(`列 c${i} が DDL に無い:\n${ddl}`);
                }
                const at = line.indexOf(" DEFAULT ");
                if (at === -1) {
                    return null;
                }
                /*
                 * 値の切り出しは**末尾から削る**。oracle は桁揃えのために
                 * DEFAULT '0'          NOT NULL と後ろを空白で埋めるので後続を落とす必要が
                 * あり、かといって「最初の空白まで」にすると 'new table' のように**値自体が
                 * 空白を含む**ケースが切れる（6-8a で一度そう壊した）。
                 */
                const rest = line.slice(at + " DEFAULT ".length);
                const value = (rest.endsWith(",") ? rest.slice(0, -1) : rest)
                    .replace(/\s+NOT\s+NULL\s*$/, "")
                    .trim();
                return value;
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

        test("oracle（未現代化）: 6-4 以前のまま CURRENT_TIMESTAMP だけが特例", () => {
            /*
             * 未現代化プロファイルの規則は 1 文字も変えていない（6-8 で 1 本ずつこちら側に移る）。
             * **6-8a で mysql が抜けたので寄せ先を oracle にした**（6-8c で消える）。
             * ddl/{mssql,oracle,sqlite} の golden 21 本が 1 バイトも動かないことの
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
            /* **6-8a で mysql が現代化されたので寄せ先を oracle に移した**（6-8c で消える） */
            expect(ddlDefaults("oracle", inputs)).toEqual([
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

        /*
         * sql-standard（段階6-7a）。**golden はこのプロファイルの要点を説明しない。**
         *
         * 要点は 3 つあり、どれも 7 本の golden に 1 行も現れない:
         *   1. 引用の語彙が SQL:2016 の 365 語であること —— fixture の識別子に標準予約語が
         *      1 つも無い（house 標準の snake_case は素直に裸で出る）
         *   2. 索引が行コメントで出ること —— INDEX / FULLTEXT を持つ fixture が 0 本
         *   3. コメントの改行が空白へ畳まれること —— fixture のコメントが 1 行しかない
         */
        /*
     * mssql（段階6-8b）。**known-issues #12 / #14 の移設先。**
     *
     * どちらも「直った後の挙動」を固定する形に書き換えてある（known-issues/README.md の運用 3）。
     * golden にも出るが、**なぜその形なのかは golden からは読めない**ので規則として置く。
     */
    describe("mssql（段階6-8b）", () => {
        test("コメントは列定義の後ろに出す（known-issue #12 の移設先）", () => {
            /*
             * 6-8b まで列定義の行末に -- コメントを付けており、**最終列にコメントがあると
             * 続く区切りカンマが飲まれて T-SQL が構文エラーになっていた**。位置を変えたのが
             * 是正の本体で、コメント自体は落としていない（T-SQL に列コメントの構文は無く、
             * sp_addextendedproperty はモデルが持たない引数を要求する）。
             */
            const xml = [
                '<?xml version="1.0" encoding="utf-8" ?>',
                "<sql>",
                '<table x="0" y="0" name="probe">',
                '<row name="c0" null="1" autoincrement="0">',
                "<datatype>int</datatype>",
                "<comment>最終列のコメント</comment>",
                "</row>",
                '<key type="PRIMARY" name="probe_pkey"><part>c0</part></key>',
                "</table>",
                "</sql>",
                "",
            ].join("\n");
            const ddl = ddlOf("mssql", xml);

            /* 列定義の行にコメントが無く、カンマが飲まれない */
            expect(ddl).toContain("  c0 int");
            expect(ddl).not.toMatch(/int.*--/);
            /* コメントは表定義の後ろ */
            expect(ddl).toContain("-- probe.c0: 最終列のコメント");
            /* 制約行が列定義から続いている（#12 では繋がらなかった） */
            expect(ddl).toContain("CONSTRAINT probe_pkey PRIMARY KEY (c0)");
        });

        test("UNIQUE は T-SQL の構文で出す（known-issue #14 の移設先）", () => {
            /* 6-8b まで MySQL の UNIQUE KEY (...) を出していた（T-SQL に KEY は無い） */
            const ddl = ddlOf(
                "mssql",
                tableXml(
                    "probe",
                    ["c0"],
                    [{ type: "UNIQUE", name: "probe_c0_key", parts: ["c0"] }],
                ),
            );

            expect(ddl).toContain("CONSTRAINT probe_c0_key UNIQUE (c0)");
            expect(ddl).not.toContain("UNIQUE KEY");
        });
    });

    describe("sql-standard（段階6-7a）", () => {
            /**
             * **語彙だけが postgresql と違う**ことの対比表。囲む記号も規則も同じで、
             * 「裸で書けない語」の集合だけが入れ替わる。
             *
             * 3 列目までが [識別子, postgresql での姿, sql-standard での姿]。**上 7 行は
             * 片方でだけ囲まれる**ので、片方の語彙をもう片方に貼り間違えると必ず落ちる。
             */
            const VOCABULARY: ReadonlyArray<readonly [string, string, string]> = [
                /* 標準の予約語。SQL:2016 は関数名まで予約するので PG では普通の列名 */
                ["year", "year", '"year"'],
                ["value", "value", '"value"'],
                ["abs", "abs", '"abs"'],
                ["count", "count", '"count"'],
                /* PostgreSQL 固有の予約語。標準には無い語なので sql-standard では裸 */
                ["analyse", '"analyse"', "analyse"],
                ["ilike", '"ilike"', "ilike"],
                ["freeze", '"freeze"', "freeze"],
                /* どちらでも予約語 */
                ["select", '"select"', '"select"'],
                ["primary", '"primary"', '"primary"'],
                /* どちらでも予約語でない（house 標準の名前はここに収まる） */
                ["created_at", "created_at", "created_at"],
                ["email", "email", "email"],
            ];

            test("引用の語彙が SQL:2016 の 365 語に入れ替わる（規則は postgresql と同じ）", () => {
                const xml = tableXml(
                    "probe",
                    VOCABULARY.map((v) => v[0]),
                );
                const pg = ddlOf(SERIALIZER_DB, xml).split("\n");
                const std = ddlOf("sql-standard", xml).split("\n");

                for (const [name, inPg, inStd] of VOCABULARY) {
                    expect(
                        pg.find((l) => l.startsWith(` ${inPg} TEXT`)),
                        `postgresql: 列 ${name} が ${inPg} として出ていない`,
                    ).toBeDefined();
                    expect(
                        std.find((l) => l.startsWith(` ${inStd} CHARACTER LARGE OBJECT`)),
                        `sql-standard: 列 ${name} が ${inStd} として出ていない`,
                    ).toBeDefined();
                }
            });

            test("索引は標準の範囲外なので行コメントで出す", () => {
                const ddl = ddlOf(
                    "sql-standard",
                    tableXml(
                        "probe",
                        ["c0", "c1"],
                        [
                            { type: "PRIMARY", name: "", parts: ["c0"] },
                            { type: "INDEX", name: "", parts: ["c0", "c1"] },
                        ],
                    ),
                );

                /* 制約は標準どおり出す */
                expect(ddl).toContain("ALTER TABLE probe ADD CONSTRAINT probe_pkey PRIMARY KEY (c0);");
                /* CREATE INDEX はどの版の SQL にも無い。情報は落とさずコメントにする */
                expect(ddl).toContain(
                    "-- CREATE INDEX idx_probe_c0_c1 ON probe (c0, c1); (索引は SQL 標準の範囲外)",
                );
                expect(ddl).not.toMatch(/^CREATE INDEX/m);
            });

            test("コメントは行コメントで出し、改行を空白へ畳む", () => {
                /*
                 * -- は行末までがコメントなので、値に改行が入ると 2 行目から SQL として
                 * 解釈されて壊れる（postgresql は COMMENT ON ... '...' で囲むので同じ危険が無い）。
                 */
                const xml = [
                    '<?xml version="1.0" encoding="utf-8" ?>',
                    "<sql>",
                    '<table x="0" y="0" name="probe">',
                    '<row name="c0" null="1" autoincrement="0">',
                    "<datatype>TEXT</datatype>",
                    "<comment>1 行目\n2 行目</comment>",
                    "</row>",
                    "<comment>表\n注記</comment>",
                    "</table>",
                    "</sql>",
                    "",
                ].join("\n");
                const ddl = ddlOf("sql-standard", xml);

                expect(ddl).toContain("-- probe: 表 注記");
                expect(ddl).toContain("-- probe.c0: 1 行目 2 行目");
                /* COMMENT ON は標準に無いので 1 行も出さない */
                expect(ddl).not.toContain("COMMENT ON");
            });
        });
    });
});
