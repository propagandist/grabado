import { defineConfig } from "@playwright/test";

// 実ブラウザ（Chromium）側。golden の生成・確定はこちらが唯一の正。
// 現行アプリは素の静的ファイルなので、リポジトリルートをそのまま配って index.html を開く。
export const PORT = 4173;
export const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: "tests",
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env["CI"],
    reporter: process.env["CI"] ? "list" : [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: BASE_URL,
        // 描画エンジンは offsetWidth/offsetHeight に依存する。
        // golden を安定させるため viewport を固定する。
        viewport: { width: 1280, height: 900 },
    },
    projects: [
        {
            name: "characterization",
            testDir: "tests/browser",
        },
        {
            name: "known-issues",
            testDir: "tests/known-issues",
        },
    ],
    webServer: {
        command: "node tests/support/static-server.mjs",
        url: `${BASE_URL}/index.html`,
        reuseExistingServer: !process.env["CI"],
        stdout: "ignore",
        stderr: "pipe",
    },
});
