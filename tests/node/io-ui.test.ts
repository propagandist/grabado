import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { createHarness, type NodeHarness } from "./harness.ts";

/*
 * UI 層（js/io.ts）の保存/読込経路の検査。HANDOVER §4 段階4-3b。
 *
 * **golden はここを 1 ビットも押さえない。** golden は Designer のファサード
 * （toDdl / toJson / fromXML / fromJson）経由で採るので js/io.ts を通らず、
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
        h.loadFixture(readFixture(SERIALIZER_DB, "house-defaults"));
        h.takeAlerts();
        h.takeRequests();
        /* 段階4-6: 仮想 backend・派生元の記録・confirm の答えを初期化する */
        h.clearServerFiles();
        h.io.baseline = null;
        h.io.pendingBaseline = null;
        h.setConfirm(false);
        h.takeConfirms();
    });

    /** save 本体だけを取り出す（段階4-6 でプリフライトの load が前に付いた） */
    function saveRequests(reqs: { url: string }[]) {
        return reqs.filter((r) => r.url.indexOf("action=save") !== -1);
    }

    describe("serversave", () => {
        test("keyword に .json が付き、Content-type と body が JSON になる", () => {
            const expected = h.toJson();
            h.io.serversave(undefined, "orders");

            /* 段階4-6: 1 本目はプリフライトの load。契約を見るのは 2 本目の save */
            const reqs = h.takeRequests();
            expect(reqs).toHaveLength(2);
            const req = reqs[1]!;
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

            /* プリフライトと save の両方が同じファイル名を指す */
            for (const req of h.takeRequests()) {
                expect(req.url).toContain("keyword=orders.json");
                expect(req.url).not.toContain("orders.json.json");
            }
        });

        test("大文字の拡張子も二重付与しない", () => {
            h.io.serversave(undefined, "Orders.JSON");

            for (const req of h.takeRequests()) {
                expect(req.url).toContain("keyword=Orders.JSON");
            }
        });

        test("設計の名前（タイトル）には .json を付けない", () => {
            h.io.serversave(undefined, "orders");

            /* .json はファイル名の都合で、設計の名前ではない */
            expect(h.window.document.title).toContain("orders");
            expect(h.window.document.title).not.toContain("orders.json");
        });
    });

    /*
     * 外部変更検知（段階4-6）。保存は read-before-write —— save の前に同じ keyword で
     * load を投げ、返ったバイト列を「自分が最後に観測した版」と比べる。判定そのものは
     * tests/node/conflict.test.ts が表で押さえるので、ここが見るのは
     * **通信が起きたか／confirm が出たか／サーバ上のファイルが変わったか**。
     */
    describe("外部変更検知（段階4-6）", () => {
        test("save の前にプリフライトの load を投げる", () => {
            h.io.serversave(undefined, "orders");

            const reqs = h.takeRequests();
            expect(reqs).toHaveLength(2);
            expect(reqs[0]!.url).toBe(
                "backend/php-mysql/?action=load&keyword=orders.json",
            );
            /* 応答はテキストで受ける（xml: true だと JSON が読めない。段階4-3b と同じ理由） */
            expect(reqs[0]!.xml).toBeFalsy();
            expect(reqs[1]!.url).toContain("action=save");
        });

        test("サーバに無ければ確認を出さずに保存する", () => {
            const expected = h.toJson();

            h.io.serversave(undefined, "orders");

            expect(h.takeConfirms()).toEqual([]);
            expect(h.getServerFile("orders.json")).toBe(expected);
        });

        test("読み込んだ後の保存は確認を出さずに通る", () => {
            /* サーバ上の版を読む -> 派生元が載る -> 同じ名前へ保存 */
            h.setServerFile("orders.json", h.toJson());
            h.io.serverload(false, "orders");
            h.takeRequests();

            h.io.serversave(undefined, "orders");

            expect(h.takeAlerts()).toEqual([]);
            expect(h.takeConfirms()).toEqual([]);
            expect(saveRequests(h.takeRequests())).toHaveLength(1);
        });

        test("外部で変わっていたら確認を出し、断れば save を投げない", () => {
            const mine = h.toJson();
            h.setServerFile("orders.json", mine);
            h.io.serverload(false, "orders");
            h.takeRequests();

            /* app の外でファイルが変わった（= git pull） */
            const theirs = mine + "\n";
            h.setServerFile("orders.json", theirs);

            h.setConfirm(false);
            h.io.serversave(undefined, "orders");

            const confirms = h.takeConfirms();
            expect(confirms).toHaveLength(1);
            /* どのファイルの話かが出る */
            expect(confirms[0]).toContain("orders.json");
            /* 断ったら 1 バイトも書かない */
            expect(saveRequests(h.takeRequests())).toHaveLength(0);
            expect(h.getServerFile("orders.json")).toBe(theirs);
        });

        test("外部で変わっていても、承諾すれば上書きする", () => {
            const mine = h.toJson();
            h.setServerFile("orders.json", mine);
            h.io.serverload(false, "orders");
            h.takeRequests();
            h.setServerFile("orders.json", mine + "\n");

            h.setConfirm(true);
            h.io.serversave(undefined, "orders");

            expect(h.takeConfirms()).toHaveLength(1);
            expect(saveRequests(h.takeRequests())).toHaveLength(1);
            expect(h.getServerFile("orders.json")).toBe(mine);
        });

        test("一度も読んでいない名前に実体があれば確認を出す", () => {
            h.setServerFile("orders.json", '{"formatVersion": 2}\n');

            h.setConfirm(false);
            h.io.serversave(undefined, "orders");

            expect(h.takeConfirms()).toHaveLength(1);
            expect(saveRequests(h.takeRequests())).toHaveLength(0);
            /* 他人のファイルは無傷のまま */
            expect(h.getServerFile("orders.json")).toBe('{"formatVersion": 2}\n');
        });

        test("保存に成功した内容が次の派生元になる", () => {
            h.io.serversave(undefined, "orders");
            h.takeRequests();

            /* 2 回目は「自分が書いた版」と一致するので確認が出ない */
            h.io.serversave(undefined, "orders");

            expect(h.takeConfirms()).toEqual([]);
            expect(saveRequests(h.takeRequests())).toHaveLength(1);
        });

        test("別名へ保存すると派生元が移る", () => {
            h.io.serversave(undefined, "orders");
            h.io.serversave(undefined, "invoices");
            h.takeRequests();
            h.takeConfirms();

            /* invoices が派生元になったので、orders へ戻ると確認が出る */
            h.io.serversave(undefined, "orders");

            expect(h.takeConfirms()).toHaveLength(1);
            expect(saveRequests(h.takeRequests())).toHaveLength(0);
        });

        test("プリフライトが 500 なら保存しない", () => {
            h.setServerFile("orders.json", '{"formatVersion": 2}\n');
            h.failNextLoad(500);

            h.io.serversave(undefined, "orders");

            /* 読めなかったので「上書きしますか」も聞かない（聞く材料が無い） */
            expect(h.takeConfirms()).toEqual([]);
            expect(saveRequests(h.takeRequests())).toHaveLength(0);
            /* 現行どおり check() が textarea に出す（locale/en.xml の http500） */
            expect(h.io.dom.ta.value).toContain("Internal Server Error");
        });

        test("プリフライトの 404 を「読み込み失敗」として表示しない", () => {
            /* 新規保存は正常系。Not Found が出ると保存に失敗したように見える */
            h.io.dom.ta.value = "";

            h.io.serversave(undefined, "orders");

            expect(h.io.dom.ta.value).not.toContain("Not Found");
            /* save 成功（201）の文言は現行どおり出る */
            expect(h.io.dom.ta.value).toContain("Saved");
        });

        test("quicksave（F2）も同じ経路を通る", () => {
            /* 無言で上書きしていた経路を塞ぐのが本段階の主眼の 1 つ */
            h.setServerFile("orders.json", '{"formatVersion": 2}\n');
            h.io._name = "orders";

            h.setConfirm(false);
            h.io.quicksave();

            expect(h.takeConfirms()).toHaveLength(1);
            expect(saveRequests(h.takeRequests())).toHaveLength(0);
        });

        test("書き出せない設計ではプリフライトすら投げない", () => {
            /* serializer が落ちる状態（型パレット未取得）。通信の前に止まる */
            const palette = (h.io as unknown as {
                owner: { palette: { setRoot(e: unknown): void; element(): unknown } };
            }).owner.palette;
            const loaded = palette.element();
            palette.setRoot(h.window.document.createElement("nothing"));

            h.io.serversave(undefined, "orders");

            expect(h.takeAlerts()).toHaveLength(1);
            expect(h.takeRequests()).toEqual([]);

            /* 後始末に useDatatypes を使わない理由は同ファイル末尾の同型のテストに書いてある */
            palette.setRoot(loaded);
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
            h.loadFixture(readFixture(SERIALIZER_DB, "minimal"));

            h.io.loadDesignText(source);

            expect(h.takeAlerts()).toEqual([]);
            expect(h.toJson()).toBe(source);
        });

        test("設計 XML も読む（読込互換）", () => {
            /*
             * 段階6-5a まで入力の XML を h.toXML()（＝ grabado 自身の書き出し）から
             * 作っていた。XML の書き出しが消えたので fixture をそのまま食わせる
             * （tests/fixtures/ は手書きの upstream 互換 XML）。
             */
            const xml = readFixture(SERIALIZER_DB, "house-defaults");
            h.loadFixture(xml);
            const source = h.toJson();
            h.loadFixture(readFixture(SERIALIZER_DB, "minimal"));

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
            const palette = (h.io as unknown as {
                owner: { palette: { setRoot(e: unknown): void; element(): unknown } };
            }).owner.palette;
            const loaded = palette.element();
            palette.setRoot(h.window.document.createElement("nothing"));

            h.io.clientsave();

            expect(h.takeAlerts()).toHaveLength(1);
            expect(h.io.dom.ta.value).toBe(before);

            /*
             * 後始末は **useDatatypes を通さず元の要素に戻す**（段階6-8d）。useDatatypes は
             * 「空にしてから差し替える」契約になったので、型を 1 つも持たないこのパレットを
             * 入れたまま呼ぶと clearTables() -> Row.getColor が範囲外の型添字を引いて落ちる。
             * ここは壊れたパレットを**わざと**入れている唯一のテストで、実アプリには無い状態。
             */
            palette.setRoot(loaded);
        });
    });
});
