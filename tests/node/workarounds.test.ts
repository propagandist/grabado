import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../support/fixtures.ts";

/**
 * upstream のバグに対する回避策が、まだ必要であることを固定する。
 *
 「その回避策がまだ必要であること」自体をテストにしておき、依存を上げたら赤くして
 * 棚卸しを強制する。回避策が黙って残骸化するのを防ぐのが目的で、vitest のパッチ更新の
 * たびに 1 回赤くなるのは意図した摩擦。
 *
 * **段階6-5a まで tests/node/parity-exceptions.ts が同じイディオムで書かれていた**
 * （xslt-processor の非準拠を「まだ実在する」形で固定していた）。DDL 生成が TS になって
 * 例外ごと消えたので、いまこの形はここ 1 本だけ。
 */

/**
 * scripts/vitest.mjs（cwd 正規化ラッパー）と vitest.config.ts のガードが対象にしている
 * vitest のバージョン。
 *
 * Windows で cwd のドライブレターが小文字だと vitest ランタイムが二重ロードされ、
 * テストが 1 件も走らないまま「TypeError: Cannot read properties of undefined
 * (reading 'config')」で落ちる。詳細と撤去条件は CUSTOMIZATIONS.md の決定ログ。
 * upstream: vitest-dev/vitest#10692 / #10812 / PR#10843
 *
 * ★ **4.1.11 でも直っていない**（2026-08-27 実測）。撤去条件の 2 を実際に回した ——
 *   `vitest.config.ts` のガードを外し、小文字 cwd で `node_modules/vitest/vitest.mjs` を
 *   直に起動したところ、**`Test Files 24 failed / Tests no tests` ＋
 *   `TypeError: Cannot read properties of undefined (reading 'config')`** が再現した。
 *   **1 回目で落ちたので「20/20 緑」の条件は満たさない。**
 *   **ガードを外さないと検証にならない**（外さないと、こちらの `assertCanonicalCwd` が
 *   先に止めるので「落ちた ＝ まだ壊れている」と読み違える）。
 */
const KNOWN_BROKEN_VITEST = "4.1.11";

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
