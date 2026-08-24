import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// HANDOVER §3 段階1: 既存 JS を束ねるためのビルド基盤。
//
// root はリポジトリルートのまま（index.html / js/ / db/ / locale/ / styles/ を動かさない）。
// URL 空間を現行と 1 バイトも変えないことが特性化テスト（HANDOVER §7）を無改修で通す条件で、
// frontend/ への集約は §2 Docker 着手時に行う（CUSTOMIZATIONS.md の決定ログ）。

/** dev server。playwright.config.ts の webServer と共有する */
export const DEV_PORT = 4173;
/** build 成果物の検証用。dev と衝突させないため別ポート */
export const PREVIEW_PORT = 4174;
/** Kotlin backend（server/）の既定ポート。`./gradlew bootRun` と揃える（段階5-1b） */
export const SERVER_PORT = 8080;

export default defineConfig({
    // db/ locale/ は OZ.Request が相対パスで fetch し、styles/ は index.html の <link> が読む。
    // publicDir は使わない（既存ディレクトリを移動すると backend の db/ 参照とテストのパス定数が割れる）。
    publicDir: false,
    // host は 127.0.0.1 で固定する。既定の "localhost" は Node が ::1 を優先して IPv6 だけで
    // listen するため、Playwright が待つ http://127.0.0.1:<port> に応答しない（実測）。
    server: {
        host: "127.0.0.1",
        port: DEV_PORT,
        strictPort: true,
        // 段階5-1b: `npm run dev` と `./gradlew bootRun`（server/）の 2 プロセスで実物を触れる
        // ようにする。**同一オリジンのまま**なので、tests/browser/harness.ts の
        // 「オリジン外へのリクエストが 1 本でも出たら失敗」検査には触れない。
        //
        // backend を起こしていなければ ECONNREFUSED になるだけで、これは
        // 段階5-1b 以前（PHP が実行されず 404 になっていた）と同じ体験。既存テストは
        // /backend を叩かないので影響もゼロ。
        proxy: {
            "/backend": {
                target: `http://127.0.0.1:${SERVER_PORT}`,
                changeOrigin: true,
            },
            /*
             * AI proxy（段階11-3 で配線、11-5 で proxy を足した）。**`/api` は §11 が始めた
             * 名前空間**で、`/backend/<name>/?action=` の形を取らない —— ここを足すまで
             * `npm run dev` 経由では `/api/ai/review` が backend に届いていなかった
             * （**実 HTTP の E2E が捕まえた**。単体テストは全部緑のままだった）。
             */
            "/api": {
                target: `http://127.0.0.1:${SERVER_PORT}`,
                changeOrigin: true,
            },
        },
    },
    preview: { host: "127.0.0.1", port: PREVIEW_PORT, strictPort: true },
    build: {
        outDir: "dist",
        emptyOutDir: true,
    },
    plugins: [
        viteStaticCopy({
            // 実行時に相対 URL で取りに行くもの。Rollup の依存グラフに乗らないので手でコピーする。
            targets: [
                { src: "db", dest: "." },
                { src: "locale", dest: "." },
                { src: "images", dest: "." },
            ],
        }),
    ],
});
