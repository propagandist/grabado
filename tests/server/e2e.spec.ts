import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { REPO_ROOT, readFixture, SERIALIZER_DB } from "../support/fixtures.ts";
import { E2E_SCHEMA_DIR } from "../../playwright.server.config.ts";

/*
 * 実 HTTP の E2E（HANDOVER §5 段階5-9）。
 *
 * **ブラウザ（実 XHR）→ Vite dev proxy → Kotlin → ファイルシステム**を通しで動かす。
 * 5-1b 以降は契約表と仮想 backend で契約を押さえてきたが、どちらも**実際の HTTP を
 * 1 バイトも流していない** —— ここが「PHP と同じ契約を Kotlin が満たす」の最終証明。
 *
 * ★ **細かい契約はここで試さない。** status やヘッダの網羅は
 *   `tests/contract/backend-cases.json`（Kotlin と仮想 backend の両方が読む）が持つ。
 *   ここが見るのは**経路が通っていること**だけ —— 実サーバを起こすぶん高価なので、
 *   本数を絞る。
 *
 * UI 操作ではなく `window.d.io` を直接叩くのは、prompt / confirm のダイアログ処理が
 * 本質でないため（UI 経路は tests/browser/io-ui.spec.ts が見ている）。
 */

const SCHEMA_DIR = join(REPO_ROOT, E2E_SCHEMA_DIR);

/** サーバ上のファイルを読む（backend が実際に書いたバイト列） */
function serverFile(name: string): string {
    return readFileSync(join(SCHEMA_DIR, name), "utf8");
}

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    /* 起動が終わるまで待つ（locale と datatypes の XHR 2 本） */
    await page.waitForFunction(() => {
        const designer = (window as unknown as { d?: { palette?: { isLoaded(): boolean } } }).d;
        return designer?.palette?.isLoaded() === true;
    });
});

test("設計を保存すると正本ディレクトリに実ファイルが書かれる", async ({ page }) => {
    const fixture = readFixture(SERIALIZER_DB, "house-defaults");

    const expected = await page.evaluate((xml) => {
        const d = (window as unknown as { d: { io: { fromXMLText(x: string): void; serversave(e: undefined, k: string): void }; toJson(): string } }).d;
        d.io.fromXMLText(xml);
        const json = d.toJson();
        d.io.serversave(undefined, "e2e-save");
        return json;
    }, fixture);

    await expect.poll(() => existsSync(join(SCHEMA_DIR, "e2e-save.json"))).toBe(true);
    /* **バイト一致**。backend は body を解釈せずそのまま書く（実測契約） */
    expect(serverFile("e2e-save.json")).toBe(expected);
});

test("保存したものを読み戻せる（往復が実 HTTP で通る）", async ({ page }) => {
    const fixture = readFixture(SERIALIZER_DB, "minimal");

    await page.evaluate((xml) => {
        const d = (window as unknown as { d: { io: { fromXMLText(x: string): void; serversave(e: undefined, k: string): void } } }).d;
        d.io.fromXMLText(xml);
        d.io.serversave(undefined, "e2e-roundtrip");
    }, fixture);
    await expect.poll(() => existsSync(join(SCHEMA_DIR, "e2e-roundtrip.json"))).toBe(true);

    /* 別の設計を開いてから読み戻す（画面の状態が入れ替わることを見る） */
    const restored = await page.evaluate(async () => {
        const d = (window as unknown as {
            d: { io: { serverload(e: false, k: string): void }; clearTables(): void; toJson(): string };
        }).d;
        d.clearTables();
        d.io.serverload(false, "e2e-roundtrip");
        await new Promise((resolve) => setTimeout(resolve, 500));
        return d.toJson();
    });

    expect(restored).toBe(serverFile("e2e-roundtrip.json"));
});

test("一覧に保存した名前が出る", async ({ page }) => {
    await page.evaluate(() => {
        const d = (window as unknown as { d: { io: { serversave(e: undefined, k: string): void } } }).d;
        d.io.serversave(undefined, "e2e-list");
    });
    await expect.poll(() => existsSync(join(SCHEMA_DIR, "e2e-list.json"))).toBe(true);

    const listed = await page.evaluate(async () => {
        const d = (window as unknown as {
            d: { io: { serverlist(): void; dom: { ta: { value: string } } } };
        }).d;
        d.io.dom.ta.value = "";
        d.io.serverlist();
        await new Promise((resolve) => setTimeout(resolve, 500));
        return d.io.dom.ta.value;
    });

    expect(listed).toContain("e2e-list.json");
    /* 昇順・末尾にも改行（段階5-1b で決めた契約） */
    expect(listed.endsWith("\n")).toBe(true);
});

test("外部で書き換わっていたら 412 を受けて confirm を出す", async ({ page }) => {
    /*
     * ★ **段階5-4 の TOCTOU 対策が実 HTTP で効いていることの証明。**
     *   ETag は内容の SHA-256 なので、ファイルを直接書き換えれば衝突が起きる。
     */
    await page.evaluate(() => {
        const d = (window as unknown as { d: { io: { serversave(e: undefined, k: string): void } } }).d;
        d.io.serversave(undefined, "e2e-conflict");
    });
    await expect.poll(() => existsSync(join(SCHEMA_DIR, "e2e-conflict.json"))).toBe(true);

    /* app の外でファイルが変わった（= 他人の PR を git pull した） */
    const theirs = serverFile("e2e-conflict.json") + "\n";
    writeFileSync(join(SCHEMA_DIR, "e2e-conflict.json"), theirs, "utf8");

    /* confirm は断る。1 バイトも上書きされないことを見る */
    page.on("dialog", (dialog) => void dialog.dismiss());
    const asked = await page.evaluate(async () => {
        const messages: string[] = [];
        const original = window.confirm;
        window.confirm = (message?: string) => {
            messages.push(String(message));
            return false;
        };
        const d = (window as unknown as { d: { io: { serversave(e: undefined, k: string): void } } }).d;
        d.io.serversave(undefined, "e2e-conflict");
        await new Promise((resolve) => setTimeout(resolve, 500));
        window.confirm = original;
        return messages;
    });

    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("e2e-conflict.json");
    expect(serverFile("e2e-conflict.json")).toBe(theirs);
});

test("正本ディレクトリに設計以外を置いても一覧に出ない", async ({ page }) => {
    /* 段階5-2 の *.json 限定。正本は git repo なので README と同居しうる */
    writeFileSync(join(SCHEMA_DIR, "README.md"), "# schema\n", "utf8");

    const listed = await page.evaluate(async () => {
        const d = (window as unknown as {
            d: { io: { serverlist(): void; dom: { ta: { value: string } } } };
        }).d;
        d.io.dom.ta.value = "";
        d.io.serverlist();
        await new Promise((resolve) => setTimeout(resolve, 500));
        return d.io.dom.ta.value;
    });

    expect(listed).not.toContain("README.md");
    /* ファイル自体は残っている（backend が消したりしない） */
    expect(readdirSync(SCHEMA_DIR)).toContain("README.md");
});
