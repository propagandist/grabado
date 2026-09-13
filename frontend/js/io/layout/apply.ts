/* ------------------------- layout apply ----------------------- */
/*
 * grabado: 整列の不純な面（#297）。**測る / 書く はここにしかない。**
 *
 * js/io/layout/layered.ts が純関数（DOM も Designer も知らない）で、ここがその呼び手。
 * **Designer と Table は型でだけ受ける**ので、値の辺は js/io/layout -> js/ の向きに
 * 1 本も生えない（js/io/extract.ts と同じ立場。verbatimModuleSyntax で emit から消える）。
 *
 * ★ **3 段に分ける。順序に意味がある。**
 *
 *   1. 測る    —— offsetWidth / offsetHeight をここで全部読む
 *   2. 計算    —— **DOM を 1 度も読まない**（純関数に渡すだけ）
 *   3. 書く    —— moveTo()
 *
 * 2 で 1 度も読まないことが、**純関数であることの機械的な証明**になる（#297 の PR 3 で
 * 回数を数える）。1 と 3 を混ぜると、1 本置くたびに強制同期レイアウトが走る
 * （#207 が Table.redraw() から落としたのと同じ形）。
 */

import type { Designer } from "../../wwwsqldesigner.ts";
import type { Relation } from "../../relation.ts";
import type { Table } from "../../table.ts";
import { layoutLayered } from "./layered.ts";
import { LAYOUT_DEFAULTS } from "./model.ts";
import type { LayoutBox, LayoutEdge, LayoutOptions } from "./model.ts";

/**
 * FK を層の辺に写す。**DOM を 1 度も読まない。**
 *
 * ★ **向きは row2 が子**（FK を宣言している側）**で、row1 が親**。js/io/extract.ts の
 * 「自分が row2（＝FK を持つ子）である relation だけを」という逐語がその正本で、
 * ここはそれに合わせている。**逆にすると層が左右反転する**（図としては成立するが、
 * 「参照される側が左」という読みが失われる）。
 *
 * 同じ relation は両端のテーブルから 2 度出てくるので Set で 1 本に畳む。
 * **多重辺・自己参照はここで落とさない** —— 純関数の normalizeEdges が受け持つ
 * （落とす規則を 2 か所に書かない）。
 */
export function collectEdges(tables: readonly Table[]): LayoutEdge[] {
    const index = new Map<Table, number>();
    for (let i = 0; i < tables.length; i++) {
        index.set(tables[i]!, i);
    }

    const seen = new Set<Relation>();
    const edges: LayoutEdge[] = [];
    for (let i = 0; i < tables.length; i++) {
        const relations = tables[i]!.getRelations();
        for (let k = 0; k < relations.length; k++) {
            const r = relations[k]!;
            if (seen.has(r)) {
                continue;
            }
            seen.add(r);
            const child = index.get(r.row2.owner);
            const parent = index.get(r.row1.owner);
            if (child === undefined || parent === undefined) {
                continue;
            }
            edges.push({ from: child, to: parent });
        }
    }
    return edges;
}

/**
 * 格子の幅を決める。**利用者の snap 設定の倍数にする。**
 *
 * ★★ Table.moveTo() は必ず snap() を通る。純関数が snap を知らないと、置いた座標が
 * snap / 2 まで動き、**x 区間が重なって Relation.measure() の normal が side に落ちる**。
 * 格子を snap の倍数にすれば snap() が恒等写像になり、不変条件がそのまま残る。
 */
function gridFor(designer: Designer): number {
    const snap = parseInt(designer.getOption("snap") as string);
    if (!snap || snap <= 0) {
        return LAYOUT_DEFAULTS.grid;
    }
    return snap * Math.ceil(LAYOUT_DEFAULTS.grid / snap);
}

/**
 * 折り返し幅を決める。**ウィンドウ幅で決めない**（それが #297 の不具合そのもの）。
 *
 * ★★ **#area の実寸から余白を引く。** js/table.ts が「left によって shrink-to-fit の
 * 上限（#area の右端まで）が変わりうる」と宣言しているので、**右端に届く位置へ置くと
 * 置いた後の実測幅が置く前と違い、2 回目の整列が 1 回目と違う結果を出す**。届かせない
 * ことで冪等が保たれる。**CSS の 3000 を焼かない** —— 実測から引く。
 *
 * 測れないとき（jsdom は offsetWidth が 0）は既定へ落ちる。**画面に依存しない既定**が
 * あることが、Node と実ブラウザで同じ結果が出る根拠になる。
 */
function wrapWidthFor(area: number): number {
    if (!Number.isFinite(area) || area <= 0) {
        return LAYOUT_DEFAULTS.wrapWidth;
    }
    const usable = area - LAYOUT_DEFAULTS.margin * 2;
    return usable > LAYOUT_DEFAULTS.margin ? usable : LAYOUT_DEFAULTS.margin;
}

/**
 * 整列を 1 回行う。**Designer.alignTables() の中身そのもの。**
 *
 * ★ **確定点（historyManager.commit）をここに置かない。** 入口の TableManager.align() が
 * 包んでいる —— IO.importresponse() と Designer.fromXMLText() が内部で alignTables() を
 * 呼ぶので、ここに置くと**読み込みのたびに余分な 1 手が積まれる**（#288 の配線）。
 *
 * ★ **resumeRedraw() は中立な対ではない。** rowManager.redraw() -> endCreate() /
 * endConnect() を呼ぶので、**整列すると FK 作成モードが解除される**。現行は解除しない
 * ので挙動の変化だが、作成モード中に整列を押す導線が無いので実害はほぼ無い。
 * **意図として引き受ける**（#297 の申し送り）。
 */
export function applyLayeredLayout(designer: Designer, options?: LayoutOptions): void {
    const tables = designer.tables;
    if (tables.length === 0) {
        return;
    }

    /* 1. 測る —— DOM を読むのはこのブロックだけ */
    const boxes: LayoutBox[] = [];
    for (let i = 0; i < tables.length; i++) {
        const el = tables[i]!.dom.container;
        boxes.push({ width: el.offsetWidth, height: el.offsetHeight });
    }
    const area = designer.dom.container.offsetWidth;

    /* 2. 集めて計算する —— ここで DOM を 1 度も読まない */
    const edges = collectEdges(tables);
    const points = layoutLayered(boxes, edges, {
        ...options,
        grid: options?.grid ?? gridFor(designer),
        wrapWidth: options?.wrapWidth ?? wrapWidthFor(area),
    });

    /* 3. 書く。**必ず try / finally で戻す**（旗が立ったまま抜けると以後の描画が止まる） */
    designer.suspendRedraw();
    try {
        for (let i = 0; i < tables.length; i++) {
            const p = points[i]!;
            tables[i]!.moveTo(p.x, p.y);
        }
    } finally {
        designer.resumeRedraw();
    }

    designer.sync();
}
