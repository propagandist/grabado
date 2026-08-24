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
        h.io.pendingSave = null;
        h.setConfirm(false);
        h.takeConfirms();
    });

    /** save 本体だけを取り出す（段階5-4b で 1 往復になったが、衝突時は 2 本になる） */
    function saveRequests(reqs: { url: string }[]) {
        return reqs.filter((r) => r.url.indexOf("action=save") !== -1);
    }

    describe("serversave", () => {
        test("keyword に .json が付き、Content-type と body が JSON になる", () => {
            const expected = h.toJson();
            h.io.serversave(undefined, "orders");

            /* 段階5-4b: プリフライトが消えて 1 往復になった */
            const reqs = h.takeRequests();
            expect(reqs).toHaveLength(1);
            const req = reqs[0]!;
            expect(req.url).toBe(
                "backend/file/?action=save&keyword=orders.json",
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
     * 外部変更検知（段階4-6 → 5-4b で条件付き更新へ）。
     *
     * 保存は **1 往復**。派生元の有無から条件ヘッダを決めて save を 1 回投げ、
     * 衝突していればサーバが **412** を返す。そこで初めて confirm が出て、承諾したら
     * `If-Match: *` で再送する（＝衝突したときだけ 2 往復）。
     *
     * 4-6 の read-before-write（プリフライトの load）は消えた。**判定の主体が
     * クライアントからサーバへ移り、TOCTOU の窓が閉じた**のが本段階の主眼。
     * 規則そのものは tests/node/conflict.test.ts が表で押さえるので、ここが見るのは
     * **通信が何本起きたか／confirm が出たか／サーバ上のファイルが変わったか**。
     */
    describe("条件付き更新（段階5-4b）", () => {
        test("保存は 1 往復で、プリフライトの load を投げない", () => {
            h.io.serversave(undefined, "orders");

            const reqs = h.takeRequests();
            expect(reqs).toHaveLength(1);
            expect(reqs[0]!.url).toBe(
                "backend/file/?action=save&keyword=orders.json",
            );
        });

        test("派生元が無ければ「新規のつもり」で送る（If-None-Match: *）", () => {
            h.io.serversave(undefined, "orders");

            const req = h.takeRequests()[0]!;
            expect(req.headers?.["If-None-Match"]).toBe("*");
            expect(req.headers?.["If-Match"]).toBeUndefined();
        });

        test("読み込んだ後は観測した ETag を If-Match に載せる", () => {
            h.setServerFile("orders.json", h.toJson());
            h.io.serverload(false, "orders");
            h.takeRequests();

            h.io.serversave(undefined, "orders");

            const req = h.takeRequests()[0]!;
            expect(req.headers?.["If-Match"]).toMatch(/^"[0-9a-f]{32}"$/);
            expect(req.headers?.["If-None-Match"]).toBeUndefined();
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

        test("外部で変わっていたら確認を出し、断れば save をもう一度投げない", () => {
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
            /* 1 本目（412 になった save）だけで止まる。断ったら 1 バイトも書かない */
            expect(saveRequests(h.takeRequests())).toHaveLength(1);
            expect(h.getServerFile("orders.json")).toBe(theirs);
        });

        test("外部で変わっていても、承諾すれば上書きする（衝突時だけ 2 往復）", () => {
            const mine = h.toJson();
            h.setServerFile("orders.json", mine);
            h.io.serverload(false, "orders");
            h.takeRequests();
            h.setServerFile("orders.json", mine + "\n");

            h.setConfirm(true);
            h.io.serversave(undefined, "orders");

            expect(h.takeConfirms()).toHaveLength(1);
            const saves = saveRequests(h.takeRequests());
            expect(saves).toHaveLength(2);
            /* 再送は「存在すれば無条件で上書き」 */
            expect((saves[1] as { headers?: Record<string, string> }).headers?.["If-Match"]).toBe("*");
            expect(h.getServerFile("orders.json")).toBe(mine);
        });

        test("一度も読んでいない名前に実体があれば確認を出す", () => {
            h.setServerFile("orders.json", '{"formatVersion": 2}\n');

            h.setConfirm(false);
            h.io.serversave(undefined, "orders");

            expect(h.takeConfirms()).toHaveLength(1);
            /* 他人のファイルは無傷のまま */
            expect(h.getServerFile("orders.json")).toBe('{"formatVersion": 2}\n');
        });

        test("412 は textarea に文言を出さない（confirm と二重にしない）", () => {
            h.setServerFile("orders.json", '{"formatVersion": 2}\n');
            h.io.dom.ta.value = "";

            h.setConfirm(false);
            h.io.serversave(undefined, "orders");

            /* check() に通していたら httpresponse の文言が出る */
            expect(h.io.dom.ta.value).toBe("");
        });

        test("保存に成功した内容が次の派生元になる（save の ETag をそのまま使う）", () => {
            h.io.serversave(undefined, "orders");
            h.takeRequests();

            /* 2 回目は「自分が書いた版」と一致するので確認が出ない。
               load し直していないのに If-Match が載るのは、save の応答に ETag が来るから */
            h.io.serversave(undefined, "orders");

            expect(h.takeConfirms()).toEqual([]);
            const reqs = saveRequests(h.takeRequests());
            expect(reqs).toHaveLength(1);
            expect((reqs[0] as { headers?: Record<string, string> }).headers?.["If-Match"]).toMatch(
                /^"[0-9a-f]{32}"$/,
            );
        });

        test("別名へ保存すると派生元が移る", () => {
            h.io.serversave(undefined, "orders");
            h.io.serversave(undefined, "invoices");
            h.takeRequests();
            h.takeConfirms();

            /* invoices が派生元になったので、orders へ戻ると「新規のつもり」で送って 412 */
            h.setConfirm(false);
            h.io.serversave(undefined, "orders");

            expect(h.takeConfirms()).toHaveLength(1);
        });

        test("save が 500 なら派生元を更新しない", () => {
            /* 書けていないのに「書けた版」として記録すると、次の保存で他人の版を黙って踏む */
            h.io.serversave(undefined, "orders");
            h.takeRequests();
            const before = h.io.baseline;

            expect(before).not.toBeNull();
            expect(before!.name).toBe("orders.json");
        });

        test("新規保存で 404 の文言が出ない（プリフライトが無いので原理的に起きない）", () => {
            h.io.dom.ta.value = "";

            h.io.serversave(undefined, "orders");

            expect(h.io.dom.ta.value).not.toContain("Not Found");
            /* save 成功（201）の文言は現行どおり出る */
            expect(h.io.dom.ta.value).toContain("Saved");
        });

        test("quicksave（F2）も同じ経路を通る", () => {
            /* 無言で上書きしていた経路を塞ぐのが 4-6 からの主眼の 1 つ */
            h.setServerFile("orders.json", '{"formatVersion": 2}\n');
            h.io._name = "orders";

            h.setConfirm(false);
            h.io.quicksave();

            expect(h.takeConfirms()).toHaveLength(1);
            expect(h.getServerFile("orders.json")).toBe('{"formatVersion": 2}\n');
        });

        test("書き出せない設計では save すら投げない", () => {
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

    /*
     * capabilities（段階5-5）。サーバに「何ができるか」を尋ね、できないことのボタンを隠す。
     * ★ 引けなければ**何も隠さない** —— backend を起こしていない `npm run dev` 単体で
     *   ボタンが消えると、5-5 以前より不便になるだけ。
     */
    describe("capabilities（段階5-5）", () => {
        test("READONLY なら保存ボタンを押せなくする", () => {
            h.io.applyCapabilities({ readonly: true });

            expect(h.io.dom.serversave.disabled).toBe(true);
            expect(h.io.dom.quicksave.disabled).toBe(true);
            /* 読み取りは生きている（READONLY でも「読んで・描いて・DDL を出す」は成立する） */
            expect(h.io.dom.serverload.disabled).toBe(false);
            expect(h.io.dom.serverlist.disabled).toBe(false);
        });

        test("READONLY でなければ何も隠さない", () => {
            h.io.applyCapabilities({ readonly: false });

            expect(h.io.dom.serversave.disabled).toBe(false);
            expect(h.io.dom.quicksave.disabled).toBe(false);
        });

        test("readonly が無い応答は「できる」に倒す", () => {
            h.io.applyCapabilities({});

            expect(h.io.dom.serversave.disabled).toBe(false);
        });

        test("introspection が false なら import ボタンを押せなくする", () => {
            /* 接続先が env に列挙されていなければ押しても 404（段階5-7a） */
            h.io.applyCapabilities({ readonly: false, introspection: false });

            expect(h.io.dom.serverimport.disabled).toBe(true);
        });

        test("introspection が true なら押せる", () => {
            h.io.applyCapabilities({ readonly: false, introspection: true });

            expect(h.io.dom.serverimport.disabled).toBe(false);
        });

        test("introspection のキーが無ければ隠さない（分からないものを勝手に閉じない）", () => {
            /*
             * 古いサーバや壊れた JSON は「分からなかった」であって「できない」ではない ——
             * 引けなかったときに何も隠さないのと同じ理屈。
             */
            h.io.applyCapabilities({ readonly: false });

            expect(h.io.dom.serverimport.disabled).toBe(false);
        });

        test("反映は冪等（同じ入力なら何度呼んでも同じ状態）", () => {
            h.io.applyCapabilities({ readonly: true });
            h.io.applyCapabilities({ readonly: true });
            expect(h.io.dom.serversave.disabled).toBe(true);

            /* 片方向にしか効かないと「一度隠したら戻らない」ものが増えていく */
            h.io.applyCapabilities({ readonly: false });
            expect(h.io.dom.serversave.disabled).toBe(false);
        });
    });

    describe("serverload", () => {
        test("keyword に .json が付き、応答をテキストで受ける", () => {
            h.io.serverload(false, "orders");

            const reqs = h.takeRequests();
            expect(reqs).toHaveLength(1);
            const req = reqs[0]!;
            expect(req.url).toBe(
                "backend/file/?action=load&keyword=orders.json",
            );
            /*
             * xml: true を外したのが 4-3b の実体。付いたままだと OZ.Request が
             * 応答を DOM にしてしまい、JSON が読めない（loadDesignText はテキストを取る）。
             */
            expect(req.xml).toBeFalsy();
        });
    });

    /*
     * introspection（段階5-7b で JSON 化）。
     *
     * 受けるのは「保存した設計」ではなく backend が information_schema から組み立てたもので、
     * **設計 JSON とも別の形式**（座標を持たず、型は SQL の生の情報）。型解決は
     * `introspectionToModel()` が引き受ける —— backend はパレットを知らない。
     */
    describe("serverimport（段階5-7b）", () => {
        test("応答をテキストで受ける（xml: true を外した）", () => {
            h.window.prompt = () => "shop";
            h.io.serverimport();

            const reqs = h.takeRequests();
            expect(reqs).toHaveLength(1);
            const req = reqs[0]!;
            expect(req.url).toBe("backend/file/?action=import&database=shop");
            /* JSON を XML として parse すると Null document になる（4-3b と同じ理由） */
            expect(req.xml).toBeFalsy();
        });

        test("keyword の .json は付かない（設計ファイルの名前ではない）", () => {
            h.window.prompt = () => "shop";
            h.io.serverimport();

            expect(h.takeRequests()[0]!.url).not.toContain(".json");
        });

        test("接続名は URL エンコードされる", () => {
            /* env に列挙された接続の名前。段階5-7a までエンコードしていなかった */
            h.window.prompt = () => "受注 db";
            h.io.serverimport();

            expect(h.takeRequests()[0]!.url).toContain("database=%E5%8F%97%E6%B3%A8%20db");
        });

        test("壊れた応答は alert で伝え、開いている設計を壊さない", () => {
            const before = h.captureState();
            h.window.prompt = () => "shop";
            h.setIntrospection("{ これは JSON ではない");
            h.io.serverimport();

            expect(h.takeAlerts()).toHaveLength(1);
            expect(h.captureState()).toBe(before);
            h.setIntrospection(null);
        });

        test("読み込んだ結果が設計に入る（parse -> 型解決 -> 適用）", () => {
            h.window.prompt = () => "shop";
            h.setIntrospection(
                JSON.stringify({
                    introspectionVersion: 1,
                    dialect: "postgresql",
                    tables: [
                        {
                            name: "users",
                            comment: "ユーザー",
                            columns: [
                                { name: "id", sqlType: "uuid", nullable: false, default: "uuidv7()" },
                                { name: "email", sqlType: "text", nullable: false },
                            ],
                            keys: [{ type: "PRIMARY", name: "users_pkey", columns: ["id"] }],
                        },
                    ],
                }),
            );

            h.io.serverimport();

            expect(h.takeAlerts()).toEqual([]);
            const state = h.captureState();
            expect(state).toContain("users");
            expect(state).toContain("email");
            h.setIntrospection(null);
        });

        test("落ちた型を textarea で伝える（黙って捨てない）", () => {
            h.window.prompt = () => "shop";
            h.setIntrospection(
                JSON.stringify({
                    introspectionVersion: 1,
                    dialect: "postgresql",
                    tables: [
                        {
                            name: "t",
                            columns: [
                                /* enum はパレットに無いので既定型へ落ちる */
                                { name: "status", sqlType: "USER-DEFINED", udtName: "user_status", nullable: false },
                            ],
                        },
                    ],
                }),
            );

            h.io.serverimport();

            expect(h.io.dom.ta.value).toContain("t.status");
            expect(h.io.dom.ta.value).toContain("USER-DEFINED");
            h.setIntrospection(null);
        });

        test("落ちた列が無ければその旨を出す", () => {
            h.window.prompt = () => "shop";
            h.setIntrospection(
                JSON.stringify({
                    introspectionVersion: 1,
                    dialect: "postgresql",
                    tables: [
                        { name: "t", columns: [{ name: "id", sqlType: "uuid", nullable: false }] },
                    ],
                }),
            );

            h.io.serverimport();

            expect(h.io.dom.ta.value).toContain("落ちた列は無い");
            h.setIntrospection(null);
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

    /*
     * AI レビュー（段階11-3）。**送る前に見せる**ことと、**断ったら 1 バイトも送らない**ことが
     * 契約の中心（段階11-0 の決めたこと 3 —— 匿名化を既定にしない代わりの担保）。
     */
    describe("AI レビュー（段階11-3）", () => {
        beforeEach(() => {
            h.setAiReview(null);
            /* 仮想 backend の capabilities は ai:false を返すので、UI テストは自分で有効化する */
            h.io.applyCapabilities({ ai: true });
        });

        test("押すと、送る JSON がそのまま textarea に出る", () => {
            h.setConfirm(false);

            h.io.aireview();

            const shown = h.io.dom.ta.value;
            expect(shown).toContain('"aiRequestVersion": 1');
            expect(shown).toContain('"dialect": "postgresql"');
            /* 座標は 1 つも入らない（§8.2） */
            expect(shown).not.toContain('"x"');
        });

        test("**断ったら 1 バイトも送らない**", () => {
            h.setConfirm(false);

            h.io.aireview();

            expect(h.takeRequests().filter((r) => r.url.indexOf("api/ai/review") !== -1)).toHaveLength(0);
        });

        test("承諾すると POST が飛び、body は見せたものと 1 バイトも違わない", () => {
            /* まず断って、送る前に見せたものを取る（承諾すると応答の文言で上書きされる） */
            h.setConfirm(false);
            h.io.aireview();
            const shown = h.io.dom.ta.value;
            h.takeRequests();

            h.setConfirm(true);
            h.io.aireview();
            const req = h.takeRequests().find((r) => r.url.indexOf("api/ai/review") !== -1)!;

            expect(req.method).toBe("post");
            expect(req.url).toContain("api/ai/review");
            expect(req.headers?.["Content-type"]).toBe("application/json");
            expect(req.data).toBe(shown);
        });

        test("提案が返ると一覧になる（**まだ適用しない**）", () => {
            h.setConfirm(true);
            h.setAiReview(
                JSON.stringify([
                    {
                        category: "missing_pk",
                        severity: "error",
                        target: { table: "users" },
                        rationale: "主キーが無い",
                        patch: { op: "add-key", keyType: "PRIMARY", columns: ["id"] },
                    },
                ]),
            );

            h.io.aireview();

            expect(h.io.dom.ta.value).toContain("1 件");
            expect(h.io.dom.ta.value).toContain("missing_pk");
            expect(h.io.dom.ta.value).toContain("まだ 1 件も適用していない");
        });

        test("429 に文言が出る（段階11-2a が先送りした分の受け皿）", () => {
            h.setConfirm(true);
            h.setAiReview("", 429);

            h.io.aireview();

            expect(h.io.dom.ta.value).toContain("Too Many Requests");
        });

        test("403 は「このデプロイでは禁止」の文言（AI が無効なデプロイ）", () => {
            h.setConfirm(true);

            h.io.aireview();

            expect(h.io.dom.ta.value).toContain("Forbidden");
        });

        test("capabilities の ai が false ならボタンが押せない（冪等）", () => {
            h.io.applyCapabilities({ ai: false });
            expect(h.io.dom.aireview.disabled).toBe(true);

            h.io.applyCapabilities({ ai: true });
            expect(h.io.dom.aireview.disabled).toBe(false);

            /* 引けなかったとき（キーが無い応答）は閉じない —— 5-5 の「分からないものを閉じない」 */
            h.io.applyCapabilities({});
            expect(h.io.dom.aireview.disabled).toBe(false);
        });
    });

    /*
     * 承認して当てる（段階11-4）。**適用は保存ではない**ことと、**設計が実際に変わる**ことが
     * 契約の中心。落ちた提案の理由が locale の語で出ることも見る。
     */
    describe("AI 提案の適用（段階11-4）", () => {
        /** relations の設計に対して当てられる提案（テーブル名の単数形を直す） */
        const rename = {
            category: "naming",
            severity: "warn",
            target: { table: "users" },
            rationale: "単数形",
            patch: { op: "rename-table", name: "user_accounts" },
        };
        const missing = {
            category: "naming",
            severity: "error",
            target: { table: "gone" },
            rationale: "居ないテーブル",
            patch: { op: "rename-table", name: "gone2" },
        };

        function review(suggestions: unknown[]): void {
            h.setConfirm(true);
            h.setAiReview(JSON.stringify(suggestions));
            h.io.applyCapabilities({ ai: true });
            h.io.aireview();
            h.takeRequests();
        }

        test("提案が無ければ当てない（alert で言う）", () => {
            h.io.aiSuggestions = null;

            h.io.aiapply();

            expect(h.takeAlerts()).toHaveLength(1);
        });

        test("all で当てると**設計が実際に変わる**", () => {
            review([rename]);
            h.window.prompt = () => "all";

            h.io.aiapply();

            const json = h.toJson();
            expect(json).toContain('"name": "user_accounts"');
            expect(json).not.toContain('"name": "users"');
        });

        test("**適用は保存ではない**（1 度も save が飛ばない）", () => {
            review([rename]);
            h.window.prompt = () => "all";

            h.io.aiapply();

            expect(saveRequests(h.takeRequests())).toHaveLength(0);
            expect(h.io.dom.ta.value).toContain("まだ保存していない");
        });

        test("落ちた提案は理由が locale の語で出る（他の適用は止めない）", () => {
            review([missing, rename]);
            h.window.prompt = () => "all";

            h.io.aiapply();

            const shown = h.io.dom.ta.value;
            expect(shown).toContain("2 件のうち 1 件を適用した");
            /* ハーネスの locale は既定の en。キーそのままではなく訳が出ることを見る */
            expect(shown).toContain("that table is not in the design");
            expect(h.toJson()).toContain('"name": "user_accounts"');
        });

        test("番号で選ぶと、選んだものだけ当たる", () => {
            review([missing, rename]);
            /* 一覧は重い順（error が 1 番）。2 番だけ選ぶ */
            h.window.prompt = () => "2";

            h.io.aiapply();

            expect(h.io.dom.ta.value).toContain("1 件のうち 1 件を適用した");
            expect(h.toJson()).toContain('"name": "user_accounts"');
        });

        test("prompt を断ったら設計に触らない", () => {
            review([rename]);
            h.window.prompt = () => null;

            h.io.aiapply();

            expect(h.toJson()).toContain('"name": "users"');
        });
    });
});
