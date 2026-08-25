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
    /*
     * build 成果物を**配布時と同じヘッダ**で配る（段階2-2）。手元のブラウザで CSP 下の
     * 動作を確かめられるようにするためで、これが無いと確認できるのはイメージ E2E（2-4）
     * まで来ない ＝ 壊れても誰も気づかない期間ができる。
     *
     * ★ **dev server には出さない。** HMR が inline script を使うので 'unsafe-inline' が
     *   要り、「本番と同じヘッダ」でなくなる。
     *
     * ★ **値の正本は server/src/main/kotlin/dev/grabado/config/SecurityHeadersFilter.kt。**
     *   ここはその写しで、tests/node/csp.test.ts が両者のずれを赤くする。
     */
    preview: {
        host: "127.0.0.1",
        port: PREVIEW_PORT,
        strictPort: true,
        headers: {
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy":
                "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
        },
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        /*
         * 段階2-2: **資産を data: URI へ inline 化しない。**
         *
         * 既定（4KB 未満）だと styles/print.css が
         * <link rel="stylesheet" href="data:text/css;base64,…"> になり、CSP の style-src に
         * data: が要る（2026-08-25 実測）。style-src を 'self' のまま保つために 0 にする
         * —— 「小さいものだけ静かに inline される」形を**構造で**潰す（issue #89）。
         */
        assetsInlineLimit: 0,
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
