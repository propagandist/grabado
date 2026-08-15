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

        test(`情報保存: ${fixture.name} — XML 経由と JSON 経由で状態が一致する`, () => {
            // 経路 A: fixture -> toXML -> fromXML
            h.useDatatypes(SERIALIZER_DB);
            h.loadFixture(readFixture(fixture.name));
            h.loadFixture(h.toXML());
            const viaXml = h.captureState();

            // 経路 B: fixture -> toJson -> fromJson
            h.useDatatypes(SERIALIZER_DB);
            h.loadFixture(readFixture(fixture.name));
            h.loadJson(h.toJson());
            const viaJson = h.captureState();

            // どちらも「2 回目の読み込み」に揃えてあるので履歴依存は相殺される。
            // 本段階でいちばん効くテスト（tests/browser/json.spec.ts の同名テストと同じ根拠）。
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
        expect(() => h.loadJson('{"formatVersion": 2}')).toThrow(/formatVersion/);
        expect(() => h.loadJson("{ 壊れた JSON")).toThrow();
        expect(h.toJson()).toBe(before);
    });
});
