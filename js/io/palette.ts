/* ------------------------- type palette ----------------------- */
/*
 * grabado: 型パレット層（HANDOVER §4 段階4-0b）。
 *
 * db/<db>/datatypes.xml の <datatypes> 要素を包むだけの層。段階3-4c まで
 * window.DATATYPES という出荷コードのグローバルだったものを、Designer が持つ
 * インスタンス（Designer.palette）に移した。読み手は owner 鎖で到達する
 * （段階4-0a の SQL.designer 撤去と同じ論法。js/globals.ts の該当コメントを参照）。
 *
 * 本層はキャッシュを持たない。段階4-0b 時点では「Designer 側の typeIndex / fkTypeFor だけが
 * 唯一のキャッシュで、ここに寄せると *datatypes を差し替えても消えない* 現行の寿命が変わる」
 * ことを理由に温存していたが、**段階6-2 でそのキャッシュごと廃止した**（型解決が id 照合に
 * なり線形走査 1 回で済むようになったため）。差し替え後に古い結果が返る経路は無くなり、
 * setRoot() に「呼ぶたびにキャッシュを捨てる」という契約を足す必要も無い。
 * 経緯と実測は CUSTOMIZATIONS.md の段階6-2。
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

    /*
     * 以下 2 本は型解決の面（段階6-2）。それまで Designer.getTypeIndex / getFKTypeFor と
     * js/io/xml-parser.ts の照合ループに分かれていたものを、パレットを見る側に寄せた。
     */

    /**
     * <datatype> の型名（サイズを外したもの）-> 添字。無ければ -1。
     *
     * **sql の完全一致は先勝ち**（段階6-2 で known-issue #3 を直した箇所）。現行は break を
     * 持たず最後の一致が勝っていたので、db/postgresql/datatypes.xml が sql="BIGINT" を
     * bigint と x_real の 2 か所に持つぶん BIGINT が Real に化けていた。
     *
     * **re は現行どおり後勝ちで、sql の完全一致も上書きしうる**（known-issue #10）。ここを
     * 直さないのは意図的 —— re はアンカーされておらず（postgresql の integer は re="INT" で
     * BIGINT / SMALLINT / INTERVAL すべてに部分一致する）、素朴に先勝ちへ倒すと oracle が
     * INTEGER -> NUMBER を失うだけでなく mssql は re="INT" を 4 型に持つぶん
     * INTEGER -> tinyint と**縮む**。壊れているのは照合順ではなくパレット側の re なので、
     * 直すのは 6-8（既存主要 4 本の現代化）。判断の実測は CUSTOMIZATIONS.md の段階6-2。
     *
     * 一致が無いときに先頭の型へ落とすフォールバック（known-issue #4）は呼び手に残る。
     * ここは -1 を返すだけで、strict 化の判断は 6-3 が js/io/xml-parser.ts で行う。
     */
    indexOfTypeName(name: string): number {
        const types = this.types();
        let index = -1;
        let sqlFound = false;
        for (let i = 0; i < types.length; i++) {
            if (types[i]!.getAttribute("sql") === name) {
                /* 2 件目以降の sql 一致は見ない（現行の || 短絡と同じく re も評価しない） */
                if (!sqlFound) {
                    index = i;
                    sqlFound = true;
                }
                continue;
            }
            const re = types[i]!.getAttribute("re");
            if (re && new RegExp(re).exec(name)) {
                index = i;
            }
        }
        return index;
    }

    /**
     * この型を親に持つ FK 子行の型。<type fk="..."> が無ければ自分自身。
     *
     * fk は **id 参照**（段階6-2 で label 参照から変えた）。label は §6 のパレット現代化が
     * 自由に動かしてよい表示名で、それを照合キーにしていると label を 1 文字動かした瞬間に
     * 解決が undefined になり Row.update({type: undefined}) 経由で UI ごと落ちる。
     * fk の値が実在する id であることは tests/node/palette-id.test.ts が全プロファイルで押さえる。
     *
     * 引けなかったときに自分自身へ倒すのは、id を持たない旧パレット（段階4-2b 以前の設計 XML に
     * 同梱された <datatypes>）を読んでも落ちないようにするため。
     */
    fkIndexFor(index: number): number {
        const fk = this.types()[index]?.getAttribute("fk");
        if (!fk) {
            return index;
        }
        const target = this.indexOfId(fk);
        return target === -1 ? index : target;
    }

    groups(): HTMLCollectionOf<Element> {
        return this.element().getElementsByTagName("group");
    }
}
