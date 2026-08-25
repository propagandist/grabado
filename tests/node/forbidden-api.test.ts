import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../support/fixtures.ts";

/*
 * 「書いてはいけない形」を 0 件で縛る（org security-verification §2.1 の型）。
 *
 * ここが見るのは **CSP の前提**。`script-src 'self'` は動的評価を許さないので、
 * これらが 1 つでも戻ってきた時点で `'unsafe-eval'` が要る CSP に落ちる ——
 * それは org security-baseline §3.5 が「実質的な無効化」と名指しする形。
 *
 * ★ **コメントの中も数える。** 「書いてはいけない形」を文字列として一切置かないほうが
 *   縛りとして強く、除外規則（コメントを剥がす）を持たないぶん壊れない。
 *   js/wwwsqldesigner.ts の cookie のコメントは、この制約に合わせて書いてある。
 *
 * ★ `innerHTML` はここに入れていない —— 2026-08-25 実測で 24 か所あり、棚卸しは別段階
 *   （判断は issue #89）。**0 を 1 にする変更が赤くなればよい**のであって、既存を
 *   読み直す作業ではない。
 */

/** 2026-08-25 実測: どちらも 0 件。**増やす変更を赤くするための閾値** */
const FORBIDDEN: ReadonlyArray<{ readonly label: string; readonly pattern: RegExp }> =
    Object.freeze([
        { label: "eval(", pattern: /\beval\s*\(/ },
        { label: "new Function", pattern: /\bnew\s+Function\s*\(/ },
    ]);

/** ディレクトリ配下の .ts をすべて —— 走査そのものが漏れないよう、拡張子だけで選ぶ */
function collectSources(dir: string): string[] {
    return readdirSync(dir, { recursive: true, encoding: "utf8" })
        .filter((name) => name.endsWith(".ts"))
        .map((name) => join(dir, name));
}

const SOURCES = ["js", "src"].flatMap((dir) => collectSources(join(REPO_ROOT, dir)));

describe("動的評価を持ち込まない（CSP の前提）", () => {
    test("走査対象が空になっていない", () => {
        expect(SOURCES.length).toBeGreaterThan(40);
    });

    for (const { label, pattern } of FORBIDDEN) {
        test(`js/ src/ に ${label} が 0 件`, () => {
            const hits = SOURCES.filter((path) => pattern.test(readFileSync(path, "utf8"))).map(
                (path) => path.slice(REPO_ROOT.length).split(sep).join("/"),
            );
            expect(hits, `${label} が戻ってきた`).toEqual([]);
        });
    }
});
