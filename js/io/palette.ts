/* ------------------------- type palette ----------------------- */
/*
 * grabado: 型パレット層（HANDOVER §4 段階4-0b）。
 *
 * db/<db>/datatypes.xml の <datatypes> 要素を包むだけの層。段階3-4c まで
 * window.DATATYPES という出荷コードのグローバルだったものを、Designer が持つ
 * インスタンス（Designer.palette）に移した。読み手は owner 鎖で到達する
 * （段階4-0a の SQL.designer 撤去と同じ論法。js/globals.ts の該当コメントを参照）。
 *
 * 本層はキャッシュを持たない。現行コードは参照のたびに getElementsByTagName を
 * 呼んでいて、Designer 側の typeIndex / fkTypeFor だけが唯一のキャッシュだからで、
 * ここに寄せると「datatypes を差し替えても消えない」現行の寿命が変わる。
 * 型解決そのものの再設計（getTypeIndex / getFKTypeFor / sql・re 照合）は
 * HANDOVER §6.1 の型パレット差し替えと同時に行う。
 *
 * 置き場所が js/io/ なのは HANDOVER §4 の io/serializer.ts をモジュールパスの表記と
 * 解釈しているため（CUSTOMIZATIONS.md の段階4-0a の記録）。本ファイルは js/ の
 * どのモジュールにも依存しない（import 0 本）ので、読み込み順に影響しない。
 */

export class TypePalette {
    /*
     * ここはクラスフィールド初期化子を使う。js/ の他クラスが declare ＋ コンストラクタ代入に
     * 統一しているのは「upstream の emit を変えない」ためで（docs/ARCHITECTURE.md §5.5 の規約5）、
     * 新規に書くクラスには保存すべき現行 emit が無い。
     *
     * 現行の window.DATATYPES と同じく、読み込み前は false。
     * null にしないのは js/io/ddl-xml.ts が持つ XMLSerializer フォールバック
     * （`element().xml` を評価する死に分岐。段階4-1a まで Designer.toXML() にあった）と
     * 同値を保つため —
     * false なら undefined、null なら TypeError で挙動が割れる。
     * この分岐は §4 の XML 書き出し撤去で消えるので、そのとき null 化する。
     */
    private root: Element | false = false;

    /** dbResponse() と Designer.fromXML() が入れる（＝現行の window.DATATYPES への代入 2 箇所） */
    setRoot(el: Element): void {
        this.root = el;
    }

    /** 読み込み済みか。page 側テストが init2() の完了を待つのに使う */
    isLoaded(): boolean {
        return !!this.root;
    }

    /**
     * <datatypes> 要素そのもの。
     *
     * 戻りを non-null で確定させるのは OZ.$ と同じ論法。読み手はすべて init2() 後で
     * （init2 は locale と datatypes が揃ってから走る）、現行も同じ位置で
     * window.DATATYPES に `as Element` を当てていた。
     */
    element(): Element {
        return this.root as Element;
    }

    /** db/<db>/datatypes.xml の db 属性。js/io.ts が output.xsl のパスと表示に使う */
    db(): string | null {
        return this.element().getAttribute("db");
    }

    types(): HTMLCollectionOf<Element> {
        return this.element().getElementsByTagName("type");
    }

    /** 添字が範囲外なら現行と同じ場所で落ちる（戻りを undefined にしない理由は element() と同じ） */
    typeAt(index: number): Element {
        return this.types()[index]!;
    }

    /*
     * 以下 2 本は設計 JSON の型キー（<type> の id 属性）を引くための面（段階4-2b）。
     *
     * id は label（表示名）とも sql（出力する型名）とも別に置いた**永続化専用のキー**で、
     * 「意味が同じ型の id は変えない・意味が変わったら必ず変える・別の意味で再利用しない」
     * が唯一の契約。label と sql は §6 のパレット現代化で自由に動かしてよい。
     * 規則と根拠は docs/FORMAT.md、規則そのものの検査は tests/node/palette-id.test.ts。
     *
     * どちらも例外を投げない（見つからなければ null / -1）。呼び手によって
     * 「書き出しの入口だから 1 バイトも書かずに落ちる」「読み込みだから位置付きで落ちる」と
     * 出すべき例外が違うので、判断は js/io/json-serializer.ts と js/io/json-parser.ts に置く。
     */

    /** <type> の id 属性。属性が無ければ null */
    idAt(index: number): string | null {
        return this.types()[index]?.getAttribute("id") ?? null;
    }

    /**
     * id -> 添字。無ければ -1。
     *
     * **最初の一致が勝つ**が、id はパレット内で一意であることを
     * tests/node/palette-id.test.ts が全プロファイルについて機械的に押さえているので、
     * label の照合（known-issue #3 の後勝ち）と違って順序に意味は無い。
     */
    indexOfId(id: string): number {
        const types = this.types();
        for (let i = 0; i < types.length; i++) {
            if (types[i]!.getAttribute("id") === id) {
                return i;
            }
        }
        return -1;
    }

    groups(): HTMLCollectionOf<Element> {
        return this.element().getElementsByTagName("group");
    }
}
