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

import { buildDdlModel } from "../ddl/shared.ts";
import type { DesignModel } from "../model.ts";
import type { TypePalette } from "../palette.ts";
import { generateJpa } from "./jpa.ts";
import { generatePrisma } from "./prisma.ts";

/**
 * 出せるターゲット。**UI の select がここから作られる**（js/io.ts）。
 *
 * 6-0 が挙げた 4 本のうち 2 本。**SQLAlchemy は保留**（判断は CUSTOMIZATIONS.md の段階6-9e）。
 * どれも「正規型 -> 言語型」の表 1 つで書けるのが 6-9c を先にやった意味だが、
 * **Prisma だけは逆参照を形式が要求する**ので、そこだけ 6-9d の判断を決め直している。
 */
export const ORM_TARGETS = ["jpa", "prisma"] as const;

export type OrmTarget = (typeof ORM_TARGETS)[number];

/** select に出す表示名。locale を通さない —— 製品名なので翻訳しない */
export const ORM_LABELS: Readonly<Record<OrmTarget, string>> = {
    jpa: "JPA (Kotlin)",
    prisma: "Prisma",
};

/** golden の拡張子。**ターゲットの性質なのでここに置く**（tests/ に散らさない） */
export const ORM_EXTENSIONS: Readonly<Record<OrmTarget, string>> = {
    jpa: "kt",
    prisma: "prisma",
};

export function isOrmTarget(target: string): target is OrmTarget {
    return (ORM_TARGETS as readonly string[]).includes(target);
}

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
): string {
    if (!isOrmTarget(target)) {
        throw new Error(`対応していない ORM ターゲット: ${target}`);
    }
    const tables = buildDdlModel(model, palette);
    /* trim するのは DDL 側（js/io/ddl/generate.ts）と同じ —— golden も同じ形になる */
    switch (target) {
        case "jpa":
            return generateJpa(tables).trim();
        case "prisma":
            /* Prisma だけ db を見る —— datasource の provider が要る（8 本中 5 本にしかない） */
            return generatePrisma(tables, palette.db()).trim();
    }
}
