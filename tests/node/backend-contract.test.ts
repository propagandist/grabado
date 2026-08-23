import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { REPO_ROOT } from "../support/fixtures.ts";
import { createHarness, type NodeHarness } from "./harness.ts";

/*
 * backend の契約を **Kotlin 実装（server/）と同じ表**で検証する（段階5-1c）。
 *
 * 表は tests/contract/backend-cases.json、散文の正は docs/ARCHITECTURE.md の
 * §4（実測・旧 PHP）と §7（Kotlin の到達点）。
 *
 * ★ ここが無いと、tests/node/harness.ts の仮想 backend は「サーバについての手書きの推測」
 *   でしかない。実際 段階5-1c まで**未知の action に 404 を返していた**（実契約は 501。
 *   php-file の fs 解決に落ちた頃の副産物が残っていた）。同じ表で両側を検証すれば、
 *   仮想 backend は**第 2 実装**になる。
 *
 * ★ 仮想 backend は Map であってファイルシステムではないので、パス解決・dotfile・
 *   拡張子の強制は模せない。**模せる範囲は表の中で `virtual` として宣言してある**ので、
 *   ここでは `virtual: true` だけを流す。残りは Kotlin 側（BackendContractTest）が持つ。
 */

interface ContractRequest {
    readonly method?: string;
    readonly action?: string | null;
    readonly keyword?: string | null;
    readonly body?: string;
    readonly backend?: string;
    readonly trailingSlash?: boolean;
    /** 条件付き更新（段階5-4）。仮想 backend も Kotlin と同じ規則で評価する */
    readonly ifMatch?: string;
    readonly ifNoneMatch?: string;
}

interface ContractCase {
    readonly id: string;
    readonly note?: string;
    readonly seed?: Record<string, string>;
    /** サーバの起動条件（段階5-3 の `readonly` など）。仮想 backend は模さない */
    readonly serverMode?: string;
    readonly request: ContractRequest;
    readonly expect: {
        readonly status: number;
        readonly body?: string;
        readonly headers?: Record<string, string>;
    };
    readonly virtual: boolean;
}

interface ContractTable {
    readonly contractVersion: number;
    readonly cases: readonly ContractCase[];
}

const TABLE: ContractTable = JSON.parse(
    readFileSync(join(REPO_ROOT, "tests", "contract", "backend-cases.json"), "utf8"),
) as ContractTable;

/** 実測 URL の形（docs/ARCHITECTURE.md §4.2）。Kotlin 側の send() と同じ組み立て。 */
function buildUrl(request: ContractRequest): string {
    const backend = request.backend ?? "php-mysql";
    const slash = request.trailingSlash === false ? "" : "/";
    const query: string[] = [];
    if (request.action !== undefined && request.action !== null) {
        query.push("action=" + request.action);
    }
    if (request.keyword !== undefined && request.keyword !== null) {
        query.push("keyword=" + encodeURIComponent(request.keyword));
    }
    return `backend/${backend}${slash}` + (query.length ? "?" + query.join("&") : "");
}

describe("backend の契約（仮想 backend / 段階5-1c）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
    });

    afterAll(() => {
        h.close();
    });

    beforeEach(() => {
        h.clearServerFiles();
        h.takeRequests();
    });

    /*
     * 仮想 backend に流せるのは「模せる」かつ「通常起動」のケースだけ。
     * `serverMode` を持つもの（段階5-3 の READONLY など）はサーバの起動条件を要求するので、
     * Kotlin 側の専用テスト（ReadOnlyContractTest）が持つ。
     */
    const virtualCases = TABLE.cases.filter((one) => one.virtual && one.serverMode === undefined);

    for (const one of virtualCases) {
        test(`${one.id}`, () => {
            for (const [name, content] of Object.entries(one.seed ?? {})) {
                h.setServerFile(name, content);
            }

            const method = one.request.method ?? "GET";
            const headers: Record<string, string> = {};
            if (one.request.ifMatch !== undefined) {
                headers["If-Match"] = one.request.ifMatch;
            }
            if (one.request.ifNoneMatch !== undefined) {
                headers["If-None-Match"] = one.request.ifNoneMatch;
            }
            const response = h.callBackend(buildUrl(one.request), {
                method: method,
                data: method === "POST" ? (one.request.body ?? "") : undefined,
                headers: headers,
            });

            expect(response.status, `${one.id}: status（${one.note ?? ""}）`).toBe(one.expect.status);

            if (one.expect.body !== undefined) {
                /* 空 body は仮想 backend も実サーバも空文字（XHR の responseText と同じ形） */
                expect(response.data ?? "", `${one.id}: body`).toBe(one.expect.body);
            }

            for (const [name, value] of Object.entries(one.expect.headers ?? {})) {
                expect(response.headers[name], `${one.id}: ヘッダ ${name}`).toBe(value);
            }
        });
    }

    test("表そのものが健全（版・件数・id の重複なし）", () => {
        expect(TABLE.contractVersion).toBe(1);
        expect(TABLE.cases.length).toBeGreaterThan(15);
        const ids = TABLE.cases.map((one) => one.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test("模せない範囲が表の中で宣言されている", () => {
        /*
         * `virtual: false` が 0 件になったら、それは「仮想 backend が実サーバと同等になった」
         * のではなく「宣言を書き忘れた」ことのほうがずっと起こりやすい。両方が 1 件以上
         * あることを確かめておく（表の意味が空洞化するのを防ぐ）。
         */
        expect(virtualCases.length).toBeGreaterThan(0);
        expect(TABLE.cases.filter((one) => !one.virtual).length).toBeGreaterThan(0);
    });

    /*
     * ★ check() に**通さない**と決めた status。
     *
     * - 412（If-Match / If-None-Match の不一致。段階5-4）
     *   「衝突したので上書きするか？」は**エラー表示ではなく分岐**。フロントが握って
     *   confirm に流すので、textarea に文言を出してはいけない。プリフライトの 404 を
     *   check() に通さないのと同じ理屈（js/io.ts の preflightresponse）。
     *
     * ここに足すのは「フロントが自分で処理する」status だけ。**表示すべきものを足して
     * 検査から逃がさないこと** —— それをやると、このテストが守っているものが無くなる。
     */
    const HANDLED_BY_FRONTEND = new Set([412]);

    /** 契約表に出てくる異常系の status のうち、check() が知っているべきもの。 */
    function statusesCheckMustKnow(): number[] {
        return Array.from(
            new Set(
                TABLE.cases
                    .map((one) => one.expect.status)
                    .filter((status) => status >= 400)
                    .filter((status) => !HANDLED_BY_FRONTEND.has(status)),
            ),
        ).sort((a, b) => a - b);
    }

    test("表に出てくる異常系の status を js/io.ts の check() が全部知っている", () => {
        /*
         * ★ これが本ファイルを置いた 2 つ目の理由。
         *
         * js/io.ts の check() は「表示すべき応答」を switch で列挙しており、**知らない status は
         * default: return true に落ちて「成功」に倒れる**。§5 で新設した 400 / 403 / 405 を
         * 足し忘れると、ユーザーには何も出ないまま save が失敗する。
         *
         * 200 / 201 は成功側だが、201 は locale の http201 = "Saved" を出す契約なので
         * check() が知っている必要がある（段階4-3b から）。ここでは異常系（>= 400）だけを見る。
         */
        const statuses = statusesCheckMustKnow();

        expect(statuses.length).toBeGreaterThan(0);
        for (const status of statuses) {
            expect(h.io.check(status), `check() が ${status} を知らない`).toBe(false);
        }
    });

    test("フロントが自分で処理する status は check() に通さない", () => {
        /*
         * 412 を check() に足してしまうと、衝突のたびに textarea へ文言が出て
         * confirm の分岐と二重になる。**通さないことも契約**なので固定する。
         */
        for (const status of HANDLED_BY_FRONTEND) {
            expect(h.io.check(status), `check() が ${status} を拾ってしまっている`).toBe(true);
        }
    });

    test("check() が知っている status には locale の文言がある", () => {
        /*
         * check() に case を足しても locale のキーが無ければ、textarea には翻訳されない
         * "http400" という文字列がそのまま出る（_() は未知キーをキー名のまま返す）。
         */
        const en = readFileSync(join(REPO_ROOT, "locale", "en.xml"), "utf8");

        for (const status of statusesCheckMustKnow()) {
            expect(en, `locale/en.xml に http${status} が無い`).toContain(`name="http${status}"`);
        }
    });
});
