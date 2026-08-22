import type { Page } from "@playwright/test";
import { captureDesignState } from "../support/state.ts";

/**
 * 実ブラウザ（Chromium）で現行アプリを起こし、現行コードそのものから挙動を採取する。
 *
 * ロジックを抽出せず現行コードを動かすのは意図的。モデル層は描画 DOM と密結合で
 * （docs/ARCHITECTURE.md §5）、抽出は HANDOVER §4 の仕事だから。ここで抽出すると
 * 「抽出後のコード」を特性化することになり安全網の意味が消える。
 */

/*
 * page.evaluate はバンドルの外で走るので、アプリに触るには window 越しのハンドルが要る。
 * 段階3-4b で window.SQL.designer から window.d に寄せた（src/main.ts が置く唯一の
 * 公開ハンドル。window.SQL は段階3-4c で撤去済み）。段階4-0b で型パレットの差し替えも
 * window.DATATYPES から window.d.palette になり、page 側が触る面は d だけになった。
 */

/** index.html を開き、Designer の init2() 完了まで待つ */
export async function openDesigner(page: Page): Promise<void> {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    // 現行コードは失敗を alert() で伝える。握り潰さず、テスト側で例外にする。
    page.on("dialog", async (d) => {
        errors.push(`alert: ${d.message()}`);
        await d.dismiss();
    });

    /*
     * 段階4-3a まで、ここは index.html:22 の dropbox.js（//cdnjs.cloudflare.com/…）を
     * page.route で遮断してオフラインを保っていた。Dropbox 連携ごと撤去して外部依存が
     * 0 本になったので、遮断のかわりに**検出**に置き換える —— 外部へのリクエストが
     * 1 本でも出たら初期化エラーとして落ちる。撤去が戻ってきたらここが赤くなる。
     */
    const requested: string[] = [];
    page.on("request", (req) => requested.push(req.url()));

    await page.goto("/index.html");

    // init2() は locale/*.xml と db/*/datatypes.xml の 2 本が揃ってから走る
    // （js/wwwsqldesigner.js:71-116, 135-157）。map と io が生えたら初期化完了。
    await page.waitForFunction(
        () => !!window.d?.map && !!window.d?.io && !!window.d?.palette.isLoaded(),
        undefined,
        { timeout: 15_000 },
    );

    /* goto の後に判定するのは、オリジンを baseURL 設定ではなく実際に開いた URL から取るため */
    const origin = new URL(page.url()).origin;
    const external = requested.filter(
        (url) => !url.startsWith(origin) && !/^(data|blob):/.test(url),
    );
    if (external.length) {
        errors.push(`外部へのリクエスト:\n${external.join("\n")}`);
    }

    if (errors.length) {
        throw new Error(`初期化中にエラー:\n${errors.join("\n")}`);
    }
}

/**
 * DB プロファイルを切り替える。
 *
 * getOption("db") は cookie だけが上書き経路（js/wwwsqldesigner.ts:230-262）なので
 * URL では切り替えられない。dbResponse()（同 91-99）と同じく型パレットを直接
 * 差し替えるのが実経路どおりで、かつ 1 ページで 5 DB を回せる。
 * 差し替え口は段階4-0b で window.DATATYPES から d.palette になった（操作は同じ）。
 *
 * **空にしてから差し替える**（段階6-8d）。旧パレットで解決済みのテーブルを残したまま
 * 型の少ないパレットへ移ると、後始末が範囲外の型添字を引いて落ちる（6-8a / 6-8b で
 * 2 度踏んだ）。実アプリ側は Designer.fromXML が「clearTables() -> パレット差し替え」の
 * 順を守っており、ここはその順序制約がハーネスに写っていなかっただけ。
 */
export async function useDatatypes(page: Page, db: string): Promise<void> {
    await page.evaluate(async (dbName) => {
        const res = await fetch(`/db/${dbName}/datatypes.xml`);
        if (!res.ok) {
            throw new Error(`datatypes.xml が取れない: ${dbName} (${res.status})`);
        }
        const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
        window.d!.clearTables();
        window.d!.palette.setRoot(doc.documentElement);
    }, db);
}

/**
 * fixture を読み込む。
 * importresponse（js/io.ts の同名メソッド）は使わない — 直後に呼ばれる alignTables() が
 * テーブルを再配置して座標を fixture と食い違わせるため。段階4-4 でテーブル順までは
 * 変わらなくなった（旧 known-issue #7）が、座標を動かすのは仕様なのでここは避けたまま。
 */
export async function loadFixture(page: Page, xml: string): Promise<void> {
    const failures = await page.evaluate((fixtureXml) => {
        const seen: string[] = [];
        const originalAlert = window.alert;
        window.alert = (msg?: unknown) => void seen.push(String(msg));
        try {
            window.d!.io.fromXMLText(fixtureXml);
        } finally {
            window.alert = originalAlert;
        }
        return seen;
    }, xml);

    if (failures.length) {
        throw new Error(`fixture の読み込みに失敗:\n${failures.join("\n")}`);
    }
}

/**
 * io ダイアログのボタンを押す（HANDOVER §4 段階4-3b）。返り値は出た alert の一覧。
 *
 * page.evaluate の中で押すのには理由が 2 つある。(1) io の container はコンストラクタで
 * DOM から外れているので `page.locator` では拾えない（dom バッグ越しならダイアログを
 * 開かずに押せる）。(2) alert / prompt を**この呼び出しの間だけ**差し替えられるので、
 * openDesigner が張る dialog ハンドラと衝突しない（loadFixture と同じイディオム）。
 *
 * 非同期の経路（clientsql / clientcopy / serverload）は click から戻った時点では
 * 終わっていない。呼び手が結果を待つこと。
 */
export function clickIo(
    page: Page,
    id: string,
    promptAnswer: string | null = null,
): Promise<string[]> {
    return page.evaluate(
        ([buttonId, answer]) => {
            const seen: string[] = [];
            const originalAlert = window.alert;
            const originalPrompt = window.prompt;
            window.alert = (msg?: unknown) => void seen.push(String(msg));
            window.prompt = () => answer;
            try {
                const buttons = window.d!.io.dom as unknown as Record<
                    string,
                    HTMLInputElement | undefined
                >;
                const button = buttons[buttonId];
                if (!button) {
                    throw new Error(`io にボタンが無い: ${buttonId}`);
                }
                button.click();
            } finally {
                window.alert = originalAlert;
                window.prompt = originalPrompt;
            }
            return seen;
        },
        [id, promptAnswer] as const,
    );
}

/** io ダイアログの #textarea（入出力欄） */
export function ioTextarea(page: Page): Promise<string> {
    return page.evaluate(() => window.d!.io.dom.ta.value);
}

export async function setIoTextarea(page: Page, value: string): Promise<void> {
    await page.evaluate((text) => {
        window.d!.io.dom.ta.value = text;
    }, value);
}

/** 設計 JSON の書き出し（HANDOVER §4 段階4-2。UI 未配線なので Designer の面を直接叩く） */
export function toJson(page: Page): Promise<string> {
    return page.evaluate(() => window.d!.toJson());
}

/**
 * 設計 JSON の読み込み。
 *
 * loadFixture() のような alert の収集はしない —— js/io/json-parser.ts は現行 XML 経路と違って
 * **例外で落ちる**（alert を出すのは js/io.ts の UI 層で、その配線は 4-3）。例外はそのまま
 * page.evaluate の reject として伝わるので、テスト側で rejects として受ける。
 */
export async function loadJson(page: Page, json: string): Promise<void> {
    await page.evaluate((text) => window.d!.fromJson(text), json);
}

/**
 * 読み込み後の状態スナップショット（HANDOVER §4 段階4-1b）。
 *
 * page.evaluate はバンドルの外で走り import を解決できないので、採取関数を
 * **ソース文字列として注入**する（tests/support/state.ts の冒頭を参照）。
 * Node 側は同じ関数を直接呼ぶので、採取ロジックの正本は 1 本のまま。
 */
export function captureState(page: Page): Promise<string> {
    return page.evaluate<string>(`(${captureDesignState})(window.d)`);
}

/**
 * DDL 生成。UI の #textarea に入る値と一致する。
 *
 * **段階6-5a で XSLT 経路が消えた。** それまでは fetch('/db/<db>/output.xsl') した
 * スタイルシートを DOMParser + XSLTProcessor に通しており（js/io.ts の finish() と
 * 同じ経路）、任意の XML を直接食わせる transformXml() もここに居た。生成が
 * js/io/ddl/generate.ts になったので、入口は Designer の面 1 つだけになっている。
 *
 * db 引数は「呼び手が意図したプロファイル」で、パレットの実体と突き合わせる。
 * XSLT 経路では db が XSL の選択に効いたが、いまは toDdl() が palette.db() を見るので
 * **引数だけ変えてもパレットが変わらない**（useDatatypes() の呼び忘れが静かに通る）。
 * その事故を塞ぐためにここで検査する。
 */
export async function generateDdl(page: Page, db: string): Promise<string> {
    return page.evaluate((expected) => {
        const actual = window.d!.palette.db();
        if (actual !== expected) {
            throw new Error(
                `型パレットが ${actual} のまま（期待は ${expected}）。useDatatypes() の呼び忘れ`,
            );
        }
        return window.d!.toDdl();
    }, db);
}
