import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { GOLDEN_DIR } from "./fixtures.ts";
import { assertNoCarriageReturn } from "./normalize.ts";

/**
 * golden の読み書き。ブラウザ側と Node 側の**両方が同じ実装を使う**ことで、
 * 比較のセマンティクス（バイト一致・LF 固定）が確実に揃う。
 *
 * 書き込みは UPDATE_GOLDEN=1 のときだけ、かつブラウザ側からのみ行う
 * （golden は実ブラウザ採取のものが唯一の正 — docs/TESTING.md 参照）。
 */
export const UPDATE_GOLDEN = process.env["UPDATE_GOLDEN"] === "1";

export function goldenPath(...segments: string[]): string {
    return join(GOLDEN_DIR, ...segments);
}

export function readGolden(path: string): string {
    if (!existsSync(path)) {
        throw new Error(
            `golden がまだ無い: ${path}\n` +
                `実ブラウザで採取してください: npm run golden:update`,
        );
    }
    const text = readFileSync(path, "utf8");
    assertNoCarriageReturn(text, `golden ${path}`);
    return text;
}

/** UPDATE_GOLDEN=1 のとき書き込み、そうでなければ既存 golden を読んで返す */
export function writeOrReadGolden(path: string, actual: string): string {
    if (UPDATE_GOLDEN) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, actual, "utf8");
        return actual;
    }
    return readGolden(path);
}
