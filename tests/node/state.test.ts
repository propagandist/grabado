import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { FIXTURES, SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { goldenPath, readGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import { createHarness, type NodeHarness } from "./harness.ts";

// golden はブラウザ側が採ったものが唯一の正。ここでは読むだけ（書かない）。
// 採取関数は page 側と共有（tests/support/state.ts）なので、両実行系がずれたら
// それ自体が情報になる — jsdom と Chromium で差が出るのはレイアウト由来の値だけのはずで、
// スナップショットはそれを除外してある。
describe("読み込み後の状態 特性化（Node / jsdom）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
    });

    afterAll(() => {
        h.close();
    });

    for (const fixture of FIXTURES) {
        test(`state golden: ${fixture.name} — ${fixture.purpose}`, () => {
            h.useDatatypes(SERIALIZER_DB);
            h.loadFixture(readFixture(fixture.name));

            const actual = h.captureState();
            assertNoCarriageReturn(actual, `state(${fixture.name})`);

            expect(actual).toBe(readGolden(goldenPath("state", `${fixture.name}.json`)));
        });
    }

    test("state golden: house-defaults を mysql パレットで読む", () => {
        h.useDatatypes("mysql");
        h.loadFixture(readFixture("house-defaults"));

        const actual = h.captureState();
        assertNoCarriageReturn(actual, "state(mysql/house-defaults)");

        expect(actual).toBe(readGolden(goldenPath("state", "mysql-house-defaults.json")));
    });

    test("冪等: 同じ XML を 2 回読んでも状態が一致する（clearTables() の後始末）", () => {
        h.useDatatypes(SERIALIZER_DB);
        const xml = readFixture("relations");

        h.loadFixture(xml);
        const first = h.captureState();
        h.loadFixture(xml);
        const second = h.captureState();

        expect(second).toBe(first);
    });
});
