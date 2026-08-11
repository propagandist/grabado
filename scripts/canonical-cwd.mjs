/*
 * WORKAROUND(vitest): Windows で cwd のドライブレターが小文字（d:\...）だと、
 * vitest ランタイムが二重ロードされてテストが 1 件も走らずに落ちる。
 *
 *   TypeError: Cannot read properties of undefined (reading 'config')
 *    ❯ tests/node/xxx.test.ts:N:1      ← トップレベルの describe(...) 行
 *    Test Files  2 failed (2)
 *         Tests  no tests
 *
 * 機序（vitest 4.1.10 / vite 8.2.1 時点）:
 *   - vitest の distDir は import.meta.url 由来なので cwd の大小をそのまま引き継ぐ
 *   - vite にバンドルされた pathe は必ずドライブレターを大文字化する
 *   - Node の ESM レジストリは URL 文字列でキーされるので、両者がずれると
 *     vitest ランタイムが 2 インスタンスになる
 *   - テストファイルが掴んだ側は clearCollectorContext を通らず runner が undefined
 *
 * 撤去条件は CUSTOMIZATIONS.md の決定ログを参照。
 * upstream: vitest-dev/vitest#10692 / #10812 / PR#10843（いずれも未修正）
 */
import { realpathSync } from "node:fs";

/**
 * cwd を fs.realpathSync.native と一致する形に正規化する。
 *
 * 単なる大文字化ではない。vite の safeRealpathSync は net use の非同期判定を境に
 * realpathSync（大小を保存）と realpathSync.native（正規化する）を同一プロセス内で
 * 切り替えるので、両者が同じ文字列を返す状態にしておくとレース自体が無害化する。
 *
 * @returns {string} 正規化後の cwd。正規化できない/すべきでない場合は現在の cwd
 */
export function canonicalCwd() {
    const cwd = process.cwd();

    // Linux / macOS の process.cwd() は常に解決済みの物理パスなので正規化の余地がない。
    // Docker（HANDOVER §2 の到達点）では完全に no-op になる。
    if (process.platform !== "win32") {
        return cwd;
    }

    let real;
    try {
        real = realpathSync.native(cwd);
    } catch {
        // native が使えない環境がある（vite 自身も EISDIR を想定している）。
        // 現状維持なら悪化はしない。
        return cwd;
    }

    // 大小以外が変わる場合は symlink の解決やネットワークドライブの UNC 展開なので、
    // cwd を動かすと別の事故になる。触らない。
    return real.toLowerCase() === cwd.toLowerCase() ? real : cwd;
}

/**
 * cwd が正規形でなければ例外を投げる。
 *
 * vitest.config.ts から呼ぶ。npx vitest や IDE の vitest 拡張は scripts/vitest.mjs を
 * 通らないので、そこだけは不可解な TypeError ではなく原因の分かるエラーで止める。
 * config はメインプロセスで読まれ、ワーカーは cwd を継承するのでここ 1 箇所で足りる。
 */
export function assertCanonicalCwd() {
    const cwd = process.cwd();
    const canonical = canonicalCwd();
    if (canonical === cwd) {
        return;
    }

    throw new Error(
        [
            `cwd のドライブレターが正規形と違います（${cwd} ≠ ${canonical}）。`,
            "",
            "このまま vitest を起動すると vitest ランタイムが二重ロードされ、テストが",
            "1 件も走らないまま TypeError: Cannot read properties of undefined",
            "(reading 'config') で落ちます（vitest 側の未修正バグ。CUSTOMIZATIONS.md 参照）。",
            "",
            '`npm test`（scripts/vitest.mjs 経由）で実行してください。',
        ].join("\n")
    );
}
