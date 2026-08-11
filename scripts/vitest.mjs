/*
 * WORKAROUND(vitest): cwd を正規化してから vitest CLI を起動する。
 * 背景と撤去条件は scripts/canonical-cwd.mjs と CUSTOMIZATIONS.md を参照。
 *
 * package.json の "test" がこのファイルを呼ぶ。引数はそのまま vitest に渡る
 * （vitest CLI は process.argv を直接読むので転送は不要）:
 *   npm test -- --reporter=verbose
 *   npm test -- -t "決定論"
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalCwd } from "./canonical-cwd.mjs";

const root = canonicalCwd();
chdirCanonical(root);

/**
 * cwd を root にする。
 *
 * process.chdir() に「現在地と大小だけ違う同一パス」を渡すと、Windows の
 * SetCurrentDirectory が「同じディレクトリ」と判断して内部の文字列を更新せず、
 * process.cwd() が元の大小のまま残ることがある（実測）。それだと
 * vitest が root の既定値として拾う cwd がずれたままになるので、
 * 更新されなかった場合だけ親を経由して確実に切り替える。
 *
 * @param {string} target
 */
function chdirCanonical(target) {
    process.chdir(target);
    if (process.cwd() === target) {
        return;
    }
    const parent = dirname(target);
    if (parent === target) {
        return; // ドライブルート。経由先が無いので諦める（distDir は下で正規形にする）
    }
    process.chdir(parent);
    process.chdir(target);
}

/*
 * chdir だけでは足りない。相対 import はこのファイル自身の import.meta.url
 * （＝正規化前のパス）を基準に解決されてしまい、結局ずれた URL で vitest を読む。
 * 正規化後の絶対パスを基準に解決し直す必要がある。
 *
 * bin のファイル名は package.json の bin フィールドから取る（dist のレイアウトを
 * 直書きしない）。vitest の exports に CLI エントリは無いので bare import は使えず、
 * ファイル URL の直指定になる。
 */
const require = createRequire(pathToFileURL(join(root, "package.json")).href);
const pkgPath = require.resolve("vitest/package.json");
const binRelative = require(pkgPath).bin.vitest;
const bin = join(dirname(pkgPath), binRelative);

/*
 * 再 spawn せず import する。プロセスが 1 個で済むので、終了コード
 * （vitest は process.exitCode を立てる）・TTY・Ctrl-C の扱いが素のまま通る。
 */
await import(pathToFileURL(bin).href);
