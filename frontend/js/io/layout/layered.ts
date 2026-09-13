/* ------------------------- layered layout --------------------- */
/*
 * grabado: FK グラフを見て座標を決める純関数（#297）。
 *
 * **DOM も Designer も import しない。** 入力は寸法と辺の添字だけで、出力は座標だけ
 * （js/io/layout/model.ts の「受け取らないもの 3 つ」）。
 *
 * ★ **層化（Sugiyama 風）を採る根拠は美意識ではない。** js/relation.ts の measure() が
 *
 *     if (r1 < l2 || r2 < l1)  -> normal（素直な S 字ベジエ）
 *     else                     -> side（15px 外へ回り込む縦線）
 *
 * と分岐しており、**「2 つの箱の x 区間が交わらないこと」が、きれいな線であることの
 * 必要十分条件**（自己参照を除く）。これはレイアウト側から幾何的に保証でき、
 * **保証の仕方は 1 つしかない** —— FK で繋がった 2 テーブルを、x 区間が重ならない
 * 別々の縦列に置く。それが層化そのものである。
 *
 * 副次的に 2 つ効く。同じ行から出る複数本（users.id を 5 表が参照）は端点が完全に
 * 重なるが、子を同一層の別の y に散らすので**すぐに離れる**。層の x を累積最大幅で
 * 決めると層間の空きが保証され、ベジエの制御点 half = floor(gap / 2) が十分な幅を持つ。
 *
 * ★ **再帰を 1 つも使わない。** 深さ優先は明示スタックで書く —— 相互 FK でハングした
 * 2 経路（#212 / #231）と同じ形を、こちらで作らないため。N は 300 まで実測されている
 * （docs/ARCHITECTURE.md §5.7）。
 */

import type { LayoutBox, LayoutEdge, LayoutOptions, LayoutPoint } from "./model.ts";
import { LAYOUT_DEFAULTS } from "./model.ts";

/** 層内順序を詰める回数。**固定する** —— 収束判定にすると実行ごとに結果が変わりうる */
const BARYCENTER_PASSES = 4;

/** 1 つの連結成分の相対配置（左上を (0, 0) に寄せたもの） */
interface ComponentFrame {
    readonly members: readonly number[];
    /** members と同じ順の相対座標 */
    readonly points: readonly LayoutPoint[];
    readonly width: number;
    readonly height: number;
}

/**
 * 座標を決める。**boxes と同じ長さ・同じ順**で返す。
 *
 * 例外を投げない。壊れた辺（範囲外の添字・自己ループ・重複）は黙って捨てる ——
 * 呼び手はライブツリーから辺を集めるので、**整列が落ちると編集が止まる**。
 */
export function layoutLayered(
    boxes: readonly LayoutBox[],
    edges: readonly LayoutEdge[],
    options?: LayoutOptions
): LayoutPoint[] {
    const opt = { ...LAYOUT_DEFAULTS, ...(options ?? {}) };
    const n = boxes.length;
    if (n === 0) {
        return [];
    }

    const clean = normalizeEdges(edges, n);
    const components = splitComponents(n, clean);

    const frames: ComponentFrame[] = [];
    for (let c = 0; c < components.length; c++) {
        frames.push(layoutComponent(components[c]!, boxes, clean, opt));
    }

    const placed: LayoutPoint[] = new Array<LayoutPoint>(n);
    packComponents(frames, opt, placed);
    return quantize(placed, opt.grid);
}

/**
 * 辺を正規化する。**捨てるのは 3 種**:
 *
 *   1. 添字が [0, n) の整数でないもの（呼び手の取り違え・削除済みテーブル）
 *   2. 自己ループ（from === to）—— 層に落とせない。描画側も自己参照は別扱い
 *   3. 重複（同じ向きの 2 本目以降）—— 多重辺は層の計算に何も足さない
 *
 * ★ **向きは潰さない。** (a -> b) と (b -> a) の相互 FK は 2 本とも残す ——
 * 片方は後退辺として層化で落ちるが、**どちらが落ちるかは層化が決める**。
 */
function normalizeEdges(edges: readonly LayoutEdge[], n: number): LayoutEdge[] {
    const seen = new Set<number>();
    const out: LayoutEdge[] = [];
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i]!;
        const from = e.from;
        const to = e.to;
        if (!Number.isInteger(from) || !Number.isInteger(to)) {
            continue;
        }
        if (from < 0 || from >= n || to < 0 || to >= n) {
            continue;
        }
        if (from === to) {
            continue;
        }
        const key = from * n + to;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push({ from: from, to: to });
    }
    return out;
}

/**
 * 連結成分に分ける（辺を無向として見る）。
 *
 * 返る順は**各成分の最小添字の昇順**、成分の中も添字の昇順。**入力順が読める形にする**
 * ——「大きい成分を先に」のような詰まり優先の順は、1 表足しただけで盤面が入れ替わる。
 */
function splitComponents(n: number, edges: readonly LayoutEdge[]): number[][] {
    const parent: number[] = new Array<number>(n);
    for (let i = 0; i < n; i++) {
        parent[i] = i;
    }
    const find = (x: number): number => {
        let r = x;
        while (parent[r]! !== r) {
            r = parent[r]!;
        }
        /* 経路圧縮。深い鎖でも 2 パスで済む */
        let cur = x;
        while (parent[cur]! !== r) {
            const next = parent[cur]!;
            parent[cur] = r;
            cur = next;
        }
        return r;
    };
    for (let j = 0; j < edges.length; j++) {
        const e = edges[j]!;
        const ra = find(e.from);
        const rb = find(e.to);
        if (ra !== rb) {
            parent[ra > rb ? ra : rb] = ra > rb ? rb : ra;
        }
    }

    const buckets = new Map<number, number[]>();
    for (let v = 0; v < n; v++) {
        const root = find(v);
        const bucket = buckets.get(root);
        if (bucket) {
            bucket.push(v);
        } else {
            buckets.set(root, [v]);
        }
    }
    const roots = Array.from(buckets.keys()).sort((a, b) => a - b);
    const out: number[][] = [];
    for (let k = 0; k < roots.length; k++) {
        out.push(buckets.get(roots[k]!)!);
    }
    return out;
}

/** 1 成分を層化して相対座標を出す */
function layoutComponent(
    members: readonly number[],
    boxes: readonly LayoutBox[],
    edges: readonly LayoutEdge[],
    opt: Required<LayoutOptions>
): ComponentFrame {
    const m = members.length;
    const local = new Map<number, number>();
    for (let i = 0; i < m; i++) {
        local.set(members[i]!, i);
    }

    /* 成分の中に閉じた辺だけを局所添字で持ち直す */
    const localEdges: LayoutEdge[] = [];
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i]!;
        const a = local.get(e.from);
        const b = local.get(e.to);
        if (a !== undefined && b !== undefined) {
            localEdges.push({ from: a, to: b });
        }
    }

    const layerOf = layerize(m, localEdges);
    const layers = groupByLayer(m, layerOf);
    orderWithinLayers(layers, localEdges, layerOf);
    return assignCoordinates(members, layers, boxes, opt);
}

/**
 * 各ノードの層を決める（longest path）。**親が左、子が右**。
 *
 * ★ **サイクルは後退辺を落として通す。** 相互 FK（a が b を、b が a を参照）は実在する
 * ので、**落ちた辺の両端は同じ層に来ることがある** —— そのときだけ x 区間が交わる。
 * 不変条件 6 が「自己参照・同層へ落ちた後退辺を除く」と断っているのはこれである。
 */
function layerize(m: number, edges: readonly LayoutEdge[]): number[] {
    /* 有向の向きは「親 -> 子」。edge は from が子なので反転して持つ */
    const adj: number[][] = [];
    for (let i = 0; i < m; i++) {
        adj.push([]);
    }
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i]!;
        adj[e.to]!.push(e.from);
    }
    for (let i = 0; i < m; i++) {
        adj[i]!.sort((a, b) => a - b);
    }

    /* 後退辺を明示スタックの DFS で拾う（白 0 / 灰 1 / 黒 2） */
    const color: number[] = new Array<number>(m).fill(0);
    const backward = new Set<number>();
    for (let s = 0; s < m; s++) {
        if (color[s] !== 0) {
            continue;
        }
        color[s] = 1;
        const stack: { v: number; i: number }[] = [{ v: s, i: 0 }];
        while (stack.length > 0) {
            const top = stack[stack.length - 1]!;
            const kids = adj[top.v]!;
            if (top.i < kids.length) {
                const w = kids[top.i]!;
                top.i++;
                if (color[w] === 1) {
                    backward.add(top.v * m + w);
                } else if (color[w] === 0) {
                    color[w] = 1;
                    stack.push({ v: w, i: 0 });
                }
            } else {
                color[top.v] = 2;
                stack.pop();
            }
        }
    }

    /* 残りは DAG。Kahn の順に最長距離を伸ばす */
    const indeg: number[] = new Array<number>(m).fill(0);
    const dag: number[][] = [];
    for (let i = 0; i < m; i++) {
        dag.push([]);
    }
    for (let p = 0; p < m; p++) {
        const kids = adj[p]!;
        for (let k = 0; k < kids.length; k++) {
            const c = kids[k]!;
            if (backward.has(p * m + c)) {
                continue;
            }
            dag[p]!.push(c);
            indeg[c]!++;
        }
    }
    const layer: number[] = new Array<number>(m).fill(0);
    const queue: number[] = [];
    for (let v = 0; v < m; v++) {
        if (indeg[v] === 0) {
            queue.push(v);
        }
    }
    let head = 0;
    while (head < queue.length) {
        const u = queue[head]!;
        head++;
        const kids = dag[u]!;
        for (let k = 0; k < kids.length; k++) {
            const w = kids[k]!;
            if (layer[u]! + 1 > layer[w]!) {
                layer[w] = layer[u]! + 1;
            }
            indeg[w]!--;
            if (indeg[w] === 0) {
                queue.push(w);
            }
        }
    }
    return layer;
}

/** 層ごとにノードを集める。**中は添字の昇順**（barycenter の初期値がここで決まる） */
function groupByLayer(m: number, layerOf: readonly number[]): number[][] {
    let max = 0;
    for (let v = 0; v < m; v++) {
        if (layerOf[v]! > max) {
            max = layerOf[v]!;
        }
    }
    const layers: number[][] = [];
    for (let l = 0; l <= max; l++) {
        layers.push([]);
    }
    for (let v = 0; v < m; v++) {
        layers[layerOf[v]!]!.push(v);
    }
    /*
     * ★ **空の層は出ない**（落とさない）—— longest path では layer[v] = k > 0 のとき
     * layer[u] = k - 1 の親 u が必ず存在する。**落とすと層番号と配列添字がずれ**、
     * 下の orderWithinLayers が「隣の層」を取り違える。
     */
    return layers;
}

/**
 * 層の中の並びを詰める（重心法）。**辺の交差を減らすのはここだけ**。
 *
 * ★ **収束判定を置かず、回数を固定する。** 判定にすると入力によって回数が変わり、
 * 「同じ入力 -> 同じ出力」は保たれても**説明できない差**が残る。前方 / 後方を交互に
 * 振るので、偶数回で両向きが同数になる。
 *
 * タイブレークは**動かさないこと**（安定ソート）。初期値が添字の昇順なので、
 * 重心が並んだノードは**添字順のまま**になる —— localeCompare も名前も入らない。
 */
function orderWithinLayers(
    layers: number[][],
    edges: readonly LayoutEdge[],
    layerOf: readonly number[]
): void {
    if (layers.length < 2) {
        return;
    }
    const n = layerOf.length;
    const nbr: number[][] = [];
    for (let i = 0; i < n; i++) {
        nbr.push([]);
    }
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i]!;
        nbr[e.from]!.push(e.to);
        nbr[e.to]!.push(e.from);
    }

    const pos: number[] = new Array<number>(n).fill(0);
    const refresh = (): void => {
        for (let l = 0; l < layers.length; l++) {
            const layer = layers[l]!;
            for (let i = 0; i < layer.length; i++) {
                pos[layer[i]!] = i;
            }
        }
    };

    for (let pass = 0; pass < BARYCENTER_PASSES; pass++) {
        refresh();
        const forward = pass % 2 === 0;
        const first = forward ? 1 : layers.length - 2;
        const last = forward ? layers.length - 1 : 0;
        const step = forward ? 1 : -1;
        for (let l = first; forward ? l <= last : l >= last; l += step) {
            const ref = l - step;
            const layer = layers[l]!;
            const weight = new Map<number, number>();
            for (let i = 0; i < layer.length; i++) {
                const v = layer[i]!;
                const around = nbr[v]!;
                let sum = 0;
                let count = 0;
                for (let k = 0; k < around.length; k++) {
                    const w = around[k]!;
                    if (layerOf[w] === ref) {
                        sum += pos[w]!;
                        count++;
                    }
                }
                /* 参照層に隣接が無ければ動かさない（現在位置を重心にする） */
                weight.set(v, count > 0 ? sum / count : pos[v]!);
            }
            layer.sort((a, b) => weight.get(a)! - weight.get(b)!);
        }
    }
}

/**
 * 層と並びから相対座標を出す。
 *
 * 層の x は**その層までの累積最大幅 ＋ layerGap** なので、**層が違えば x 区間は必ず
 * 交わらない**（不変条件 6 の実体）。層の中は上から積み、層ごとに縦の中央へ寄せる ——
 * 高さの違う層が上端に揃うと、図が階段状に見えるため。
 */
function assignCoordinates(
    members: readonly number[],
    layers: readonly number[][],
    boxes: readonly LayoutBox[],
    opt: Required<LayoutOptions>
): ComponentFrame {
    const widths: number[] = [];
    const heights: number[] = [];
    let tallest = 0;
    for (let l = 0; l < layers.length; l++) {
        const layer = layers[l]!;
        let w = 0;
        let h = 0;
        for (let i = 0; i < layer.length; i++) {
            const box = boxes[members[layer[i]!]!]!;
            if (box.width > w) {
                w = box.width;
            }
            h += box.height;
            if (i > 0) {
                h += opt.rowGap;
            }
        }
        widths.push(w);
        heights.push(h);
        if (h > tallest) {
            tallest = h;
        }
    }

    const points: LayoutPoint[] = new Array<LayoutPoint>(members.length);
    let x = 0;
    for (let l = 0; l < layers.length; l++) {
        const layer = layers[l]!;
        let y = Math.floor((tallest - heights[l]!) / 2);
        for (let i = 0; i < layer.length; i++) {
            const v = layer[i]!;
            points[v] = { x: x, y: y };
            y += boxes[members[v]!]!.height + opt.rowGap;
        }
        x += widths[l]! + opt.layerGap;
    }

    return {
        members: members,
        points: points,
        width: x - opt.layerGap,
        height: tallest,
    };
}

/**
 * 成分を棚に詰める。**折り返し幅はウィンドウ幅ではない**（options の wrapWidth）——
 * 現行の不具合そのものなので、**呼び手が画面を測って渡す経路を作らない**。
 *
 * ★ 1 成分が wrapWidth より広いときは**そのまま置く**。折らない ——
 * 層の順序を崩すより、盤面が広がるほうがよい（#area は呼び手が広げる）。
 */
function packComponents(
    frames: readonly ComponentFrame[],
    opt: Required<LayoutOptions>,
    out: LayoutPoint[]
): void {
    let cx = opt.margin;
    let cy = opt.margin;
    let shelf = 0;
    for (let f = 0; f < frames.length; f++) {
        const frame = frames[f]!;
        if (cx > opt.margin && cx + frame.width > opt.wrapWidth) {
            cx = opt.margin;
            cy += shelf + opt.componentGap;
            shelf = 0;
        }
        for (let i = 0; i < frame.members.length; i++) {
            const p = frame.points[i]!;
            out[frame.members[i]!] = { x: cx + p.x, y: cy + p.y };
        }
        cx += frame.width + opt.componentGap;
        if (frame.height > shelf) {
            shelf = frame.height;
        }
    }
}

/**
 * 格子へ丸める。**切り上げに統一する** —— 負へ倒れず、順序も間隔も保たれる。
 *
 * ★ **丸めても箱は重ならない。** 丸め後の値は [v, v + grid) に入るので、2 つの座標の
 * 差は元の差より grid 未満しか縮まない。層間（layerGap 60）も同層（rowGap 20）も
 * 成分間（componentGap 40）も grid（20）以上の空きを持たせてあるので、
 * **丸めの前後で「重なる」側へは倒れない**。
 */
function quantize(points: readonly LayoutPoint[], grid: number): LayoutPoint[] {
    if (!Number.isFinite(grid) || grid <= 0) {
        return points.slice();
    }
    const out: LayoutPoint[] = new Array<LayoutPoint>(points.length);
    for (let i = 0; i < points.length; i++) {
        const p = points[i]!;
        out[i] = {
            x: Math.ceil(p.x / grid) * grid,
            y: Math.ceil(p.y / grid) * grid,
        };
    }
    return out;
}
