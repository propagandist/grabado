import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../support/fixtures.ts";

/*
 * 設計トークンの器が、静かに壊れないことを固定する（#169）。
 *
 * ここが見るのは 3 つだけで、どれも **dev では緑のまま dist で壊れる**形を捕まえる:
 *
 *   1. `@import` —— frontend/index.html の CSS <link> は 4 本とも media 属性を持つので、
 *      Vite は CSS として処理せず**素の資産としてコピーする**（実証: material-inspired.css
 *      とビルド後の assets/material-inspired-*.css がバイト一致する）。したがって
 *      `@import` はインライン化されず、ブラウザが /assets/ からの相対で解決して 404 になる。
 *      `npm run dev` では /styles/ が実在するので**通ってしまう**。
 *   2. 未定義の `var()` —— 宣言が計算値時点で無効になり、**その 1 宣言だけが静かに落ちる**。
 *      とくに styles/base.css と styles/icons.css は title を持たない <link> で常に効くので、
 *      **テーマ側（material-inspired.css の :root）のトークンを参照してはいけない** ——
 *      original を選ぶと material-inspired.css ごと disabled になり、未定義になる。
 *   3. <link> から参照されていない .css —— 置いたのに読まれていないファイル。
 *
 * 残りの検査（トークンの命名・未使用トークン・コントラスト）は #175。
 */

const STYLES = join(REPO_ROOT, "frontend/styles");
const INDEX = join(REPO_ROOT, "frontend/index.html");

const cssFiles = readdirSync(STYLES).filter((f) => f.endsWith(".css"));
const html = readFileSync(INDEX, "utf8");

/** テーマ切り替えの対象にならない = 常に効く CSS。テーマのトークンを参照できない側 */
const ALWAYS_ON = ["base.css", "icons.css"];

function read(file: string): string {
    return readFileSync(join(STYLES, file), "utf8");
}

/** `--name:` の宣言を採る。`var(--name)` の参照とは別物なので、コロンで見分ける */
function declaredTokens(css: string): Set<string> {
    return new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

function referencedTokens(css: string): Set<string> {
    return new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!));
}

describe("styles の器（#169）", () => {
    test("@import を 1 つも使っていない —— dist で 404 になり、dev では通ってしまう", () => {
        for (const file of cssFiles) {
            expect(read(file), `${file} が @import を持っている`).not.toMatch(/@import/);
        }
    });

    test("常に効く CSS は、自前と base.css のトークンだけを参照する", () => {
        const base = declaredTokens(read("base.css"));
        for (const file of ALWAYS_ON) {
            const css = read(file);
            const own = declaredTokens(css);
            for (const ref of referencedTokens(css)) {
                expect(
                    own.has(ref) || base.has(ref),
                    `${file} が ${ref} を参照しているが、base.css にも自前にも無い` +
                        `（テーマ側の :root にあるなら、original を選んだときに未定義になる）`,
                ).toBe(true);
            }
        }
    });

    test("テーマ CSS の var() は、自前か base.css で定義されている", () => {
        const base = declaredTokens(read("base.css"));
        for (const file of cssFiles) {
            const css = read(file);
            const own = declaredTokens(css);
            for (const ref of referencedTokens(css)) {
                expect(own.has(ref) || base.has(ref), `${file} の ${ref} が未定義`).toBe(true);
            }
        }
    });

    test("styles/*.css が全部 index.html の <link> から参照されている", () => {
        for (const file of cssFiles) {
            expect(html, `styles/${file} を読む <link> が無い`).toContain(`styles/${file}`);
        }
    });
});
