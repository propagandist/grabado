/*
 * 座標系の採取（#236）。
 *
 * ★★ **なぜ golden ではなくここなのか。** tests/support/state.ts の「何を採らないか」が
 *   レイアウト由来の値を全部落としている —— jsdom は offsetWidth が常に 0 なので、
 *   除外して初めて 1 本の golden を実ブラウザと jsdom で共有できるという判断で、
 *   **それは動かさない**。結果として **コネクタが実際にどこへ引かれているかを見ている
 *   テストが 1 本も無かった**（#236 の発端）。
 *
 *   ここは golden を増やさない。**採るのは数で、突き合わせるのは同じページの中**
 *   —— 端点とアンカーはどちらも同じレイアウトから出るので、**フォントにも viewport にも
 *   OS にも依らない**。「3000px」のような CSS の値を 1 つも焼かない。
 *
 * ★★ **自己完結関数であること**（state.ts / probe.ts と同じ）。module スコープの束縛を
 *   一切参照しない（ヘルパーはすべて内側）。page 側は関数を**ソース文字列として注入**する:
 *
 *       await page.evaluate(`(${captureCanvasGeometry})(window.d)`)
 *
 * ★ **判定をここに書かない。** 採るのは生の実測だけで、「端点がアンカーに乗っているか」の
 *   判定はテスト側が持つ。**relation.ts の分岐（どちらの縁を選ぶか）を写すと、
 *   テストが実装の言い換えになって何も検知しなくなる。**
 */

import type { Designer } from "../../frontend/js/wwwsqldesigner.ts";
import type { Row } from "../../frontend/js/row.ts";

/** テーブル 1 本ぶんの実測と、ミニマップ上の分身 */
export interface TableBox {
    title: string;
    /** モデル側の座標（redraw() が style.left / top へ書く元） */
    x: number;
    y: number;
    /** DOM から読んだ実測 */
    left: number;
    top: number;
    width: number;
    height: number;
    selected: boolean;
    /**
     * ミニマップ上の分身。**style から読む**（Table.redraw() が Math.round した値が
     * そのまま入っている）。offsetWidth で読むと border 込みになって式と合わない。
     */
    mini: { left: number; top: number; width: number; height: number };
}

/**
 * relation の端点が乗りうる場所。**左右どちらの縁を選ぶかは採らない** —— それは
 * relation.ts の分岐で、判定側が両方を候補として持つ。
 */
export interface RowAnchor {
    table: string;
    row: string;
    tableLeft: number;
    tableRight: number;
    tableTop: number;
    rowTop: number;
    rowHeight: number;
    /** 選択中のテーブルは縁も中心も 1px ずれる（relation.ts:260-269） */
    selected: boolean;
}

export interface RelationGeometry {
    /** vector なら path の d、非 vector（div 3 本）なら null */
    d: string | null;
    /** d から読んだ両端。**始点と終点の順序は分岐で入れ替わる**（判定側は集合で見る） */
    ends: [[number, number], [number, number]] | null;
    anchors: [RowAnchor, RowAnchor];
    hidden: boolean;
}

export interface GeometrySnapshot {
    /** false なら d は 1 本も採れない。テスト側で先に落とすための旗 */
    vector: boolean;
    designer: { width: number; height: number };
    /** ミニマップ自身の寸法（縮尺の分子） */
    map: { width: number; height: number };
    tables: TableBox[];
    relations: RelationGeometry[];
}

/**
 * 現在の盤面から座標系を採る。**アプリには何も足さない**（読むだけ）。
 *
 * 走査順はテーブル順 → 行順 → その行の relation 順で、**同じ設計からは必ず同じ並び**。
 */
export function captureCanvasGeometry(d: Designer): GeometrySnapshot {
    function anchorOf(row: Row): RowAnchor {
        const table = row.owner;
        const el = table.dom.container;
        const left = el.offsetLeft;
        return {
            table: table.getTitle(),
            row: row.getTitle(),
            tableLeft: left,
            tableRight: left + el.offsetWidth,
            tableTop: el.offsetTop,
            rowTop: row.dom.container.offsetTop,
            rowHeight: row.dom.container.offsetHeight,
            selected: table.selected,
        };
    }

    /* "M x0 y0 C c1x c1y c2x c2y x3 y3" —— 数だけ拾えば命令の綴りに依らない */
    function parseEnds(
        path: string | null
    ): [[number, number], [number, number]] | null {
        if (!path) {
            return null;
        }
        const found = path.match(/-?\d+(?:\.\d+)?/g);
        if (!found || found.length < 8) {
            return null;
        }
        const n = found.map(Number);
        return [
            [n[0]!, n[1]!],
            [n[6]!, n[7]!],
        ];
    }

    function px(value: string): number {
        const n = parseFloat(value);
        return isNaN(n) ? 0 : n;
    }

    const tables: TableBox[] = [];
    for (let i = 0; i < d.tables.length; i++) {
        const t = d.tables[i]!;
        const el = t.dom.container;
        const mini = t.dom.mini.style;
        tables.push({
            title: t.getTitle(),
            x: t.x,
            y: t.y,
            left: el.offsetLeft,
            top: el.offsetTop,
            width: el.offsetWidth,
            height: el.offsetHeight,
            selected: t.selected,
            mini: {
                left: px(mini.left),
                top: px(mini.top),
                width: px(mini.width),
                height: px(mini.height),
            },
        });
    }

    const relations: RelationGeometry[] = [];
    const seen: unknown[] = [];
    for (let i = 0; i < d.tables.length; i++) {
        const rows = d.tables[i]!.rows;
        for (let j = 0; j < rows.length; j++) {
            const row = rows[j]!;
            for (let k = 0; k < row.relations.length; k++) {
                const rel = row.relations[k]!;
                if (seen.indexOf(rel) !== -1) {
                    continue;
                }
                seen.push(rel);
                /* 非 vector では dom[0] が div なので getAttribute は null を返す */
                const path = rel.dom[0].getAttribute("d");
                relations.push({
                    d: path,
                    ends: parseEnds(path),
                    anchors: [anchorOf(rel.row1), anchorOf(rel.row2)],
                    hidden: rel.hidden,
                });
            }
        }
    }

    return {
        /*
         * ★ d.vector の実体は **関数**（getOption("vector") && document.createElementNS。
         *   wwwsqldesigner.ts:189-190）。そのまま返すと page.evaluate のシリアライズで
         *   落ちて undefined になる —— 真偽に潰してから渡す。
         */
        vector: !!d.vector,
        designer: { width: d.width, height: d.height },
        map: { width: d.map.width, height: d.map.height },
        tables,
        relations,
    };
}
