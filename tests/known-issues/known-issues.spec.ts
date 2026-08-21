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

test("#4 型パレットに無い型は黙って先頭の型になる（未現代化プロファイル）", async () => {
    // **postgresql は 6-3、mysql は 6-8a、mssql は 6-8b、oracle は 6-8c で解消した**
    // （uuid 相当の型と strict 化）。移設先は tests/browser/types.spec.ts の
    // 「UUID が uuid に解決される」と「strict なパレットでは未知の型が例外になる」。
    // **ここに残るのは sqlite だけで、6-8d で消える**（そのとき #4 の項目ごと無くなる）。
    //
    // **入力は postgresql の fixture でなければならない**（段階6-6a で fixture が DB 別に
    // なった）。見たいのは「そのパレットに無い型名を読ませたとき」で、sqlite の fixture を
    // sqlite のパレットで読むのは正常系。
    //
    // **空にしてからパレットを差し替える** —— sqlite は 5 型しか無く、前のテストが残した
    // テーブルを後始末すると範囲外の型添字を引いて落ちる（6-8a / 6-8b で踏んだ形）。
    await loadFixture(page, readFixture(SERIALIZER_DB, "empty"));
    await useDatatypes(page, "sqlite");
    await loadFixture(page, readFixture(SERIALIZER_DB, "house-defaults"));

    const id = await page.evaluate(() =>
        window.d!.palette.idAt(window.d!.tables[0]!.rows[0]!.data.type),
    );

    // fixture の users.id は UUID。sqlite パレットに uuid 型が無く、
    // js/io/xml-parser.ts の初期値 type:0 が残るため先頭型（text）になる
    // （設計 JSON は未知の id を throw するのでこの経路を持たない）。
    // **寄せ先は 6-8a で mysql -> oracle、6-8c で oracle -> sqlite と動いた。**
    expect(id).toBe("text");

    // 落ちた結果は DDL にもそのまま出る（sqlite は全列が TEXT に潰れる）
    const ddl = await generateDdl(page, "sqlite");
    expect(ddl).toContain("'id' TEXT");
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
 * #4 と同じ形で、現象は未現代化の 1 本（sqlite）だけに残っている
 * ——直るのは 6-8。fixtures/quote-in-default.xml はそのまま残してある。
 *
 * 「直った後の挙動」は tests/node/ddl.test.ts の LITERALS 表（O'Brien -> 'O''Brien'）、
 * 「未現代化では直っていない」ことは同ファイルの mysql のテストが押さえる。
 */

/*
 * §6 段階6-5a が新設した 2 件のうち、**#12 は 6-8b で直った**（mssql の現代化）。
 * 移設先は tests/node/ddl.test.ts の「mssql（段階6-8b）」。残るのは #13 で、6-8d で消える。
 */

test("#13 sqlite: 複合 PRIMARY KEY が UNIQUE に落ち PRIMARY KEY が消える", async () => {
    /*
     * **空にしてからパレットを差し替える。** 逆にすると、前のテストが残したテーブル
     * （oracle の 15 型で解決済み）を sqlite の 5 型で後始末することになり、
     * clearTables() が範囲外の型添字を引いて Row.getColor で落ちる。
     * 6-8a が template.spec.ts で踏んだのと同じ形で、**プロファイルが現代化されて
     * 寄せ先が動くたびに露出する**（型数の少ない側へ切り替えると起きる）。
     */
    await loadFixture(page, readFixture(SERIALIZER_DB, "empty"));
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
 * §6 段階6-8c で新設。**grabado の生成器の欠陥ではなく Oracle の制約**だが、
 * 「実行できない DDL を出す」ことに変わりはないので隔離する。
 *
 * 生成した DDL を Oracle 23ai に流して見つけた（6 本のうち quotes-i18n だけが落ちた）。
 * **直し方が生成器の中に無い**のがこの 1 本の特徴 —— 識別子を書き換えるのは 6-5b の
 * 決めたこと 7 で採らないと決めており、残る手は「入力側（UI）で止める」しかない。
 * 6-5b が同じ棚に送った「63 バイトを超える識別子」「空文字の識別子」と同じ性質で、
 * 直すのは 6-9 以降（§11 の AI リファクタ提案が review-first で受けるのが素直）。
 */
test("#15 oracle: 識別子に \" を含むと実行できない DDL になる", async () => {
    await loadFixture(page, readFixture(SERIALIZER_DB, "empty"));
    await useDatatypes(page, "oracle");
    await loadFixture(page, readFixture(SERIALIZER_DB, "quotes-i18n"));

    const ddl = await generateDdl(page, "oracle");

    /*
     * grabado は他の 7 本と同じ規則で "" にエスケープして出す。**Oracle だけがそれを
     * 受け付けない** —— ORA-25716: The identifier contains a double quotation mark (")
     * character。他プロファイル（postgresql / h2 / sql-standard）は同じ形で通る。
     */
    expect(ddl).toContain('"say ""hi"""');
});
