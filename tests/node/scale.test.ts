import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type NodeHarness } from "./harness.ts";
import {
    SCALE_COUNTS,
    SCALE_DOM_NODES,
    syntheticDesign,
} from "../support/synthetic.ts";
import {
    installScaleProbe,
    readScaleProbe,
    resetScaleProbe,
    type ScaleCounts,
} from "../support/probe.ts";

/*
 * 規模の費用を**回数で**固定する（#206）。
 *
 * ★★ **実時間では判定しない。** 共有ランナーが不安定で、計装自体も実時間を歪める。
 *   ここが守るのは「N に対する増え方」と「係数」で、**二次項が生えたらすぐ赤くなる**。
 *
 * ★★ **3 点で見る。** 2 点は必ず直線に乗るので、線形性の証明にならない。
 *   10 / 50 / 100 の 3 点が同じ 1 次式に乗ることを見る（300 は tests/scale/ の browser 側）。
 *
 * ★ **係数の内訳をすべて分解してはいない。** rowUpdate（列の総数）と rowRedraw
 *   （列の総数 ＋ キー登録数）と relationRedraw（関係の本数）は導出できるが、
 *   offsetWidth と tableRedraw の係数は実測から当てはめた値。**守るのは線形性と係数**で、
 *   内訳が要るのは「効く」と分かってからでよい。
 *
 * ★ jsdom で数えられないもの: alignTables()（折り返しが offsetWidth に依存する）／
 *   Chromium の LayoutCount ／ 実時間。**この分担は docs/TESTING.md の
 *   「なぜ 2 系統あるのか」と同じ形**で、新しい規律を作っていない。
 */

/** 測る段。300 は browser 側（jsdom で 4 段回すと npm test の増分が受け入れ基準を超える） */
const STEPS = [10, 50, 100] as const;

/*
 * ★ **式の正本は tests/support/synthetic.ts の SCALE_COUNTS / SCALE_DOM_NODES**（#207）。
 *   元はここと tests/scale/load.spec.ts が同じ式を別々に持っており、**#207 で片方だけ直り、
 *   もう片方が赤くなって気づいた**（2026-09-10）。**2 か所に書かない。**
 */
const EXPECTED = SCALE_COUNTS;
const EXPECTED_DOM = SCALE_DOM_NODES;

describe("規模の費用（#206）", () => {
    let h: NodeHarness;
    const measured = new Map<number, { counts: ScaleCounts; dom: number; domAfter: number }>();

    beforeAll(async () => {
        h = await createHarness();
        h.useDatatypes("postgresql");

        /*
         * 計装は**生きている実体からプロトタイプを辿る**ので、先に最小の設計を読む
         * （2 テーブルなら table / row / relation が揃う）。アプリに計装用の面は足さない。
         */
        h.loadJson(syntheticDesign(2));
        installScaleProbe(h.window, {
            table: h.designer.tables[0]!,
            row: h.designer.tables[0]!.rows[0]!,
            relation: h.designer.relations[0]!,
        });

        for (const n of STEPS) {
            const json = syntheticDesign(n);
            h.designer.clearTables();
            resetScaleProbe(h.window);
            h.loadJson(json);
            const counts = readScaleProbe(h.window);
            const dom = h.dom.window.document.querySelectorAll("*").length;
            h.designer.clearTables();
            const domAfter = h.dom.window.document.querySelectorAll("*").length;
            measured.set(n, { counts, dom, domAfter });
        }
    }, 120_000);

    describe("合成設計そのもの", () => {
        it("同じ N なら 1 バイトも変わらない", () => {
            expect(syntheticDesign(37)).toBe(syntheticDesign(37));
        });

        it("N が違えば違う（テーブル数がそのまま出る）", () => {
            const parsed = JSON.parse(syntheticDesign(7)) as { tables: unknown[] };
            expect(parsed.tables.length).toBe(7);
        });

        it("読み込んで書き戻すと 1 バイトも変わらない（正準形である）", () => {
            const json = syntheticDesign(5);
            h.designer.clearTables();
            h.loadJson(json);
            expect(h.toJson()).toBe(json);
        });

        it("1 未満は例外", () => {
            expect(() => syntheticDesign(0)).toThrow();
            expect(() => syntheticDesign(1.5)).toThrow();
        });
    });

    describe("読み込みの費用は N の 1 次式", () => {
        for (const key of Object.keys(EXPECTED) as (keyof ScaleCounts)[]) {
            it(`${key} = ${EXPECTED[key](0)} + ${EXPECTED[key](1) - EXPECTED[key](0)}N`, () => {
                for (const n of STEPS) {
                    expect(measured.get(n)!.counts[key]).toBe(EXPECTED[key](n));
                }
            });
        }

        it("DOM ノード数も 1 次式", () => {
            for (const n of STEPS) {
                expect(measured.get(n)!.dom).toBe(EXPECTED_DOM(n));
            }
        });

        /*
         * ★★ **二次項が 1 つも無いことを、係数とは別に見る。** 上の式が全部合っていても
         *   「式そのものを実測に合わせて書き換えた」だけかもしれない —— 増分の比を見れば、
         *   式とは独立に次数が分かる。N が 10 倍なら、線形なら増分もおよそ 10 倍。
         */
        it("N を 10 倍にしても費用は 10 倍前後（二次なら 100 倍になる）", () => {
            const small = measured.get(10)!.counts;
            const large = measured.get(100)!.counts;
            for (const key of Object.keys(EXPECTED) as (keyof ScaleCounts)[]) {
                const ratio = large[key] / small[key];
                expect(ratio).toBeGreaterThan(9);
                expect(ratio).toBeLessThan(12);
            }
        });
    });

    describe("後始末", () => {
        it("clearTables() で DOM が設計の分だけ戻る（N によらず同じ数）", () => {
            const sizes = STEPS.map((n) => measured.get(n)!.domAfter);
            expect(new Set(sizes).size).toBe(1);
            expect(sizes[0]).toBe(EXPECTED_DOM(0) + 7);
        });
    });

    describe("履歴（#288）", () => {
        /*
         * ★★ **上の 10 カウンタは、undo / redo の事故を 1 ビットも検出しない。**
         *   tests/support/probe.ts が数えるのはレイアウト読み出し 4 つと
         *   redraw / update の呼び出しだけで、**extractModel はどれも通らない**。
         *   確定点を低レベルの変異点（addTable / addRow / Row.update）に置くと
         *   読み込み 1 回で N x C 回スナップショットを採ることになるが、
         *   **全カウンタが緑のまま、次数判定も緑、タイムアウトもしない**。
         *
         *   **スタックの深さを見るのが唯一の計器。**
         */
        it("読み込み 1 回でスタックが 1 件しか増えない", () => {
            h.designer.clearTables();
            h.designer.io.loadDesignText(syntheticDesign(10));
            const history = h.designer.historyManager;
            history.reset();

            /* 実経路（UI と同じ入口）で、100 テーブルを読む */
            h.designer.io.loadDesignText(syntheticDesign(100));

            expect(history.depth()).toBe(1);
        });
    });
});
