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
    toXml,
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
 * #1（属性値のエスケープ不足）と #8（<default> の末尾に改行が無い）は §4 段階4-4 で
 * 直した。「直った後の挙動」のアサートは tests/browser/serialize.spec.ts に移してある
 * （README の運用 3）。
 */

test("#2 nullable かつ default 未指定の行が、保存すると <default>NULL</default> を獲得する", async () => {
    await useDatatypes(page, SERIALIZER_DB);
    await loadFixture(page, readFixture("house-defaults"));

    const xml = await toXml(page);

    // fixture の articles.body は <default> を持たないが、保存すると生える
    // （js/row.js:21 の既定 null -> js/row.js:420 で NULL として出力）
    expect(readFixture("house-defaults")).toContain('<row name="body" null="1" autoincrement="0">\n<datatype>TEXT</datatype>\n</row>');
    expect(xml).toContain('<row name="body" null="1" autoincrement="0">\n<datatype>TEXT</datatype>\n<default>NULL</default>');
});

test("#3 BIGINT が Big Integer ではなく Real に解決される（sql 重複・最後の一致が勝つ）", async () => {
    await useDatatypes(page, SERIALIZER_DB);
    await loadFixture(page, readKnownIssueFixture("bigint-drift"));

    const label = await page.evaluate(() => {
        const row = (window.d!.tables[0] as { rows: { getDataType(): Element }[] }).rows[0];
        return row!.getDataType().getAttribute("label");
    });

    // db/postgresql/datatypes.xml は sql="BIGINT" を Big Integer と Real の 2 か所に持ち、
    // js/row.js:472-479 のループは break しないので後勝ちになる
    expect(label).toBe("Real");
    expect(label).not.toBe("Big Integer");
});

test("#4 型パレットに無い型は黙って先頭の型になる（UUID -> INTEGER）", async () => {
    await useDatatypes(page, SERIALIZER_DB);
    await loadFixture(page, readFixture("house-defaults"));

    const label = await page.evaluate(() => {
        const row = (window.d!.tables[0] as { rows: { getDataType(): Element }[] }).rows[0];
        return row!.getDataType().getAttribute("label");
    });

    // fixture の users.id は UUID。現行 db/postgresql/datatypes.xml に uuid 型が無く、
    // js/row.js:455 の初期値 type:0 が残るため Integer になる。
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
