import { test, expect, type Page } from "@playwright/test";
import { FIXTURES, SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { goldenPath, writeOrReadGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import {
    captureState,
    loadFixture,
    loadJson,
    openDesigner,
    toJson,
    toXml,
    useDatatypes,
} from "./harness.ts";

/*
 * 設計 JSON（formatVersion: 1）の特性化。HANDOVER §4 段階4-2。
 *
 * serialize.spec.ts（XML）と同じ構成だが、押さえるものが 1 つ多い。XML 側の golden は
 * 「現行が実際に吐いたバイト列」の記録で、正しさの根拠は現行実装そのものだった。
 * JSON は**新しい形式**なので、golden だけでは「その形が設計を過不足なく運べるか」を
 * 何も言っていない。それを言うのが 3 本目の「情報保存」テスト —— 同じ fixture を
 * XML 経由と JSON 経由で往復させ、**ライブツリー＋DOM の状態が一致する**ことを見る。
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

test.describe("設計 JSON 特性化（toJson / fromJson）", () => {
    for (const fixture of FIXTURES) {
        test(`golden: ${fixture.name} — ${fixture.purpose}`, async () => {
            await useDatatypes(page, SERIALIZER_DB);
            await loadFixture(page, readFixture(fixture.name));

            const actual = await toJson(page);
            assertNoCarriageReturn(actual, `toJson(${fixture.name})`);

            const expected = writeOrReadGolden(
                goldenPath("json", `${fixture.name}.json`),
                actual,
            );
            expect(actual).toBe(expected);
        });

        test(`round-trip: ${fixture.name}`, async () => {
            await useDatatypes(page, SERIALIZER_DB);
            await loadFixture(page, readFixture(fixture.name));

            // fixture -> toJson -> fromJson -> toJson -> fromJson -> toJson
            const first = await toJson(page);
            await loadJson(page, first);
            const second = await toJson(page);
            await loadJson(page, second);
            const third = await toJson(page);

            // 保存した JSON を読み直しても同じ JSON に戻る（＝情報が落ちない・増えない）
            expect(second).toBe(first);
            expect(third).toBe(second);
        });

        test(`情報保存: ${fixture.name} — XML 経由と JSON 経由で状態が一致する`, async () => {
            // 経路 A: fixture -> toXML -> fromXML
            await useDatatypes(page, SERIALIZER_DB);
            await loadFixture(page, readFixture(fixture.name));
            await loadFixture(page, await toXml(page));
            const viaXml = await captureState(page);

            // 経路 B: fixture -> toJson -> fromJson
            await useDatatypes(page, SERIALIZER_DB);
            await loadFixture(page, readFixture(fixture.name));
            await loadJson(page, await toJson(page));
            const viaJson = await captureState(page);

            // どちらも「2 回目の読み込み」に揃えてあるので、履歴依存（zIndex 等）は相殺される。
            // 差が出たらそれがそのまま「JSON が落とした / 変えた情報」の一覧になる。
            expect(viaJson).toBe(viaXml);
        });
    }

    test("決定論: 同一モデルから toJson() を 2 回呼ぶと完全に一致する", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("house-defaults"));

        expect(await toJson(page)).toBe(await toJson(page));
    });

    test("整形: 2 スペース・末尾 LF 1 つ（CLAUDE.md 制約3）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("house-defaults"));

        const actual = await toJson(page);

        expect(actual.endsWith("\n")).toBe(true);
        expect(actual.endsWith("\n\n")).toBe(false);
        // 再整形して完全一致 ＝ 2 スペース以外の加工が 1 つも入っていない
        expect(`${JSON.stringify(JSON.parse(actual), null, 2)}\n`).toBe(actual);
    });

    test("キー順は js/io/json-format.ts の宣言順に固定", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("house-defaults"));

        const design = JSON.parse(await toJson(page));
        expect(Object.keys(design)).toEqual(["formatVersion", "db", "tables"]);
        expect(design.formatVersion).toBe(1);
        expect(design.db).toBe(SERIALIZER_DB);

        // users は comment / keys の両方を持つ（fixture house-defaults）
        const users = design.tables.find((t: { name: string }) => t.name === "users");
        expect(Object.keys(users)).toEqual(["name", "x", "y", "comment", "columns", "keys"]);

        // 既定値と同じキーは出ない（id は uuidv7 の default だけを持つ NOT NULL 列）
        const id = users.columns[0];
        expect(Object.keys(id)).toEqual(["name", "type", "default"]);
    });

    test("型を label で持つので後勝ちドリフトが起きない（known-issue #3 を持ち込まない）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("minimal"));

        // db/postgresql/datatypes.xml は sql="BIGINT" を Big Integer（添字 2）と
        // Real（添字 6）の 2 か所に持つ。型を sql 名で焼く形式だと
        // Big Integer -> "BIGINT" -> 照合の後勝ちで Real に化ける。
        const design = JSON.parse(await toJson(page));
        design.tables[0].columns[0].type = "Big Integer";
        const source = `${JSON.stringify(design, null, 2)}\n`;

        await loadJson(page, source);
        expect(await toJson(page)).toBe(source);

        // 同じ設計を XML 経由で往復させると化ける（現行の挙動。tests/known-issues/ が固定している）
        await loadFixture(page, await toXml(page));
        const drifted = JSON.parse(await toJson(page));
        expect(drifted.tables[0].columns[0].type).toBe("Real");
    });

    test("diff フレンドリー: テーブル追加は独立ブロックの追加だけになる", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture("relations"));
        const before = await toJson(page);

        // relations fixture の末尾にテーブルを 1 つ足した設計を作る
        const design = JSON.parse(before);
        design.tables.push({
            name: "audit_log",
            x: 700,
            y: 320,
            columns: [{ name: "id", type: "Integer" }],
        });
        await loadJson(page, `${JSON.stringify(design, null, 2)}\n`);
        const after = await toJson(page);

        // 既存部分は 1 バイトも動かず、末尾に 1 ブロックが増えるだけ
        const tail = "\n  ]\n}\n";
        expect(before.endsWith(tail)).toBe(true);
        const head = before.slice(0, -tail.length);
        expect(after.startsWith(head)).toBe(true);

        const added = after.slice(head.length);
        expect(added).toContain('"name": "audit_log"');
        expect(added).not.toContain('"name": "employees"');
    });

    test.describe("壊れた入力は読み込まず例外にする", () => {
        test.beforeEach(async () => {
            await useDatatypes(page, SERIALIZER_DB);
            await loadFixture(page, readFixture("minimal"));
        });

        test("formatVersion が 1 でなければ拒む", async () => {
            const design = JSON.parse(await toJson(page));
            design.formatVersion = 2;
            await expect(loadJson(page, JSON.stringify(design))).rejects.toThrow(
                /formatVersion/,
            );
        });

        test("型パレットに無い型は拒む（known-issue #4 を持ち込まない）", async () => {
            const design = JSON.parse(await toJson(page));
            design.tables[0].columns[0].type = "Nonexistent Type";
            await expect(loadJson(page, JSON.stringify(design))).rejects.toThrow(
                /Nonexistent Type/,
            );
        });

        test("必須キーの欠落・型違いを拒む", async () => {
            const design = JSON.parse(await toJson(page));
            delete design.tables[0].columns[0].name;
            await expect(loadJson(page, JSON.stringify(design))).rejects.toThrow(
                /columns\[0\]\.name/,
            );

            const badTables = { formatVersion: 1, tables: {} };
            await expect(loadJson(page, JSON.stringify(badTables))).rejects.toThrow(
                /tables/,
            );
        });

        test("例外が出ても今開いている設計は消えない", async () => {
            const before = await toJson(page);

            await expect(loadJson(page, '{"formatVersion": 2}')).rejects.toThrow();
            await expect(loadJson(page, "{ 壊れた JSON")).rejects.toThrow();

            // parse を clearTables() より先に置いてある（js/wwwsqldesigner.ts の fromJson）
            expect(await toJson(page)).toBe(before);
        });
    });
});
