import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { readFixture, SERIALIZER_DB } from "../support/fixtures.ts";
import { clickIo, openDesigner } from "../browser/harness.ts";
import viteConfig from "../../vite.config.ts";
import { IMAGE_SCHEMA_DIR, REPO_ROOT } from "./compose.ts";

/*
 * 配布イメージの通しの検証（HANDOVER §2 段階2-4）。
 *
 * **ブラウザ → 単一プロセス（Spring Boot）→ bind mount したホストのファイル。** 開発時の
 * 2 プロセス（Vite dev server ＋ bootRun）とは配信の分担が違い（docs/ARCHITECTURE.md §9.2）、
 * **手元の jar には static が入らない**ので、この経路はここでしか通らない。
 *
 * ★ **細かい契約はここで試さない**（5-9 / 11-5 と同じ方針）。status やヘッダの網羅は
 *   tests/contract/backend-cases.json と Kotlin 側が持つ。ここが見るのは
 *   **イメージでしか出ないもの**だけ —— 実コンテナを起こすぶん高価なので本数を絞る。
 */

/**
 * 配布時のセキュリティヘッダ。**正本は Kotlin の SecurityHeadersFilter** で、ここが読むのは
 * vite.config.ts の写し —— 両者のずれは tests/node/csp.test.ts が見る
 * （tests/dist/smoke.spec.ts と同じ借り方）。
 */
const EXPECTED_HEADERS = (viteConfig.preview?.headers ?? {}) as Record<string, string>;

/**
 * 経路別の `Cache-Control`（段階2-4）。**値の正本は SecurityHeadersFilter** で、規則そのものは
 * server 側の CacheControlTest が持つ。ここは**イメージから実際にその値が出ている**ことだけを見る。
 */
const CACHE_CONTROL = {
    immutable: "public, max-age=31536000, immutable",
    revalidate: "no-cache",
    noStore: "no-store",
} as const;

/** Chrome が console に出した CSP 違反。**afterEach で毎回空を確かめる** */
const cspViolations: string[] = [];

let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    /*
     * ★ **CSP は curl では確かめにならない**（org security-verification §1.2）。
     *   2-2 がイメージに向けたのは `curl -sSI` だけで、**違反が出ないことと機能が
     *   壊れていないことはブラウザにしか出ない**。開いた瞬間から拾っておく。
     */
    page.on("console", (msg) => {
        if (/Content Security Policy/i.test(msg.text())) {
            /*
             * ★ **出どころも一緒に控える。** 違反の本文には「どこで起きたか」が入らないので、
             *   赤くなってから探すことになる（実際に探した）。bundle の行番号でも、
             *   dist/assets/index-*.js を開けば辿れる。
             */
            const at = msg.location();
            cspViolations.push(`${msg.text()}\n  at ${at.url}:${at.lineNumber}:${at.columnNumber}`);
        }
    });
    await openDesigner(page);
});

test.afterEach(() => {
    expect(cspViolations.splice(0), "CSP 違反が出た").toEqual([]);
});

test.afterAll(async () => {
    await page.close();
});

/** ハッシュ付き資産の URL を、配られた HTML から 1 本取る */
async function assetUrl(): Promise<string> {
    const html = await (await page.request.get("/")).text();
    const found = /\/assets\/[A-Za-z0-9._-]+\.js/.exec(html);
    expect(found, "index.html が /assets/ の js を参照していない").not.toBeNull();
    return found![0];
}

/** mount 先（ホスト側）に実際に書かれたバイト列 */
function hostFile(name: string): string {
    return readFileSync(join(REPO_ROOT, IMAGE_SCHEMA_DIR, name), "utf8");
}

test("イメージの index.html から Designer が初期化される", async () => {
    /*
     * **単一プロセスが classpath の static/ を配っていることの証明。** Dockerfile の COPY で
     * dist を入れる形（Gradle タスクにしない。段階2-0 の決めたこと 2）の代償として、
     * 手元の jar では 1 度も通らない経路がここ。
     */
    expect(await page.evaluate(() => typeof window.d!.toDdl === "function")).toBe(true);
});

test("Rollup の依存グラフに乗らない資産がイメージから配られる", async () => {
    // db/ locale/ は OZ.Request が相対 URL で fetch し、images/ はバンドル後の CSS が参照する。
    // vite-plugin-static-copy が dist へ入れたものが、そのまま jar に入っているか。
    for (const path of [`db/${SERIALIZER_DB}/datatypes.xml`, "locale/en.xml", "images/back.png"]) {
        const status = await page.evaluate(async (p) => (await fetch(p)).status, path);
        expect(status, `${path} がイメージに無い`).toBe(200);
    }
});

test("セキュリティヘッダ 5 本が 4 経路すべてに付く", async () => {
    /*
     * 2-2 が手で叩いた curl を機械に置き換える（申し送り:「**この段階のあいだ、イメージの
     * ヘッダが落ちても誰も気づかない**」）。
     *
     * ★ 経路を 4 本にしてあるのは org security-verification §1.2 の★
     *   「**ヘッダが落ちるのは、たいてい正常系ではない経路**」。
     */
    const paths = ["/", "/no-such-path", "/backend/file/?action=list", await assetUrl()];

    for (const path of paths) {
        const response = await page.request.get(path);
        for (const [name, value] of Object.entries(EXPECTED_HEADERS)) {
            expect(response.headers()[name.toLowerCase()], `${name} が ${path} で落ちている`).toBe(
                value,
            );
        }
    }
});

test("Cache-Control が経路別に出る", async () => {
    /*
     * ★ 段階2-3 まで**どの経路にも 1 本も出ていなかった**（2026-08-26 実測）。
     *   経路ごとに値が変わるヘッダは「1 か所を足したせいで他が落ちる」型の事故を招く
     *   （org security-baseline §3.9 の★★★は nginx の add_header の話だが、構造は同じ）
     *   ので、**上のテストと同じ 4 経路**で 5 本が揃っていることも同時に見ている。
     */
    const cases: ReadonlyArray<[string, string]> = [
        [await assetUrl(), CACHE_CONTROL.immutable],
        ["/", CACHE_CONTROL.revalidate],
        ["/index.html", CACHE_CONTROL.revalidate],
        [`/db/${SERIALIZER_DB}/datatypes.xml`, CACHE_CONTROL.revalidate],
        ["/backend/file/?action=list", CACHE_CONTROL.noStore],
        ["/no-such-path", CACHE_CONTROL.revalidate],
    ];

    for (const [path, expected] of cases) {
        const response = await page.request.get(path);
        expect(response.headers()["cache-control"], `${path} の Cache-Control`).toBe(expected);
    }
});

test("ハッシュを持たない資産は条件付き GET で 304 になる", async () => {
    /*
     * `no-cache` は「キャッシュしてよいが毎回検証する」。**検証が成立する裏づけ**として、
     * Last-Modified を返して 304 を出すことをここで見る（ETag は出していない。
     * 2026-08-26 実測）。これが無いと no-cache は毎回フル取得と変わらない。
     */
    const first = await page.request.get("/");
    const lastModified = first.headers()["last-modified"];
    expect(lastModified, "静的資産が Last-Modified を返していない").toBeTruthy();

    const second = await page.request.get("/", {
        headers: { "If-Modified-Since": lastModified! },
    });
    expect(second.status()).toBe(304);
});

test("capabilities は既定で 3 つとも false", async () => {
    const response = await page.request.get("/backend/file/?action=capabilities");

    expect(response.status()).toBe(200);
    /* introspection も AI も env がそろって初めて有効になる（配布の既定はこれ） */
    expect(await response.json()).toEqual({ readonly: false, introspection: false, ai: false });
});

test("保存がホストの mount に実ファイルを書き、読み戻せる", async () => {
    /*
     * **bind mount と非 root（uid=100）の uid が合っていることの証明。** 2-1 / 2-3 は
     * 手で確かめただけで、**Linux ホストは今も未実測**（README の条件つきの予約）。
     *
     * 経路は window.d.io（5-9 と同じ）。UI 操作にしないのは prompt / confirm の処理が
     * 本質でないため —— **curl で叩くと Content-Type の罠を踏む**（付けないと Tomcat が
     * パラメータ解析で body を読み尽くし、**201 が返るのに 0 バイトのファイルが書かれる**。
     * 2026-08-26 実測）が、js/io.ts は application/json を明示している。
     */
    const fixture = readFixture(SERIALIZER_DB, "house-defaults");

    const expected = await page.evaluate((xml) => {
        const d = window.d!;
        d.io.fromXMLText(xml);
        const json = d.toJson();
        d.io.serversave(undefined, "image-e2e-save");
        return json;
    }, fixture);

    await expect
        .poll(() => existsSync(join(REPO_ROOT, IMAGE_SCHEMA_DIR, "image-e2e-save.json")))
        .toBe(true);
    /* **バイト一致**。backend は body を解釈せずそのまま書く（実測契約） */
    expect(hostFile("image-e2e-save.json")).toBe(expected);

    /* 読み戻し（画面の状態が入れ替わる） */
    const restored = await page.evaluate(async () => {
        const d = window.d!;
        d.clearTables();
        d.io.serverload(false, "image-e2e-save");
        await new Promise((resolve) => setTimeout(resolve, 500));
        return d.toJson();
    });
    expect(restored).toBe(hostFile("image-e2e-save.json"));
});

test("CSP 下で主要操作が一巡する", async () => {
    /*
     * org security-verification §1.2:「**CSP はブラウザでしか確認にならない**」。
     * 経路は tests/dist/smoke.spec.ts と同じ入口を借りる —— あちらが見るのは
     * vite preview が配る dist で、**ここは jar に入った同じものをイメージから配った場合**。
     * 違反が出れば afterEach が拾う。
     */
    const result = await page.evaluate(() => {
        const d = window.d!;

        d.tableManager.preAdd();
        d.tableManager.click({ clientX: 300, clientY: 200 } as unknown as MouseEvent);
        d.window.close();
        const table = d.tables[d.tables.length - 1]!;
        d.tableManager.select(table);
        d.tableManager.addRow();

        d.keyManager.sync(table);
        d.keyManager.add();

        /* テーマ切り替えと cookie の往復（段階2-2 で eval を撤去した経路） */
        d.setOption("style", "original");
        d.applyStyle();
        d.setOption("style", "material-inspired");
        d.applyStyle();

        return { rows: table.rows.length, keys: table.keys.length };
    });

    expect(result.rows).toBeGreaterThan(0);
    expect(result.keys).toBeGreaterThan(0);

    /* DDL 出力と localStorage（どちらも alert が出なければ通っている） */
    expect(await clickIo(page, "clientsql")).toEqual([]);
    expect(await clickIo(page, "clientlocalsave", "image-smoke")).toEqual([]);
    expect(await clickIo(page, "clientlocalload", "image-smoke")).toEqual([]);
});
