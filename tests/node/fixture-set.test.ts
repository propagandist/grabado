import { existsSync, readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DB_PROFILES, FIXTURES, FIXTURE_DIR, fixtureDir } from "../support/fixtures.ts";

/*
 * fixture の母集団の検査（HANDOVER §6 段階6-6a）。
 *
 * 6-6a で fixture は tests/fixtures/<db>/<name>.xml に分かれた。**分けた瞬間に
 * 「置き忘れ」という新しい壊れ方が生まれる** —— 6-7 でプロファイルを 3 本足すとき、
 * db/<db>/datatypes.xml だけ置いて fixture を忘れると DDL golden のテストが
 * 「ファイルが無い」で落ちる。落ちること自体は正しいが、原因が golden の不在に見えて
 * 実際は入力の不在という、読み違えやすい形で落ちる。
 *
 * ここが 1 本あれば「fixture が足りない」と名指しで落ちる。tests/node/palette-id.test.ts が
 * パレット側に対してやっていることの、入力側の対応物。
 */
describe("fixture の母集団（DB × 名前）", () => {
    test("すべてのプロファイルに FIXTURES の全 fixture がある（余分なファイルも無い）", () => {
        const expected = DB_PROFILES.flatMap((db) =>
            FIXTURES.map((f) => `${db}/${f.name}.xml`),
        ).sort();

        const actual = DB_PROFILES.filter((db) => existsSync(fixtureDir(db)))
            .flatMap((db) =>
                readdirSync(fixtureDir(db))
                    .filter((name) => name.endsWith(".xml"))
                    .map((name) => `${db}/${name}`),
            )
            .sort();

        expect(actual).toEqual(expected);
    });

    /*
     * 直下に .xml が残っていたら 6-6a の移行漏れ。読み手（readFixture）は db を必ず取るので
     * 直下のファイルはどのテストからも参照されず、**古い入力が更新されないまま残る**。
     */
    test("tests/fixtures/ の直下に fixture は無い（すべて DB 別ディレクトリの下）", () => {
        const strays = readdirSync(FIXTURE_DIR, { withFileTypes: true })
            .filter((e) => e.isFile() && e.name.endsWith(".xml"))
            .map((e) => e.name);

        expect(strays).toEqual([]);
    });

    /* db/ に無いプロファイルの fixture は誰も読まない（撤去した DB の残骸を捕まえる） */
    test("fixture のディレクトリは db/ のプロファイルと 1 対 1", () => {
        const dirs = readdirSync(FIXTURE_DIR, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort();

        expect(dirs).toEqual([...DB_PROFILES].sort());
    });
});
