import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { FIXTURES, SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { goldenPath, readGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import { createHarness, type NodeHarness } from "./harness.ts";

// 設計 JSON（HANDOVER §4 段階4-2）の高速回帰。
// golden はブラウザ側が採ったものが唯一の正。ここでは読むだけ（書かない）。
describe("設計 JSON 特性化（Node / jsdom）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
    });

    afterAll(() => {
        h.close();
    });

    for (const fixture of FIXTURES) {
        test(`golden: ${fixture.name} — ${fixture.purpose}`, () => {
            h.useDatatypes(SERIALIZER_DB);
            h.loadFixture(readFixture(fixture.name));

            const actual = h.toJson();
            assertNoCarriageReturn(actual, `toJson(${fixture.name})`);

            expect(actual).toBe(readGolden(goldenPath("json", `${fixture.name}.json`)));
        });

        test(`round-trip: ${fixture.name}`, () => {
            h.useDatatypes(SERIALIZER_DB);
            h.loadFixture(readFixture(fixture.name));

            const first = h.toJson();
            h.loadJson(first);
            const second = h.toJson();
            h.loadJson(second);
            const third = h.toJson();

            expect(second).toBe(first);
            expect(third).toBe(second);
        });

        test(`情報保存: ${fixture.name} — XML から読んだ状態と JSON を往復した状態が一致する`, () => {
            /*
             * 段階6-5a まで経路 A は「fixture -> toXML -> fromXML」だった。XML の書き出しが
             * 消えたので、**fixture をもう一度読む**形に変えてある。比べたいのは
             * 「JSON が落とした / 変えた情報」なので、基準側が grabado の書いた XML から
             * 元の fixture に変わっても主張は同じ（むしろ外部由来の XML が基準になる）。
             */
            // 経路 A: fixture(XML) を 2 回読む
            h.useDatatypes(SERIALIZER_DB);
            h.loadFixture(readFixture(fixture.name));
            h.loadFixture(readFixture(fixture.name));
            const viaXml = h.captureState();

            // 経路 B: fixture -> toJson -> fromJson
            h.useDatatypes(SERIALIZER_DB);
            h.loadFixture(readFixture(fixture.name));
            h.loadJson(h.toJson());
            const viaJson = h.captureState();

            // どちらも「2 回目の読み込み」に揃えてあるので履歴依存は相殺される。
            // 差が出たらそれがそのまま「JSON が落とした / 変えた情報」の一覧になる。
            expect(viaJson).toBe(viaXml);
        });
    }

    test("決定論: 同一モデルから toJson() を 2 回呼ぶと完全に一致する", () => {
        h.useDatatypes(SERIALIZER_DB);
        h.loadFixture(readFixture("house-defaults"));

        expect(h.toJson()).toBe(h.toJson());
    });

    test("壊れた入力は例外にし、今開いている設計を消さない", () => {
        h.useDatatypes(SERIALIZER_DB);
        h.loadFixture(readFixture("minimal"));
        const before = h.toJson();

        // js/wwwsqldesigner.ts の fromJson は parse を clearTables() より先に置いてある
        expect(() => h.loadJson('{"formatVersion": 3}')).toThrow(/formatVersion/);
        expect(() => h.loadJson("{ 壊れた JSON")).toThrow();
        expect(h.toJson()).toBe(before);
    });

    // ---- 段階4-2b で足した 3 本 ----

    test("formatVersion 1 は読まず、移行コマンドを名指しする", () => {
        h.useDatatypes(SERIALIZER_DB);
        h.loadFixture(readFixture("minimal"));
        const before = h.toJson();

        // 4-2 が書いていた形（型キーが label、db は任意）
        const v1 = JSON.stringify({
            formatVersion: 1,
            db: SERIALIZER_DB,
            tables: [
                {
                    name: "things",
                    x: 10,
                    y: 20,
                    columns: [{ name: "id", type: "Integer" }],
                },
            ],
        });

        // 「黙ってアップグレードしない」ことと「何をすればいいか言う」ことの両方を押さえる。
        // 後方互換はこの例外 1 つだけで、変換は tools/migrate-design.mjs にある。
        expect(() => h.loadJson(v1)).toThrow(/migrate:design/);
        expect(h.toJson()).toBe(before);
    });

    test("db が実行中の型パレットと違えば例外（label 12 個の無言誤解決を塞ぐ）", () => {
        // postgresql の設計を mysql パレットで開く。label 時代はこれが通り、
        // 共有していた 12 label（Integer / Text / Timestamp ...）が黙って別の型に化けていた。
        h.useDatatypes(SERIALIZER_DB);
        h.loadFixture(readFixture("minimal"));
        const pgDesign = h.toJson();

        h.useDatatypes("mysql");
        expect(() => h.loadJson(pgDesign)).toThrow(/db/);
    });

    test("型 id は db をまたいで解決しない（同じ id が両方にあっても）", () => {
        // integer は postgresql にも mysql にもある id。db 照合が無ければ通ってしまう。
        h.useDatatypes("mysql");
        h.loadFixture(readFixture("minimal"));
        const mysqlDesign = h.toJson();

        expect(mysqlDesign).toContain('"db": "mysql"');
        expect(mysqlDesign).toContain('"type": "integer"');

        h.useDatatypes(SERIALIZER_DB);
        expect(() => h.loadJson(mysqlDesign)).toThrow(/db/);
    });

    // ---- 段階4-4 で足した 1 本（4-2 からの申し送り）----

    test("同名テーブルがある設計は 1 バイトも書かずに例外", () => {
        // 設計 JSON は relation を名前で参照するので、同名テーブルがあると
        // 読み戻したとき参照先が入れ替わる。形式では直さず保存を拒む（4-2 の決めごと）。
        const duplicated = [
            '<?xml version="1.0" encoding="utf-8" ?>',
            "<sql>",
            '<table x="10" y="10" name="users">',
            '<row name="id" null="0" autoincrement="0">',
            "<datatype>INTEGER</datatype>",
            "</row>",
            "</table>",
            '<table x="200" y="10" name="users">',
            '<row name="id" null="0" autoincrement="0">',
            "<datatype>INTEGER</datatype>",
            "</row>",
            "</table>",
            "</sql>",
            "",
        ].join("\n");

        h.useDatatypes(SERIALIZER_DB);
        h.loadFixture(duplicated);

        expect(() => h.toJson()).toThrow(/users/);
        expect(() => h.toJson()).toThrow(/重複/);

        // 名前を分ければ通る（拒んでいるのが重複そのものであることの確認）
        h.loadFixture(duplicated.replace('name="users">\n<row name="id" null="0"', 'name="accounts">\n<row name="id" null="0"'));
        expect(h.toJson()).toContain('"name": "accounts"');
    });
});
