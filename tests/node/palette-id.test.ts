import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DB_PROFILES, REPO_ROOT } from "../support/fixtures.ts";

/*
 * 型パレットの id 規則の検査（HANDOVER §4 段階4-2b）。
 *
 * id は設計 JSON の型キー（docs/FORMAT.md）。**ファイルとの契約はこの属性だけ**で、
 * label（表示名）と sql（出力する型名）は §6 のパレット現代化が自由に動かしてよい。
 * だから id が壊れると git 管理下の設計ファイルが黙って別の型になる —— それを
 * 起こさないための規則を、パレットを触るすべての段階に対して機械的に押さえる。
 *
 * ここが赤くなるのは §6 でパレットを差し替えるときで、そのとき考えるべきは
 * 「規則を緩めるか」ではなく「移行表を書いたか」。
 */

interface PaletteType {
    readonly index: number;
    readonly id: string | undefined;
    readonly label: string | undefined;
    readonly sql: string | undefined;
    /** FK 子行の型（段階6-2 で label 参照から id 参照になった） */
    readonly fk: string | undefined;
}

/**
 * <type> を属性ごと拾う。XML パーサを使わないのは読むのが 3 属性だけで、
 * かつ XML の属性値に " が入らないため（tools/migrate-design.mjs と同じ判断）。
 */
function readTypes(db: string): PaletteType[] {
    const xml = readFileSync(join(REPO_ROOT, "db", db, "datatypes.xml"), "utf8");
    return (xml.match(/<type\s[^>]*?\/>/g) ?? []).map((tag, index) => ({
        index: index,
        id: /\sid="([^"]*)"/.exec(tag)?.[1],
        label: /\slabel="([^"]*)"/.exec(tag)?.[1],
        sql: /\ssql="([^"]*)"/.exec(tag)?.[1],
        fk: /\sfk="([^"]*)"/.exec(tag)?.[1],
    }));
}

/** id -> 添字。tools 側と js/io/palette.ts の indexOfId と同じ規則 */
const ID_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

describe("型パレットの id 規則（段階4-2b）", () => {
    test("db/ に読めるプロファイルがある（この検査自体が空振りしていないこと）", () => {
        expect(DB_PROFILES.length).toBeGreaterThan(0);
    });

    for (const db of DB_PROFILES) {
        describe(db, () => {
            const types = readTypes(db);

            test("すべての <type> が id を持つ", () => {
                const missing = types.filter((t) => t.id === undefined);
                expect(
                    missing.map((t) => `[${t.index}] label=${t.label}`),
                ).toEqual([]);
            });

            test(`id が ${ID_PATTERN.source} に適合する`, () => {
                /*
                 * この形にしてあること自体が安全装置になっている。**現行 5 パレットの
                 * label はこの形に 1 つも一致しない**（すべて大文字か空白を含む）ので、
                 * 移行し忘れた formatVersion 1 のファイルが「たまたま読めてしまう」ことが
                 * 原理的に起きない。id を大文字混じりにするとこの保証が消える。
                 */
                const invalid = types.filter(
                    (t) => t.id === undefined || !ID_PATTERN.test(t.id),
                );
                expect(
                    invalid.map((t) => `[${t.index}] id=${t.id} label=${t.label}`),
                ).toEqual([]);
            });

            test("fk の値は同じパレットに実在する id", () => {
                /*
                 * 段階6-2。fk は「この型を親に持つ FK 子行の型」で、6-2 までは label 参照
                 * だった。label は §6 のパレット現代化が自由に動かしてよい表示名なので
                 * （docs/FORMAT.md の規則3）、そこを照合キーにしていると label を 1 文字
                 * 動かした瞬間に解決が壊れる —— しかも実害は FK を対話的に作ったときだけ
                 * 出るので、6-3 のパレット差し替えでは気づけない。
                 *
                 * TypePalette.fkIndexFor は引けなければ自分自身に倒す（旧パレット互換）ので、
                 * 型が黙って別物になるのを止められるのは**この検査だけ**。
                 */
                const ids = new Set(types.map((t) => t.id));
                const dangling = types
                    .filter((t) => t.fk !== undefined && !ids.has(t.fk))
                    .map((t) => `[${t.index}] id=${t.id} fk=${t.fk}`);
                expect(dangling).toEqual([]);
            });

            test("id がパレット内で一意", () => {
                const seen = new Map<string, number>();
                const dup: string[] = [];
                for (const t of types) {
                    if (t.id === undefined) continue;
                    const first = seen.get(t.id);
                    if (first !== undefined) {
                        dup.push(`${t.id}: [${first}] と [${t.index}]`);
                    } else {
                        seen.set(t.id, t.index);
                    }
                }
                expect(dup).toEqual([]);
            });
        });
    }

    test("x_ 接頭辞は撤去予定の entry にだけ付いている", () => {
        /*
         * x_ は「そのプロファイルの正規語彙に無い entry」の印（規則は docs/FORMAT.md）。
         * 4-2b 時点の実測は 2 件（postgresql の Real と vfp9 の Integer (not key)）で、
         * どちらも sql 属性が壊れているもの。6-1 で vfp9 が対応 DB から外れ、残るのは
         * postgresql の Real（sql="BIGINT"。Big Integer と重複 ＝ known-issue #3 の本体）だけ。
         *
         * 増えていたら、パレットに新しい壊れた entry が入ったということ。
         * 6-3 の PG18 パレット差し替え（x_real が消える）で 0 件になる。
         * 対応 DB の決定は CUSTOMIZATIONS.md の 6-0。
         */
        const flagged = DB_PROFILES.flatMap((db) =>
            readTypes(db)
                .filter((t) => t.id?.startsWith("x_"))
                .map((t) => `${db}: ${t.id} (label=${t.label}, sql=${t.sql})`),
        );
        expect(flagged).toEqual(["postgresql: x_real (label=Real, sql=BIGINT)"]);
    });
});
