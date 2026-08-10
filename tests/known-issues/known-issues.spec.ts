import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { REPO_ROOT, SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
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

function readKnownFixture(name: string): string {
    return readFileSync(join(REPO_ROOT, "tests", "known-issues", "fixtures", `${name}.xml`), "utf8");
}

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
    await useDatatypes(page, SERIALIZER_DB);
});

test.afterAll(async () => {
    await page.close();
});

test("#1 識別子に & を含めると toXML() が well-formed でない XML を吐く", async () => {
    await useDatatypes(page, SERIALIZER_DB);
    await loadFixture(page, readKnownFixture("amp-in-name"));

    const xml = await toXml(page);

    // 属性値のエスケープは " -> &quot; だけ（js/table.js:303, js/row.js:405）
    expect(xml).toContain('name="R&D"');
    expect(xml).toContain('name="a&b"');

    // 吐いた XML を読み直せない = 保存したファイルを二度と開けない
    const parseFailed = await page.evaluate((source) => {
        const doc = new DOMParser().parseFromString(source, "text/xml");
        return doc.getElementsByTagName("parsererror").length > 0;
    }, xml);
    expect(parseFailed).toBe(true);
});

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
    await loadFixture(page, readKnownFixture("bigint-drift"));

    const label = await page.evaluate(() => {
        const row = (window.SQL.designer.tables[0] as { rows: { getDataType(): Element }[] }).rows[0];
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
        const row = (window.SQL.designer.tables[0] as { rows: { getDataType(): Element }[] }).rows[0];
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
    const ddl = await transformXml(page, "postgresql", readKnownFixture("empty-default"));

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

test("#7 alignTables() が tables を破壊的ソートし、テーブル順と座標を変える", async () => {
    await useDatatypes(page, SERIALIZER_DB);
    await loadFixture(page, readFixture("relations"));

    const before = await page.evaluate(() =>
        (window.SQL.designer.tables as { getTitle(): string }[]).map((t) => t.getTitle()),
    );
    await page.evaluate(() =>
        (window.SQL.designer as unknown as { alignTables(): void }).alignTables(),
    );
    const after = await page.evaluate(() =>
        (window.SQL.designer.tables as { getTitle(): string }[]).map((t) => t.getTitle()),
    );

    // js/wwwsqldesigner.js:310-312 が this.tables.sort() で配列そのものを並べ替える。
    // js/io.js:676 の importresponse がロード後にこれを呼ぶため、
    // サーバ import 経由で開くと保存 XML のテーブル順が変わる。
    expect(before).toEqual(["employees", "projects", "teams", "employee_projects"]);
    expect(after).not.toEqual(before);
    expect([...after].sort()).toEqual([...before].sort());
});

test("#8 <default> だけ改行が付かず diff が読みにくい", async () => {
    await useDatatypes(page, SERIALIZER_DB);
    await loadFixture(page, readFixture("house-defaults"));

    const xml = await toXml(page);

    // js/row.js:428 は他の要素と違い末尾に \n を付けない。
    // HANDOVER §4 の「1テーブル=独立ブロック・diff フレンドリー」に反する。
    expect(xml).toContain("<default>NULL</default></row>");
    expect(xml).toContain("<default>NULL</default><comment>");
});

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
