import { mkdirSync, rmSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { DEV_PORT, SERVER_PORT } from "./vite.config.ts";

/*
 * 実 HTTP の E2E（HANDOVER §5 段階5-9）。
 *
 * **これが「PHP と同じ契約を Kotlin が満たす」の最終証明。** 5-1b 以降は契約表と仮想 backend で
 * 契約を押さえてきたが、どちらも**実際の HTTP を 1 バイトも流していない** ——
 * ブラウザ（実 XHR）→ Vite dev proxy → Kotlin → ファイルシステム、を通しで動かすのはここだけ。
 *
 * ★ **既存 4 系統に混ぜない。** これだけ **Java 21 と bootJar** を要求するので、
 *   `npm test` / `test:browser` の前提（Node だけで回る）を壊さないよう独立させた。
 *   `docs/TESTING.md` に走らせ方と要件を書いてある。
 *
 * 正本ディレクトリは `tests/tmp-schema/`（.gitignore 済み）。**実ファイルに書く**ことが
 * 目的なので一時ディレクトリを本物として使う。
 */

/** E2E 用の正本ディレクトリ */
export const E2E_SCHEMA_DIR = "tests/tmp-schema";

/*
 * ★ **config の評価時に作り直す。`globalSetup` では間に合わない。**
 *
 * Playwright は **webServer を globalSetup より先に起動する**。backend は起動時に
 * 正本ディレクトリの「存在する / 読める / 書ける」を検証して、駄目なら**起動失敗**する
 * （mount 忘れで設計を失う事故を塞ぐため。段階5-1b）ので、globalSetup で作っても
 * webServer が先に落ちる（実際に踏んだ）。
 *
 * 前回の残りを消すのは、テストが「空から始める」ことを前提にしているため。
 */
rmSync(E2E_SCHEMA_DIR, { recursive: true, force: true });
mkdirSync(E2E_SCHEMA_DIR, { recursive: true });

export default defineConfig({
    testDir: "tests/server",
    // golden を採らないが、実サーバを共有するので直列に保つ（他の config と同じ方針）
    workers: 1,
    fullyParallel: false,
    reporter: process.env["CI"] ? "list" : [["list"]],
    use: {
        baseURL: `http://127.0.0.1:${DEV_PORT}`,
        viewport: { width: 1280, height: 900 },
    },
    webServer: [
        {
            // dev server。/backend を SERVER_PORT へ proxy する（vite.config.ts の設定）
            command: "npx vite",
            port: DEV_PORT,
            reuseExistingServer: !process.env["CI"],
            timeout: 60_000,
        },
        {
            /*
             * Kotlin backend。**jar を先に作っておくこと**（npm run test:server が
             * bootJar を呼ぶ）。`gradlew bootRun` を直接起こさないのは、Gradle の起動が
             * 遅いうえに終了時のプロセス片付けが読みにくいため。
             */
            command: `java -jar server/build/libs/grabado.jar --grabado.schema-dir=${E2E_SCHEMA_DIR}`,
            port: SERVER_PORT,
            reuseExistingServer: !process.env["CI"],
            timeout: 120_000,
        },
    ],
});
