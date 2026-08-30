import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../support/fixtures.ts";

/*
 * **版の写しが揃っていること**を固定する。**軸は 2 つある。**
 *
 * 1. **ツールチェーンの版**（issue #134）—— 配布物と CI が同じ Node / Java で動いているか
 * 2. **製品の版**（issue #155）—— `package.json` / `package-lock.json` /
 *    `server/build.gradle.kts` が同じ `version` を名乗っているか
 *
 * **1 は壊れるずれ、2 は壊れないずれ。** 分けて読むこと —— 下の describe が 2 つあるのはそのため。
 *
 * ---
 *
 * **軸 1: 配布物と CI が同じツールチェーンの版で動いていること**（issue #134）。
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

/*
 * **軸 2: 製品の版が 3 か所で揃っていること**（issue #155）。
 *
 * ★ **こちらは「壊れないずれ」を止める。** `version` はどこからも読まれていない
 *   （2026-08-30 実測。`archiveFileName` は `grabado.jar` で固定、フロントも参照しない）ので、
 *   **ずれても出力は 1 バイトも変わらない**。それでも止めるのは、**版は名前**であり、
 *   **`gh release` とタグは 1 つしか無い**から —— **成果物の外では 1 つの版に見える**のに、
 *   リポジトリの中で 2 つの名前を名乗るのは、記録として嘘になる。
 *
 * ★ **「赤は直せるものに限る」は、ここには当たらない。** あの判断
 *   （org security-baseline §3.12 / ci-strategy）が避けているのは**直せない赤**（上流の CVE 等）で、
 *   **この赤は片方の数字を直せば消える**。
 *
 * ★ **`package-lock.json` を含めるのは二重ではない**（**2026-08-30 実測**）——
 *   **`npm ci` はルートの `version` のずれを捕まえない**。lock を `0.9.9` /
 *   `package.json` を `0.1.0` にして `npm ci --dry-run` を回したところ、
 *   **116 packages を入れて exit 0** で通った。**見ているのは依存の整合だけ。**
 *
 * ★ **版番号そのものはここに書かない**（軸 1 と同じ理由）。確かめるのは**一致だけ**で、
 *   **どの版にするかは `docs/BRANCHING.md` のリリース手順が決める**。
 */
const PACKAGE_JSON = "package.json";
const PACKAGE_LOCK = "package-lock.json";

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

/**
 * [version] の文字列版（軸 2）。**版番号は数値にならない**（`0.1.0`）ので別に持つ。
 * **空振りを緑にしない**のは同じ。
 */
function versionStrings(rel: string, what: string, pattern: RegExp): string[] {
    const hits = [...read(rel).matchAll(pattern)];
    expect(hits.length, `${rel} の ${what} が、ちょうど 1 か所で読めること`).toBe(1);
    return hits.map((hit) => hit[1]!);
}

/**
 * JSON は `JSON.parse` で読む（軸 2）。**正規表現で読まない** —— lock は依存にも
 * `"version"` を持つので、**インデントでは根と依存を区別できない**。
 *
 * ★ **書式が壊れたときは parse エラーで落ちる。** 軸 1 の [version] が
 *   「ちょうど 1 か所で読めること」を要求しているのと**同じ役目**を、こちらは parse が担う
 *   ——**読み取りが壊れたまま緑になる検査は、無いのと同じ。**
 */
function json(rel: string): Record<string, unknown> {
    return JSON.parse(read(rel)) as Record<string, unknown>;
}

/**
 * 版番号を 1 つ取り出す。**`undefined` 同士が一致して緑になるのを防ぐ**ため、
 * **必ず「読めたこと」を先に主張する** —— キーが消えた lock で
 * `undefined === undefined` が通ると、**検査があるのに何も見ていない**状態になる。
 */
function productVersion(value: unknown, where: string): string {
    expect(value, `${where} の version が読めること`).toEqual(expect.any(String));
    expect(value as string, `${where} の version が空でないこと`).not.toBe("");
    return value as string;
}

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

describe("製品の版の一致（issue #155）", () => {
    /** 正本: `package.json` の `version`（**リリース手順が最初に動かすのがここだから**）。 */
    const source = (): string =>
        productVersion(json(PACKAGE_JSON)["version"], PACKAGE_JSON);

    test("package-lock.json のルートが、package.json の version に揃っている", () => {
        expect(
            productVersion(json(PACKAGE_LOCK)["version"], `${PACKAGE_LOCK} のルート`),
            [
                "package-lock.json のルートと package.json の version がずれている。",
                "**npm ci はこのずれを捕まえない**（2026-08-30 実測: 0.9.9 と 0.1.0 で exit 0）。",
                "版を上げるときは docs/BRANCHING.md の「リリース」節のとおり 3 ファイルを動かすこと。",
            ].join("\n"),
        ).toBe(source());
    });

    test("package-lock.json の自己記述が、package.json の version に揃っている", () => {
        /*
         * `packages[""]` は lock が持つ**自分自身の記述**。ルートの `version` とは別に持つので、
         * **片方だけ直すと静かにずれる** —— 2026-08-30 に手で 2 か所を直したときの実体がこれ。
         */
        const packages = json(PACKAGE_LOCK)["packages"] as Record<string, { version?: unknown }>;
        expect(packages, `${PACKAGE_LOCK} に packages があること`).toBeTypeOf("object");
        expect(
            productVersion(packages[""]?.version, `${PACKAGE_LOCK} の packages[""]`),
            'package-lock.json の packages[""] と package.json の version がずれている。',
        ).toBe(source());
    });

    test("server/build.gradle.kts が、package.json の version に揃っている", () => {
        const [copy] = versionStrings(
            BUILD_GRADLE,
            "version",
            /^version = "([^"]+)"$/gm,
        );
        expect(
            copy,
            [
                "server/build.gradle.kts と package.json の version がずれている。",
                "**出力は変わらない**（archiveFileName は grabado.jar で固定）が、",
                "**タグと gh release は 1 つしか無い** —— 2 つの名前を名乗ると記録が嘘になる。",
            ].join("\n"),
        ).toBe(source());
    });
});
