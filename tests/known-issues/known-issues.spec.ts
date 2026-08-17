import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import {
    REPO_ROOT,
    SERIALIZER_DB,
    readFixture,
    readKnownIssueFixture,
} from "../support/fixtures.ts";
import {
    generateDdl,
    loadFixture,
    openDesigner,
    transformXml,
    useDatatypes,
} from "../browser/harness.ts";

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

test("#10 <type re> の照合が壊れている（アンカー無し・大小文字・sql の完全一致を上書き）", async () => {
    // (1) oracle は integer(sql="INTEGER") -> number(re="INT") の順に並ぶ。sql が完全一致した
    //     後で number の re が部分一致して上書きするので、INTEGER が NUMBER になる。
    await useDatatypes(page, "oracle");
    await loadFixture(page, readKnownIssueFixture("re-match-drift"));

    const oracleLabels = await page.evaluate(() =>
        window.d!.tables[0]!.rows.map((r) => r.getDataType().getAttribute("label")),
    );
    expect(oracleLabels[0]).toBe("NUMBER");
    expect(oracleLabels[0]).not.toBe("INTEGER");

    // (2) postgresql の decimal は re="numeric"（小文字）なので大文字の NUMERIC には当たらず、
    //     一致 0 件で先頭型 Integer に落ちる（#4 と同じ落ち方だが、原因は re の大小文字）。
    await useDatatypes(page, SERIALIZER_DB);
    await loadFixture(page, readKnownIssueFixture("re-match-drift"));

    const pgLabels = await page.evaluate(() =>
        window.d!.tables[0]!.rows.map((r) => r.getDataType().getAttribute("label")),
    );
    expect(pgLabels[1]).toBe("Integer");
    expect(pgLabels[1]).not.toBe("Decimal");

    // 段階6-2 は sql の完全一致どうしの順序だけを直し（#3）、ここは意図して残した。
    // 素朴に re を先勝ちへ倒すと mssql が re="INT" を 4 型に持つぶん INTEGER -> tinyint と
    // 縮み、oracle と合わせて DDL golden 12 本が品質を下げる方向に動く。直すのは 6-8。
});

test("#4 型パレットに無い型は黙って先頭の型になる（UUID -> INTEGER）", async () => {
    await useDatatypes(page, SERIALIZER_DB);
    await loadFixture(page, readFixture("house-defaults"));

    const label = await page.evaluate(() => {
        const row = (window.d!.tables[0] as { rows: { getDataType(): Element }[] }).rows[0];
        return row!.getDataType().getAttribute("label");
    });

    // fixture の users.id は UUID。現行 db/postgresql/datatypes.xml に uuid 型が無く、
    // js/io/xml-parser.ts:125 の初期値 type:0 が残るため Integer になる（§4 段階4-1b で
    // js/row.js から移設。設計 JSON は未知の id を throw するのでこの経路を持たない）。
    // HANDOVER §6.1 の型パレット差し替えで解消される想定。
    expect(label).toBe("Integer");

    // 落ちた結果は golden にもそのまま写っている
    const ddl = await generateDdl(page, SERIALIZER_DB);
    expect(ddl).toContain("id INTEGER NOT NULL DEFAULT uuidv7()");
});

test("#5 空の <default></default> で ` DEFAULT ` だけが残る（introspection 出力を食わせた場合）", async () => {
    const ddl = await transformXml(page, "postgresql", readKnownIssueFixture("empty-default"));

    // db/postgresql/output.xsl:58-64 は要素の存在だけを見るので、値が空でも DEFAULT を出す
    expect(ddl).toContain(" note TEXT DEFAULT \n");
});

test("#6 key が複数あると制約名が <table>_pkey で衝突する", async () => {
    await useDatatypes(page, SERIALIZER_DB);
    await loadFixture(page, readFixture("house-defaults"));

    const ddl = await generateDdl(page, SERIALIZER_DB);

    // db/postgresql/output.xsl:90-92 は key/@name を無視してテーブル名から生成する。
    // users は PRIMARY と UNIQUE の 2 本を持つので同名の制約が 2 つ出る。
    const collisions = ddl.match(/ADD CONSTRAINT users_pkey /g) ?? [];
    expect(collisions).toHaveLength(2);
    expect(ddl).toContain("ADD CONSTRAINT users_pkey PRIMARY KEY (id);");
    expect(ddl).toContain("ADD CONSTRAINT users_pkey UNIQUE (email);");
    // fixture が持っている本来の名前はどこにも出ない
    expect(ddl).not.toContain("users_email_key");
});

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
