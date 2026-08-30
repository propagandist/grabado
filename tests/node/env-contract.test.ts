import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../support/fixtures.ts";

/*
 * env の一覧が 3 つのファイルでずれていないことを固定する（§2 段階2-3）。
 *
 * 正本は application.yaml（**実際に読むのがそこだから**）。`.env.example` は利用者向けの
 * 写しで、`compose.yaml` の `environment:` は**コンテナへ渡す口**。3 つが一致していないと、
 * 「`.env` に書いたのに効かない」が黙って起きる —— それは外から見て壊れているのと
 * 区別がつかない。
 *
 * イディオムは tests/node/csp.test.ts と同じ（正本を読んで写しのずれを赤くする）。
 * **値そのものは見ない** —— 既定値は application.yaml と docs/ARCHITECTURE.md §7.3 / §8.4 が
 * 持ち、ここが確かめるのは**名前の集合**だけ。
 */

const APPLICATION_YAML = join(REPO_ROOT, "server/src/main/resources/application.yaml");
const ENV_EXAMPLE = join(REPO_ROOT, ".env.example");
const COMPOSE = join(REPO_ROOT, "compose.yaml");

/** YAML の `key:` に続く、より深いインデントの行を返す（空行は飛ばす）。 */
function blockUnder(source: string, key: string): string[] {
    const lines = source.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trimEnd().endsWith(`${key}:`));
    if (start < 0) return [];
    const outer = lines[start]!.match(/^\s*/)![0].length;
    const body: string[] = [];
    for (const line of lines.slice(start + 1)) {
        if (line.trim() === "") continue;
        if (line.match(/^\s*/)![0].length <= outer) break;
        body.push(line.trim());
    }
    return body;
}

/**
 * application.yaml が読む env の名前。**コメント行を除く** —— introspection の書式の例が
 * コメントの中にあり、それは「読んでいる env」ではない。
 */
function envNamesFromApplicationYaml(): string[] {
    const source = readFileSync(APPLICATION_YAML, "utf8");
    const effective = source
        .split(/\r?\n/)
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n");
    const names = [...effective.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map(([, name]) => name!);
    return [...new Set(names)].sort();
}

/** `GRABADO_` 前綴りと `ANTHROPIC_API_KEY`。**これが外向きに案内する集合。** */
function documentedEnvNames(): string[] {
    return envNamesFromApplicationYaml().filter(
        (name) => name.startsWith("GRABADO_") || name === "ANTHROPIC_API_KEY",
    );
}

/**
 * 裸の一般語で読んでいる互換名（`SCHEMA_DIR` / `READONLY`）。**案内はしない** ——
 * application.yaml の冒頭が書いているとおり、公開 OSS のコンテナ env として衝突しうる。
 */
function legacyAliases(): string[] {
    return envNamesFromApplicationYaml().filter(
        (name) => !name.startsWith("GRABADO_") && name !== "ANTHROPIC_API_KEY",
    );
}

/** `.env.example` のキー。**行ごとコメントアウトされた行も拾う**（使わない行はそう書く）。 */
function keysFromEnvExample(): string[] {
    const source = readFileSync(ENV_EXAMPLE, "utf8");
    const keys = [...source.matchAll(/^#?([A-Z][A-Z0-9_]*)=/gm)].map(([, key]) => key!);
    return [...new Set(keys)].sort();
}

/** `compose.yaml` の `environment:` が列挙している名前。 */
function environmentFromCompose(): string[] {
    const source = readFileSync(COMPOSE, "utf8");
    const names = blockUnder(source, "environment")
        .filter((line) => line.startsWith("- "))
        .map((line) => line.slice(2).trim());
    return [...new Set(names)].sort();
}

const documented = documentedEnvNames();

describe("env の名前が 3 つのファイルで一致している", () => {
    test("application.yaml から読めている（読み取り自体が壊れていない）", () => {
        // 増減したらここを直す。**「13 本ある」ではなく「この 13 本」**を書くのは、
        // 名前が入れ替わっても数が同じなら緑になる形を避けるため。
        expect(documented).toEqual([
            "ANTHROPIC_API_KEY",
            "GRABADO_AI_CACHE_ENTRIES",
            "GRABADO_AI_CACHE_TTL",
            "GRABADO_AI_EFFORT",
            "GRABADO_AI_MAX_CONCURRENT",
            "GRABADO_AI_MAX_REQUEST_BYTES",
            "GRABADO_AI_MAX_TABLES",
            "GRABADO_AI_MODEL",
            "GRABADO_AI_RATE_PER_MINUTE",
            "GRABADO_AI_TIMEOUT",
            "GRABADO_HSTS",
            "GRABADO_READONLY",
            "GRABADO_SCHEMA_DIR",
        ]);
    });

    test(".env.example が同じ集合を持つ", () => {
        expect(keysFromEnvExample()).toEqual(documented);
    });

    test("compose.yaml の environment が同じ集合を渡す", () => {
        expect(environmentFromCompose()).toEqual(documented);
    });

    test("裸の互換名は案内しない（GRABADO_ 前綴りが正）", () => {
        // 互換で読んでいること自体は変えない。**外向きの一覧に出さない**だけ。
        expect(legacyAliases()).toEqual(["READONLY", "SCHEMA_DIR"]);
        for (const alias of legacyAliases()) {
            expect(keysFromEnvExample()).not.toContain(alias);
            expect(environmentFromCompose()).not.toContain(alias);
        }
    });
});

describe("compose.yaml の書き方（段階2-3 の判断を固定する）", () => {
    const source = readFileSync(COMPOSE, "utf8");

    test("mount 先が application.yaml の既定と一致する", () => {
        const target = blockUnder(source, "volumes")
            .map((line) => line.replace(/^-\s*/, "").split(":")[1])
            .find((path) => path !== undefined);
        // `${GRABADO_SCHEMA_DIR:${SCHEMA_DIR:/data/schema}}` の最内の既定。
        const fallback = /schema-dir:.*:([^}]*)\}\}/.exec(
            readFileSync(APPLICATION_YAML, "utf8"),
        );
        expect(target).toBe(fallback?.[1]);
    });

    test("env_file を使わない（無関係な秘密をコンテナへ入れない）", () => {
        expect(source).not.toMatch(/^\s*env_file:/m);
    });

    test("environment に ${...} を書かない（空文字が起動を落とす）", () => {
        // 2026-08-26 実測: `GRABADO_READONLY=` は
        // `Failed to bind properties under 'grabado.readonly' to boolean` で起動しない。
        // **キーだけのリスト形式なら未設定の env は渡らない。**
        for (const entry of environmentFromCompose()) {
            expect(entry).toMatch(/^[A-Z][A-Z0-9_]*$/);
        }
    });

    test("レジストリのイメージを指さない（各自が build する）", () => {
        expect(source).not.toMatch(/^\s*image:/m);
        expect(source).toMatch(/^\s*build:/m);
    });
});
