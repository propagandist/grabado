import { describe, expect, test } from "vitest";
import {
    etagFromHeaders,
    preconditionFor,
    verdictAfterConflict,
    type Baseline,
} from "../../frontend/js/io/conflict.ts";

/*
 * 条件付き更新の規則（HANDOVER §4 段階4-6 → §5 段階5-4b）。
 *
 * ハーネスを使わない —— どれも js/ のどこにも依存しない純関数（tests/node/ では
 * detect.test.ts と同じ立場）。UI（confirm を出すか）と通信（ヘッダを載せるか）は
 * js/io.ts の仕事で、ここが押さえるのは**どちらに倒すかの決定**だけ。
 *
 * ★ 段階4-6 の verdictForSave()（プリフライトの応答とバイト列を比べる 9 本）は消えた。
 *   **判定の主体がクライアントからサーバへ移った**ため —— 一致 / 不一致を決めるのは
 *   backend の If-Match 評価で、クライアントに残るのは「412 を受けたときに何と言うか」
 *   と「次の save に何を載せるか」の 2 つだけ。テストが減ったのはカバレッジが落ちたのではなく、
 *   **守るべき規則そのものが小さくなった**から（TOCTOU の窓も同時に閉じている）。
 */

const BASE: Baseline = { name: "orders.json", etag: '"abc123"' };

describe("412 を受けたときの分岐（段階5-4b）", () => {
    test("観測した版があれば conflict（本機能の主眼）", () => {
        expect(verdictAfterConflict(BASE, "orders.json")).toBe("conflict");
    });

    test("派生元が無いのに実体があれば exists", () => {
        expect(verdictAfterConflict(null, "orders.json")).toBe("exists");
    });

    test("別名へ保存するなら exists", () => {
        /* baseline は「今開いているファイル」の記録で、別の名前について何も言っていない */
        expect(verdictAfterConflict(BASE, "invoices.json")).toBe("exists");
    });
});

describe("保存に載せる条件ヘッダ（段階5-4b）", () => {
    test("観測した版があれば If-Match にその ETag を載せる", () => {
        expect(preconditionFor(BASE, "orders.json")).toEqual({ ifMatch: '"abc123"' });
    });

    test("派生元が無ければ「新規のつもり」＝ If-None-Match: *", () => {
        expect(preconditionFor(null, "orders.json")).toEqual({ ifNoneMatch: "*" });
    });

    test("別名へ保存するときも「新規のつもり」", () => {
        /* 実在すればサーバが 412 を返し、exists の confirm に流れる */
        expect(preconditionFor(BASE, "invoices.json")).toEqual({ ifNoneMatch: "*" });
    });

    test("どちらか一方だけが立つ（両方載せると意味が衝突する）", () => {
        for (const precondition of [preconditionFor(BASE, "orders.json"), preconditionFor(null, "x.json")]) {
            const keys = Object.keys(precondition);
            expect(keys).toHaveLength(1);
        }
    });
});

describe("応答ヘッダからの ETag 取り出し（段階5-4b）", () => {
    test("大小を無視して読む", () => {
        /*
         * XMLHttpRequest.getAllResponseHeaders() はヘッダ名を小文字化して返す（仕様）。
         * テストの仮想 backend や将来の実装が元の大小のまま渡すこともあるので、どちらでも読む。
         */
        expect(etagFromHeaders({ etag: '"a"' })).toBe('"a"');
        expect(etagFromHeaders({ ETag: '"a"' })).toBe('"a"');
        expect(etagFromHeaders({ "ETAG": '"a"' })).toBe('"a"');
    });

    test("無ければ null", () => {
        expect(etagFromHeaders({ "content-type": "application/json" })).toBeNull();
        expect(etagFromHeaders({})).toBeNull();
        expect(etagFromHeaders(undefined)).toBeNull();
    });

    test("空文字は null に倒す（条件ヘッダに載せられない値なので）", () => {
        expect(etagFromHeaders({ etag: "" })).toBeNull();
    });
});
