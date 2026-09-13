/* ------------------------- layout metrics --------------------- */
/*
 * grabado: 整列の質を数える物差し（#297）。**出荷コードに入れない。**
 *
 * ★★ **純関数とは別実装で数える。** layered.ts の中の判定を再利用すると、
 * **バグが実装と検査の両方へ同時に写る** —— 「層が違えば x 区間は交わらない」を
 * 実装の層番号で確かめても、層の割り当てが間違っていたら検査も一緒に間違える。
 * ここは**出てきた座標だけ**を見る（層も辺の向きも知らない）。
 *
 * 交差の数え方は**中心 - 中心の近似**。実際の線は js/relation.ts が行の y と箱の縁から
 * 引くベジエなので厳密には違うが、**硬い判定にしない**のは意図（issue の「やらないこと」）
 * —— 相対比較（旧実装より悪化しないこと）に使うだけで、絶対値は焼かない。
 */

import type { LayoutBox, LayoutEdge, LayoutPoint } from "../../frontend/js/io/layout/model.ts";

export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/** 箱と座標から矩形にする */
export function toRects(boxes: readonly LayoutBox[], points: readonly LayoutPoint[]): Rect[] {
    const out: Rect[] = [];
    for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i]!;
        const p = points[i]!;
        out.push({ x: p.x, y: p.y, width: b.width, height: b.height });
    }
    return out;
}

/** 2 つの矩形が重なるか。**辺で接するだけなら重ならない**とみなす */
export function overlaps(a: Rect, b: Rect): boolean {
    if (a.x + a.width <= b.x || b.x + b.width <= a.x) {
        return false;
    }
    if (a.y + a.height <= b.y || b.y + b.height <= a.y) {
        return false;
    }
    return true;
}

/** x 区間が交わるか（js/relation.ts の measure() が normal / side を分ける条件そのもの） */
export function xRangesOverlap(a: Rect, b: Rect): boolean {
    return !(a.x + a.width < b.x || b.x + b.width < a.x);
}

function center(r: Rect): [number, number] {
    return [r.x + r.width / 2, r.y + r.height / 2];
}

function orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
    const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (v > 0) {
        return 1;
    }
    if (v < 0) {
        return -1;
    }
    return 0;
}

/**
 * 2 本の線分が交差するか。**端点を共有する組は交差と数えない** ——
 * 同じテーブルから出る 2 本は必ず端点を共有するので、数えると次数の高いテーブルが
 * あるだけで交差数が跳ね上がり、比較の意味が消える。
 */
function segmentsCross(
    p1: [number, number],
    p2: [number, number],
    q1: [number, number],
    q2: [number, number]
): boolean {
    const d1 = orientation(q1[0], q1[1], q2[0], q2[1], p1[0], p1[1]);
    const d2 = orientation(q1[0], q1[1], q2[0], q2[1], p2[0], p2[1]);
    const d3 = orientation(p1[0], p1[1], p2[0], p2[1], q1[0], q1[1]);
    const d4 = orientation(p1[0], p1[1], p2[0], p2[1], q2[0], q2[1]);
    return d1 * d2 < 0 && d3 * d4 < 0;
}

/** 交差している辺の組の数。**端点を共有する組は数えない** */
export function countCrossings(
    boxes: readonly LayoutBox[],
    points: readonly LayoutPoint[],
    edges: readonly LayoutEdge[]
): number {
    const rects = toRects(boxes, points);
    let count = 0;
    for (let i = 0; i < edges.length; i++) {
        const a = edges[i]!;
        if (a.from === a.to) {
            continue;
        }
        for (let j = i + 1; j < edges.length; j++) {
            const b = edges[j]!;
            if (b.from === b.to) {
                continue;
            }
            if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) {
                continue;
            }
            const cross = segmentsCross(
                center(rects[a.from]!),
                center(rects[a.to]!),
                center(rects[b.from]!),
                center(rects[b.to]!)
            );
            if (cross) {
                count++;
            }
        }
    }
    return count;
}

/** 辺の長さ（中心 - 中心）の総和 */
export function totalEdgeLength(
    boxes: readonly LayoutBox[],
    points: readonly LayoutPoint[],
    edges: readonly LayoutEdge[]
): number {
    const rects = toRects(boxes, points);
    let sum = 0;
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i]!;
        if (e.from === e.to) {
            continue;
        }
        const a = center(rects[e.from]!);
        const b = center(rects[e.to]!);
        sum += Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
    }
    return sum;
}

/** 盤面の占有面積（全体の bbox） */
export function boundingArea(boxes: readonly LayoutBox[], points: readonly LayoutPoint[]): number {
    if (boxes.length === 0) {
        return 0;
    }
    const rects = toRects(boxes, points);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i]!;
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
    }
    return (maxX - minX) * (maxY - minY);
}
