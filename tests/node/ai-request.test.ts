import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { buildAiRequest, serializeAiRequest } from "../../frontend/js/io/ai/request.ts";
import {
    applyNotice,
    orderedSuggestions,
    parseSelection,
    reviewNotice,
} from "../../frontend/js/io/ai/notice.ts";
import type { PatchRejection } from "../../frontend/js/io/ai/apply-patch.ts";
import type { AiSuggestion } from "../../frontend/js/io/ai/suggestion.ts";
import type { DesignModel } from "../../frontend/js/io/model.ts";
import { TypePalette } from "../../frontend/js/io/palette.ts";
import { parseDesignXml } from "../../frontend/js/io/xml-parser.ts";
import { REPO_ROOT, readFixture } from "../support/fixtures.ts";

/*
 * AI へ送る形（段階11-3。契約は docs/ARCHITECTURE.md §8.2）と、返ってきた提案の見せ方。
 *
 * **ハーネスを使わない** —— どちらも純関数で、palette と model しか見ない
 * （convert.test.ts / apply-patch.test.ts と同じ立場）。
 *
 * ★ **ここが決定論であることが backend の結果キャッシュの前提**（§8.5）。鍵は
 *   「送られてきたバイト列の SHA-256」なので、同じ設計から違うバイト列が出ると当たらない。
 */

const dom = new JSDOM("");
const parser = new dom.window.DOMParser();

function paletteOf(db: string): TypePalette {
    const xml = readFileSync(join(REPO_ROOT, "frontend", "db", db, "datatypes.xml"), "utf8");
    const palette = new TypePalette();
    palette.setRoot(parser.parseFromString(xml, "text/xml").documentElement as unknown as Element);
    return palette;
}

const palette = paletteOf("postgresql");

function modelOf(fixture: string): DesignModel {
    const doc = parser.parseFromString(readFixture("postgresql", fixture), "text/xml");
    return parseDesignXml(doc.documentElement as unknown as Element, palette);
}

describe("送る形（aiRequestVersion: 1）", () => {
    test("版と dialect が入る（dialect はパレットの db）", () => {
        const request = buildAiRequest(modelOf("relations"), palette);

        expect(request.aiRequestVersion).toBe(1);
        expect(request.dialect).toBe("postgresql");
    });

    test("座標・formatVersion・db を 1 つも送らない", () => {
        const json = serializeAiRequest(buildAiRequest(modelOf("relations"), palette));

        expect(json).not.toContain('"x"');
        expect(json).not.toContain('"y"');
        expect(json).not.toContain("formatVersion");
        expect(json).not.toContain('"db"');
    });

    test("型は**解決済みの SQL 名**で入る（id でも添字でもない）", () => {
        const request = buildAiRequest(modelOf("relations"), palette);
        const columns = request.tables[0]!.columns;

        expect(columns.map((c) => c.sqlType)).toEqual(["INTEGER", "TEXT", "INTEGER"]);
    });

    test("参照は子の列に付く（親を名前で指す）", () => {
        const request = buildAiRequest(modelOf("relations"), palette);
        const managerId = request.tables[0]!.columns[2]!;

        expect(managerId.name).toBe("manager_id");
        expect(managerId.references).toEqual([{ table: "employees", column: "id" }]);
    });

    test("空のものは送らない（コメント・サイズ・既定値・参照）", () => {
        const request = buildAiRequest(modelOf("relations"), palette);
        const id = request.tables[0]!.columns[0]!;

        expect(id).toEqual({ name: "id", sqlType: "INTEGER", nullable: false });
        expect("comment" in id).toBe(false);
        expect("size" in id).toBe(false);
        expect("default" in id).toBe(false);
        expect("references" in id).toBe(false);
    });

    test("nullable は false でも送る（無いことと区別する）", () => {
        const request = buildAiRequest(modelOf("relations"), palette);

        expect(request.tables[0]!.columns[0]!.nullable).toBe(false);
        expect(request.tables[0]!.columns[2]!.nullable).toBe(true);
    });

    test("サイズと既定値とコメントは、あれば入る", () => {
        const request = buildAiRequest(modelOf("house-defaults"), palette);
        const users = request.tables.find((t) => t.name === "users")!;
        const id = users.columns[0]!;
        const email = users.columns[1]!;

        expect(id.default).toBe("uuidv7()");
        expect(email.comment).toBe("ログイン用メールアドレス");
    });

    test("キーは type と列。名前は空なら送らない", () => {
        const request = buildAiRequest(modelOf("relations"), palette);

        expect(request.tables[0]!.keys).toEqual([
            { type: "PRIMARY", name: "employees_pkey", columns: ["id"] },
        ]);
    });

    test("**同じモデルからは同じバイト列**（結果キャッシュの鍵が安定する条件）", () => {
        const once = serializeAiRequest(buildAiRequest(modelOf("relations"), palette));
        const twice = serializeAiRequest(buildAiRequest(modelOf("relations"), palette));

        expect(twice).toBe(once);
    });

    test("テーブルが 0 件でも形は保たれる", () => {
        const request = buildAiRequest(modelOf("empty"), palette);

        expect(request.tables).toEqual([]);
        expect(serializeAiRequest(request)).toContain('"aiRequestVersion": 1');
    });
});

describe("返ってきた提案の見せ方", () => {
    const suggestion = (
        severity: "info" | "warn" | "error",
        table: string,
        withPatch: boolean,
    ): AiSuggestion => ({
        category: "naming",
        severity: severity,
        target: { table: table },
        rationale: `${table} の理由`,
        patch: withPatch ? { op: "rename-table", name: table + "s" } : undefined,
    });

    test("0 件は 0 件と言う（黙らない）", () => {
        expect(reviewNotice([])).toContain("0 件");
    });

    test("件数と内訳が先頭に出る", () => {
        const notice = reviewNotice([
            suggestion("info", "a", true),
            suggestion("error", "b", true),
            suggestion("error", "c", false),
        ]);

        expect(notice).toContain("3 件");
        expect(notice).toContain("error 2 / info 1");
    });

    test("**重い順に並ぶ**（設計の順だと error が埋もれる）", () => {
        const notice = reviewNotice([
            suggestion("info", "light", true),
            suggestion("error", "heavy", true),
        ]);

        expect(notice.indexOf("heavy")).toBeLessThan(notice.indexOf("light"));
    });

    test("patch を持たない提案はそう書く", () => {
        expect(reviewNotice([suggestion("warn", "a", false)])).toContain("無し（人が判断する指摘）");
    });

    test("**まだ適用していない**ことを明示する（review-first）", () => {
        expect(reviewNotice([suggestion("warn", "a", true)])).toContain("まだ 1 件も適用していない");
    });
});

describe("承認の選択（段階11-4）", () => {
    test("all はすべて", () => {
        expect(parseSelection("all", 3)).toEqual([0, 1, 2]);
        expect(parseSelection("  ALL ", 2)).toEqual([0, 1]);
    });

    test("番号は 1 始まりで、カンマでも空白でも区切れる", () => {
        expect(parseSelection("1,3", 5)).toEqual([0, 2]);
        expect(parseSelection("1 3", 5)).toEqual([0, 2]);
        expect(parseSelection(" 2, 4 ", 5)).toEqual([1, 3]);
    });

    test("**入力順ではなく一覧の順**に並べ直す（後の patch は前の結果を見るため）", () => {
        expect(parseSelection("3,1", 5)).toEqual([0, 2]);
    });

    test("範囲外と重複と壊れた語は黙って捨てる", () => {
        expect(parseSelection("0,1,1,9,x,-2", 3)).toEqual([0]);
        expect(parseSelection("", 3)).toEqual([]);
        expect(parseSelection("none", 3)).toEqual([]);
    });
});

describe("適用結果の見せ方（段階11-4）", () => {
    const one = (table: string): AiSuggestion => ({
        category: "naming",
        severity: "warn",
        target: { table: table },
        rationale: "理由",
        patch: { op: "rename-table", name: table + "s" },
    });

    /** locale を通さない層なので、テストは恒等関数を渡す */
    const asIs = (key: string): string => key;

    test("件数と、当てたもの・見送ったものが 1 件ずつ出る", () => {
        const rejections: (PatchRejection | null)[] = [
            null,
            { kind: "patchtablemissing", table: "gone" },
        ];

        const notice = applyNotice([one("a"), one("gone")], rejections, asIs);

        expect(notice).toContain("2 件のうち 1 件を適用した");
        expect(notice).toContain("適用: a（rename-table）");
        expect(notice).toContain("見送り: gone（rename-table） —— patchtablemissing");
    });

    test("**保存していないことを必ず書く**（undo が無い代わり）", () => {
        const notice = applyNotice([one("a")], [null], asIs);

        expect(notice).toContain("まだ保存していない");
        expect(notice).toContain("読み直せば元に戻る");
    });

    test("落ちた理由は kind をそのまま渡す（訳すのは呼び手）", () => {
        const notice = applyNotice(
            [one("a")],
            [{ kind: "patchnametaken", name: "as" }],
            (key) => "訳:" + key,
        );

        expect(notice).toContain("訳:patchnametaken");
    });
});

describe("一覧の番号（段階11-4）", () => {
    const at = (severity: "info" | "warn" | "error", table: string): AiSuggestion => ({
        category: "naming",
        severity: severity,
        target: { table: table },
        rationale: "理由",
    });

    test("番号は 1 始まりで、重い順に振られる", () => {
        const notice = reviewNotice([at("info", "light"), at("error", "heavy")]);

        expect(notice).toContain("1. [error] naming / heavy");
        expect(notice).toContain("2. [info] naming / light");
    });

    test("**適用の順と一覧の順が同じ**（番号がそのまま承認の単位になる）", () => {
        const suggestions = [at("info", "light"), at("error", "heavy")];

        expect(orderedSuggestions(suggestions).map((s) => s.target.table)).toEqual([
            "heavy",
            "light",
        ]);
    });
});
