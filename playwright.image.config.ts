import { defineConfig } from "@playwright/test";
import { SERVER_PORT } from "./vite.config.ts";

/*
 * 配布イメージの E2E（HANDOVER §2 段階2-4）。
 *
 * **これが「配る形が正しい」の最終証明。** 2-1 でイメージが動き、2-2 で CSP が付き、
 * 2-3 で compose と env が入ったが、**どれも人が手で 1 回叩いただけ**で機械は見ていない。
 * 5-9（§5）・11-5（§11）が実 HTTP で節を閉じたのと同じ位置に置く。
 *
 * ★ **イメージでしか出ないものだけを見る。** 手元の jar には static が入らない
 *   （dist を static へ入れるのは Dockerfile の COPY。段階2-0 の決めたこと 2）ので、
 *   「**単一プロセスが static と API の両方を配る**」はここでしか確かめられない。
 *   status やヘッダの網羅は tests/contract/backend-cases.json と Kotlin 側が持つ。
 *
 * ★ **既存 5 系統に混ぜない。** これだけ **Docker** を要求するので、`npm test` /
 *   `test:browser` の前提（Node だけで回る）を壊さないよう独立させた。
 *   走らせ方と要件は docs/TESTING.md。
 *
 * ★ **CI には載せていない**（段階2-5 の担当）。**載せる前に手元で通ることを確かめる**
 *   順序を崩さない —— 載せてから直すと、org 共有の枠を使いながらデバッグすることになる。
 */

/** コンテナが待つポート。compose.yaml の ports の左辺と揃える */
export const IMAGE_BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;

export default defineConfig({
    testDir: "tests/image",
    /* 実コンテナ 1 つを共有するので直列に保つ（他の config と同じ方針） */
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env["CI"],
    reporter: "list",
    /* イメージのビルドを含むので、既定の 30 秒では足りない場面がある */
    timeout: 60_000,
    globalSetup: "./tests/image/global-setup.ts",
    globalTeardown: "./tests/image/global-teardown.ts",
    use: {
        baseURL: IMAGE_BASE_URL,
        viewport: { width: 1280, height: 900 },
    },
    /*
     * ★ **READONLY は同じ compose を env 違いで起こし直して見る**（issue #93 の判断 4）。
     *   project の依存で直列にすることで、**ビルドは 1 回**のまま**両方の条件が
     *   compose 経路を通る**。別ポートで並べる案は、READONLY 側だけ compose を
     *   通らない経路になるので却下した。
     */
    projects: [
        { name: "image", testMatch: /smoke\.spec\.ts$/ },
        {
            name: "readonly-setup",
            testMatch: /readonly\.setup\.ts$/,
            dependencies: ["image"],
        },
        {
            name: "image-readonly",
            testMatch: /readonly\.spec\.ts$/,
            dependencies: ["readonly-setup"],
        },
    ],
});
