import { test, expect, type Page } from "@playwright/test";
import { SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { goldenPath, readGolden } from "../support/golden.ts";
import {
    clickIo,
    ioTextarea,
    loadFixture,
    openDesigner,
    setIoTextarea,
    toJson,
    toXml,
    useDatatypes,
} from "./harness.ts";

/*
 * UI の保存/読込経路の特性化。HANDOVER §4 段階4-3b。
 *
 * **golden はここを 1 ビットも押さえない。** golden 85 本はすべて Designer のファサード
 * （toXML / toJson / fromXML / fromJson）経由で採るので js/io.ts を通らず、「UI が JSON に
 * 切り替わったこと」は golden 不変と両立してしまう。だから 4-3b の完了判定は
 * 「golden 無差分」＋「本ファイルと tests/node/io-ui.test.ts」の 2 本立てになる。
 *
 * こちら（実ブラウザ）が担うのは、Node の jsdom では見られないもの —— download の
 * suggestedFilename、localStorage、XSLTProcessor 経由の DDL 生成、そして DOM に
 * ボタンが実在すること。server 経路の契約（URL / Content-type / body）は
 * tests/node/io-ui.test.ts の担当。
 *
 * golden は読むだけで書かない（本ファイルは golden を持たない）。
 */

let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
    await useDatatypes(page, SERIALIZER_DB);
});

test.afterAll(async () => {
    await page.close();
});

test.beforeEach(async () => {
    await useDatatypes(page, SERIALIZER_DB);
    await loadFixture(page, readFixture("house-defaults"));
    await setIoTextarea(page, "");
});

test.describe("保存（すべて JSON になる）", () => {
    test("clientsave は textarea に設計 JSON を入れる", async () => {
        expect(await clickIo(page, "clientsave")).toEqual([]);

        const text = await ioTextarea(page);
        const design = JSON.parse(text);
        expect(design.formatVersion).toBe(2);
        expect(design.db).toBe(SERIALIZER_DB);
        /* serializer の出力とバイト一致（UI が別経路で組み直していない） */
        expect(text).toBe(await toJson(page));
    });

    test("clientdownload は .json / application/json で落とす", async () => {
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            clickIo(page, "clientdownload"),
        ]);

        expect(download.suggestedFilename()).toBe("new-database.json");
    });

    test("clientlocalsave は localStorage に JSON を入れ、clientlocalload で戻る", async () => {
        const expected = await toJson(page);

        expect(await clickIo(page, "clientlocalsave", "io-ui-test")).toEqual([]);

        const stored = await page.evaluate(() =>
            localStorage.getItem("wwwsqldesigner_databases_io-ui-test"),
        );
        expect(stored).toBe(expected);

        /* 別の設計に切り替えてから読み戻す */
        await loadFixture(page, readFixture("minimal"));
        expect(await clickIo(page, "clientlocalload", "io-ui-test")).toEqual([]);
        expect(await toJson(page)).toBe(expected);
    });
});

test.describe("読み込み（JSON と XML の両方を受ける）", () => {
    test("clientload は textarea の JSON を読む", async () => {
        const source = await toJson(page);
        await loadFixture(page, readFixture("minimal"));
        await setIoTextarea(page, source);

        expect(await clickIo(page, "clientload")).toEqual([]);
        expect(await toJson(page)).toBe(source);
    });

    test("clientload は設計 XML も読む（読込互換）", async () => {
        const expected = await toJson(page);
        const xml = await toXml(page);
        await loadFixture(page, readFixture("minimal"));
        await setIoTextarea(page, xml);

        expect(await clickIo(page, "clientload")).toEqual([]);
        expect(await toJson(page)).toBe(expected);
    });

    test("4-3b より前に localStorage へ保存した XML も読める", async () => {
        const expected = await toJson(page);
        const xml = await toXml(page);
        await page.evaluate((value) => {
            localStorage.setItem("wwwsqldesigner_databases_io-ui-legacy", value);
        }, xml);
        await loadFixture(page, readFixture("minimal"));

        expect(await clickIo(page, "clientlocalload", "io-ui-legacy")).toEqual([]);
        expect(await toJson(page)).toBe(expected);
    });
});

test.describe("読めない入力は開いている設計を壊さない", () => {
    test("空の textarea", async () => {
        const before = await toJson(page);
        await setIoTextarea(page, "   \n ");

        expect(await clickIo(page, "clientload")).toHaveLength(1);
        expect(await toJson(page)).toBe(before);
    });

    test("JSON でも XML でもない入力は parser に渡さない", async () => {
        const before = await toJson(page);
        await setIoTextarea(page, "CREATE TABLE foo ();");

        const alerts = await clickIo(page, "clientload");
        expect(alerts).toHaveLength(1);
        /* JSON parser の位置つきメッセージでも xmlerror でもない、専用の 1 本 */
        expect(alerts[0]).not.toContain("formatVersion");
        expect(await toJson(page)).toBe(before);
    });

    test("壊れた JSON は位置つきメッセージを出し、XML として読み直さない", async () => {
        const before = await toJson(page);
        await setIoTextarea(page, '{"formatVersion": 2, "db": ');

        const alerts = await clickIo(page, "clientload");
        expect(alerts).toHaveLength(1);
        /*
         * フォールバックがあると「JSON として壊れている」→「XML としても壊れている」と
         * たどって Null document に着地し、直せる位置の情報が消える（js/io/detect.ts）。
         */
        expect(alerts[0]).not.toContain("Null document");
        expect(await toJson(page)).toBe(before);
    });

    test("db 不一致は両方の db 名と導線を出して拒む", async () => {
        const before = await toJson(page);
        const design = JSON.parse(before);
        design.db = "mysql";
        await setIoTextarea(page, JSON.stringify(design));

        const alerts = await clickIo(page, "clientload");
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toContain("mysql");
        expect(alerts[0]).toContain(SERIALIZER_DB);
        /* 「拒む」だけで終わらせず、ユーザーが取れる行動を書く（段階4-3b の決定） */
        expect(alerts[0]).toContain("Options");

        expect(await toJson(page)).toBe(before);
    });
});

test.describe("XML が残る場所", () => {
    test("clientsql は UI 経由でも DDL golden と一致する", async () => {
        /*
         * ここだけ Designer.toXML() が生き残る（output.xsl への入力）。ddl.spec.ts は
         * ハーネスが finish() を模しているので、実経路（ボタン -> OZ.Request -> XSLT）を
         * 通す DDL はこの 1 本だけになる。
         */
        expect(await clickIo(page, "clientsql")).toEqual([]);

        await expect
            .poll(() => ioTextarea(page), { timeout: 10_000 })
            .not.toBe("");
        /* golden は末尾改行を持たない（finish() が .trim() した値をそのまま採ったもの） */
        expect(await ioTextarea(page)).toBe(
            readGolden(goldenPath("ddl", SERIALIZER_DB, "house-defaults.sql")),
        );
    });
});

test.describe("撤去したものが戻っていない", () => {
    test("Dropbox のボタンと XML/TXT ダウンロードが index.html から消えている", async () => {
        /*
         * io の container はコンストラクタで DOM から外れているので getElementById では
         * 拾えない（ダイアログを開くまで document に居ない）。container 越しに見る。
         */
        const ids = await page.evaluate(() =>
            [
                "dropboxsave",
                "dropboxload",
                "dropboxlist",
                "clientdownloadxml",
                "clientdownloadtxt",
            ].filter(
                (id) => window.d!.io.dom.container.querySelector(`#${id}`) !== null,
            ),
        );
        expect(ids).toEqual([]);

        /* 統合後の 1 本は実在する */
        expect(
            await page.evaluate(
                () =>
                    window.d!.io.dom.container.querySelector("#clientdownload") !== null,
            ),
        ).toBe(true);
    });
});
