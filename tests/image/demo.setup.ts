import { expect, test } from "@playwright/test";
import { down } from "./compose.ts";
import { DEMO_CONTAINER, isRunning, removeContainers, startDemo, waitUntilReady } from "./docker-run.ts";

/*
 * 公開デモの形へ入れ替える（issue #286）。**compose を落としてから `docker run` で起こす。**
 *
 * ★ **8080 を奪うので、この project が最後。** compose はここから先は要らない
 *   —— 1 度落としたら二度と起こさない順序にしてある（playwright.image.config.ts の projects）。
 *
 * ★ **ここが赤くなるのが #286 そのもの。** v0.4.0 〜 v0.8.0 のイメージは、この形で
 *   `正本ディレクトリが無い: /data/schema` を出して **exit=1** する（2026-09-12 実測）。
 *   **`readonly.spec.ts` は compose 経由で必ず mount するので、この経路を通らない。**
 */
test("公開デモの形（env 2 本・mount 無し）で起動する", async ({ request }) => {
    /* compose を落とす → build 済みイメージを起こす → 受け付けるまで待つ。60 秒では薄い */
    test.setTimeout(180_000);

    down();
    removeContainers();
    startDemo();

    await waitUntilReady(request);

    /* ★ 応答したあとに落ちていないこと（起動途中で 1 度だけ返る形を緑にしない） */
    expect(isRunning(DEMO_CONTAINER), "応答したあとに落ちた").toBe(true);
});
