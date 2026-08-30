import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../support/fixtures.ts";

/*
 * 配布物と CI が**同じツールチェーンの版**で動いていることを固定する（issue #134）。
 *
 * Dockerfile の web ステージは「版は ci-frontend.yml の `node-version` に揃える。
 * **CI と違うもので配布物を作らない**」と書いているが、**2026-08-30 まで、それを見る機械が
 * 1 つも無かった** —— Dependabot の #130（node 24 → 26）は Dockerfile の 1 行だけを動かし、
 * **全ジョブ緑のまま**「CI と違うもので配布物を作る」状態にできた。
 * Java も同型で、`jvmToolchain` / `java-version` / temurin 2 ステージの **4 か所が手で
 * 揃っている**（Java 26 は 2026-03 に出ているので、temurin の同型 PR がいずれ来る）。
 *
 * イディオムは tests/node/csp.test.ts と tests/node/env-contract.test.ts と同じ
 * ——**正本を読んで、写しのずれを赤くする**。
 *
 * ★ **版の数字そのものはここに書かない。** 書けば正本が 2 つになる（env-contract.test.ts が
 *   「値そのものは見ない。確かめるのは名前の集合だけ」と決めているのと同じ理由）。
 *   ここが確かめるのは**一致だけ**で、「どの版にするか」は正本の側が決める。
 *
 * ★ **意図して対象外にしたもの**（漏れではない）
 *   - `.github/workflows/ci-image.yml` の `node-version` —— 段階2-5 が「**揃える義務は無い**／
 *     **揃える先を 3 か所に増やさない**」と決めた先。あれは Playwright を回す Node であって、
 *     イメージの中身とは別（web ステージは自分のベースイメージで build する）。
 *   - `tests/orm-tools/cases.ts` の `node:24` —— **使い捨てコンテナで tsc を回すだけ**で、
 *     配布物のビルド入力ではない。`npm test` にも CI にも入らない層（そのファイルの★）。
 */

const CI_FRONTEND = ".github/workflows/ci-frontend.yml";
const CI_SERVER = ".github/workflows/ci-server.yml";
const DOCKERFILE = "Dockerfile";
const BUILD_GRADLE = "server/build.gradle.kts";

/** 改行は LF に寄せて読む（`$` が CR に引っかかると、書式ではなく OS で結果が変わる）。 */
function read(rel: string): string {
    return readFileSync(join(REPO_ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}

/**
 * `pattern` が**ちょうど 1 か所だけ**当たることを要求して、捕獲した版番号を返す。
 *
 * ★ **空振りを緑にしない。** 書式が変わって読めなくなったとき「一致している」ではなく
 *   「**読めなかった**」と言わせる —— 読み取りが壊れたまま緑になる検査は、無いのと同じ。
 *
 * ★ ベースイメージの正規表現は `@sha256:` を**必須**にしてある。digest ピンを外すと
 *   ここが読めなくなって赤くなる（org security-baseline §5.1 の「タグだけでは、同じ
 *   Dockerfile から違うものが入る」に、副次的にだが機械が付く）。
 */
function version(rel: string, what: string, pattern: RegExp): number {
    const hits = [...read(rel).matchAll(pattern)];
    expect(hits.length, `${rel} の ${what} が、ちょうど 1 か所で読めること`).toBe(1);
    return Number(hits[0]![1]);
}

/** 正本: ci-frontend.yml の `node-version`（Dockerfile が名指ししている先）。 */
const nodeSource = (): number =>
    version(CI_FRONTEND, "node-version", /^[ \t]+node-version: (\d+)$/gm);

/** 正本: build.gradle.kts の `jvmToolchain`（**実際にコンパイルするのがここだから**）。 */
const javaSource = (): number =>
    version(BUILD_GRADLE, "jvmToolchain", /^[ \t]*jvmToolchain\((\d+)\)$/gm);

describe("ツールチェーンの版の一致（issue #134）", () => {
    test("Dockerfile の web ステージは、ci-frontend.yml の node-version に揃っている", () => {
        const copy = version(
            DOCKERFILE,
            "web ステージの node",
            /^FROM node:(\d+)-alpine@sha256:[0-9a-f]{64} AS web$/gm,
        );
        expect(
            copy,
            [
                "Dockerfile の web ステージと ci-frontend.yml の node-version がずれている。",
                "**CI と違うもので配布物を作らない**（Dockerfile の★）ので、両方を動かすこと。",
                "版を上げる判断そのものは docs/HANDOVER.md §2.2（着手時に最新 LTS 確認）。",
            ].join("\n"),
        ).toBe(nodeSource());
    });

    test("ci-server.yml の java-version は、build.gradle.kts の jvmToolchain に揃っている", () => {
        const copy = version(CI_SERVER, "java-version", /^[ \t]+java-version: (\d+)$/gm);
        expect(
            copy,
            "ci-server.yml の java-version と build.gradle.kts の jvmToolchain がずれている。",
        ).toBe(javaSource());
    });

    test("Dockerfile の api ステージは、build.gradle.kts の jvmToolchain に揃っている", () => {
        const copy = version(
            DOCKERFILE,
            "api ステージの temurin",
            /^FROM eclipse-temurin:(\d+)-jdk-alpine@sha256:[0-9a-f]{64} AS api$/gm,
        );
        expect(
            copy,
            "Dockerfile の api ステージ（jdk）と build.gradle.kts の jvmToolchain がずれている。",
        ).toBe(javaSource());
    });

    test("Dockerfile の runtime ステージは、build.gradle.kts の jvmToolchain に揃っている", () => {
        const copy = version(
            DOCKERFILE,
            "runtime ステージの temurin",
            /^FROM eclipse-temurin:(\d+)-jre-alpine@sha256:[0-9a-f]{64}$/gm,
        );
        expect(
            copy,
            [
                "Dockerfile の runtime ステージ（jre）と build.gradle.kts の jvmToolchain が",
                "ずれている。**jar を作った JDK より古い JRE で起こすと起動時に落ちる。**",
            ].join("\n"),
        ).toBe(javaSource());
    });
});
