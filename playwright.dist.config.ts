import { defineConfig } from "@playwright/test";
import { PREVIEW_PORT } from "./vite.config.ts";

// build 成果物（dist/）に対するスモーク。dev server が通っても配布物が壊れていては意味がないため、
// vite build → vite preview の経路を 1 本だけ張る（HANDOVER §3 段階1）。
// golden の権威は playwright.config.ts 側（dev server）で、こちらは読むだけ・採取しない。
export const DIST_BASE_URL = `http://127.0.0.1:${PREVIEW_PORT}`;

export default defineConfig({
    testDir: "tests/dist",
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env["CI"],
    reporter: "list",
    use: {
        baseURL: DIST_BASE_URL,
        viewport: { width: 1280, height: 900 },
    },
    webServer: {
        command: "npm run build && npx vite preview",
        url: `${DIST_BASE_URL}/index.html`,
        // 常に採り直す（古い dist を検証しても意味がない）
        reuseExistingServer: false,
        stdout: "ignore",
        stderr: "pipe",
        timeout: 120_000,
    },
});
