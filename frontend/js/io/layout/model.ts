/* ------------------------- layout model ----------------------- */
/*
 * grabado: 整列の入出力（#297）。
 *
 * 置き場所が js/io/ なのは js/io/template.ts と同じ理由 —— **純粋ロジックの根を 2 つに
 * しない**。本ファイルは型だけで emit が空なので、src/app.ts（読み込み順の文書）には
 * 載せない（js/io/model.ts と同じ扱い）。
 *
 * ★ **この層が受け取らないものが 3 つある。受け取らないことが、そのまま保証になる。**
 *
 *   受け取らない        それで防げること
 *   ------------------  --------------------------------------------------------------
 *   DesignModel         名前解決を通らないので、**同名テーブルで両端が先頭に寄る**既知の
 *                       性質（js/io/apply.ts）がレイアウトへ波及しない
 *   名前                タイブレークが常に添字になり localeCompare の環境依存が入らない。
 *                       d.tables の順序破壊（旧 known-issue #7）も構造的に起きない。
 *                       **副産物として、同名テーブルが入力として存在しえない**
 *   現在の x / y        **冪等性が型の上で証明される**（テストを書く必要がない性質になる）
 *
 * ★ **寸法は呼び手が測る。** テーブルの幅・高さは DOM 実測しかなく（Table.redraw() が
 * offsetWidth から入れる）、jsdom では測れない。引数で受ければこの矛盾が消え、実測では
 * 作れない盤面（「幅 1000 が 1 本と幅 10 が 50 本」等）も入力にできる。
 * **モデルに宣言寸法を持たせる案は採らない** —— 寸法の真実が 2 つになる。
 */

/** テーブル 1 つの実測寸法。**添字が同一性**で、名前は持たない */
export interface LayoutBox {
    readonly width: number;
    readonly height: number;
}

/**
 * FK 1 本。添字は boxes の添字。
 *
 * from が**参照する側**（子。FK を宣言しているテーブル）、to が**参照される側**（親）。
 * 向きは層の順序にだけ使う —— 親が左、子が右に来る。
 */
export interface LayoutEdge {
    readonly from: number;
    readonly to: number;
}

/** 出力。**boxes と同じ長さ・同じ順**で返る */
export interface LayoutPoint {
    readonly x: number;
    readonly y: number;
}

/**
 * 寸法以外の入力。**すべて省略可**で、省略時は下の既定が入る。
 *
 * ★ **grid は必須の概念であって飾りではない。** Table.moveTo() は必ず snap() を通るので、
 * 純関数が snap を知らないと層の x が snap / 2 まで動き、**x 区間が重なって
 * Relation.measure() の normal が side に落ちる**。全座標を grid の倍数にすれば
 * snap() が恒等写像になり、不変条件が保たれる。
 */
export interface LayoutOptions {
    /** 座標の量子化幅。0 なら量子化しない（既定 20） */
    readonly grid?: number;
    /** 盤面の左上の余白（既定 10） */
    readonly margin?: number;
    /** 層と層の最小の空き。ベジエの制御点が十分な幅を持つために要る（既定 60） */
    readonly layerGap?: number;
    /** 同じ層で上下に並ぶ箱の最小の空き（既定 20） */
    readonly rowGap?: number;
    /** 連結成分どうしの最小の空き（既定 40） */
    readonly componentGap?: number;
    /** 盤面の折り返し幅。**ウィンドウ幅ではない**（既定 2800 = #area の 3000 から余白を引いた値） */
    readonly wrapWidth?: number;
}

/** 既定値。**呼び手が 1 つも渡さなくても決定論であることが要る** */
export const LAYOUT_DEFAULTS: Required<LayoutOptions> = {
    grid: 20,
    margin: 10,
    layerGap: 60,
    rowGap: 20,
    componentGap: 40,
    wrapWidth: 2800,
};
