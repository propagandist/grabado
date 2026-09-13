import { describe, expect, test } from "vitest";
import { layoutLayered } from "../../frontend/js/io/layout/layered.ts";
import { LAYOUT_DEFAULTS } from "../../frontend/js/io/layout/model.ts";
import type { LayoutBox, LayoutEdge, LayoutPoint } from "../../frontend/js/io/layout/model.ts";
import {
    boundingArea,
    countCrossings,
    overlaps,
    toRects,
    totalEdgeLength,
    xRangesOverlap,
} from "../support/layout-metrics.ts";

/*
 * 層化レイアウトの純関数（#297 の PR 1）。
 *
 * **ハーネスを使わない。** layered.ts が import するのは型だけで、DOM も Designer も
 * 掴まない（apply-patch.test.ts / convert.test.ts と同じ立場）。**jsdom も要らない。**
 *
 * **golden を 1 本も作らない。** 整列後の座標を焼くとフォント・viewport・OS 依存が
 * 入る（#236 と同じ判断）。ここが見るのは**不変条件**と、旧実装との**相対比較**だけ。
 *
 * ★ **絶対値を焼かない。** 「x が 250 になること」のような検査は 1 つも書かない ——
 * 層間の空きを 60 から 80 に変えただけで全部赤くなり、**何が壊れたのか読めなくなる**。
 */

/** 同じ寸法の箱を n 個 */
function boxesOf(n: number, width = 100, height = 60): LayoutBox[] {
    const out: LayoutBox[] = [];
    for (let i = 0; i < n; i++) {
        out.push({ width: width, height: height });
    }
    return out;
}

/** 0 -> 1 -> 2 -> ... の鎖（from が子なので、i + 1 が i を参照する形） */
function chain(n: number): LayoutEdge[] {
    const out: LayoutEdge[] = [];
    for (let i = 0; i + 1 < n; i++) {
        out.push({ from: i + 1, to: i });
    }
    return out;
}

/** 0 を n - 1 本が参照する星（users.id を 5 表が参照する形） */
function star(n: number): LayoutEdge[] {
    const out: LayoutEdge[] = [];
    for (let i = 1; i < n; i++) {
        out.push({ from: i, to: 0 });
    }
    return out;
}

/**
 * 現行 alignTables() の参照実装（js/wwwsqldesigner.ts:702-741 の逐語）。
 *
 * **出荷コードからは消えるが、比較の相手としてここに残す**（indexOfTypeNameLegacy と
 * 同じ立場）。**FK の本数の降順に並べ、幅で折り返して敷き詰めるだけ** —— どのテーブルと
 * 繋がっているかを 1 度も見ていない。
 */
function legacyAlign(boxes: readonly LayoutBox[], edges: readonly LayoutEdge[], avail: number): LayoutPoint[] {
    const counts: number[] = [];
    for (let i = 0; i < boxes.length; i++) {
        let c = 0;
        for (let k = 0; k < edges.length; k++) {
            const e = edges[k]!;
            if (e.from === i || e.to === i) {
                c++;
            }
        }
        counts.push(c);
    }
    const order: number[] = [];
    for (let i = 0; i < boxes.length; i++) {
        order.push(i);
    }
    order.sort((a, b) => counts[b]! - counts[a]!);

    const out: LayoutPoint[] = new Array<LayoutPoint>(boxes.length);
    let x = 10;
    let y = 10;
    let max = 0;
    for (let i = 0; i < order.length; i++) {
        const t = order[i]!;
        const w = boxes[t]!.width;
        const h = boxes[t]!.height;
        if (x + w > avail) {
            x = 10;
            y += 10 + max;
            max = 0;
        }
        out[t] = { x: x, y: y };
        x += 10 + w;
        if (h > max) {
            max = h;
        }
    }
    return out;
}

/** 連結成分（**物差し側の別実装**。layered.ts の splitComponents を使わない） */
function componentsOf(n: number, edges: readonly LayoutEdge[]): number[][] {
    const seen: number[] = new Array<number>(n).fill(-1);
    const adj: number[][] = [];
    for (let i = 0; i < n; i++) {
        adj.push([]);
    }
    for (let k = 0; k < edges.length; k++) {
        const e = edges[k]!;
        if (e.from < 0 || e.from >= n || e.to < 0 || e.to >= n || e.from === e.to) {
            continue;
        }
        adj[e.from]!.push(e.to);
        adj[e.to]!.push(e.from);
    }
    const out: number[][] = [];
    for (let s = 0; s < n; s++) {
        if (seen[s] !== -1) {
            continue;
        }
        const id = out.length;
        const group: number[] = [];
        const queue = [s];
        seen[s] = id;
        while (queue.length > 0) {
            const v = queue.shift()!;
            group.push(v);
            const around = adj[v]!;
            for (let i = 0; i < around.length; i++) {
                const w = around[i]!;
                if (seen[w] === -1) {
                    seen[w] = id;
                    queue.push(w);
                }
            }
        }
        out.push(group.sort((a, b) => a - b));
    }
    return out;
}

/**
 * 不変条件 7 種のうち、1 回の呼び出しで見られる 5 つ。
 * 決定論（1）と冪等（7）は 2 回呼んで比べるので、それぞれの test が持つ。
 */
function expectInvariants(
    boxes: readonly LayoutBox[],
    edges: readonly LayoutEdge[],
    points: readonly LayoutPoint[],
    grid = LAYOUT_DEFAULTS.grid,
    acyclic = true
): void {
    /* 2. 順序保存 —— 長さが同じで、添字が入れ替わっていない */
    expect(points.length).toBe(boxes.length);

    /* 4. 負を出さない・全座標が grid の倍数 */
    for (let i = 0; i < points.length; i++) {
        expect(points[i]!.x).toBeGreaterThanOrEqual(0);
        expect(points[i]!.y).toBeGreaterThanOrEqual(0);
        if (grid > 0) {
            expect(points[i]!.x % grid).toBe(0);
            expect(points[i]!.y % grid).toBe(0);
        }
    }

    const rects = toRects(boxes, points);

    /* 3. 箱が 1 対も重ならない */
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
        }
    }

    /*
     * 6. FK で繋がった 2 表の x 区間が交わらない。
     *
     * ★★ **同じ x のペアを黙って飛ばすと、検査に穴が開く** —— 層化を殺して全部を
     * 層 0 に置く変異を入れると、全ペアが「同じ x」になって**1 つも検査されなくなる**。
     * そこで飛ばした本数を数え、**サイクルの無い入力では 0 本であること**を要求する。
     * 同じ層へ落ちてよいのは**後退辺（相互 FK・サイクル）だけ**だからである。
     */
    let sameColumn = 0;
    for (let k = 0; k < edges.length; k++) {
        const e = edges[k]!;
        if (e.from === e.to || e.from < 0 || e.to < 0 || e.from >= boxes.length || e.to >= boxes.length) {
            continue;
        }
        const a = rects[e.from]!;
        const b = rects[e.to]!;
        if (a.x === b.x) {
            sameColumn++;
            continue;
        }
        expect(xRangesOverlap(a, b)).toBe(false);
    }
    if (acyclic) {
        expect(sameColumn).toBe(0);
    }

    /* 5. 連結成分の bbox が互いに交わらない */
    const groups = componentsOf(boxes.length, edges);
    const frames = groups.map((g) => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < g.length; i++) {
            const r = rects[g[i]!]!;
            minX = Math.min(minX, r.x);
            minY = Math.min(minY, r.y);
            maxX = Math.max(maxX, r.x + r.width);
            maxY = Math.max(maxY, r.y + r.height);
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    });
    for (let i = 0; i < frames.length; i++) {
        for (let j = i + 1; j < frames.length; j++) {
            expect(overlaps(frames[i]!, frames[j]!)).toBe(false);
        }
    }
}

describe("不変条件", () => {
    test("鎖・星・格子のどれでも 5 つが成り立つ", () => {
        const inputs: { name: string; boxes: LayoutBox[]; edges: LayoutEdge[] }[] = [
            { name: "鎖 10", boxes: boxesOf(10), edges: chain(10) },
            { name: "星 12", boxes: boxesOf(12), edges: star(12) },
            {
                name: "多対多の中間表",
                boxes: boxesOf(7),
                edges: [
                    { from: 2, to: 0 },
                    { from: 2, to: 1 },
                    { from: 3, to: 0 },
                    { from: 4, to: 1 },
                    { from: 5, to: 2 },
                    { from: 6, to: 2 },
                ],
            },
        ];
        for (const input of inputs) {
            const points = layoutLayered(input.boxes, input.edges);
            expectInvariants(input.boxes, input.edges, points);
        }
    });

    test("1. 決定論 —— 同じ入力からは同じ出力", () => {
        const boxes = boxesOf(20);
        const edges = chain(20).concat(star(6));
        const a = layoutLayered(boxes, edges);
        const b = layoutLayered(boxes, edges);
        expect(a).toEqual(b);
    });

    test("7. 冪等 —— 2 回目も 1 つも動かない（現在座標を読まないので自明）", () => {
        const boxes = boxesOf(15);
        const edges = star(15);
        const first = layoutLayered(boxes, edges);
        const second = layoutLayered(boxes, edges);
        expect(second).toEqual(first);
    });

    test("2. 順序保存 —— 入力の添字と出力の添字が 1 対 1 で対応する", () => {
        /* 幅を全部変えておくと、入れ替わりが座標に出る */
        const boxes: LayoutBox[] = [];
        for (let i = 0; i < 8; i++) {
            boxes.push({ width: 50 + i * 10, height: 40 });
        }
        const points = layoutLayered(boxes, chain(8));
        expect(points.length).toBe(8);
        /* 鎖なら層が 1 つずつ進むので、x は狭義単調増加になる */
        for (let i = 1; i < points.length; i++) {
            expect(points[i]!.x).toBeGreaterThan(points[i - 1]!.x);
        }
    });

    test("grid を 0 にすると量子化しない（それでも重ならない）", () => {
        const boxes = boxesOf(6);
        const edges = chain(6);
        const points = layoutLayered(boxes, edges, { grid: 0 });
        expectInvariants(boxes, edges, points, 0);
    });
});

describe("異常系 —— 例外を投げず、不変条件を満たす", () => {
    const cases: { name: string; boxes: LayoutBox[]; edges: LayoutEdge[] }[] = [
        { name: "0 表", boxes: [], edges: [] },
        { name: "1 表", boxes: boxesOf(1), edges: [] },
        { name: "辺 0 本", boxes: boxesOf(5), edges: [] },
        { name: "自己ループ", boxes: boxesOf(3), edges: [{ from: 1, to: 1 }, { from: 2, to: 0 }] },
        { name: "相互 FK", boxes: boxesOf(2), edges: [{ from: 0, to: 1 }, { from: 1, to: 0 }] },
        {
            name: "多重辺",
            boxes: boxesOf(3),
            edges: [{ from: 1, to: 0 }, { from: 1, to: 0 }, { from: 2, to: 0 }],
        },
        {
            name: "サイクル 3",
            boxes: boxesOf(3),
            edges: [{ from: 1, to: 0 }, { from: 2, to: 1 }, { from: 0, to: 2 }],
        },
        {
            name: "非連結成分が複数",
            boxes: boxesOf(9),
            edges: [{ from: 1, to: 0 }, { from: 3, to: 2 }, { from: 5, to: 4 }, { from: 7, to: 6 }],
        },
        {
            name: "1 成分が 9 割",
            boxes: boxesOf(20),
            edges: chain(18),
        },
        { name: "寸法 0", boxes: boxesOf(4, 0, 0), edges: chain(4) },
        {
            name: "棚より広い表",
            boxes: [{ width: 5000, height: 60 }, { width: 100, height: 60 }],
            edges: [{ from: 1, to: 0 }],
        },
    ];

    /* 相互 FK とサイクルだけは、後退辺が同じ層へ落ちることを許す */
    const cyclic = new Set(["相互 FK", "サイクル 3"]);

    for (const c of cases) {
        test(c.name, () => {
            const points = layoutLayered(c.boxes, c.edges);
            expectInvariants(c.boxes, c.edges, points, LAYOUT_DEFAULTS.grid, !cyclic.has(c.name));
        });
    }

    test("範囲外の添字・非整数の辺は黙って捨てる", () => {
        const boxes = boxesOf(3);
        const edges: LayoutEdge[] = [
            { from: 99, to: 0 },
            { from: 0, to: -1 },
            { from: 1.5, to: 0 },
            { from: 2, to: 0 },
        ];
        const points = layoutLayered(boxes, edges);
        expect(points.length).toBe(3);
        expectInvariants(boxes, [{ from: 2, to: 0 }], points);
    });
});

describe("旧実装との相対比較 —— 絶対値は焼かない", () => {
    /* 現行 alignTables() の折り返し幅（ウィンドウ幅 - ツールバー）に近い値 */
    const AVAIL = 1264;

    const inputs: { name: string; boxes: LayoutBox[]; edges: LayoutEdge[] }[] = [
        { name: "鎖 10", boxes: boxesOf(10), edges: chain(10) },
        { name: "星 12", boxes: boxesOf(12), edges: star(12) },
        {
            name: "多対多の中間表",
            boxes: boxesOf(7),
            edges: [
                { from: 2, to: 0 },
                { from: 2, to: 1 },
                { from: 3, to: 0 },
                { from: 4, to: 1 },
                { from: 5, to: 2 },
                { from: 6, to: 2 },
            ],
        },
    ];

    for (const input of inputs) {
        test(`${input.name} —— 交差数が悪化しない`, () => {
            const next = layoutLayered(input.boxes, input.edges);
            const prev = legacyAlign(input.boxes, input.edges, AVAIL);
            const a = countCrossings(input.boxes, next, input.edges);
            const b = countCrossings(input.boxes, prev, input.edges);
            expect(a).toBeLessThanOrEqual(b);
        });

        test(`${input.name} —— 線長総和が悪化しない`, () => {
            const next = layoutLayered(input.boxes, input.edges);
            const prev = legacyAlign(input.boxes, input.edges, AVAIL);
            const a = totalEdgeLength(input.boxes, next, input.edges);
            const b = totalEdgeLength(input.boxes, prev, input.edges);
            expect(a).toBeLessThanOrEqual(b);
        });
    }

    /*
     * ★★ **線長はどんな入力でも縮むわけではない**（2026-09-13 実測）。
     *
     *     入力      交差          線長                  面積
     *     鎖 10     0 -> 0        1870 -> 1440          65k -> 92k
     *     星 12     0 -> 0        6120 -> 3124          156k -> 224k
     *     中間表 7  0 -> 0        1980 -> 990           46k -> 92k
     *     鎖 30     2 -> 0        5849 -> 4640          240k -> 284k
     *     星 30     0 -> 0        15657 -> **17830**    240k -> 598k
     *
     * **星 30（1 親 + 29 子）だけ 14% 伸びる** —— 子が 1 つの層に縦へ 29 個並ぶので、
     * 端の子から親までが遠くなる。旧実装は敷き詰めるだけなので密になる。
     * **これは層化の代償であって不具合ではない** —— x 区間を交わらせない保証と引き換えに、
     * 盤面は縦へ伸びる。**面積は 5 入力すべてで増える**（同じ理由）。
     *
     * **判定を 3 入力に限るのは意図**（issue #297 の受け入れ基準）。星 30 を判定に足すと、
     * **「線を短くする」が目的にすり替わる** —— 目的は normal / side の分岐であって、
     * 総和の最小化ではない。
     */

    test("x 区間の重なりが減る —— これが normal / side を分ける条件そのもの", () => {
        const boxes = boxesOf(12);
        const edges = star(12);
        const next = toRects(boxes, layoutLayered(boxes, edges));
        const prev = toRects(boxes, legacyAlign(boxes, edges, AVAIL));
        let a = 0;
        let b = 0;
        for (let k = 0; k < edges.length; k++) {
            const e = edges[k]!;
            if (xRangesOverlap(next[e.from]!, next[e.to]!)) {
                a++;
            }
            if (xRangesOverlap(prev[e.from]!, prev[e.to]!)) {
                b++;
            }
        }
        expect(a).toBeLessThan(b);
    });
});

describe("記録のみ —— 判定しない", () => {
    test("線長総和と占有面積を数えられる（数を焼かない）", () => {
        const boxes = boxesOf(10);
        const edges = chain(10);
        const points = layoutLayered(boxes, edges);
        expect(totalEdgeLength(boxes, points, edges)).toBeGreaterThan(0);
        expect(boundingArea(boxes, points)).toBeGreaterThan(0);
    });
});
