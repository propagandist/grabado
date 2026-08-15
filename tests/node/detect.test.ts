import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { detectDesignFormat } from "../../js/io/detect.ts";
import { FIXTURES, GOLDEN_DIR, readFixture } from "../support/fixtures.ts";

/*
 * 形式判別の検査（HANDOVER §4 段階4-3b）。
 *
 * ハーネスを使わない —— detectDesignFormat() は js/ のどこにも依存しない純関数なので、
 * 直接 import して呼べる（バンドルを経由しないのは tests/node/ でここだけ。他は
 * window に触るので harness が要る）。
 *
 * ここが押さえているのは「行き先が決まること」だけ。中身が妥当かは parser の仕事で、
 * 壊れた JSON が "json" に落ちるのは**意図した設計**（js/io/detect.ts の冒頭）。
 */

describe("形式判別（段階4-3b）", () => {
    test("設計 JSON は json", () => {
        expect(detectDesignFormat('{"formatVersion": 2}')).toBe("json");
    });

    test("設計 XML は xml", () => {
        expect(detectDesignFormat('<?xml version="1.0" ?>\n<sql>\n</sql>\n')).toBe(
            "xml",
        );
    });

    test("空文字列は empty", () => {
        expect(detectDesignFormat("")).toBe("empty");
    });

    test("空白と改行だけは empty", () => {
        expect(detectDesignFormat("  \r\n\t \n")).toBe("empty");
    });

    test("先行する空白・改行は飛ばす", () => {
        expect(detectDesignFormat("\n\n   {}")).toBe("json");
        expect(detectDesignFormat("  \t<sql/>")).toBe("xml");
    });

    test("BOM は飛ばす", () => {
        /*
         * ECMAScript の WhiteSpace は U+FEFF を含むので trim() で落ちる。この依存が
         * 崩れると BOM 付きファイル（Windows のエディタが付ける）が unknown に落ちる。
         */
        expect(detectDesignFormat("﻿{}")).toBe("json");
        expect(detectDesignFormat('﻿<?xml version="1.0" ?>')).toBe("xml");
    });

    test("どちらでもない入力は unknown", () => {
        expect(detectDesignFormat("CREATE TABLE foo ();")).toBe("unknown");
        expect(detectDesignFormat("[]")).toBe("unknown");
        expect(detectDesignFormat('"文字列だけの JSON"')).toBe("unknown");
    });

    test("壊れた JSON でも json に落ちる（例外は parser が位置つきで出す）", () => {
        expect(detectDesignFormat('{"formatVersion": 2, "tables":')).toBe("json");
    });

    test("実物の fixture と golden がすべて期待どおりに判別される", () => {
        /*
         * 合成した文字列だけでなく、UI が実際に受け取るバイト列で確かめる。
         * fixture（XML）と golden/json（serializer の出力）が判別の両端。
         */
        const actual = FIXTURES.flatMap((f) => [
            `${f.name}.xml: ${detectDesignFormat(readFixture(f.name))}`,
            `${f.name}.json: ${detectDesignFormat(
                readFileSync(join(GOLDEN_DIR, "json", `${f.name}.json`), "utf8"),
            )}`,
        ]);
        expect(actual).toEqual(
            FIXTURES.flatMap((f) => [`${f.name}.xml: xml`, `${f.name}.json: json`]),
        );
    });
});
