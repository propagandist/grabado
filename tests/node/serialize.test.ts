import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { FIXTURES, SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { goldenPath, readGolden } from "../support/golden.ts";
import { assertNoCarriageReturn, normalizeDesignXml } from "../support/normalize.ts";
import { createHarness, type NodeHarness } from "./harness.ts";

// golden はブラウザ側が採ったものが唯一の正。ここでは読むだけ（書かない）。
describe("serializer 特性化（Node / jsdom）", () => {
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

            const actual = normalizeDesignXml(h.toXML());
            assertNoCarriageReturn(actual, `toXML(${fixture.name})`);

            expect(actual).toBe(readGolden(goldenPath("ddl-input", `${fixture.name}.xml`)));
        });

        test(`round-trip: ${fixture.name}`, () => {
            h.useDatatypes(SERIALIZER_DB);
            h.loadFixture(readFixture(fixture.name));

            const first = h.toXML();
            h.loadFixture(first);
            const second = h.toXML();
            h.loadFixture(second);
            const third = h.toXML();

            expect(second).toBe(first);
            expect(third).toBe(second);
        });
    }

    test("決定論: 同一モデルから toXML() を 2 回呼ぶと完全に一致する", () => {
        h.useDatatypes(SERIALIZER_DB);
        h.loadFixture(readFixture("house-defaults"));

        expect(h.toXML()).toBe(h.toXML());
    });
});
