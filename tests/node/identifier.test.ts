import { describe, expect, test } from "vitest";
import {
    identifierIssue,
    identifierRulesFor,
    type IdentifierRules,
} from "../../frontend/js/io/ddl/naming.ts";
import { DB_PROFILES } from "../support/fixtures.ts";

/*
 * 識別子の検査（HANDOVER §6 段階6-9b）。
 *
 * ハーネスを使わない —— js/io/ddl/naming.ts は型以外の import を持たないので、
 * tests/node/type-resolution.test.ts と同じ立場で直に叩ける。
 *
 * **ここが押さえるのは「どの名前が、どのプロファイルで、なぜ使えないか」の 3 つ組だけ。**
 * 画面にどう出るか（波線と tooltip）は tests/browser/identifier.spec.ts、
 * 文言そのものは locale の 21 ファイル。
 *
 * 検査は**警告のためのもので、入力を拒まない**（6-9b の判断。CUSTOMIZATIONS.md）——
 * だから「囲めば通る」ものは 1 つも入れていない。予約語も日本語も記号も、
 * quoteIdentifier が囲めば実行できる DDL になるので問題ではない。
 */

function rulesOf(db: string): IdentifierRules {
    const rules = identifierRulesFor(db);
    if (!rules) {
        throw new Error(`${db} の識別子規則が無い`);
    }
    return rules;
}

describe("識別子の検査（段階6-9b）", () => {
    describe("identifierRulesFor", () => {
        test("8 プロファイルすべてに規則がある", () => {
            const missing = DB_PROFILES.filter((db) => identifierRulesFor(db) === null);
            expect(missing).toEqual([]);
            expect(DB_PROFILES.length).toBe(8);
        });

        test("知らない名前には null（対応 DB から外れたプロファイルが来うる）", () => {
            /*
             * 旧い設計 XML の同梱 <datatypes db="cubrid"> のような、6-1 で撤去した
             * プロファイル名が来る経路がある。規則を知らないのに警告するほうが害なので、
             * 呼び手（js/identifier-hint.ts）は null を「警告しない」に倒す。
             */
            expect(identifierRulesFor("cubrid")).toBeNull();
            expect(identifierRulesFor(null)).toBeNull();
            expect(identifierRulesFor("")).toBeNull();
        });
    });

    describe("問題にしないもの（囲めば通る）", () => {
        /*
         * **ここが検査の範囲を決めている。** house 標準の snake_case はもちろん、
         * 予約語・日本語・空白・記号も、quoteIdentifier が囲めば実行できる DDL になる。
         * 警告に混ぜると house 標準の設計が大量に引っかかり、印そのものが無視される。
         */
        const HARMLESS = ["users", "created_at", "order", "select", "顧客", "say hi", "a-b"];

        test("8 プロファイル × 無害な名前は 1 件も警告しない", () => {
            const flagged: string[] = [];
            for (const db of DB_PROFILES) {
                for (const name of HARMLESS) {
                    const issue = identifierIssue(name, rulesOf(db));
                    if (issue) {
                        flagged.push(`${db}/${name}: ${issue.kind}`);
                    }
                }
            }
            expect(flagged).toEqual([]);
        });

        test('oracle 以外は識別子の " を問題にしない（エスケープで通る）', () => {
            const flagged = DB_PROFILES.filter(
                (db) => db !== "oracle" && identifierIssue('say "hi"', rulesOf(db)) !== null,
            );
            expect(flagged).toEqual([]);
        });
    });

    describe("空文字", () => {
        test("8 プロファイルすべてで警告する", () => {
            const missed = DB_PROFILES.filter(
                (db) => identifierIssue("", rulesOf(db))?.kind !== "identifierempty",
            );
            expect(missed).toEqual([]);
        });

        /*
         * **sqlite だけは実際には作れてしまう**（実測: CREATE TABLE ""(x INT) が通る）。
         * それでも警告するのは、名前の無い列 / テーブルが**設計として壊れている**ため。
         * 検査の 3 件のうち、ここだけが「DB が拒むか」ではなく設計の側の主張になっている。
         */
        test("UI から空にはできないので、来るのは読み込んだファイルから", () => {
            /* Visual.setTitle が空文字を無視する（js/visual.ts）。再現は parser 経由だけ */
            expect(identifierIssue("", rulesOf("sqlite"))).toEqual({ kind: "identifierempty" });
        });
    });

    describe('oracle の "（known-issue #15）', () => {
        test('識別子に " を含むと警告する', () => {
            expect(identifierIssue('say "hi"', rulesOf("oracle"))).toEqual({
                kind: "identifierforbidden",
                char: '"',
            });
        });

        test("**直っていない**（Oracle の制約なので生成器の中に直し方が無い）", () => {
            /*
             * 6-9b がやったのは「実行できない DDL が出ることに、出す前に気づけるようにする」
             * ことだけ。#15 は known-issues に残る —— 出力そのものは今も ORA-25716 で落ちる。
             * 直し方が無いことの記録は CUSTOMIZATIONS.md の段階6-8c。
             */
            expect(rulesOf("oracle").forbidden).toBeDefined();
            expect(rulesOf("postgresql").forbidden).toBeUndefined();
        });
    });

    describe("長さの上限", () => {
        /**
         * 実測 / 一次資料の別つきの表（js/io/ddl/naming.ts の各 IdentifierRules）。
         * **単位も超えたときの挙動もプロファイルで違う**ことがここに出る。
         */
        const LIMITS: ReadonlyArray<
            readonly [string, number | null, "bytes" | "chars" | null, string | null]
        > = [
            ["postgresql", 63, "bytes", "truncate"],
            ["mysql", 64, "chars", "error"],
            ["mariadb", 64, "chars", "error"],
            ["mssql", 128, "chars", "error"],
            ["oracle", 128, "bytes", "error"],
            ["sql-standard", 128, "chars", "error"],
            /* 上限を持たない 2 本（sqlite は実測で 10,000 文字が通る。h2 は未計測） */
            ["h2", null, null, null],
            ["sqlite", null, null, null],
        ];

        test("8 プロファイルの上限と単位（実測と一次資料の表）", () => {
            const actual = LIMITS.map(([db]) => {
                const limit = rulesOf(db).limit;
                return [
                    db,
                    limit?.max ?? null,
                    limit?.unit ?? null,
                    limit?.onExceed ?? null,
                ] as const;
            });
            expect(actual).toEqual(LIMITS.map((one) => [...one]));
        });

        test("postgresql は 63 バイト。**日本語は 21 文字で上限**（バイトで数える）", () => {
            /*
             * 実測（PG 18）: 21 文字（63 バイト）は通り、22 文字（66 バイト）は
             * **黙って 63 バイトへ切られた**（既存の 21 文字テーブルと衝突して初めて分かる）。
             * バイトで数えないと、日本語の設計で 3 倍の見落としが出る。
             */
            const pg = rulesOf("postgresql");
            expect(identifierIssue("a".repeat(63), pg)).toBeNull();
            expect(identifierIssue("顧".repeat(21), pg)).toBeNull();

            expect(identifierIssue("a".repeat(64), pg)).toEqual({
                kind: "identifiertoolong",
                length: 64,
                limit: { max: 63, unit: "bytes", onExceed: "truncate" },
            });
            expect(identifierIssue("顧".repeat(22), pg)).toEqual({
                kind: "identifiertoolong",
                length: 66,
                limit: { max: 63, unit: "bytes", onExceed: "truncate" },
            });
        });

        test("mysql は 64 文字。**日本語 64 文字は通る**（文字で数える）", () => {
            /* 実測（MySQL 8）: 65 文字の ASCII で ERROR 1059 */
            const mysql = rulesOf("mysql");
            expect(identifierIssue("a".repeat(64), mysql)).toBeNull();
            expect(identifierIssue("顧".repeat(64), mysql)).toBeNull();
            expect(identifierIssue("a".repeat(65), mysql)?.kind).toBe("identifiertoolong");
        });

        test("上限を持たないプロファイルでは長さで警告しない", () => {
            expect(identifierIssue("a".repeat(10000), rulesOf("sqlite"))).toBeNull();
            expect(identifierIssue("a".repeat(10000), rulesOf("h2"))).toBeNull();
        });
    });
});
