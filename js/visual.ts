/* -------------------- base visual element -------------------- */
/*
 * grabado: ES クラス化した（HANDOVER §3 段階2）。段階3-2 で .ts 化した。
 *
 * 二相構築（_init / _build）の呼び出しは基底コンストラクタに持たせない。
 * 派生クラスは super() より前に this を触れないが、js/table.ts の _build() は
 * this.owner.map.dom.container を読むため両立しない。各サブクラスが従来
 * SQL.Visual.apply(this) を書いていた位置で自分で呼ぶ（Step4 で分離済み）。
 * そのためコンストラクタは持たない（既定＝何もしない）。
 *
 * dom バッグを型引数にしてあるのは js/relation.ts が配列で上書きするため
 * （docs/ARCHITECTURE.md §5.4 の「3 形態」）。基底を VisualDom 固定にして
 * サブクラスで declare 再宣言する案は Relation が TS2415 で成立せず、
 * D extends VisualDom の制約も配列を排除するので採れない。
 *
 * インスタンスプロパティは必ず declare で宣言する（段階3-2 の機械的規則）。
 * tsconfig の target が ES2022 ＝ useDefineForClassFields が既定 true なので、
 * declare なしの宣言はクラス本体に emit されて構築時に own property が生え、
 * 挙動が変わる（! による definite assignment assertion でも emit される）。
 */

import { SQL } from "./globals.ts";

/** 基底が用意する dom バッグ。_build() が埋めるまでは実行時 null（下の _init を参照） */
export interface VisualDom {
    container: HTMLElement;
    title: HTMLElement;
}

/** 基底が用意する data。サブクラスは declare data: RowData 等で狭める */
export interface VisualData {
    title: string;
}

export class Visual<D = VisualDom> {
    declare dom: D;
    declare data: VisualData;

    _init(): void {
        /*
         * 実行時は null で始まり _build() が埋める。型は「構築完了後の状態」を記述し、
         * 嘘はこの 1 行に閉じ込める（この間に this.dom を読むコードは存在しない）。
         */
        this.dom = {
            container: null,
            title: null,
        } as unknown as D;
        this.data = {
            title: "",
        };
    }

    _build(): void {}

    toXML(): void {}

    fromXML(node: Element): void {}

    destroy(): void {
        /* "destructor" */
        /* dom が配列なのは Relation だけで、その Relation は destroy を上書きする */
        var p = (this.dom as VisualDom).container.parentNode;
        if (p && p.nodeType == 1) {
            p.removeChild((this.dom as VisualDom).container);
        }
    }

    setTitle(text: string): void {
        if (!text) {
            return;
        }
        this.data.title = text;
        (this.dom as VisualDom).title.innerHTML = text;
    }

    getTitle(): string {
        return this.data.title;
    }

    redraw(): void {}
}

SQL.Visual = Visual;
