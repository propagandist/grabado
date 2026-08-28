import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ORM_EXTENSIONS, ORM_TARGETS } from "../../frontend/js/io/orm/generate.ts";
import { EXCLUSIONS, PRISMA_URLS, TOOLS } from "../orm-tools/cases.ts";
import { DB_PROFILES, GOLDEN_DIR, ormGoldenCases } from "../support/fixtures.ts";

/*
 * 「通す一覧」の整合検査（issue #120）。
 *
 * `npm run test:orm-tools` は**要 Docker ＋ ネットワーク**なので手元でしか回らない。
 * **回さない日が続けば、除外の表は黙って腐る** —— golden が消えたのに除外だけが残る、
 * 4 本目の ORM を足したのに道具を決め忘れる、といった形で。
 *
 * ここが見るのは**表と実体のずれだけ**で、**道具は 1 つも起こさない**（ファイルを読むだけ）。
 * だから `npm test` に載る —— #120 が「CI に載せない」と決めたのは**道具を走らせること**で、
 * 表の整合はその射程の外。`fixture-set.test.ts` が fixture の母集団に対してやっていることの、
 * golden 側の対応物。
 */
describe("ORM の実物検証: 通す一覧（issue #120）", () => {
    const ormGolden = join(GOLDEN_DIR, "orm");

    test("道具の表が ORM_TARGETS と 1 対 1（4 本目を足して道具を決め忘れたら落ちる）", () => {
        expect(TOOLS.map((t) => t.target).sort()).toEqual([...ORM_TARGETS].sort());
    });

    test("道具の表がディスク上の golden ディレクトリと 1 対 1", () => {
        const onDisk = readdirSync(ormGolden, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort();

        expect(TOOLS.map((t) => t.target).sort()).toEqual(onDisk);
    });

    test("各ターゲットの golden が ormGoldenCases と 1 対 1（余分も不足も無い）", () => {
        for (const target of ORM_TARGETS) {
            const expected = ormGoldenCases(DB_PROFILES)
                .map((one) => `${one.db}/${one.fixture}.${ORM_EXTENSIONS[target]}`)
                .sort();

            const root = join(ormGolden, target);
            const actual = readdirSync(root, { withFileTypes: true })
                .filter((e) => e.isDirectory())
                .flatMap((dir) => readdirSync(join(root, dir.name)).map((f) => `${dir.name}/${f}`))
                .sort();

            expect(actual, `${target} の golden`).toEqual(expected);
        }
    });

    test("除外はすべて実在する golden を指す（直ったのに除外だけ残っている状態を捕まえる）", () => {
        for (const one of EXCLUSIONS) {
            const target = ORM_TARGETS.find((t) => t === one.target);
            expect(target, `${one.target} は知らないターゲット`).toBeDefined();

            const cases = ormGoldenCases(DB_PROFILES);
            const found = cases.some((c) => c.db === one.db && c.fixture === one.fixture);
            expect(found, `${one.target}/${one.db}/${one.fixture} は母集団に無い`).toBe(true);
        }
    });

    test("除外には理由が書いてある（空文字を弾く）", () => {
        for (const one of EXCLUSIONS) {
            expect(one.reason.trim().length, `${one.target}/${one.db}/${one.fixture}`).toBeGreaterThan(0);
        }
    });

    /*
     * ★ Prisma の provider は golden の datasource ブロックが持つ。**検証側の URL 表に
     *   無い provider が出てきたら、prisma validate はスキームの不一致で落ちる** ——
     *   落ちてから調べるより、ここで名指しにする。
     */
    test("Prisma golden の provider がすべて PRISMA_URLS にある", () => {
        const root = join(ormGolden, "prisma");
        const found = new Set<string>();
        for (const dir of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
            for (const file of readdirSync(join(root, dir.name))) {
                const text = readFileSync(join(root, dir.name, file), "utf8");
                const datasource = /^datasource\s[\s\S]*?^\}/m.exec(text);
                if (datasource === null) {
                    continue;
                }
                const provider = /provider\s*=\s*"([^"]+)"/.exec(datasource[0]);
                if (provider !== null) {
                    found.add(provider[1]!);
                }
            }
        }
        expect(found.size).toBeGreaterThan(0);
        for (const one of found) {
            expect(PRISMA_URLS[one], `provider ${one} の URL が無い`).toBeDefined();
        }
    });
});
