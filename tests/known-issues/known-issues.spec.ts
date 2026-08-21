import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import {
    REPO_ROOT,
    SERIALIZER_DB,
    readFixture,
    readKnownIssueFixture,
} from "../support/fixtures.ts";
import { generateDdl, loadFixture, openDesigner, useDatatypes } from "../browser/harness.ts";

/**
 * 現行コードの既知の不具合。**golden ファイルは持たない**。
 *
 * golden（tests/golden/）は「移植で変わってはいけない挙動」の記録なので、
 * バグをそこに焼くと期待される正しい出力に見えてしまう。ここでは
 * 「現在こう壊れている」ことをテストコード内のリテラルで直接アサートする。
 *
 * 運用: 移植（HANDOVER §4 / §6.3）で直したらこのテストが**赤くなる**。
 * その時点で「直った」ことを確認し、CUSTOMIZATIONS.md に記録してからテストを更新する。
 * 詳細は同ディレクトリの README.md。
 */
let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
    await useDatatypes(page, SERIALIZER_DB);
});

test.afterAll(async () => {
    await page.close();
});

/*
 * #1（属性値のエスケープ不足）と #8（<default> の末尾に改行が無い）は §4 段階4-4 で、
 * #2（保存で <default>NULL</default> が生える）は §4 段階4-5 で直した。「直った後の挙動」の
 * アサートは tests/browser/serialize.spec.ts に移してある（README の運用 3）。
 *
 * #3（BIGINT が Real に化ける）は §6 段階6-2 で直した。移設先は tests/browser/types.spec.ts と
 * tests/browser/json.spec.ts。同じ段階で **#10 を新設**している（下）—— #3 の記述にあった
 * 「re もアンカー無しの部分一致」はそちらが引き継ぐ。
 */

test("#10 <type re> の照合が壊れている（アンカー無し・sql の完全一致を上書き）", async () => {
    // (1) oracle は integer(sql="INTEGER") -> number(re="INT") の順に並ぶ。sql が完全一致した
    //     後で number の re が部分一致して上書きするので、INTEGER が NUMBER になる。
    await useDatatypes(page, "oracle");
    await loadFixture(page, readKnownIssueFixture("re-match-drift"));

    const oracleIds = await page.evaluate(() =>
        window.d!.tables[0]!.rows.map((r) => window.d!.palette.idAt(r.data.type)),
    );
    expect(oracleIds[0]).toBe("number");
    expect(oracleIds[0]).not.toBe("integer");

    // (2) mssql は re="INT" を 4 型（tinyint / smallint / int / bigint）に振っている。
    //     後勝ちなので INTEGER は bigint に当たり、**素朴に先勝ちへ倒すと tinyint に縮む**。
    //     **6-8a で mysql が現代化されたので (2) の寄せ先を mssql に移した**（6-8b で消える）。
    await useDatatypes(page, "mssql");
    await loadFixture(page, readKnownIssueFixture("re-match-drift"));

    const mssqlIds = await page.evaluate(() =>
        window.d!.tables[0]!.rows.map((r) => window.d!.palette.idAt(r.data.type)),
    );
    expect(mssqlIds[0]).toBe("bigint");

    // 段階6-2 は sql の完全一致どうしの順序だけを直し（#3）、ここは意図して残した。
    // 素朴に re を先勝ちへ倒すと mssql が re="INT" を 4 型に持つぶん INTEGER -> tinyint と
    // 縮み、oracle と合わせて DDL golden 12 本が品質を下げる方向に動く。直すのは 6-8。
    //
    // **postgresql は段階6-3 でこの不具合から抜けた** —— strict なプロファイルは re を
    // 見ず、sql / aka の大小無視の完全一致だけで解決する。当時ここが押さえていた
    // 「decimal の re="numeric" が大文字 NUMERIC に当たらない」の移設先は
    // tests/node/type-resolution.test.ts の「大文字小文字を無視する」。
});

test("#4 型パレットに無い型は黙って先頭の型になる（未現代化プロファイル）", async () => {
    // **postgresql は段階6-3 で、mysql は 6-8a で解消した**（uuid 相当の型と strict 化）。
    // 移設先は tests/browser/types.spec.ts の「UUID が uuid に解決される」と
    // 「strict なパレットでは未知の型が例外になる」。ここに残るのは未現代化の 3 本で、
    // それぞれのパレットを現代化する 6-8b 以降で消える。
    //
    // **入力は postgresql の fixture でなければならない**（段階6-6a で fixture が DB 別に
    // なった）。見たいのは「そのパレットに無い型名を読ませたとき」で、oracle の fixture を
    // oracle のパレットで読むのは正常系。6-6b が 4 プロファイルの fixture を実型へ書き換えても
    // ここは動かない。
    await useDatatypes(page, "oracle");
    await loadFixture(page, readFixture(SERIALIZER_DB, "house-defaults"));

    const id = await page.evaluate(() =>
        window.d!.palette.idAt(window.d!.tables[0]!.rows[0]!.data.type),
    );

    // fixture の users.id は UUID。oracle パレットに uuid 型が無く、
    // js/io/xml-parser.ts の初期値 type:0 が残るため先頭型（integer）になる
    // （設計 JSON は未知の id を throw するのでこの経路を持たない）。
    // **6-8a で mysql が現代化されたので寄せ先を oracle に移した**（6-8c で消える）。
    expect(id).toBe("integer");

    // 落ちた結果は DDL にもそのまま出る（oracle は #10 で INTEGER が NUMBER に化ける）
    const ddl = await generateDdl(page, "oracle");
    expect(ddl).toContain('"id"');
    expect(ddl).toContain("NUMBER");
});

/*
 * #5（空の <default></default> で ` DEFAULT ` だけが残る）は §6 段階6-5a で**構造的に消えた**。
 *
 * 現象が起きるのは「introspection が吐いた XML を直接 XSLT に食わせる」経路だけで、
 * その XSLT が TS 生成器になり、生成器はモデル（js/io/model.ts）からしか DDL を作らない。
 * 空の <default> は読み込みの時点で row.def = "" になり（段階4-5 で「既定 NULL」の内部表現を
 * 撤去した結果）、生成器の hasDefault が false になるので DEFAULT 句そのものが出ない。
 * **直したというより、現象に到達する経路が無くなった。**
 *
 * 「直った後の挙動」のアサートは tests/browser/serialize.spec.ts に移してある（README の運用 3）。
 */

/*
 * #6（key が複数あると制約名が <table>_pkey で衝突する）は §6 段階6-5b で直した。
 *
 * 制約名は key/@name を優先し、空のときだけ §6.3 の規約で組む（js/io/ddl/naming.ts）。
 * house-defaults の users は PRIMARY と UNIQUE の 2 本を持つので、直った結果が
 * tests/golden/ddl/postgresql/house-defaults.sql に users_email_key として出ている
 * （PRIMARY / UNIQUE 以外が ADD CONSTRAINT ... KEY (...) に落ちる件も同時に消えた）。
 *
 * 「直った後の挙動」と**規約そのもの**のアサートは tests/node/ddl.test.ts の
 * 「§6.3 の命名規約と識別子の引用（段階6-5b）」へ移してある（README の運用 3）——
 * fixture 11 個すべてが name を持つので、名前が空のときの規約は golden では見えない。
 */

/*
 * #7（alignTables() の破壊的ソート）は §4 段階4-4 で直した。「直った後の挙動」の
 * アサートは tests/browser/serialize.spec.ts に移してある（README の運用 3）。
 */

test("#9 introspection サンプル（PG18 実出力）が well-formed でなく index も出ない", async () => {
    const sample = readFileSync(
        join(REPO_ROOT, "docs", "samples", "introspection-postgresql.xml"),
        "utf8",
    );

    const parseFailed = await page.evaluate((source) => {
        const doc = new DOMParser().parseFromString(source, "text/xml");
        return doc.getElementsByTagName("parsererror").length > 0;
    }, sample);

    // docs/ARCHITECTURE.md §4.6 / CUSTOMIZATIONS.md の実測記録どおり。
    // 余分な </key> でパースが落ち、PG18 相手の import はフロントでも読み込めない。
    expect(parseFailed).toBe(true);
    // index 収集ループが break するため、実在する index が 1 つも出ていない
    expect(sample).not.toContain("idx_articles_author_id");
    expect(sample).not.toContain("idx_articles_published_on_title");
});

/*
 * #11（既定値を quote で囲むとき値の中の ' がエスケープされない）は §6 段階6-5b で
 * **strict なプロファイルだけ**直した（js/io/ddl/shared.ts の escapeLiteral）。
 * #4 / #10 と同じ形で、現象は未現代化の 3 本（mssql / oracle / sqlite）に残っている
 * ——直るのは 6-8。fixtures/quote-in-default.xml はそのまま残してある。
 *
 * 「直った後の挙動」は tests/node/ddl.test.ts の LITERALS 表（O'Brien -> 'O''Brien'）、
 * 「未現代化では直っていない」ことは同ファイルの mysql のテストが押さえる。
 */

/*
 * ここから下は §6 段階6-5a で新設した 2 件。**6-5a が作った欠陥ではない** ——
 * XSLT を TS へ逐語移植する過程で読み直したときに見つかった、upstream からの粗さ。
 * 挙動不変が 6-5a の要件なので TS 側でも忠実に再現してあり、直すのは 6-8
 * （既存主要 4 本の現代化）。**黙って持ち込まないための隔離**がこの 2 本。
 */

test("#12 mssql: 最終列にコメントがあると区切りカンマが -- に飲まれる", async () => {
    await useDatatypes(page, "mssql");
    await loadFixture(page, readFixture(SERIALIZER_DB, "relations"));

    const ddl = await generateDdl(page, "mssql");

    /*
     * 列定義はカンマをコメントより先に出す（db/mssql/output.xsl:34-45 の逐語）。
     * 最終列にコメントが付くと、そのあと key ループが出す区切りカンマが同じ行の
     * -- の後ろに来るので、**T-SQL としては次の CONSTRAINT 行が列定義に繋がらない**。
     * employees の最終列 manager_id は自己参照 FK でコメントを持つ。
     */
    expect(ddl).toContain("[manager_id] bigint  -- 直属の上長（自己参照）, ");
    /* カンマがコメント行の末尾に流れるので、CONSTRAINT が行頭から始まる */
    expect(ddl).toContain("\nCONSTRAINT employees_pkey PRIMARY KEY ([id])");
});

test("#13 sqlite: 複合 PRIMARY KEY が UNIQUE に落ち PRIMARY KEY が消える", async () => {
    await useDatatypes(page, "sqlite");
    await loadFixture(page, readFixture(SERIALIZER_DB, "relations"));

    const ddl = await generateDdl(page, "sqlite");

    /*
     * db/sqlite/output.xsl:61-64 は「UNIQUE、または part が 2 個以上の PRIMARY」を
     * まとめて UNIQUE (...) として出す。単一列 PK だけが列定義に inline されるので、
     * **複合 PK を持つテーブルには PRIMARY KEY が 1 つも無い DDL ができる**。
     * employee_projects の PK は (employee_id, project_id) の複合。
     */
    const composite = ddl.slice(ddl.indexOf("CREATE TABLE 'employee_projects'"));
    const createTable = composite.slice(0, composite.indexOf(");"));
    expect(createTable).toContain("UNIQUE (employee_id, project_id)");
    expect(createTable).not.toContain("PRIMARY KEY");
});

/*
 * §6 段階6-6b で新設。**6-6b が作った欠陥ではない** —— 6-5a が逐語移植した upstream の
 * 粗さで、当時の 9 件の一覧から漏れていたもの。4 プロファイルの fixture を実型で
 * 書き直したときに house 既定の UNIQUE を読み直して見つかった。直すのは 6-8。
 *
 * 入力は #12 / #13 と揃えて postgresql の fixture のままにしてある —— 生成器が出す
 * 構文の話で、列の型には依存しないため。
 */
test("#14 mssql: UNIQUE キーが T-SQL に無い UNIQUE KEY 構文で出る", async () => {
    await useDatatypes(page, "mssql");
    await loadFixture(page, readFixture(SERIALIZER_DB, "house-defaults"));

    const ddl = await generateDdl(page, "mssql");

    /*
     * js/io/ddl/mssql.ts:63（db/mssql/output.xsl の逐語）が MySQL の構文をそのまま出す。
     * T-SQL の正しい形は CONSTRAINT <name> UNIQUE ( <cols> ) で、KEY は付かない。
     * house 既定は users に UNIQUE を 1 本持つので、**この DB では必ず踏む**。
     */
    expect(ddl).toContain("CONSTRAINT users_email_key UNIQUE KEY ([email])");
    expect(ddl).not.toContain("CONSTRAINT users_email_key UNIQUE ([email])");
});
