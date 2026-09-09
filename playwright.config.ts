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
        /*
         * 規模の実測（#206）。**characterization に混ぜない** —— ci-frontend.yml が
         * npm run test:browser を回すので、300 テーブルの実測が全 PR に載ってしまう
         * （golden:update も同じ project 指定）。別 config にもしない —— 既存 3 本の別 config は
         * **配信先が違う**から分かれている（dist は vite preview、server は jar、image は compose）。
         * ここは characterization と同じ Vite dev server・同じ固定 viewport を使うので、
         * webServer ブロックの複製にしかならない。
         */
        {
            name: "scale",
            testDir: "tests/scale",
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
