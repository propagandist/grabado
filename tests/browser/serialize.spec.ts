import { test, expect, type Page } from "@playwright/test";
import { SERIALIZER_DB, readFixture, readKnownIssueFixture } from "../support/fixtures.ts";
import {
    generateDdl,
    loadFixture,
    loadJson,
    openDesigner,
    toJson,
    useDatatypes,
} from "./harness.ts";

// 1 ページを beforeAll で作って使い回す（現行アプリはページ単位のグローバル SQL.designer 1 個で動く）。
// serial モードにはしない — 1 件落ちた時点で残りが skip され、影響範囲が見えなくなるため。

let page: Page;

/** 設計 JSON の tables[].name を出現順に取り出す */
function tableNamesOf(json: string): string[] {
    return (JSON.parse(json) as { tables: { name: string }[] }).tables.map((t) => t.name);
}

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
    await useDatatypes(page, SERIALIZER_DB);
});

test.afterAll(async () => {
    await page.close();
});

/*
 * **段階6-5a で「XML の書き出し」という主題そのものが消えた。**
 * 4-3b でユーザーに見える保存経路が JSON になり、残っていた toXML() は
 * db/<db>/output.xsl（XSLT）への入力専用だった。その XSLT が TS 生成器になったので、
 * 中間 XML と tests/golden/ddl-input/ の 7 本ごと撤去してある。
 *
 * ここに残るのは **XML を読む側の互換**と、形式に依存しない serializer の性質。
 * 移した先の対応は CUSTOMIZATIONS.md の段階6-5a「消える主張の始末」の表にある:
 *
 *   - golden 7 本 / round-trip 7 本 / 決定論  -> JSON 側（json.spec.ts）が同じ主張を持つ
 *   - <default> の後に改行（旧 #8）           -> XML 固有なので消滅
 *   - & を含む識別子（旧 #1）                 -> 下の「識別子に & を含んでも壊れない」
 *   - 既定値の無い行（旧 #2）                 -> 下の JSON 版
 *   - alignTables（旧 #7）                    -> 下（比較対象を JSON にしただけ）
 */
test.describe("serializer 特性化（読込互換と形式非依存の性質）", () => {
    /*
     * 段階4-4 まではこれが「非決定性の所在」テスト —— XML の Active URL コメントに
     * location.href が入ることを固定していた。撤去したので主張を反転させてある。
     *
     * **段階6-5a で対象が XML から JSON と DDL に移った。** 環境依存が出力に現れない
     * こと自体は CLAUDE.md 制約3（決定論）の中身なので、書き出しが残る 2 形式で見る。
     * テストを消さないのは、撤去したこと自体を記録として残すため。
     */
    test("環境依存が無い: location.href が出力に現れない", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture(SERIALIZER_DB, "minimal"));

        const json = await toJson(page);
        const ddl = await generateDdl(page, SERIALIZER_DB);
        const href = await page.evaluate(() => location.href);

        expect(json).not.toContain("Active URL");
        expect(json).not.toContain(href);
        expect(ddl).not.toContain(href);
        /*
         * XML には upstream のクレジット行（https://github.com/ondras/...）が入っていた。
         * JSON にも DDL にも URL は 1 つも出ない
         */
        expect(json.match(/http\S*/g)).toBeNull();
        expect(ddl.match(/http\S*/g)).toBeNull();

        /* golden はもう 1 バイトも正規化していない（tests/support/normalize.ts） */
        expect(json).toBe(await toJson(page));
        expect(ddl).toBe(await generateDdl(page, SERIALIZER_DB));
    });

    /*
     * 旧 known-issue #1。段階4-4 で属性値とテキストノードのエスケープを全経路に
     * 通したので、`&` を含む識別子でも読み直せる XML になった。
     *
     * **段階6-5a で XML の書き出しが消えたので、主張を JSON と DDL に移した。**
     * 「壊れたファイルができて二度と開けない」という #1 の実害は、書き出す形式が
     * 変わっても消えない性質なので、形式ごとに見る:
     *   - JSON: JSON.stringify がエスケープを持つので、読み直して同じ設計になる
     *   - DDL: 生成器は識別子を素通しする（XSLT 経路でも実体参照の往復で素通しだった）
     * fixture は known-issues 側のものをそのまま使う（正常系に昇格させると DDL golden の
     * 母集団が 35 -> 40 に増え、本段階の完了判定「DDL golden 無差分」がぼやける）。
     */
    test("識別子に & を含んでも書き出し・読み直しが壊れない", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readKnownIssueFixture("amp-in-name"));

        const json = await toJson(page);
        const ddl = await generateDdl(page, SERIALIZER_DB);

        /* JSON は生の & を持ち、DDL にもそのまま出る（実体参照は 1 つも残らない） */
        expect(json).toContain('"name": "R&D"');
        expect(json).not.toContain("&amp;");
        expect(ddl).toContain("R&D");
        expect(ddl).not.toContain("&amp;");

        /* 読み直すと元の識別子に戻る（二重エスケープしていない） */
        await loadJson(page, json);
        expect(await toJson(page)).toBe(json);
    });

    /*
     * 旧 known-issue #2。段階4-5 で「既定 NULL」の内部表現（def === null）を撤去したので、
     * 既定値を持たない行は保存しても既定値を獲得しない（＝保存で情報が増えない）。
     * **段階6-5a で見る先を XML から JSON に移した**（主張は同じ）。
     */
    test("既定値の無い行は保存しても既定値を獲得しない", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture(SERIALIZER_DB, "house-defaults"));

        const design = JSON.parse(await toJson(page)) as {
            tables: { name: string; columns: { name: string; default?: string }[] }[];
        };
        const body = design.tables
            .find((t) => t.name === "articles")!
            .columns.find((c) => c.name === "body")!;

        /* fixture の articles.body は <default> を持たない。保存しても持たないまま */
        expect(readFixture(SERIALIZER_DB, "house-defaults")).toContain(
            '<row name="body" null="1" autoincrement="0">\n<datatype>TEXT</datatype>\n</row>',
        );
        expect(body.default).toBeUndefined();
        expect(await toJson(page)).not.toContain('"default": "NULL"');
    });

    /*
     * 旧 known-issue #5。空の <default></default>（introspection が値の無いカラムにも出す）を
     * 読ませると ` DEFAULT ` だけの壊れた SQL になっていた。**段階6-5a で経路ごと消えた** ——
     * XSLT に外部由来の XML を直接食わせる口が無くなり、生成器はモデルからしか DDL を作らない。
     * 空の値は読み込みの時点で "" になるので（4-5）、DEFAULT 句そのものが出ない。
     */
    test("空の <default></default> を読んでも DEFAULT 句は出ない", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readKnownIssueFixture("empty-default"));

        const ddl = await generateDdl(page, SERIALIZER_DB);

        /* 旧 #5 ではこの行が " note TEXT DEFAULT \n" になっていた */
        expect(ddl).toContain(" note TEXT\n");
        expect(ddl).not.toContain("DEFAULT \n");
        /* 同じテーブルの id は本物の既定値を持つので、DEFAULT 句自体は出る */
        expect(ddl).toContain(" id UUID NOT NULL DEFAULT uuidv7(),");
    });

    /*
     * 段階4-5 の読み込み互換。4-3b 以前に保存されたファイルは既定値の無い行にも
     * <default>NULL</default> を持つ（それが known-issue #2 そのもの）。parser は
     * 生値のまま渡し、apply -> Row.update() が "" に潰すので、読み直すと消える。
     */
    test("4-3b 以前の <default>NULL</default> を読むと既定なしになる", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        const legacy =
            [
                '<?xml version="1.0" encoding="utf-8" ?>',
                "<sql>",
                '<table x="20" y="20" name="legacy">',
                '<row name="c" null="1" autoincrement="0">',
                "<datatype>TEXT</datatype>",
                "<default>NULL</default>",
                "</row>",
                "</table>",
                "</sql>",
            ].join("\n") + "\n";

        await loadFixture(page, legacy);

        expect(await toJson(page)).not.toContain('"default"');
    });

    /*
     * 段階4-5 の決めたこと 1。UI の default 欄に "NULL" と打っても既定なしに潰れる
     * （nullable 列の DEFAULT NULL は SQL 上も暗黙の既定と同義）。正規化は
     * Row.update() の 1 箇所だけにあるので、ここでは UI 経路（collapse）を通す。
     */
    test("nullable な行の default 欄に NULL と打っても既定値は出ない", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture(SERIALIZER_DB, "house-defaults"));

        const typed = await page.evaluate(() => {
            /* articles.body（null="1"・既定なし） */
            const table = (
                window.d!.tables as { getTitle(): string; rows: unknown[] }[]
            ).find((t) => t.getTitle() === "articles")!;
            const row = table.rows.find(
                (r) => (r as { getTitle(): string }).getTitle() === "body"
            ) as {
                expand(): void;
                collapse(): void;
                dom: { def: HTMLInputElement };
                data: { def: string };
            };

            row.expand();
            /* 展開直後の表示。段階4-4 までは "NULL" が入っていた */
            const shown = row.dom.def.value;
            row.dom.def.value = "NULL";
            row.collapse();
            return { shown, stored: row.data.def };
        });

        expect(typed.shown).toBe("");
        expect(typed.stored).toBe("");
        /* 他の行の既定値（uuidv7() など）は出るので、body の行だけを見る */
        const design = JSON.parse(await toJson(page)) as {
            tables: { name: string; columns: { name: string; default?: string }[] }[];
        };
        const body = design.tables
            .find((t) => t.name === "articles")!
            .columns.find((c) => c.name === "body")!;
        expect(body.default).toBeUndefined();
    });

    /*
     * 旧 known-issue #7。段階4-4 で alignTables() が this.tables を破壊的ソートするのを
     * やめたので、ここで「直った後の挙動」を固定する（tests/known-issues/README.md の運用 3）。
     * 保存順の安定性そのものなので known-issues ではなく serializer の特性化に置く。
     */
    test("alignTables() はテーブル順を変えない（座標だけを動かす）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture(SERIALIZER_DB, "relations"));

        const before = await page.evaluate(() =>
            (window.d!.tables as { getTitle(): string }[]).map((t) => t.getTitle())
        );
        const jsonBefore = await toJson(page);

        await page.evaluate(() =>
            (window.d! as unknown as { alignTables(): void }).alignTables()
        );

        const after = await page.evaluate(() =>
            (window.d!.tables as { getTitle(): string }[]).map((t) => t.getTitle())
        );
        const jsonAfter = await toJson(page);

        expect(before).toEqual([
            "employees",
            "projects",
            "teams",
            "employee_projects",
        ]);
        expect(after).toEqual(before);
        // 座標の再配置は仕様なので出力自体は変わってよい。変わってはいけないのは順序。
        expect(tableNamesOf(jsonAfter)).toEqual(tableNamesOf(jsonBefore));
    });

    /*
     * 段階4-4 まではこのテストが <datatypes db="..."> ブロックの差で「パレット依存」を
     * 示していた。ブロックごと撤去したので、根拠を型解決の結果そのものに移した
     * （minimal では INTEGER が両 DB で同じ SQL 名に解決されるため、PG 固有の型を
     * 並べた types-matrix を使う）。**段階6-5a で見る先を XML から DDL に移した** ——
     * 型解決の結果がいちばん素直に出るのが <datatype> の後継である DDL の型名だから。
     */
    test("型解決は型パレット依存（DB 横断 golden を持たない根拠）", async () => {
        const xml = readFixture(SERIALIZER_DB, "types-matrix");

        await useDatatypes(page, "postgresql");
        await loadFixture(page, xml);
        const pg = await generateDdl(page, "postgresql");

        await useDatatypes(page, "oracle");
        await loadFixture(page, xml);
        const other = await generateDdl(page, "oracle");

        // 同じ入力・同じ生成器でも解決結果が変わる。oracle に BYTEA / JSONB は
        // 無いので、一致が無いときの初期値 0（＝先頭の型）に落ちる
        // ——known-issue #4 そのもの。**6-8a で mysql が現代化されたので寄せ先を移した**
        // （mysql は BYTEA を aka で受けるようになり、#4 の例に使えない）。
        expect(pg).toContain("BYTEA");
        expect(other).not.toContain("BYTEA");
        expect(pg).not.toBe(other);
    });
});
