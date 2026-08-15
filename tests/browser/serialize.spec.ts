import { test, expect, type Page } from "@playwright/test";
import {
    FIXTURES,
    SERIALIZER_DB,
    readFixture,
    readKnownIssueFixture,
} from "../support/fixtures.ts";
import { goldenPath, writeOrReadGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import {
    loadFixture,
    openDesigner,
    toJson,
    toXml,
    useDatatypes,
} from "./harness.ts";

// 1 ページを beforeAll で作って使い回す（現行アプリはページ単位のグローバル SQL.designer 1 個で動く）。
// serial モードにはしない — 1 件落ちた時点で残りが skip され、影響範囲が見えなくなるため。

let page: Page;

/** 出力 XML に現れる <table name="..."> を出現順に取り出す */
function tableNamesOf(xml: string): string[] {
    return [...xml.matchAll(/<table x="[^"]*" y="[^"]*" name="([^"]*)">/g)].map(
        (m) => m[1]!
    );
}

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
    await useDatatypes(page, SERIALIZER_DB);
});

test.afterAll(async () => {
    await page.close();
});

test.describe("serializer 特性化（toXML / fromXML）", () => {
    for (const fixture of FIXTURES) {
        test(`golden: ${fixture.name} — ${fixture.purpose}`, async () => {
            await useDatatypes(page, SERIALIZER_DB);
            await loadFixture(page, readFixture(fixture.name));

            const actual = await toXml(page);
            assertNoCarriageReturn(actual, `toXML(${fixture.name})`);

            const expected = writeOrReadGolden(
                goldenPath("ddl-input", `${fixture.name}.xml`),
                actual
            );
            expect(actual).toBe(expected);
        });

        test(`round-trip: ${fixture.name}`, async () => {
            await useDatatypes(page, SERIALIZER_DB);
            await loadFixture(page, readFixture(fixture.name));

            // fixture -> toXML -> fromXML -> toXML -> fromXML -> toXML
            const first = await toXml(page);
            await loadFixture(page, first);
            const second = await toXml(page);
            await loadFixture(page, second);
            const third = await toXml(page);

            // 保存した XML を読み直しても同じ XML に戻る（＝情報が落ちない・増えない）
            expect(second).toBe(first);
            expect(third).toBe(second);
        });
    }

    test("決定論: 同一モデルから toXML() を 2 回呼ぶと完全に一致する", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("house-defaults"));

        expect(await toXml(page)).toBe(await toXml(page));
    });

    /*
     * 段階4-4 まではこれが「非決定性の所在」テスト —— Active URL コメントに
     * location.href が入ることを固定していた。撤去したので主張を反転させる。
     * テストを消さないのは、撤去したこと自体を記録として残すため。
     */
    test("環境依存が無い: Active URL コメントも location.href も出力に現れない", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("minimal"));

        const raw = await toXml(page);
        const href = await page.evaluate(() => location.href);

        expect(raw).not.toContain("Active URL");
        expect(raw).not.toContain(href);
        // 残る http は upstream のクレジット行だけ（＝環境依存ではない）
        expect(raw.match(/http\S*/g)).toEqual([
            "https://github.com/ondras/wwwsqldesigner/",
        ]);
        // golden はもう 1 バイトも正規化していない（tests/support/normalize.ts）
        expect(raw).toBe(await toXml(page));
    });

    /*
     * 旧 known-issue #1。段階4-4 で属性値とテキストノードのエスケープを全経路に
     * 通したので、`&` を含む識別子でも読み直せる XML になった。fixture は
     * known-issues 側のものをそのまま使う（正常系に昇格させると DDL golden の
     * 母集団が 63 -> 72 に増え、本段階の完了判定「DDL golden 無差分」がぼやける）。
     */
    test("識別子に & を含んでも well-formed な XML を吐く", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readKnownIssueFixture("amp-in-name"));

        const xml = await toXml(page);

        expect(xml).toContain('name="R&amp;D"');
        expect(xml).toContain('name="a&amp;b"');
        expect(xml).not.toContain('name="R&D"');

        const parseFailed = await page.evaluate((source) => {
            const doc = new DOMParser().parseFromString(source, "text/xml");
            return doc.getElementsByTagName("parsererror").length > 0;
        }, xml);
        expect(parseFailed).toBe(false);

        // 読み直すと元の識別子に戻る（二重エスケープしていない）
        await loadFixture(page, xml);
        expect(await toXml(page)).toBe(xml);
    });

    /*
     * 旧 known-issue #8。<default> だけ末尾に改行が無く、1 行に 2 要素が並んでいた。
     *
     * 段階4-5 まではここが <default>NULL</default> を読んでいた。#2 を直して
     * 「既定なし」の行から <default> が消えたので、実在する既定値へ寄せた
     * （users.id の uuidv7()。INTEGER は quote 属性が空なので生値のまま出る）。
     */
    test("<default> の後にも改行が入る（1 要素 1 行）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("house-defaults"));

        const xml = await toXml(page);

        expect(xml).toContain("<default>uuidv7()</default>\n");
        expect(xml).not.toContain("</default><");
    });

    /*
     * 旧 known-issue #2。段階4-5 で「既定 NULL」の内部表現（def === null）を撤去したので、
     * 既定値を持たない行は保存しても <default> を獲得しない（＝保存で情報が増えない）。
     */
    test("既定値の無い行は保存しても <default> を獲得しない", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("house-defaults"));

        const xml = await toXml(page);

        // fixture の articles.body は <default> を持たない。保存しても持たないまま
        expect(readFixture("house-defaults")).toContain(
            '<row name="body" null="1" autoincrement="0">\n<datatype>TEXT</datatype>\n</row>'
        );
        expect(xml).toContain(
            '<row name="body" null="1" autoincrement="0">\n<datatype>TEXT</datatype>\n</row>'
        );
        expect(xml).not.toContain("<default>NULL</default>");
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

        expect(await toXml(page)).not.toContain("<default>");
        expect(await toJson(page)).not.toContain('"default"');
    });

    /*
     * 段階4-5 の決めたこと 1。UI の default 欄に "NULL" と打っても既定なしに潰れる
     * （nullable 列の DEFAULT NULL は SQL 上も暗黙の既定と同義）。正規化は
     * Row.update() の 1 箇所だけにあるので、ここでは UI 経路（collapse）を通す。
     */
    test("nullable な行の default 欄に NULL と打っても <default> は出ない", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("house-defaults"));

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
        expect(await toXml(page)).toContain(
            '<row name="body" null="1" autoincrement="0">\n<datatype>TEXT</datatype>\n</row>'
        );
    });

    /*
     * 旧 known-issue #7。段階4-4 で alignTables() が this.tables を破壊的ソートするのを
     * やめたので、ここで「直った後の挙動」を固定する（tests/known-issues/README.md の運用 3）。
     * 保存順の安定性そのものなので known-issues ではなく serializer の特性化に置く。
     */
    test("alignTables() はテーブル順を変えない（座標だけを動かす）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("relations"));

        const before = await page.evaluate(() =>
            (window.d!.tables as { getTitle(): string }[]).map((t) => t.getTitle())
        );
        const xmlBefore = await toXml(page);

        await page.evaluate(() =>
            (window.d! as unknown as { alignTables(): void }).alignTables()
        );

        const after = await page.evaluate(() =>
            (window.d!.tables as { getTitle(): string }[]).map((t) => t.getTitle())
        );
        const xmlAfter = await toXml(page);

        expect(before).toEqual([
            "employees",
            "projects",
            "teams",
            "employee_projects",
        ]);
        expect(after).toEqual(before);
        // 座標の再配置は仕様なので出力自体は変わってよい。変わってはいけないのは順序。
        expect(tableNamesOf(xmlAfter)).toEqual(tableNamesOf(xmlBefore));
    });

    /*
     * 段階4-4 まではこのテストが <datatypes db="..."> ブロックの差で「パレット依存」を
     * 示していた。ブロックごと撤去したので、根拠を型解決の結果そのものに移す
     * （minimal では INTEGER が両 DB で同じ SQL 名に解決されるため、PG 固有の型を
     * 並べた types-matrix を使う）。
     */
    test("型解決は型パレット依存（DB 横断 golden を持たない根拠）", async () => {
        const xml = readFixture("types-matrix");

        await useDatatypes(page, "postgresql");
        await loadFixture(page, xml);
        const pg = await toXml(page);

        await useDatatypes(page, "mysql");
        await loadFixture(page, xml);
        const my = await toXml(page);

        // 同じ入力・同じ serializer でも解決結果が変わる。mysql に BYTEA / JSONB は
        // 無いので、一致が無いときの初期値 0（＝先頭の型 INTEGER）に落ちる
        // ——known-issue #4 そのもの。
        expect(pg).toContain("<datatype>BYTEA</datatype>");
        expect(my).not.toContain("<datatype>BYTEA</datatype>");
        expect(pg).not.toBe(my);
    });
});
