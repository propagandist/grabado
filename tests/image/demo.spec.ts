import { expect, test } from "@playwright/test";
import { runWithoutMount } from "./docker-run.ts";

/*
 * **公開デモと同じ形**（issue #286）—— イメージ ＋ env 2 本、**mount 無し**（docs/ARCHITECTURE.md §9.7）。
 * 起こすのは tests/image/demo.setup.ts。
 *
 * ★ **ブラウザを 1 枚も開かない**（`request` fixture）。見たいのは HTTP の応答だけで、画面の面は
 *   readonly.spec.ts が compose 経由で見ている —— **同じことを 2 か所で見ない。**
 *   副産物として、`GRABADO_HSTS=true` を立ててもブラウザの状態を汚しようがない
 *   （そもそも HSTS はホスト名に効き、IP には効かない。§7.3）。
 *
 * ★ **`import` の 403 は足さない** —— readonly.spec.ts が持っている。ここが持つのは
 *   **mount が無いことで壊れうるもの**だけ。
 */

test("capabilities が readonly を立てる（mount 無し）", async ({ request }) => {
    const response = await request.get("/backend/file/?action=capabilities");

    expect(response.status()).toBe(200);
    /* ★ 「3 つとも false」ではない —— readonly:true が READONLY で動いている証拠（§9.7 の★★） */
    expect(await response.json()).toEqual({ readonly: true, introspection: false, ai: false });
});

test("list が 200 の 0 バイト（正本ディレクトリが無くても落ちない）", async ({ request }) => {
    /*
     * ★ **案 A のいちばん危ない面。** 起動時の check を外すだけだと、`Files.newDirectoryStream` が
     *   存在しないディレクトリで例外を投げ、**200 ではなく 500** になる —— **起動できても、
     *   公開デモの画面は壊れたまま**。§9.7 の「`list` は 0 件を返す」を機械が押さえるのはここだけ。
     */
    const response = await request.get("/backend/file/?action=list");

    expect(response.status()).toBe(200);
    expect((await response.body()).byteLength, "0 件は 0 バイト").toBe(0);
});

test("save が 403（500 ではない）", async ({ request }) => {
    /* mount が無くても、ReadOnlyDesignStore が **FS に触る前に** 止めていること */
    const response = await request.post("/backend/file/?action=save&keyword=x.json", {
        headers: { "Content-Type": "application/json" },
        data: '{"formatVersion":2,"db":"postgresql","tables":[]}\n',
    });

    expect(response.status(), "READONLY なのに保存できた").toBe(403);
});

test("トップが 200 で、HSTS が preload 無しで出る", async ({ request }) => {
    /*
     * ★ **`/` は外側（Railway）が起動の判定に叩く口**でもある —— ここが 200 でなければ、
     *   アプリが起きていてもデプロイは失敗扱いになる。**mount 無しでも static を配れる**ことを見る。
     *
     * ★ **`GRABADO_HSTS` という env の名前で効くことは、ここでしか見ていない** ——
     *   HstsEnabledTest が登録するのは Spring のプロパティ `grabado.hsts` で、**env 名の鎖は
     *   どこも通っていなかった**（2026-09-12 実測）。§9.7 の env 2 本を両方渡す形にしてある。
     *
     * ★ **値は見ない。** 正本は SecurityHeadersFilter.HSTS で、値そのものは HstsTest が持つ ——
     *   ここが写しを持つと 3 つ目になる。見るのは §9.7 の `curl` と同じ「**preload が無いこと**」。
     */
    const response = await request.get("/");

    expect(response.status()).toBe(200);
    const hsts = response.headers()["strict-transport-security"];
    expect(hsts, "GRABADO_HSTS=true なのに出ていない").toBeTruthy();
    expect(hsts, "preload は付けない（org security-baseline §4.3）").not.toContain("preload");
});

test("READONLY でなければ、mount 無しは起動しない（#202 の fail-fast）", () => {
    /* 起動を待たずに bean 生成で落ちるが、イメージの起こし直しぶんの猶予を持たせる */
    test.setTimeout(120_000);

    const result = runWithoutMount({});

    /* ★ 125 / 126 / 127 は docker CLI 側の失敗。**1 であること自体が「アプリが拒んだ」の識別子** */
    expect(result.status, `mount 無しで起動してしまった:\n${result.output}`).toBe(1);
    /* ★ 照合は ASCII だけ —— 端末のエンコーディングで揺れる文字で判定しない */
    expect(result.output).toContain("/data/schema");
    expect(result.output).toContain("GRABADO_SCHEMA_DIR");
});
