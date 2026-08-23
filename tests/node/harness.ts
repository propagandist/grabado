import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "vite";
import { REPO_ROOT } from "../support/fixtures.ts";
import { captureDesignState } from "../support/state.ts";
/* OZ の型は js/oz.ts の export に移した（HANDOVER §3 段階3-1）。
   実体は window.eval したバンドルが載せるので、ここでは型だけ借りる。 */
import type { OzRequestCallback, OzRequestOptions } from "../../js/oz.ts";
/* UI 層の型（段階4-3b。実体はバンドルの内側） */
import type { IO } from "../../js/io.ts";
/* バンドルが window に載せるハンドルの型（実体は tests/node/app-entry.ts） */
import type { GrabadoTestApi } from "./app-entry.ts";

/**
 * jsdom 上に現行アプリを起こす、Node 側（高速回帰）のハーネス。
 *
 * 権威は実ブラウザ側（tests/browser/）。こちらは同じ fixture・同じ golden を
 * 高速に回すための第 2 の実行系で、両者がずれたらそれ自体が情報になる。
 *
 * 実ブラウザとの構造的な違いは 2 つだけ:
 *   1. OZ.Request を fs 読みに差し替える（jsdom で XHR を実際に飛ばさないため）
 *   2. offsetWidth/offsetHeight が常に 0（jsdom はレイアウトしない）
 *      -> 書き出しが使うのは x/y だけなのでシリアライズの特性化には影響しない
 */

/*
 * Designer インスタンスの型は js/wwwsqldesigner.ts の実体 1 本（HANDOVER §4 段階4-1c）。
 * 段階3-2 の SqlDesigner（types/globals.d.ts -> js/globals.ts と移った別名）は撤去済み。
 * 本ファイルは designer を api 越しの値として持つだけなので、この型を import していない。
 */

/**
 * OZ.Request が受けた 1 回分（段階4-3b）。
 *
 * server 経路（save / load / list / import）は URL とヘッダと body が backend との契約
 * そのもので、golden では 1 ビットも押さえられない（golden は Designer のファサード経由で
 * 採るため js/io.ts を通らない）。OZ.Request は全通信の唯一の入口なので、差し替え先で
 * 記録するだけで契約が固定できる。
 */
export interface RequestRecord {
    readonly url: string;
    readonly method: string | undefined;
    /** 応答を XML として parse するか。段階4-3b で load だけ false になった */
    readonly xml: boolean | undefined;
    readonly contentType: string | undefined;
    readonly data: string | undefined;
    /** 送ったリクエストヘッダ（段階5-4b の If-Match / If-None-Match を見るため） */
    readonly headers: Record<string, string> | undefined;
}

/** 仮想 backend の 1 応答（段階5-1c）。`OZ.Request` のコールバック 3 引数をそのまま持つ。 */
export interface BackendResponse {
    readonly data: unknown;
    readonly status: number;
    readonly headers: Record<string, string>;
}

export interface NodeHarness {
    readonly dom: JSDOM;
    readonly window: JSDOM["window"];
    /** UI 層（js/io.ts）。段階4-3b の保存/読込経路を Node からも叩く */
    readonly io: IO;
    /** OZ.Request が受けたリクエストを取り出して空にする（発生順） */
    takeRequests(): RequestRecord[];
    /** 型パレットを差し替える（dbResponse() と同じ操作） */
    useDatatypes(db: string): void;
    /** fixture を読み込む。alert が出たら例外にする */
    loadFixture(xml: string): void;
    /** DDL 生成（段階6-5a で toXML() から置き換わった。js/io/ddl/generate.ts） */
    toDdl(): string;
    /** ORM のモデル定義（段階6-9d） */
    toOrm(target: string): string;
    /** 設計 JSON の書き出し / 読み込み（段階4-2 で新設。UI への配線は 4-3b） */
    toJson(): string;
    /** 読み込みは alert ではなく例外で落ちる（js/io/json-parser.ts） */
    loadJson(json: string): void;
    /** 読み込み後の状態スナップショット（page 側と同じ関数。tests/support/state.ts） */
    captureState(): string;
    /** 溜まった alert を取り出して空にする（UI 層は失敗を alert で伝える） */
    takeAlerts(): string[];
    /**
     * 仮想 backend を 1 往復だけ直接叩く（段階5-1c）。UI を経由しないので、
     * `tests/contract/backend-cases.json` のケースをそのまま流せる。
     */
    callBackend(url: string, options?: OzRequestOptions): BackendResponse;
    /**
     * 仮想 backend の中身を置く / 消す（段階4-6）。`null` で削除 ＝ load が 404 になる。
     * keyword はフロントが組み立てるファイル名（`orders.json` のように `.json` 付き）。
     */
    setServerFile(keyword: string, text: string | null): void;
    /** 仮想 backend の現在の中身。save の write-through を検算するために読む */
    getServerFile(keyword: string): string | null;
    /** 仮想 backend を空にする（テストごとの初期化） */
    clearServerFiles(): void;
    /** 次に load が返す HTTP ステータスを 1 回だけ差し替える（500 系の経路用） */
    failNextLoad(status: number): void;
    /**
     * introspection の応答を差し込む（段階5-7b）。`null` に戻すと 404（接続先が無いサーバ）。
     * 実際のカタログ読み取りは Kotlin の統合テスト（実 PG18）が見るので、ここで試すのは
     * **フロント側の往復**（parse -> 型解決 -> 適用 -> 並べ直し）だけ。
     */
    setIntrospection(json: string | null): void;
    /** confirm の答えを固定する（jsdom の confirm は常に false を返すため。段階4-6） */
    setConfirm(answer: boolean): void;
    /** confirm に渡された文言を取り出して空にする */
    takeConfirms(): string[];
    close(): void;
}

function readRepoFile(relPath: string): string {
    return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

/**
 * URL パス -> リポジトリ内ファイル。OZ.Request の差し替え先。
 * CONFIG.STATIC_PATH は空文字なので、アプリが投げる URL は "locale/en.xml" のような相対パス。
 */
function resolveRequestUrl(url: string): string {
    return url.replace(/^\/+/, "").split("?")[0] ?? "";
}

/** クエリ文字列から 1 つ取り出す（`?` の後ろだけを見る） */
function queryParam(url: string, name: string): string | null {
    const q = url.indexOf("?");
    if (q === -1) {
        return null;
    }
    const m = new RegExp("(?:^|&)" + name + "=([^&]*)").exec(url.substring(q + 1));
    return m ? decodeURIComponent(m[1]!) : null;
}

/**
 * tests/node/app-entry.ts を単一 IIFE に束ねて返す（HANDOVER §3 段階3-0、3-4b で入口を変更）。
 *
 * 以前はここで js/*.js を 1 本ずつ eval していたが、その経路は js/ が .ts になった時点で
 * 動かなくなる（docs/TESTING.md が段階3 の分岐点として予告していた箇所）。バンドルを噛ませると
 * js/ が .js でも .ts でも、参照がグローバルでも ESM でも同じコードで動くので、移行が 1 回で済む。
 * 副次的に、読み込み順の定義が src/app.ts の 1 か所に集約される（従来はここに SCRIPT_ORDER として
 * 二重に書かれていた）。
 *
 * 束ねるのは src/app.ts をそのまま import して window.__grabado を載せるだけの薄いエントリ
 * （段階3-4b）。バンドルの内側にある OZ と Designer に Node 側から手を届かせるためで、
 * 読み込み順の定義は src/app.ts の 1 か所のまま。
 *
 * 起動（new Designer()）は含めない。OZ.Request を fs 読みに差し替えてから生成する必要があり、
 * その順序は現行と 1 行も変えないため。だから束ねるのは src/main.ts ではない。
 */
async function bundleApp(): Promise<string> {
    const result = await build({
        // vite.config.ts を読ませない。viteStaticCopy が走ると dist/ に書き込んでしまう。
        configFile: false,
        // process.cwd() を読ませない（Windows の cwd 大小問題と非干渉にする。
        // scripts/canonical-cwd.mjs の WORKAROUND を参照）。
        root: REPO_ROOT,
        logLevel: "silent",
        build: {
            write: false,
            target: "es2022",
            minify: false,
            // 副作用 import だけで構成されるエントリなので、ツリーシェイクの判断に
            // 安全網を依存させない。配布物の妥当性は npm run test:dist が別途張る。
            rollupOptions: { treeshake: false },
            lib: {
                entry: "tests/node/app-entry.ts",
                formats: ["iife"],
                name: "GrabadoApp",
                fileName: "app",
            },
        },
    });

    const outputs = Array.isArray(result) ? result : [result];
    const first = outputs[0];
    if (!first || !("output" in first)) {
        throw new Error("vite build がバンドル出力を返さなかった（watch モードになっている）");
    }
    const chunk = first.output.find((o) => o.type === "chunk");
    if (!chunk) {
        throw new Error("バンドル出力に chunk が無い");
    }
    return chunk.code;
}

export async function createHarness(): Promise<NodeHarness> {
    const appBundle = await bundleApp();

    // index.html から <script src> と末尾の `new SQL.Designer()` を外す。
    // 評価の順序と OZ.Request の差し替えを制御するため、バンドルは手で eval する。
    const html = readRepoFile("index.html")
        .replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, "")
        .replace(/<script type="text\/javascript">[\s\S]*?<\/script>/g, "");

    const virtualConsole = new VirtualConsole();
    // jsdom が実装していない API（alert 等）の警告は握らず捨てる。
    // 本当のエラーは下の alert フックと pageerror 相当で拾う。
    virtualConsole.on("jsdomError", () => {});

    const dom = new JSDOM(html, {
        runScripts: "dangerously",
        url: "http://127.0.0.1:4173/index.html",
        pretendToBeVisual: true,
        virtualConsole,
    });
    const window = dom.window;

    // strict で評価する。ESM で配る側（dev / build / test:browser / test:dist）は常に strict
    // なのに window.eval は sloppy、という実行系の乖離を縮めるため。rolldown の IIFE 出力自体には
    // "use strict" が付かないので前置が要る。
    //
    // ただし暗黙グローバル（段階2 で直した js/io.js の req / js/oz.js の y）は、これを入れても
    // 捕まらない。jsdom の Window は vm の contextified global（Proxy）なので、strict でも
    // 未宣言の名前への代入が成立してしまう。実測: 前置ありで関数内の this は undefined、
    // frozen への代入は TypeError、delete 変数は SyntaxError になる（＝コードは strict）が、
    // 暗黙グローバル代入だけは素通りして window に載る。Node の素の indirect eval と
    // vm.runInContext では同じコードが ReferenceError になるので、これは jsdom 固有の制約。
    // 暗黙グローバルの検出は引き続き npm run test:browser の担当（docs/TESTING.md）。
    window.eval(`"use strict";\n${appBundle}`);

    // バンドルが載せたハンドル（tests/node/app-entry.ts）。段階3-4b までは
    // window.OZ / window.SQL という出荷コード側のグローバルを踏んでいた。
    const api = (window as unknown as { __grabado?: GrabadoTestApi }).__grabado;
    if (!api) {
        throw new Error("バンドルが window.__grabado を載せていない（tests/node/app-entry.ts）");
    }

    /*
     * 仮想 backend（段階4-6 で新設、段階5-1c で Kotlin 実装に合わせた）。
     *
     * 4-6 で保存が read-before-write になり、「サーバ上に何が置いてあるか」を作り分けられないと
     * 一致 / 不一致が試せない（fs 解決だけだと backend/ は必ず 404 に落ちる）ので置いた。
     *
     * ★ 段階5-1c から、これは**手書きの推測ではなく契約の第 2 実装**になった。
     *   `tests/contract/backend-cases.json` の `virtual: true` のケースを
     *   `tests/node/backend-contract.test.ts` が流し、Kotlin 実装（server/）と**同じ表**で
     *   検証される。挙動を変えるときは表を先に直すこと。
     *
     * ★ ここは Map であってファイルシステムではないので、パス解決・dotfile・拡張子の強制は
     *   模せない。**模せない範囲は表の中で `virtual: false` として宣言してある。**
     */
    const serverFiles = new Map<string, string>();
    let nextLoadStatus: number | null = null;
    /** introspection の応答（段階5-7b）。null なら「接続先が無い」＝ 404 */
    let introspectionResponse: string | null = null;

    /**
     * Kotlin 実装（`server/src/main/kotlin/dev/grabado/design/ETags.kt`）と**同じ計算**。
     * 内容の SHA-256 を先頭 16 バイトだけ hex にして引用符で囲む。
     *
     * 同じ規則にしておかないと、契約表の ETag まわりが「両側で検証された」と言えなくなる。
     */
    function etagOf(text: string): string {
        const hex = createHash("sha256").update(text, "utf8").digest("hex");
        return `"${hex.slice(0, 32)}"`;
    }

    function respondAsBackend(
        url: string,
        callback: OzRequestCallback,
        options?: OzRequestOptions,
    ): void {
        const action = queryParam(url, "action");
        const keyword = queryParam(url, "keyword") ?? "";

        if (action === "save") {
            const body = typeof options?.data === "string" ? options.data : "";
            const current = serverFiles.get(keyword);
            const currentTag = current === undefined ? null : etagOf(current);
            const ifMatch = options?.headers?.["If-Match"];
            const ifNoneMatch = options?.headers?.["If-None-Match"];

            /*
             * 条件付き更新（段階5-4）。Kotlin 実装（server/ の ETags）と同じ規則:
             *   If-Match: "<etag>" … 一致すれば通す。違えば / 不在なら 412
             *   If-Match: *        … 存在すれば無条件で通す。不在なら 412
             *   If-None-Match: *   … 不在なら通す。実在すれば 412
             */
            if (ifMatch !== undefined) {
                const satisfied =
                    ifMatch === "*" ? currentTag !== null : currentTag !== null && ifMatch === currentTag;
                if (!satisfied) {
                    callback("", 412, {});
                    return;
                }
            }
            if (ifNoneMatch !== undefined) {
                const satisfied = ifNoneMatch === "*" ? currentTag === null : ifNoneMatch !== currentTag;
                if (!satisfied) {
                    callback("", 412, {});
                    return;
                }
            }

            serverFiles.set(keyword, body);
            /*
             * save 成功は 201 + 空 body（docs/ARCHITECTURE.md §4.3 の実測。§7.1 でも維持）。
             * 段階5-4 から**新しい ETag も返す** —— フロントは load し直さずに baseline を
             * 更新できる。
             */
            callback("", 201, { ETag: etagOf(body) });
            return;
        }
        if (action === "load") {
            if (nextLoadStatus !== null) {
                const status = nextLoadStatus;
                nextLoadStatus = null;
                callback("", status, {});
                return;
            }
            const text = serverFiles.get(keyword);
            if (text === undefined) {
                callback("", 404, {});
                return;
            }
            /*
             * 保存したバイト列をそのまま返す（backend は中身を解釈しない）。
             * Content-Type は段階5-1b から octet-stream + nosniff —— フロントは
             * 段階4-3b から中身の先頭 1 文字で判別するので見ないが、契約なので返す。
             */
            callback(text, 200, {
                "Content-Type": "application/octet-stream",
                "X-Content-Type-Options": "nosniff",
                ETag: etagOf(text),
            });
            return;
        }
        if (action === "list") {
            /*
             * 昇順・末尾にも改行・空なら 0 バイト。dotfile は返さない（段階5-1b）。
             * 段階5-2 から **`*.json` だけ**（大小無視）—— 正本ディレクトリは README や
             * .gitattributes と同居しうるので、設計として扱うものを絞る。
             */
            const names = Array.from(serverFiles.keys())
                .filter((name) => !name.startsWith("."))
                .filter((name) => name.toLowerCase().endsWith(".json"))
                .sort();
            callback(names.map((name) => name + "\n").join(""), 200, {});
            return;
        }
        if (action === "import") {
            /*
             * 段階5-7a/b。仮想 backend は外部 DB に繋がない（繋げない）ので、既定では
             * **接続先が 1 つも設定されていないサーバ**として振る舞う —— 404。
             * 実際のカタログ読み取りは Kotlin の統合テスト（実 PG18）が見る。
             *
             * `setIntrospection()` で応答を差し込めば、フロント側の往復
             * （parse -> 型解決 -> 適用 -> 並べ直し）を試せる。
             */
            if (introspectionResponse === null) {
                callback("", 404, {});
                return;
            }
            callback(introspectionResponse, 200, { "Content-Type": "application/json" });
            return;
        }
        if (action === "capabilities") {
            /*
             * 段階5-5。仮想 backend は READONLY を模さない（サーバの起動条件なので）ため、
             * 常に「全部できる」を返す。READONLY の側は Kotlin の ReadOnlyContractTest が持つ。
             * キー順は Kotlin の Capabilities（data class のプロパティ順）に合わせる。
             */
            callback('{"readonly":false,"introspection":false,"ai":false}', 200, {
                "Content-Type": "application/json",
            });
            return;
        }
        /*
         * import / remove / 未知の action / action 指定なし。
         *
         * 段階5-1c まで 404 を返していた（php-file の fs 解決に落ちた頃の副産物）が、
         * **実測契約は 501**（ARCHITECTURE §4.3）。Kotlin 実装もそう返す。
         */
        callback("", 501, {});
    }

    // OZ.Request を fs 読みへ。同期的にコールバックを呼ぶので
    // new Designer() のうちに init2() まで到達する。
    const requests: RequestRecord[] = [];
    api.OZ.Request = (
        url: string,
        callback?: OzRequestCallback,
        options?: OzRequestOptions,
    ) => {
        /* 段階4-3b: server 経路の契約（URL / Content-type / body）を固定するための記録 */
        requests.push({
            url: url,
            method: options?.method,
            xml: options?.xml,
            contentType: options?.headers?.["Content-type"],
            data: typeof options?.data === "string" ? options.data : undefined,
            headers: options?.headers,
        });
        if (!callback) {
            return false;
        }
        const path = resolveRequestUrl(url);
        /* locale / datatypes は今までどおり fs から読む（output.xsl は段階6-5a で消えた） */
        if (path.indexOf("backend/") === 0) {
            respondAsBackend(url, callback, options);
            return false;
        }
        let text: string;
        try {
            text = readRepoFile(path);
        } catch {
            callback(null, 404, {});
            return false;
        }
        const data = options?.xml
            ? new window.DOMParser().parseFromString(text, "text/xml")
            : text;
        callback(data, 200, {});
        return false;
    };

    const alerts: string[] = [];
    window.alert = (msg?: unknown) => void alerts.push(String(msg));

    /*
     * confirm（段階4-6）。jsdom は "not implemented" を出して常に false を返すので、
     * 「上書きする」側の経路が試せない。alert と同じ形で記録し、答えは固定する。
     */
    const confirms: string[] = [];
    let confirmAnswer = false;
    window.confirm = (msg?: string): boolean => {
        confirms.push(String(msg));
        return confirmAnswer;
    };

    // 段階3-4b まで window.eval("new SQL.Designer();") と書いて結果を window.SQL.designer から
    // 拾っていた。ハンドルを掴んでいるので戻り値をそのまま使える（コンストラクタ内の
    // SQL.designer への自己登録も段階4-0a で消え、インスタンスへの経路はこの戻り値だけになった）。
    const designer = new api.Designer();
    if (!designer.map || !designer.io) {
        throw new Error(`Designer の初期化に失敗:\n${alerts.join("\n")}`);
    }

    const takeAlerts = (): string[] => alerts.splice(0, alerts.length);
    takeAlerts();
    /* 初期化中の locale / datatypes の取得は記録から落とす（テストが見るのは操作の分だけ） */
    requests.length = 0;

    return {
        dom,
        window,
        io: designer.io,
        takeRequests: (): RequestRecord[] => requests.splice(0, requests.length),
        takeAlerts: takeAlerts,
        useDatatypes(db: string): void {
            const xml = readRepoFile(`db/${db}/datatypes.xml`);
            const doc = new window.DOMParser().parseFromString(xml, "text/xml");
            // 段階4-0b で window.DATATYPES から Designer のプロパティになった。
            // 差し替えの中身（dbResponse() と同じ「documentElement を入れる」操作）は不変。
            //
            // **空にしてから差し替える**（段階6-8d）。旧パレットで解決済みのテーブルを
            // 残したまま型の少ないパレットへ移ると、後始末が範囲外の型添字を引いて落ちる
            // （6-8a / 6-8b で 2 度踏んだ）。実アプリ側は Designer.fromXML が
            // 「clearTables() -> パレット差し替え」の順を守っており、ここはその順序制約が
            // ハーネスに写っていなかっただけ。各テストが書いていた儀式をここへ畳む。
            designer.clearTables();
            designer.palette.setRoot(doc.documentElement);
        },
        loadFixture(xml: string): void {
            designer.io.fromXMLText(xml);
            const failures = takeAlerts();
            if (failures.length) {
                throw new Error(`fixture の読み込みに失敗:\n${failures.join("\n")}`);
            }
        },
        toDdl(): string {
            return designer.toDdl();
        },
        toOrm(target: string): string {
            return designer.toOrm(target);
        },
        toJson(): string {
            return designer.toJson();
        },
        loadJson(json: string): void {
            designer.fromJson(json);
        },
        captureState(): string {
            return captureDesignState(designer);
        },
        /**
         * 仮想 backend を 1 往復だけ直接叩く（段階5-1c）。
         *
         * `tests/contract/backend-cases.json` を流すための口。UI を経由しないので、
         * 契約表のケースを「URL を投げて (data, status, headers) を見る」形で試せる。
         * 仮想 backend は同期なので、コールバックの結果をそのまま返せる。
         */
        callBackend(url: string, options?: OzRequestOptions): BackendResponse {
            let captured: BackendResponse | null = null;
            api.OZ.Request(
                url,
                (data: unknown, code: number, headers?: Record<string, string>) => {
                    captured = { data: data, status: code, headers: headers ?? {} };
                },
                options,
            );
            if (!captured) {
                throw new Error(`仮想 backend が応答しなかった: ${url}`);
            }
            return captured;
        },
        setServerFile(keyword: string, text: string | null): void {
            if (text === null) {
                serverFiles.delete(keyword);
            } else {
                serverFiles.set(keyword, text);
            }
        },
        getServerFile(keyword: string): string | null {
            return serverFiles.has(keyword) ? serverFiles.get(keyword)! : null;
        },
        clearServerFiles(): void {
            serverFiles.clear();
            nextLoadStatus = null;
        },
        failNextLoad(status: number): void {
            nextLoadStatus = status;
        },
        setIntrospection(json: string | null): void {
            introspectionResponse = json;
        },
        setConfirm(answer: boolean): void {
            confirmAnswer = answer;
        },
        takeConfirms: (): string[] => confirms.splice(0, confirms.length),
        close(): void {
            window.close();
        },
    };
}
