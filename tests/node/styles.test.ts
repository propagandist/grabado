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

/*
 * 色のコントラスト（#171）。
 *
 * ★ **不透明度ではなく色で薄くする**と、値をここで見られる —— 着手前は
 *   `label { opacity: .7 }` や `.typehint { color: gray }` が**コントラスト計算から
 *   逃げていた**。gray（#808080）は白地で 3.95:1 しかなく WCAG AA（4.5:1）に届かない。
 *
 * ★ 見るのは 4 対だけ。**背景が確定している組み合わせ**に限る ——
 *   任意の重なりを総当たりすると、実際には起きない組み合わせで赤くなる。
 */

/** #rrggbb / rgba(r, g, b, a) を、白い面の上に合成した [r, g, b] にする */
function toRgb(css: string, bg: [number, number, number]): [number, number, number] {
    const hex = css.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        /* #FFF のような 3 桁も来る（material-inspired.css の --surface がこれ） */
        const six =
            hex[1]!.length === 3
                ? hex[1]!
                      .split("")
                      .map((c) => c + c)
                      .join("")
                : hex[1]!;
        const n = parseInt(six, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = css.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
    if (!m) throw new Error(`色として読めない: ${css}`);
    const a = m[4] === undefined ? 1 : Number(m[4]);
    return [1, 2, 3].map((i) => Math.round(Number(m[i]!) * a + bg[i - 1]! * (1 - a))) as [
        number,
        number,
        number,
    ];
}

/** WCAG 2.x の相対輝度 */
function luminance([r, g, b]: [number, number, number]): number {
    const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg: string, bg: string): number {
    const bgRgb = toRgb(bg, [255, 255, 255]);
    const fgRgb = toRgb(fg, bgRgb);
    const [a, b] = [luminance(fgRgb), luminance(bgRgb)].sort((x, y) => y - x) as [number, number];
    return (a + 0.05) / (b + 0.05);
}

/** `--name: 値;` を 1 つ読む */
function tokenValue(css: string, name: string): string {
    const m = css.match(new RegExp(`${name}\s*:\s*([^;]+);`));
    if (!m) throw new Error(`${name} が見つからない`);
    return m[1]!.trim();
}

describe("色のコントラスト（#171）", () => {
    const theme = read("material-inspired.css");
    const base = read("base.css");
    const surface = tokenValue(theme, "--surface");

    const onAccent = tokenValue(theme, "--on-accent");
    const PAIRS: [string, string, string][] = [
        ["本文", tokenValue(theme, "--text"), surface],
        ["薄い文字（label / optgroup）", tokenValue(theme, "--text-muted"), surface],
        ["型ヒント", tokenValue(base.slice(base.indexOf(".typehint")), "color"), surface],
        /* 白い文字を載せる面。#171 でこの 6 つのうち 5 つが 4.5:1 に届いていなかった */
        ["ブランド面の上の文字（#bar のホバー）", onAccent, tokenValue(theme, "--brand")],
        ["ブランド面（ホバー）", onAccent, tokenValue(theme, "--brand-hover")],
        ["アクセント面（#clientsql）", onAccent, tokenValue(theme, "--accent")],
        ["情報面（#keyadd）", onAccent, tokenValue(theme, "--info")],
        ["情報面（ホバー）", onAccent, tokenValue(theme, "--info-hover")],
        ["危険面（#keyremove）", onAccent, tokenValue(theme, "--danger")],
        ["危険面（ホバー）", onAccent, tokenValue(theme, "--danger-hover")],
        /* フォーカスリングは非テキストなので 3:1 でよいが、値が既に 4.5 を超えている */
        ["フォーカスリング", tokenValue(base, "--focus"), surface],
    ];

    test.each(PAIRS)("%s が WCAG AA（4.5:1）を満たす", (_label, fg, bg) => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
});

describe("!important（#171）", () => {
    test("author の !important は 3 つのまま —— 増やすなら理由を書いてから", () => {
        /*
         * 3 つとも **inline 宣言を殺すため**に要る（消すと挙動が変わる）:
         *   .table tbody { background: none !important }  —— row.ts:428 の型パレット由来の
         *       背景色を殺し、型の色を border-right の帯として出している
         *   .table tbody.expanded { background-color: … !important }  —— 同上
         *   select optgroup { background: white !important }  —— row.ts:512 の inline 背景色
         *
         * ★ 数える前にコメントを落とす —— **規約や理由を書いた文の中の "!important" を
         *   拾うと、説明を書くほど数が増える**（org writing-baseline §8 と同じ形）。
         */
        const total = cssFiles
            .map((f) => read(f).replace(/\/\*[\s\S]*?\*\//g, ""))
            .join("\n")
            .match(/!important/g);
        expect(total?.length ?? 0).toBe(3);
    });
});
