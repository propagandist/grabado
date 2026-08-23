import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
    DB_PROFILES,
    FIXTURES,
    FIXTURE_DIR,
    NON_PROFILE_FIXTURE_DIRS,
    REPO_ROOT,
    fixtureDir,
    readFixture,
} from "../support/fixtures.ts";

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

    /*
     * db/ に無いプロファイルの fixture は誰も読まない（撤去した DB の残骸を捕まえる）。
     *
     * DB プロファイル以外の fixture（段階5-6 の introspection）は
     * NON_PROFILE_FIXTURE_DIRS に**明示的に宣言**する —— 除外を暗黙にすると
     * 「知らないディレクトリが増えても気づかない」状態になる。
     */
    test("fixture のディレクトリは db/ のプロファイル ＋ 宣言済みの非プロファイルだけ", () => {
        const dirs = readdirSync(FIXTURE_DIR, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort();

        expect(dirs).toEqual([...DB_PROFILES, ...NON_PROFILE_FIXTURE_DIRS].sort());
    });
});

/*
 * types-matrix の網羅の検査（HANDOVER §6 段階6-6b）。
 *
 * 6-6b で types-matrix は「そのプロファイルのパレットを 1 型 1 列で網羅するもの」になった。
 * **網羅は放っておくと必ず腐る** —— 6-8 が各パレットを現代化し、6-7 が 3 本足すたびに
 * 型が増減するのに、fixture 側は人が手で足すため。ここが 1 本あれば、パレットに型を足して
 * fixture を忘れた瞬間に**足りない型名を名指しで**落ちる。
 *
 * 見るのは**入力側の網羅だけ**で、解決結果は見ない —— oracle の INTEGER のように
 * 「書いた型に到達できない」ものがあり（known-issue #10）、そちらは golden と
 * tests/node/type-resolution.test.ts の仕事。混ぜると 6-8 でどちらが直ったのか分からなくなる。
 */
describe("types-matrix の網羅（DB × 型）", () => {
    interface PaletteType {
        /** 出力される型名。落ちているときにこれを名指しで出す */
        readonly sql: string;
        /** この型に到達できる書き方（sql ∪ aka。大文字化して持つ） */
        readonly names: ReadonlySet<string>;
    }

    /** パレットの型（palette-id.test.ts と同じく属性だけを正規表現で読む） */
    function paletteTypes(db: string): PaletteType[] {
        const xml = readFileSync(join(REPO_ROOT, "db", db, "datatypes.xml"), "utf8");
        return (xml.match(/<type\s[^>]*?\/>/g) ?? []).map((tag) => {
            const sql = /\ssql="([^"]*)"/.exec(tag)?.[1] ?? "";
            const aka = /\saka="([^"]*)"/.exec(tag)?.[1]?.split("|") ?? [];
            return { sql: sql, names: new Set([sql, ...aka].map((one) => one.toUpperCase())) };
        });
    }

    /** fixture に書かれた型名（js/io/xml-parser.ts と同じくサイズを外す） */
    function writtenTypes(db: string, fixture: string): string[] {
        return [...readFixture(db, fixture).matchAll(/<datatype>([^<]*)<\/datatype>/g)].map((m) =>
            m[1]!.replace(/\(.*$/, ""),
        );
    }

    for (const db of DB_PROFILES) {
        test(`${db}: types-matrix がパレットの全型を 1 列以上書いている`, () => {
            /*
             * 判定は sql そのものではなく「sql ∪ aka のどれかが書かれているか」。
             * postgresql の types-matrix は旧名（SERIAL / DECIMAL / TIMESTAMP …）で
             * 書いてあり、aka で読む互換経路を fixture 由来の実バイト列で通す役目も
             * 兼ねている。**別名で書いても入力としてはその型を網羅している。**
             */
            const written = writtenTypes(db, "types-matrix").map((one) => one.toUpperCase());
            const missing = paletteTypes(db)
                .filter((type) => !written.some((one) => type.names.has(one)))
                .map((type) => type.sql);

            expect(missing).toEqual([]);
        });

        /*
         * 逆向き。パレットの sql にも aka にも無い型名を書くと**例外になる**（段階6-8d で
         * 8 本とも同じになった。6-8c までは未現代化プロファイルが黙って先頭型に落ちていた
         * ——known-issue #4）。例外は fixture を読んだ瞬間ではなく DDL を採る段で出るので、
         * 書き間違いを入力の時点で捕まえるこの検査は 6-8d 以降も要る。
         */
        test(`${db}: どの fixture もパレットが知らない型名を書いていない`, () => {
            const known = new Set(paletteTypes(db).flatMap((type) => [...type.names]));
            const unknown = FIXTURES.flatMap((f) =>
                writtenTypes(db, f.name)
                    .filter((one) => !known.has(one.toUpperCase()))
                    .map((one) => `${f.name}: ${one}`),
            );

            expect(unknown).toEqual([]);
        });
    }
});
