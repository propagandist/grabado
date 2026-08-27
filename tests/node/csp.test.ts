import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import viteConfig from "../../vite.config.ts";
import { REPO_ROOT } from "../support/fixtures.ts";

/*
 * セキュリティヘッダの写しが、正本とずれていないことを固定する（§2 段階2-2）。
 *
 * 正本は Kotlin の SecurityHeadersFilter（配布時に実際に配るのが Spring だから）で、
 * vite.config.ts の preview.headers はその写し —— **手元の `vite preview` を配布時と
 * 同じヘッダで回す**ためだけに存在する。写しを許す代わりに、ずれたらここが赤くなる。
 *
 * イディオムは tests/node/type-mapping.test.ts（docs の表と実装を 1 セルずつ）と
 * tests/node/workarounds.test.ts（回避策がまだ必要であること）に既にある形。
 */

const FILTER = join(
    REPO_ROOT,
    "server/src/main/kotlin/io/propagandist/grabado/config/SecurityHeadersFilter.kt",
);

/**
 * Kotlin の `HEADERS` から `"名前" to "値",` の対を読む。
 *
 * 1 ヘッダ 1 行に保つ（CSP の行は長いが折らない）—— 折った瞬間にこの読み取りが壊れ、
 * **正本の書き方をテストの都合で決めることになる**ので、そのときは Kotlin 側ではなく
 * ここを直す。
 */
function headersFromKotlin(): Record<string, string> {
    const source = readFileSync(FILTER, "utf8");
    const pairs = source.matchAll(/^\s*"([A-Za-z-]+)" to "([^"]*)",$/gm);
    const headers: Record<string, string> = {};
    for (const [, name, value] of pairs) {
        headers[name!] = value!;
    }
    return headers;
}

const kotlin = headersFromKotlin();
const preview = viteConfig.preview?.headers ?? {};

describe("セキュリティヘッダ", () => {
    test("Kotlin 側が 5 本を持っている（読み取り自体が壊れていない）", () => {
        expect(Object.keys(kotlin).sort()).toEqual([
            "Content-Security-Policy",
            "Permissions-Policy",
            "Referrer-Policy",
            "X-Content-Type-Options",
            "X-Frame-Options",
        ]);
    });

    test("vite preview の写しが正本と 1 バイトも違わない", () => {
        expect(preview).toEqual(kotlin);
    });
});

describe("CSP の守る値", () => {
    const csp = kotlin["Content-Security-Policy"] ?? "";

    /*
     * org security-baseline §3.5:「script-src に 'unsafe-inline' や 'unsafe-eval' を
     * 足す変更が、実質的な無効化」。**足した日に赤くする**のがこのテストの役目。
     */
    test("script-src を緩めていない", () => {
        expect(csp, `CSP が緩んでいる: ${csp}`).not.toMatch(/unsafe-inline|unsafe-eval/);
    });

    /* org security-baseline §3.9（分類 B に掛かるクリックジャッキングの値） */
    test("frame-ancestors 'none' がある", () => {
        expect(csp).toContain("frame-ancestors 'none'");
    });

    /*
     * 使う先だけを明示で開ける形。default-src が 'self' に緩むと、未列挙の
     * ディレクティブ（worker / manifest / media / frame）が黙って通るようになる。
     */
    test("default-src 'none' から始まる", () => {
        expect(csp.startsWith("default-src 'none';")).toBe(true);
    });
});
