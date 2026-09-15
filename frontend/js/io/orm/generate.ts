/* ------------------------- orm: 入口 -------------------------- */
/*
 * grabado: DesignModel -> ORM モデル定義（HANDOVER §6 段階6-9d）。
 *
 * **出力の 2 本目の軸。** 6-5a が作った格子（docs/ARCHITECTURE.md §5.6）の形式側に、
 * DDL・設計 JSON に続く 3 つ目として入る:
 *
 *            ライブ側（描画エンジンを触る）      形式側（バイト列を知る）
 *      出    extract.ts                        json-serializer.ts / ddl/ / **orm/**
 *      入    apply.ts                          xml-parser.ts / json-parser.ts
 *
 * **db プロファイルとして足さない**（段階6-9a の決めたこと 1）。db/ にディレクトリを作ると
 * その瞬間 DB_PROFILES に入り、型パレットの契約（strict / <template> / newrowtype /
 * types-matrix の全型網羅）を全部背負う —— ORM は型パレットではない。設計 JSON の db が
 * "jpa" になって**同じ設計から DDL と ORM の両方を出せなくなる**のも決定的だった。
 *
 * だから ORM 出力は**下敷きの db プロファイルの上に乗る** —— 型は正規型（6-9c の kind）を
 * 介して写し、識別子の規則も下敷きのプロファイルのものをそのまま使う。
 * 8 プロファイルどれで設計していても ORM を出せる。
 */

import { buildDdlModel, type DdlTable } from "../ddl/shared.ts";
import type { TypeLoss } from "../convert.ts";
import { convertDesign } from "../convert.ts";
import type { DesignModel } from "../model.ts";
import type { TypePalette } from "../palette.ts";
import { generateJpa } from "./jpa.ts";
import { generateJpaJava } from "./jpa-java.ts";
import { generateDrizzle } from "./drizzle.ts";
import { generatePrisma } from "./prisma.ts";

/**
 * 出せるターゲット。**UI の select がここから作られる**（js/io.ts）。
 *
 * 6-0 が挙げた 4 本のうち **3 本で確定**。**SQLAlchemy は決めて外した**（2026-08-28。
 * 理由と**再考の条件**は CUSTOMIZATIONS.md の同日の記録 —— **見直すなら「復活」ではなく
 * 新規開発**である）。
 *
 * ★ **2026-09-15 に 4 本目を足した。ただし SQLAlchemy ではない** —— **JPA (Java)**。
 * **3 本で確定した根拠の 1 つ（「JPA と合わせて JVM 圏も埋まっている」）が、シェアで
 * 検算すると成立しなかった** —— サーバサイド JVM の多数派は Java で、埋まっていたのは
 * house と同じスタックの側だけだった。**SQLAlchemy を外した判断は動いていない**
 * （Python 圏への訴求が実際に要るときに、別 issue で見直す）。
 *
 * ★ **4 本の性質は揃っていない。**
 *   - **Prisma だけは逆参照を形式が要求する**（6-9d の「出さない」を 6-9e で決め直した）
 *   - **Drizzle だけは型の表が core ごとに要る**（6-9e の「表 1 つで書ける」という見立ては
 *     6-9f の実測で外れた。pg / mysql / sqlite / mssql で関数名も表せる意味も変わる）
 *   - **JPA だけが 2 本ある。** `jpa` が Kotlin で `jpa-java` が Java ——
 *     **`jpa` を `jpa-kotlin` へ改名していない。** golden 14 本のパスであり、
 *     `npm run test:orm-tools -- jpa` という**公開された手順の引数**でもあるため、
 *     機能追加と同じ diff に混ぜない判断。**id が非対称なのは承知のうえ**で、
 *     曖昧さは下の ORM_LABELS が引き受けている（`prisma` / `drizzle` が製品名で
 *     言語の接尾辞を持たないのと同じで、id はキーであって説明ではない）
 */
export const ORM_TARGETS = ["jpa", "jpa-java", "prisma", "drizzle"] as const;

export type OrmTarget = (typeof ORM_TARGETS)[number];

/** select に出す表示名。locale を通さない —— 製品名なので翻訳しない */
export const ORM_LABELS: Readonly<Record<OrmTarget, string>> = {
    jpa: "JPA (Kotlin)",
    "jpa-java": "JPA (Java)",
    prisma: "Prisma",
    drizzle: "Drizzle",
};

/** golden の拡張子。**ターゲットの性質なのでここに置く**（tests/ に散らさない） */
export const ORM_EXTENSIONS: Readonly<Record<OrmTarget, string>> = {
    jpa: "kt",
    "jpa-java": "java",
    prisma: "prisma",
    /* Drizzle のスキーマは素の TypeScript */
    drizzle: "ts",
};

export function isOrmTarget(target: string): target is OrmTarget {
    return (ORM_TARGETS as readonly string[]).includes(target);
}

/**
 * ターゲット -> 生成器。
 *
 * **db を見るのは Prisma と Drizzle**（JPA は 2 本とも見ない）。ただし理由が違う ——
 * Prisma は datasource の provider が要るだけだが、**Drizzle は型そのものが core 依存**
 * （段階6-9f）。どちらも 8 本中 5 本にしか対応が無い。
 *
 * ★ **4 本目で三項演算子の連鎖をやめた**（2026-09-15）。4 段になると読めなくなるうえ、
 * **連鎖の末尾は fallback なので、足したターゲットが黙って Drizzle として出る**。
 * Record にすると**型が網羅を強制する** —— 1 本足して埋め忘れれば typecheck が落ちる。
 */
const GENERATORS: Readonly<
    Record<OrmTarget, (tables: readonly DdlTable[], db: string | null) => string>
> = {
    jpa: (tables) => generateJpa(tables),
    "jpa-java": (tables) => generateJpaJava(tables),
    prisma: (tables, db) => generatePrisma(tables, db),
    drizzle: (tables, db) => generateDrizzle(tables, db),
};

/**
 * ORM のモデル定義を作る。
 *
 * **入力は DDL 生成と同じ解決済みモデル**（buildDdlModel）。型パレットを読むのは
 * あちら 1 か所のままで、こちらは正規型（kind）と size と関係を見る。
 */
export function generateOrm(
    model: DesignModel,
    palette: TypePalette,
    target: string,
    outputPalette?: TypePalette,
): string {
    if (!isOrmTarget(target)) {
        throw new Error(`対応していない ORM ターゲット: ${target}`);
    }
    /*
     * **下敷きのプロファイルも選べる**（段階6-10b）。ORM は「出力の別の軸」なので、
     * db の軸と掛け合わせられるのが素直な形 —— 「PG で設計して MySQL 向けの Prisma を出す」
     * は provider が変わるので実際に別の出力になる。省略時は 6-10a 以前と 1 バイトも変わらない。
     */
    const output = outputPalette ?? palette;
    const converted = convertDesign(model, palette, output);
    const tables = buildDdlModel(converted.model, output);
    /* trim するのは DDL 側（js/io/ddl/generate.ts）と同じ —— golden も同じ形になる */
    const body = GENERATORS[target](tables, output.db()).trim();

    if (body === "") {
        return body;
    }
    return conversionNotice(palette, output, converted.losses) + body;
}

/**
 * 変換したときだけ先頭に付ける説明（段階6-10b）。**同じ db なら 1 バイトも足さない**ので、
 * 既存の ORM golden 28 本は無差分のまま。
 *
 * DDL 側（js/io/ddl/generate.ts）と別実装にしてあるのは**コメント記法が違う**から ——
 * あちらは `--`、こちらは JPA も Prisma も `//`。1 本に括るとどちらでもない形になる
 * （6-9e が「言語ごとの識別子の規則は各生成器が持つ」と決めたのと同じ立場）。
 */
function conversionNotice(
    from: TypePalette,
    to: TypePalette,
    losses: readonly TypeLoss[],
): string {
    const fromDb = from.db();
    const toDb = to.db();
    if (fromDb === null || fromDb === toDb) {
        return "";
    }

    const out = [`// grabado: ${fromDb} の設計を ${toDb} の型で写して出力した。`];
    if (losses.length === 0) {
        out.push("// 型はすべてそのまま写っている（意味が動いた列は無い）。");
    } else {
        const columns = new Set(losses.map((l) => l.table + "." + l.column));
        out.push(`// **${columns.size} 列で型が動いている**（詳細は同じ設計の DDL 出力に出る）:`);
        for (const key of columns) {
            out.push("//   " + key.split("\r").join(" ").split("\n").join(" "));
        }
    }
    return out.join("\n") + "\n\n";
}
