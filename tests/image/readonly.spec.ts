import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { openDesigner } from "../browser/harness.ts";
import { health, IMAGE_SCHEMA_DIR, REPO_ROOT } from "./compose.ts";

/*
 * 公開デモと同じ条件（HANDOVER §2 段階2-4）。**同じイメージを `GRABADO_READONLY=true` で
 * 起こし直したもの**を叩く（入れ替えは tests/image/readonly.setup.ts）。
 *
 * ★ **公開デモは READONLY 一択**（CLAUDE.md）—— AI は API 費用が自社負担、introspection は
 *   SSRF の踏み台になる。だから「止まっていること」と「読むだけは生きていること」の
 *   両方が、配布物として正しいかどうかの分かれ目になる。
 */

/** 通常モードのテストに依存しないよう、**ホスト側から**置く設計 */
const SEEDED = "image-e2e-readonly.json";
const SEEDED_BODY = '{"formatVersion":2,"db":"postgresql","tables":[]}\n';

test.beforeAll(() => {
    /*
     * ★ **mount の逆方向の証明でもある** —— ホスト（git pull した人）が置いたファイルを
     *   コンテナが読む。正本は git 管理のファイルで、app はそれを読み書きするだけ
     *   （CLAUDE.md 制約2）。
     */
    writeFileSync(join(REPO_ROOT, IMAGE_SCHEMA_DIR, SEEDED), SEEDED_BODY, "utf8");
});

test("READONLY でも healthy のまま", () => {
    /*
     * 判定先が `?action=capabilities` なのは、**副作用が無く、止めている条件でも 200 が返る
     * 唯一の口**だから（段階2-3）。save のような口にすると、**公開デモだけが unhealthy に
     * なる** —— そこを取り違えていないことを、この 1 行が押さえる。
     */
    expect(health()).toBe("healthy");
});

test("capabilities が readonly を立てる", async ({ page }) => {
    const response = await page.request.get("/backend/file/?action=capabilities");

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ readonly: true, introspection: false, ai: false });
});

test("save と import が 403、list と load は 200", async ({ page }) => {
    const save = await page.request.post(`/backend/file/?action=save&keyword=${SEEDED}`, {
        headers: { "Content-Type": "application/json" },
        data: '{"formatVersion":2,"db":"postgresql","tables":[{"name":"x"}]}\n',
    });
    expect(save.status(), "READONLY なのに保存できた").toBe(403);

    const importing = await page.request.get("/backend/file/?action=import&database=any");
    expect(importing.status(), "READONLY なのに introspection が通った").toBe(403);

    /* 読むだけは生きている（読み取りビューアとして成立する） */
    expect((await page.request.get("/backend/file/?action=list")).status()).toBe(200);
    const load = await page.request.get(`/backend/file/?action=load&keyword=${SEEDED}`);
    expect(load.status()).toBe(200);

    /*
     * ★ **「止めた」が「書きかけて止めた」でないこと**を、**同じテストの中で**見る
     *   （BackendBehaviourTest の 412 と同じ形）。
     *
     *   別テストに分けていたら、**検出の確認で嘘をついた** —— READONLY を渡さずに回すと
     *   上の save が 201 で通ってファイルは書き換わるのに、**失敗のあと Playwright が
     *   worker を作り直して beforeAll が走り、種ファイルが復元されていた**（2026-08-26 実測）。
     *   順序に意味があるアサーションは、順序が保証される場所に置く。
     */
    expect(await load.text(), "403 なのに内容が書き換わっている").toBe(SEEDED_BODY);
});

test("保存とインポートのボタンが押せない", async ({ page }) => {
    /*
     * capabilities は起動時に 1 回引いて DOM に反映される（js/io.ts の applyCapabilities。
     * 段階5-5）。**画面まで届いていること**を見るのはここだけ —— 403 が返るかどうかとは別の話で、
     * 押せてしまえば公開デモで毎回エラーを見せることになる。
     */
    await openDesigner(page);

    const disabled = await page.evaluate(() => {
        const dom = window.d!.io.dom;
        return {
            serversave: dom.serversave.disabled,
            quicksave: dom.quicksave.disabled,
            serverimport: dom.serverimport.disabled,
            aireview: dom.aireview.disabled,
            /* 読み込みは止めない（読み取りビューアとして成立させる） */
            serverload: dom.serverload.disabled,
        };
    });

    expect(disabled).toEqual({
        serversave: true,
        quicksave: true,
        serverimport: true,
        aireview: true,
        serverload: false,
    });
});
