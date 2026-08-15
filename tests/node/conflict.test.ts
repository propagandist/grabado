import { describe, expect, test } from "vitest";
import { verdictForSave, type Baseline } from "../../js/io/conflict.ts";

/*
 * 保存前の判定の検査（HANDOVER §4 段階4-6）。
 *
 * ハーネスを使わない —— verdictForSave() は js/ のどこにも依存しない純関数（tests/node/ では
 * detect.test.ts と同じ立場）。UI（confirm を出すか）と通信（プリフライトを投げるか）は
 * js/io.ts の仕事で、ここが押さえるのは**どちらに倒すかの決定**だけ。
 */

const BASE: Baseline = { name: "orders.json", text: '{"formatVersion": 2}\n' };

describe("保存前の判定（段階4-6）", () => {
    test("サーバに無ければ absent（新規保存。失うものが無い）", () => {
        expect(
            verdictForSave(null, "orders.json", { status: 404, text: null }),
        ).toBe("absent");
    });

    test("派生元があってもサーバから消えていれば absent", () => {
        /* 外部で削除された場合。save し直すのは復元であって上書きではない */
        expect(
            verdictForSave(BASE, "orders.json", { status: 404, text: null }),
        ).toBe("absent");
    });

    test("観測した版と一致すれば clean", () => {
        expect(
            verdictForSave(BASE, "orders.json", { status: 200, text: BASE.text }),
        ).toBe("clean");
    });

    test("観測した後に変わっていれば conflict（本機能の主眼）", () => {
        expect(
            verdictForSave(BASE, "orders.json", {
                status: 200,
                text: '{"formatVersion": 2, "tables": []}\n',
            }),
        ).toBe("conflict");
    });

    test("末尾の改行 1 つの違いでも conflict（バイト列で比べる）", () => {
        expect(
            verdictForSave(BASE, "orders.json", {
                status: 200,
                text: BASE.text.trimEnd(),
            }),
        ).toBe("conflict");
    });

    test("派生元が無いのに実体があれば exists", () => {
        expect(
            verdictForSave(null, "orders.json", { status: 200, text: BASE.text }),
        ).toBe("exists");
    });

    test("別名へ保存するなら中身が同じでも exists", () => {
        /* baseline は「今開いているファイル」の記録で、別の名前について何も言っていない */
        expect(
            verdictForSave(BASE, "invoices.json", { status: 200, text: BASE.text }),
        ).toBe("exists");
    });

    test("200 で本文が無ければ空文字として比べる", () => {
        expect(
            verdictForSave({ name: "orders.json", text: "" }, "orders.json", {
                status: 200,
                text: null,
            }),
        ).toBe("clean");
    });

    test("404 以外は「実体あり」に倒す（安全側）", () => {
        /*
         * 500 / 501 / 503 は js/io.ts が check() で先に落とす契約なのでここには来ないが、
         * 来たときに「無いものとして上書き」へ倒れないことを固定しておく。
         */
        expect(
            verdictForSave(BASE, "orders.json", { status: 500, text: null }),
        ).toBe("conflict");
    });
});
