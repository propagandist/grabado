import { defineConfig } from "@playwright/test";
import { DEV_PORT } from "./vite.config.ts";

// 実ブラウザ（Chromium）側。golden の生成・確定はこちらが唯一の正。
// 配信は Vite dev server（HANDOVER §3 段階1）。root はリポジトリルートのままなので
// index.html / db/ / locale/ / styles/ の URL は静的サーバ時代と同じ。
export const PORT = DEV_PORT;
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
        command: "npx vite",
        url: `${BASE_URL}/index.html`,
        reuseExistingServer: !process.env["CI"],
        stdout: "ignore",
        stderr: "pipe",
    },
});
