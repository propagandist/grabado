/* ------------------- orm-tools: 通す一覧と道具の表 ------------------- */
/*
 * grabado: ORM 出力を**実物の道具**に通す検査の設定（issue #120）。
 *
 * ★ **母集団はディレクトリ走査で作る。ここには書かない。**
 *   `tests/support/fixtures.ts` の `DB_PROFILES` が `frontend/db/` の実体を正とするのと
 *   同じ理由 —— **リストは人が書き写すもので実体とずれうる**。ここが持つのは
 *   **道具の表**と**除外の表**だけで、除外には**理由が型として必須**。
 *
 * ★ **0 バイトの golden は除外リストに書かない。** 「空なら道具に渡すものが無い」は
 *   規則であって一覧ではない —— `empty` の出力規則が変わった日に、書いた一覧は黙って腐る。
 */

import { readFileSync } from "node:fs";

/**
 * 本体の版を読む（#251）。**道具の版のうち、本体にあるものは写さない。**
 *
 * ★ 写していた時期がある —— `typescript` は #131（2026-08-30。Dependabot）で本体だけ
 *   5.9.3 -> 7.0.2 に上がり、**ここの写しは 12 日 5.9.3 のままだった**。Dependabot は本体を
 *   上げても、この表の文字列までは直さない。**そしてこの層は手元でしか回らないので、
 *   ずれは回した日にしか見えない。** 読めば、ずれそのものが起きない。
 *
 * ★ 写しを残して「揃っているか」をテストで見る形（`toolchain.test.ts` が Node / JDK でやっている）
 *   は採らない —— あれは**本体を読めない場所**（Dockerfile ・ CI の yml）のための形。ここは読める。
 *
 * **読めなければ例外にする**（黙って古い版で回さない）。`tests/node/orm-tools.test.ts` が
 * このファイルを import するので、**本体の形が変わって読めなくなったら `npm test` が落ちる**。
 */
export const repoVersion = Object.freeze({
    typescript(): string {
        const lock = JSON.parse(repoFile("package-lock.json")) as {
            packages?: Record<string, { version?: string }>;
        };
        const version = lock.packages?.["node_modules/typescript"]?.version;
        if (!version) {
            throw new Error("package-lock.json に node_modules/typescript の版が無い");
        }
        return version;
    },
    kotlin(): string {
        const version = /^kotlin\s*=\s*"([^"]+)"/m.exec(repoFile("server/gradle/libs.versions.toml"))?.[1];
        if (!version) {
            throw new Error("server/gradle/libs.versions.toml に kotlin の版が無い");
        }
        return version;
    },
});

function repoFile(rel: string): string {
    return readFileSync(new URL("../../" + rel, import.meta.url), "utf8");
}

/** 道具 1 つぶん。`target` は `tests/golden/orm/<target>/` のディレクトリ名 */
export interface ToolSpec {
    readonly target: string;
    /** 使い捨てコンテナのイメージ。**タグ止め**（digest は実行のたびに印字する） */
    readonly image: string;
    /** この道具が何を確かめるのか（1 行） */
    readonly what: string;
    /**
     * 道具の版。**ピン止めする** —— 版が判定そのものを左右する
     * （`mssql-core` の有無も `bytea` の有無も drizzle-orm の版で決まる）。
     */
    readonly versions: Readonly<Record<string, string>>;
}

/**
 * 道具の表。**`ORM_TARGETS` と 1 対 1 でなければ検査が落ちる**
 * （`tests/node/orm-tools.test.ts`）—— 4 本目の ORM を足して道具を決め忘れた状態を捕まえる。
 *
 * ★ **イメージは digest でピンしない。** `Dockerfile` が digest ピンなのは**配布物を作るから**
 *   （org `security-baseline.md` §5.1）で、このコンテナは**何も生み出さない**。
 *   代わりに**実際に使った digest を毎回印字する**ので、再現に要る情報はログに残る。
 */
export const TOOLS: readonly ToolSpec[] = Object.freeze([
    {
        target: "jpa",
        image: "eclipse-temurin:25-jdk",
        what: "Kotlin コンパイラが受け付けるか（jakarta.persistence を classpath に置く）",
        versions: Object.freeze({
            /* server の kotlin を読む（Gradle は通さない）。写しを持たない —— repoVersion の KDoc */
            kotlin: repoVersion.kotlin(),
            /* Spring Boot 4.1.1 = Jakarta EE 11 の世代 */
            "jakarta.persistence-api": "3.2.0",
        }),
    },
    {
        target: "prisma",
        image: "node:24",
        what: "prisma validate が受け付けるか",
        versions: Object.freeze({ prisma: "6.19.1" }),
    },
    {
        target: "drizzle",
        image: "node:24",
        what: "drizzle-orm の型定義に照らして tsc --strict が通るか",
        versions: Object.freeze({
            "drizzle-orm": "0.45.2",
            /* repo の typescript を読む（TS を 2 種類走らせない）。写しを持たない —— repoVersion の KDoc */
            typescript: repoVersion.typescript(),
        }),
    },
]);

/**
 * 検証しない golden と、**その理由**。
 *
 * ★ **理由の無い除外は書けない**（型が要求する）。ここに書けるのは
 *   「**その組み合わせに対応する形式が存在しない**」だけで、
 *   「**道具が受け付けない**」は書けない —— それは直すべき欠陥である。
 *
 * ★ **「対応する core / provider が無い」は除外の理由にならない。**
 *   h2 / mssql / oracle / sql-standard の Drizzle 出力は pg-core の形で出しており、
 *   **pg-core の TypeScript としては妥当であるべき**。同じく Prisma の provider 無し 3 本は
 *   検証時に `datasource` を足せば通る（`verify.ts` の prelude）。
 *   **2026-08-28 の実測では、この理由で除外すべきものは 1 件も無かった。**
 */
export interface Exclusion {
    readonly target: string;
    readonly db: string;
    readonly fixture: string;
    readonly reason: string;
}

/** いまは 0 件。**空であることに意味がある**（上の★） */
export const EXCLUSIONS: readonly Exclusion[] = Object.freeze([]);

/**
 * Prisma の `datasource` を持たない golden に**検証時だけ**足す prelude。
 *
 * ★ **golden は 1 バイトも変えない。** h2 / oracle / sql-standard には対応する provider が
 *   無く、golden のヘッダが「使うときは自分で足すこと」と言っている。**足すのは検証側の仕事**。
 *
 * ★ **末尾に連結する。** Prisma はブロックの順序を問わないので意味は変わらず、
 *   **エラーメッセージの行番号が golden の行番号のまま読める**（先頭に足すとずれる）。
 *
 * ★ **provider は postgresql 固定でよい。** 6-9c が `@db.*`（native type 属性）を出さないと
 *   決めているので、**Prisma のスカラーは provider に依らない**。型の写像を見るという
 *   この検査の目的は、どの provider を足しても変わらない。
 */
export const PRISMA_PRELUDE = [
    "",
    "// grabado の検証が足した datasource（golden には含まれない。issue #120）。",
    "datasource db {",
    '  provider = "postgresql"',
    '  url      = env("DATABASE_URL")',
    "}",
    "",
].join("\n");

/**
 * provider -> `prisma validate` に渡すダミー URL。
 *
 * **Prisma は URL のスキームと provider の一致を検査する**ので、provider ごとに別の値が要る。
 * 接続はしないので、**到達しないアドレスでよい**。
 */
export const PRISMA_URLS: Readonly<Record<string, string>> = Object.freeze({
    postgresql: "postgresql://u:p@127.0.0.1:5432/db",
    mysql: "mysql://u:p@127.0.0.1:3306/db",
    sqlserver: "sqlserver://127.0.0.1:1433;database=db;user=u;password=p",
    sqlite: "file:./dev.db",
});
