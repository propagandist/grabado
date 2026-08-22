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
    /** 読み込みで受ける別名（段階6-3 で新設。| 区切り） */
    readonly aka: string | undefined;
}

/**
 * <type> を属性ごと拾う。XML パーサを使わないのは読むのが数属性だけで、
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
        aka: /\saka="([^"]*)"/.exec(tag)?.[1],
    }));
}

/** aka の 1 件ずつ（大小無視で照合されるので比較は大文字に寄せる） */
function akaNames(t: PaletteType): string[] {
    return (t.aka?.split("|") ?? []).map((n) => n.toUpperCase());
}

/** そのプロファイルの datatypes.xml 全文（下の 2 本は <type> 以外も読む） */
function readPalette(db: string): string {
    return readFileSync(join(REPO_ROOT, "db", db, "datatypes.xml"), "utf8");
}

/**
 * <template> の <row> が指す型 id（段階6-4）。テンプレートが無ければ空。
 *
 * 読み方は readTypes と同じ素の正規表現。**id 参照であることが唯一の契約**なので、
 * ここで実在を押さえておかないと「テンプレートを適用した瞬間に例外」が
 * パレットを触った段階ではなく利用者の手元で出る。
 */
function readTemplateTypes(db: string): string[] {
    const block = /<template>([\s\S]*?)<\/template>/.exec(readPalette(db));
    if (!block) {
        return [];
    }
    return (block[1]!.match(/<row\s[^>]*?\/>/g) ?? []).map(
        (tag) => /\stype="([^"]*)"/.exec(tag)?.[1] ?? "",
    );
}

/** <datatypes newrowtype="..."> が指す型 id（段階6-4。無ければ undefined） */
function readNewRowType(db: string): string | undefined {
    return /<datatypes\s[^>]*?\snewrowtype="([^"]*)"/.exec(readPalette(db))?.[1];
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

            test("aka が他の型の sql と衝突しない（段階6-3）", () => {
                /*
                 * TypePalette.indexOfTypeNameStrict は sql を全型走査してから aka を走査する
                 * ので、衝突しても sql が勝つ（＝黙って別の型になることはない）。それでも
                 * ここで止めるのは、衝突した aka が**永遠に届かない死んだ別名**になるため。
                 * 「別名を書いたのに効かない」を静かに残さない。
                 */
                const sqls = new Set(
                    types.map((t) => t.sql?.toUpperCase()).filter((s) => s !== undefined),
                );
                const clashing = types.flatMap((t) =>
                    akaNames(t)
                        .filter((n) => sqls.has(n))
                        .map((n) => `[${t.index}] id=${t.id} aka=${n}`),
                );
                expect(clashing).toEqual([]);
            });

            test("aka がパレット内で重複しない（段階6-3）", () => {
                /* 同じ別名を 2 つの型が主張すると、解決は並び順という偶然に決まる */
                const seen = new Map<string, string>();
                const dup: string[] = [];
                for (const t of types) {
                    for (const name of akaNames(t)) {
                        const first = seen.get(name);
                        if (first !== undefined) {
                            dup.push(`${name}: ${first} と ${t.id}`);
                        } else {
                            seen.set(name, `${t.id}`);
                        }
                    }
                }
                expect(dup).toEqual([]);
            });

            test("<template> の type は実在する id（段階6-4）", () => {
                /*
                 * fk と同じ論法。テンプレートは type を **id 参照**で持つので
                 * （sql 名にすると §6 が sql を動かした瞬間に壊れる）、実在しない id を
                 * 書くと js/io/template.ts が例外を投げる —— それが出るのは
                 * 「新規テーブルを作ろうとしたとき」なので、パレットを触った段階では
                 * 誰も気づけない。**この検査だけがその間に立つ。**
                 */
                const ids = new Set(types.map((t) => t.id));
                const dangling = readTemplateTypes(db).filter(
                    (id) => !ids.has(id),
                );
                expect(dangling).toEqual([]);
            });

            test("newrowtype は実在する id（段階6-4）", () => {
                /*
                 * **段階6-8d で「属性が無くてもよい」を落とした。** 6-8c までは未現代化
                 * プロファイルが属性を持たず空振りが許されていたが、8 本すべてが持つように
                 * なったので、許したままだと書き忘れが黙って通る（添字 0 の型になる）。
                 */
                const id = readNewRowType(db);
                const ids = new Set(types.map((t) => t.id));
                expect(id !== undefined && ids.has(id)).toBe(true);
            });

            test("sql がパレット内で重複しない", () => {
                /*
                 * 6-2 まで db/postgresql/datatypes.xml が sql="BIGINT" を bigint と x_real の
                 * 2 か所に持っていた（known-issue #3 の本体）。**6-3 の撤去で 5 パレットすべてが
                 * 重複 0 になった**ので、ここを検査に変えて再発を止める。
                 */
                const seen = new Map<string, string>();
                const dup: string[] = [];
                for (const t of types) {
                    if (t.sql === undefined) continue;
                    const first = seen.get(t.sql);
                    if (first !== undefined) {
                        dup.push(`${t.sql}: ${first} と ${t.id}`);
                    } else {
                        seen.set(t.sql, `${t.id}`);
                    }
                }
                expect(dup).toEqual([]);
            });
        });
    }

    test('8 プロファイルすべてが strict="1" を持つ（ファイル規則。段階6-8d）', () => {
        /*
         * **js/ 側の読み手が 0 になった属性を、ここで test-enforced な規則にする。**
         *
         * strict="1" は 6-3 が「現代化済みの印」として入れたもので、照合規則・未知型の扱い・
         * size の落とし方を切り替えていた。6-8d で 8 本すべてが現代化され、
         * js/io/palette.ts の isStrict() は分岐ごと消えた。
         *
         * 属性まで消す案は採らなかった —— 消すと「このファイルは sql / aka の完全一致だけで
         * 解決でき、re を持たず、length を守る」という**ファイルの契約を宣言する唯一の面**が
         * 無くなる。6-9 で新しいプロファイルを足すとき、コードはもう何も止めてくれない。
         */
        const notStrict = DB_PROFILES.filter(
            (db) =>
                !readFileSync(join(REPO_ROOT, "db", db, "datatypes.xml"), "utf8").includes(
                    'strict="1"',
                ),
        );
        expect(notStrict).toEqual([]);
    });

    test("x_ 接頭辞の entry は 1 つも残っていない", () => {
        /*
         * x_ は「そのプロファイルの正規語彙に無い entry」の印（規則は docs/FORMAT.md）。
         * 4-2b 時点の実測は 2 件（postgresql の Real と vfp9 の Integer (not key)）で、
         * どちらも sql 属性が壊れているもの。6-1 で vfp9 が対応 DB から外れ、
         * **6-3 の PG18 パレット差し替えで x_real も撤去されて 0 件になった**
         * （移行先は bigint。表は CUSTOMIZATIONS.md の段階6-3）。
         *
         * 期待値を [] にしたので、**壊れた entry を新しく足すとここが赤くなる**。
         * そのとき考えるべきは「x_ を付けて通す」ではなく「なぜ壊れた型を入れるのか」。
         */
        const flagged = DB_PROFILES.flatMap((db) =>
            readTypes(db)
                .filter((t) => t.id?.startsWith("x_"))
                .map((t) => `${db}: ${t.id} (label=${t.label}, sql=${t.sql})`),
        );
        expect(flagged).toEqual([]);
    });
});
