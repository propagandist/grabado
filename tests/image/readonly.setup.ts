import { test } from "@playwright/test";
import { health, up } from "./compose.ts";
import { expect } from "@playwright/test";

/*
 * 公開デモと同じ条件へ入れ替える（段階2-4）。**同じ compose を env 違いで起こし直す。**
 * compose は設定の変化を見てコンテナを作り直すので、**ビルドは走らない**。
 */
test("GRABADO_READONLY=true で起こし直す", () => {
    up({ GRABADO_READONLY: "true" });

    /*
     * ★ **READONLY でも healthy であること**が、ここで同時に証明される。
     *   `--wait` は healthy まで待つので `up` が返った時点で成立しているが、
     *   **判定先を取り違えたときに気づける**よう明示的に見る —— healthcheck が叩くのは
     *   `?action=capabilities`（**副作用が無く、止めている条件でも 200 が返る唯一の口**）。
     *   ここを save のような口にすると、**公開デモだけが unhealthy になる**（段階2-3）。
     */
    expect(health()).toBe("healthy");
});
