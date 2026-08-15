import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { createHarness, type NodeHarness } from "./harness.ts";

/*
 * UI 層（js/io.ts）の保存/読込経路の検査。HANDOVER §4 段階4-3b。
 *
 * **golden はここを 1 ビットも押さえない。** golden は Designer のファサード
 * （toXML / toJson / fromXML / fromJson）経由で採るので js/io.ts を通らず、
 * 「UI が JSON に切り替わったこと」は golden 不変と両立してしまう。だから 4-3b の
 * 完了判定は「golden 85 本が無差分」＋「本ファイルと tests/browser/io-ui.spec.ts」の
 * 2 本立てになる。
 *
 * こちら（Node）が担うのは **server 経路の契約**（URL / Content-type / body / 応答の
 * 解釈指定）。OZ.Request が全通信の唯一の入口なので、ハーネスの差し替え先で記録するだけで
 * 固定できる。ブラウザでしか見られないもの（download の suggestedFilename、
 * localStorage、DDL 生成）は tests/browser/io-ui.spec.ts の担当。
 */

describe("UI の保存/読込経路（Node / jsdom）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
    });

    afterAll(() => {
        h.close();
    });

    beforeEach(() => {
        h.useDatatypes(SERIALIZER_DB);
        h.loadFixture(readFixture("house-defaults"));
        h.takeAlerts();
        h.takeRequests();
    });

    describe("serversave", () => {
        test("keyword に .json が付き、Content-type と body が JSON になる", () => {
            const expected = h.toJson();
            h.io.serversave(undefined, "orders");

            const reqs = h.takeRequests();
            expect(reqs).toHaveLength(1);
            const req = reqs[0]!;
            expect(req.url).toBe(
                "backend/php-mysql/?action=save&keyword=orders.json",
            );
            expect(req.method).toBe("post");
            expect(req.contentType).toBe("application/json");
            /* body は serializer の出力とバイト一致（UI が別経路で組み直していない） */
            expect(req.data).toBe(expected);
        });

        test(".json 付きの名前を渡しても二重にならない", () => {
            /* serverlist が返すのは backend 上のファイル名なので .json 付き。
               それをそのまま prompt に貼っても壊れないことが jsonKeyword() の要件 */
            h.io.serversave(undefined, "orders.json");

            const url = h.takeRequests()[0]!.url;
            expect(url).toContain("keyword=orders.json");
            expect(url).not.toContain("orders.json.json");
        });

        test("大文字の拡張子も二重付与しない", () => {
            h.io.serversave(undefined, "Orders.JSON");

            expect(h.takeRequests()[0]!.url).toContain("keyword=Orders.JSON");
        });

        test("設計の名前（タイトル）には .json を付けない", () => {
            h.io.serversave(undefined, "orders");

            /* .json はファイル名の都合で、設計の名前ではない */
            expect(h.window.document.title).toContain("orders");
            expect(h.window.document.title).not.toContain("orders.json");
        });
    });

    describe("serverload", () => {
        test("keyword に .json が付き、応答をテキストで受ける", () => {
            h.io.serverload(false, "orders");

            const reqs = h.takeRequests();
            expect(reqs).toHaveLength(1);
            const req = reqs[0]!;
            expect(req.url).toBe(
                "backend/php-mysql/?action=load&keyword=orders.json",
            );
            /*
             * xml: true を外したのが 4-3b の実体。付いたままだと OZ.Request が
             * 応答を DOM にしてしまい、JSON が読めない（loadDesignText はテキストを取る）。
             */
            expect(req.xml).toBeFalsy();
        });
    });

    describe("serverimport（据え置き）", () => {
        test("introspection は XML のままで、keyword の .json も付かない", () => {
            /*
             * ここが受けるのは「保存した設計」ではなく backend が information_schema から
             * 組み立てた XML。JSON 化は backend を Kotlin に移す HANDOVER §5.2 の仕事で、
             * フロントだけ先に JSON を期待させると現行 backend との契約が切れる。
             */
            h.window.prompt = () => "shop";
            h.io.serverimport();

            const reqs = h.takeRequests();
            expect(reqs).toHaveLength(1);
            const req = reqs[0]!;
            expect(req.url).toBe("backend/php-mysql/?action=import&database=shop");
            expect(req.xml).toBe(true);
        });
    });

    describe("loadDesignText", () => {
        test("設計 JSON を読む", () => {
            const source = h.toJson();
            h.loadFixture(readFixture("minimal"));

            h.io.loadDesignText(source);

            expect(h.takeAlerts()).toEqual([]);
            expect(h.toJson()).toBe(source);
        });

        test("設計 XML も読む（読込互換）", () => {
            const source = h.toJson();
            const xml = h.toXML();
            h.loadFixture(readFixture("minimal"));

            h.io.loadDesignText(xml);

            expect(h.takeAlerts()).toEqual([]);
            expect(h.toJson()).toBe(source);
        });

        test("空なら empty を出して何もしない", () => {
            const before = h.toJson();

            h.io.loadDesignText("   \n  ");

            expect(h.takeAlerts()).toHaveLength(1);
            expect(h.toJson()).toBe(before);
        });

        test("どちらの形式でもない入力は parser に渡さない", () => {
            const before = h.toJson();

            h.io.loadDesignText("CREATE TABLE foo ();");

            /* JSON parser の位置つきメッセージでも xmlerror でもない、専用の 1 本 */
            expect(h.takeAlerts()).toHaveLength(1);
            expect(h.toJson()).toBe(before);
        });

        test("壊れた JSON は alert で伝え、開いている設計を壊さない", () => {
            const before = h.toJson();

            h.io.loadDesignText('{"formatVersion": 2, "db": ');

            expect(h.takeAlerts()).toHaveLength(1);
            expect(h.toJson()).toBe(before);
        });

        test("db 不一致の alert にファイル側と実行中の db 名と導線が入る", () => {
            const design = JSON.parse(h.toJson());
            design.db = "mysql";

            h.io.loadDesignText(JSON.stringify(design));

            const alerts = h.takeAlerts();
            expect(alerts).toHaveLength(1);
            expect(alerts[0]).toContain("mysql");
            expect(alerts[0]).toContain(SERIALIZER_DB);
            /* 「拒む」だけで終わらせず、ユーザーが取れる行動を書く（段階4-3b の決定） */
            expect(alerts[0]).toContain("Options");
        });

        test("壊れた JSON を XML として読み直さない（フォールバックが無いこと）", () => {
            /*
             * ここが detect.ts の存在理由。フォールバックがあると、この入力は
             * 「JSON として壊れている」→「XML としても壊れている」とたどって
             * xmlerror の Null document に着地し、直せる位置の情報が消える。
             */
            h.io.loadDesignText("{ 壊れた JSON");

            const alerts = h.takeAlerts();
            expect(alerts).toHaveLength(1);
            expect(alerts[0]).not.toContain("Null document");
        });
    });

    describe("書き出し", () => {
        test("clientsave は textarea に JSON を入れる", () => {
            h.io.clientsave();

            const text = h.io.dom.ta.value;
            expect(JSON.parse(text).formatVersion).toBe(2);
            expect(text).toBe(h.toJson());
        });

        test("型パレットが読めていなければ書かずに alert する", () => {
            /*
             * serializer は「1 バイトも書かずに落ちる」契約（js/io/json-serializer.ts）。
             * UI 側もそれに合わせて textarea を空で上書きしない。
             */
            h.io.clientsave();
            const before = h.io.dom.ta.value;

            h.io.dom.ta.value = before;
            const palette = (h.io as unknown as { owner: { palette: { setRoot(e: unknown): void } } })
                .owner.palette;
            palette.setRoot(h.window.document.createElement("nothing"));

            h.io.clientsave();

            expect(h.takeAlerts()).toHaveLength(1);
            expect(h.io.dom.ta.value).toBe(before);

            /* 後始末（beforeEach が useDatatypes で戻すが、明示しておく） */
            h.useDatatypes(SERIALIZER_DB);
        });
    });
});
