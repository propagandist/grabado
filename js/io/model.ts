/* ------------------------- design model ----------------------- */
/*
 * grabado: 直列化の中間モデル（HANDOVER §4 段階4-1a）。
 *
 * 段階4-0b までの直列化は Designer / Table / Row / Key に散った 8 メソッドで、
 * 「ライブオブジェクト -> バイト列」を 1 段でやっていた。ここに JSON を足すと
 * 8 が 16 になるので、§4 の残りに入る前に 2x2 の格子へ組み替える。
 *
 *            ライブ側（描画エンジンを触る）      バイト側（形式を知る）
 *      出    extract.ts の extractModel()       xml-serializer.ts / 4-2 の json
 *      入    4-1b の apply.ts                   4-1b の xml-parser.ts / 4-3 の json
 *
 * ライブ側は形式非依存なので一度だけ書く。形式が増えるとバイト側だけが増える。
 *
 * 本ファイルは型だけで emit が空なので、src/app.ts（読み込み順の文書）には載せない。
 *
 * 規約: モデルは「描画エンジンが実際に保持している値」を写す。型パレットに依存する
 * 解決（添字 -> sql 名 / quote）は serializer と parser が palette 引数を使って行う。
 * 詳細は下の RowModel.type と CUSTOMIZATIONS.md の段階4-1a の記録。
 */

/**
 * 1 回の serialize / deserialize の間だけ生きるスナップショット。
 * ライブツリーと同期し続ける「第 2 の真実」ではない。
 */
export interface DesignModel {
    readonly tables: readonly TableModel[];
}

export interface TableModel {
    readonly title: string;
    readonly x: number;
    readonly y: number;
    /** Table.data.comment。"" が「コメント無し」（現行の if (c) と同じ意味） */
    readonly comment: string;
    readonly rows: readonly RowModel[];
    readonly keys: readonly KeyModel[];
}

export interface RowModel {
    readonly title: string;
    /**
     * 型パレットの添字（Row.data.type そのもの）。
     *
     * sql 名に解決して持たないのは、現行 js/row.ts の toXML() が添字から要素を引いて
     * その要素の sql と quote を読むため。モデルを sql 名にすると serializer は
     * パレットを名前で引き直すことになり、同じ sql を持つ型が 2 つあるパレット
     * （known-issue #3 の BIGINT）では別の要素に当たりうる。今の postgresql では
     * どちらも quote="" なので golden は割れないが、「割れないことがテストで
     * 保証されない」種類の変更になる。添字なら typeAt(index) の逐語移動で済む。
     */
    readonly type: number;
    readonly size: string;
    /** null は「既定 NULL」を表す現行の内部表現（known-issue #2。4-5 で撤去する） */
    readonly def: string | null;
    readonly nll: boolean;
    readonly ai: boolean;
    readonly comment: string;
    /**
     * この行を子（FK 側）とする参照。現行 Row.toXML() の
     * 「this.relations のうち r.row2 != this を除いたもの」と同じ並びで、
     * <row> 直下に出る <relation> と 1:1。
     */
    readonly relations: readonly RelationRef[];
}

/**
 * 参照先（親）の指し方。現行 XML がそのまま名前で持つので名前で写す
 * （r.row1.owner.getTitle() / r.row1.getTitle() の逐語）。
 *
 * 同名のテーブルが 2 つあると復元時に両端が同じテーブルに解決される既知の
 * 不具合は、この名前解決に由来する。id 参照へ移すかは formatVersion: 1 の
 * スキーマを決める 4-2 の判断（CUSTOMIZATIONS.md 段階4-0a の申し送り）。
 */
export interface RelationRef {
    readonly table: string;
    readonly row: string;
}

export interface KeyModel {
    /** Key.getType()。setType() が null を握りつぶすので既定 "INDEX" から動かない */
    readonly type: string;
    /**
     * Key.getName()。型は string だが、name 属性の無い <key> を読み込むと
     * 実行時は null が入り name="null" と書き出される（現行の癖。fixture の
     * <key> 11 個はすべて name を持つので golden も known-issues も検出しない）。
     * 現行と同じ嘘をそのまま持つ。
     */
    readonly name: string;
    /** <part> に書く行名（Key.rows の getTitle()） */
    readonly parts: readonly string[];
}
