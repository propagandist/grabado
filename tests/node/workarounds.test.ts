import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../support/fixtures.ts";

/**
 * upstream のバグに対する回避策が、まだ必要であることを固定する。
 *
 * tests/node/parity-exceptions.ts と同じ考え方。「その例外がまだ実在すること」自体を
 * テストにしておき、依存を上げたら赤くして棚卸しを強制する。回避策が黙って残骸化する
 * のを防ぐのが目的で、vitest のパッチ更新のたびに 1 回赤くなるのは意図した摩擦。
 */

/**
 * scripts/vitest.mjs（cwd 正規化ラッパー）と vitest.config.ts のガードが対象にしている
 * vitest のバージョン。
 *
 * Windows で cwd のドライブレターが小文字だと vitest ランタイムが二重ロードされ、
 * テストが 1 件も走らないまま「TypeError: Cannot read properties of undefined
 * (reading 'config')」で落ちる。詳細と撤去条件は CUSTOMIZATIONS.md の決定ログ。
 * upstream: vitest-dev/vitest#10692 / #10812 / PR#10843
 */
const KNOWN_BROKEN_VITEST = "4.1.10";

function installedVitestVersion(): string {
    const pkg = readFileSync(
        join(REPO_ROOT, "node_modules/vitest/package.json"),
        "utf8",
    );
    return (JSON.parse(pkg) as { version: string }).version;
}

describe("回避策の棚卸し", () => {
    test(`vitest はまだ ${KNOWN_BROKEN_VITEST}（cwd 正規化ラッパーが必要なまま）`, () => {
        expect(
            installedVitestVersion(),
            [
                "vitest のバージョンが変わった。CUSTOMIZATIONS.md の",
                "「vitest の Windows 小文字ドライブレター問題」の撤去条件を実行すること:",
                "",
                "  1. PR #10843 がマージされた版か確認する",
                "  2. 小文字 cwd を強制してラッパー無しで 20 回走らせ、20/20 緑なら直っている",
                "     node -e \"process.chdir('d:/…'); require('child_process')" +
                    ".spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run'],{stdio:'inherit'})\"",
                "",
                "直っていれば scripts/vitest.mjs・scripts/canonical-cwd.mjs・",
                "package.json の test・vitest.config.ts のガード・このテストを同時に撤去する。",
                "まだなら KNOWN_BROKEN_VITEST を新しいバージョンへ更新する。",
            ].join("\n"),
        ).toBe(KNOWN_BROKEN_VITEST);
    });
});
