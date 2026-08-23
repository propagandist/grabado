/*
 * server/ の jar を作る（HANDOVER §5 段階5-9）。
 *
 * `npm run test:server` が E2E の前に呼ぶ。**Gradle wrapper の名前と呼び方が OS で違う**
 * ので、npm script の 1 行に押し込まず専用スクリプトにした（scripts/vitest.mjs と同じ流儀）:
 *
 *   * Windows … `gradlew.bat`
 *   * それ以外 … `gradlew`
 *
 * ★ **絶対パスで渡す。** `cwd` を server/ にしても、`shell: true` の下では
 *   **カレントディレクトリは PATH に入らない**（Windows の cmd）ので、
 *   裸の `gradlew.bat` は「見つからない」で落ちる（実際に踏んだ）。
 *
 * jar を作るだけで、起こすのは Playwright の webServer（playwright.server.config.ts）。
 * `gradlew bootRun` を直接使わないのは、Gradle の起動が遅く終了時のプロセス片付けも
 * 読みにくいため。
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(repoRoot, "server");
const wrapper = join(serverDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");

const result = spawnSync(`"${wrapper}"`, ["bootJar"], {
    cwd: serverDir,
    stdio: "inherit",
    shell: true,
});

if (result.error) {
    console.error(`gradle wrapper を起動できなかった（Java 21 が要る）: ${result.error.message}`);
    process.exit(1);
}
process.exit(result.status ?? 1);
