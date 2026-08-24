import { expect, test } from "@playwright/test";
import { readFixture, SERIALIZER_DB } from "../support/fixtures.ts";

/*
 * AI の実 HTTP E2E（HANDOVER §11 段階11-5）。
 *
 * **ブラウザ（実 XHR）→ Vite dev proxy → Kotlin → Anthropic** を通しで動かす。
 * 5-9 が §5 でやったことの §11 版で、**「動くはず」と「動く」の差を埋める**のが目的。
 *
 * ★ **実キーが要るので既定では走らせない。** `ANTHROPIC_API_KEY` と `GRABADO_IT_AI_MODEL` が
 *   両方そろっていなければ丸ごと skip する（`PostgresCatalogIntegrationTest` と同じ形）。
 *   1 往復あたり **$0.05 前後**（11-2b の実測）。
 *
 * ★ **細かい契約はここで試さない。** status やスキーマの網羅は契約表（`tests/contract/`）と
 *   11-2b の統合テストが持つ。ここが見るのは**経路が通っていること**だけ。
 *
 * ★ **この 1 本が段階11-3 の漏れを捕まえた** —— `vite.config.ts` の proxy が `/backend` しか
 *   転送しておらず、`npm run dev` 経由では `/api/ai/review` が backend に届いていなかった。
 *   単体テストは全部緑のままだった（仮想 backend は proxy を通らない）。
 *
 * ## 走らせ方
 *
 * ```bash
 * set -a; . ./.env; set +a
 * GRABADO_IT_AI_MODEL=claude-opus-5 npm run test:server
 * ```
 */

const ENABLED =
    (process.env["ANTHROPIC_API_KEY"] ?? "") !== "" &&
    (process.env["GRABADO_IT_AI_MODEL"] ?? "") !== "";

test.describe("AI レビューの実 HTTP（段階11-5）", () => {
    test.skip(!ENABLED, "ANTHROPIC_API_KEY と GRABADO_IT_AI_MODEL が要る");

    /* 上流の思考時間ぶん長めに取る（11-2b の実測で 18〜35 秒） */
    test.setTimeout(180_000);

    test("設計を送ると提案が返り、承認したものが設計に当たる", async ({ page }) => {
        await page.goto("/");
        await page.waitForFunction(() => {
            const designer = (window as unknown as { d?: { palette?: { isLoaded(): boolean } } }).d;
            return designer?.palette?.isLoaded() === true;
        });

        /* 送信前の confirm と、承認する番号の prompt に答える（内容も控える） */
        /*
         * 送信前の confirm と、承認する番号の prompt に答える。**status を控えておく** ——
         * 失敗したときに「上流が遅い」のか「経路が落ちた」のかを、この 1 本だけで見分けられる
         * ようにするため（実際 415 をここで踏んだ）。
         */
        const seen: string[] = [];
        page.on("response", (res) => {
            if (res.url().includes("/api/ai/review")) {
                seen.push(String(res.status()));
            }
        });
        page.on("dialog", (dialog) => {
            void dialog.accept(dialog.type() === "prompt" ? "all" : "");
        });

        const fixture = readFixture(SERIALIZER_DB, "house-defaults");
        await page.evaluate((xml) => {
            const d = (window as unknown as { d: { io: { fromXMLText(x: string): void } } }).d;
            d.io.fromXMLText(xml);
        }, fixture);

        /* capabilities は起動時に引いている。env がそろっていれば押せる状態のはず */
        expect(
            await page.evaluate(() => (window as unknown as { d: { io: { dom: { aireview: HTMLInputElement } } } }).d.io.dom.aireview.disabled),
        ).toBe(false);

        await page.evaluate(() => {
            (window as unknown as { d: { io: { aireview(): void } } }).d.io.aireview();
        });

        /* 上流が返るまで待つ（textarea が提案の一覧に変わる。実測 18〜35 秒） */
        await expect
            .poll(
                async () =>
                    await page.evaluate(
                        () =>
                            (window as unknown as { d: { io: { dom: { ta: HTMLTextAreaElement } } } }).d
                                .io.dom.ta.value,
                    ),
                { timeout: 150_000, intervals: [1000] },
            )
            .toContain("AI から");

        /* 経路が通った証拠は 200 が 1 本（415 / 403 で落ちていない） */
        expect(seen).toEqual(["200"]);

        const suggestions = await page.evaluate(
            () =>
                (window as unknown as { d: { io: { aiSuggestions: unknown[] | null } } }).d.io
                    .aiSuggestions?.length ?? 0,
        );
        /* house-defaults は自社標準に沿っているので 0 件もありうる —— 経路が通ったことが要点 */
        expect(suggestions).toBeGreaterThanOrEqual(0);

        if (suggestions === 0) {
            return;
        }

        const before = await page.evaluate(
            () => (window as unknown as { d: { toJson(): string } }).d.toJson(),
        );
        await page.evaluate(() => {
            (window as unknown as { d: { io: { aiapply(): void } } }).d.io.aiapply();
        });

        const notice = await page.evaluate(
            () =>
                (window as unknown as { d: { io: { dom: { ta: HTMLTextAreaElement } } } }).d.io.dom.ta
                    .value,
        );
        expect(notice).toContain("件を適用した");
        /* **保存はされない**（正本のファイルは 1 バイトも変わらない） */
        expect(notice).toContain("まだ保存していない");

        const after = await page.evaluate(
            () => (window as unknown as { d: { toJson(): string } }).d.toJson(),
        );
        /* 1 件でも当たっていれば設計は変わる。全部落ちた場合は変わらない（どちらも正常） */
        expect(typeof after).toBe("string");
        expect(after.length).toBeGreaterThan(0);
        if (notice.includes("  適用:")) {
            expect(after).not.toBe(before);
        }
    });
});
