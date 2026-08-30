/* ------------------------- design model ----------------------- */
/*
 * grabado: 直列化の中間モデル（HANDOVER §4 段階4-1a）。
 *
 * 段階4-0b までの直列化は Designer / Table / Row / Key に散った 8 メソッドで、
 * 「ライブオブジェクト -> バイト列」を 1 段でやっていた。ここに JSON を足すと
 * 8 が 16 になるので、§4 の残りに入る前に 2x2 の格子へ組み替える。
 *
 *            ライブ側（描画エンジンを触る）      バイト側（形式を知る）
 *      出    extract.ts の extractModel()       ddl-xml.ts / json-serializer.ts
 *      入    apply.ts の applyDesignModel()     xml-parser.ts / json-parser.ts
 *
 * ライブ側は形式非依存なので一度だけ書く。形式が増えるとバイト側だけが増える。
 * 4 本すべてが揃ったのが段階4-1b。
 *
 * 本ファイルは型だけで emit が空なので、src/app.ts（読み込み順の文書）には載せない。
 *
 * 規約: モデルは「描画エンジンが実際に保持している値」を写す。型パレットに依存する
 * 解決（添字 -> sql 名 / quote）は serializer と parser が palette 引数を使って行う。
 * 詳細は下の RowModel.type と CUSTOMIZATIONS.md の段階4-1a の記録。
 *
 * 段階4-1b の追補 —— **入りと出でモデルは完全には対称でない**。
 *
 *   1. 型が嘘をつく箇所が入り側だけにある。TableModel.title / RowModel.title /
 *      KeyModel.type / RelationRef.table / RelationRef.row は parser が getAttribute の
 *      生値を入れるので、属性が無ければ**実行時 null**。現行の 4 実装がそれぞれ
 *      !（non-null assertion）や早期 return で受けていた癖をそのまま持っている。
 *      extract 側は必ず string を入れる。**KeyModel.name は段階6-5b で外れた**（下記）。
 *   2. RowModel.def は入り側では「XML / JSON が言った値」で、出側では「ツリーが保持して
 *      いる値」。"NULL" -> "" の正規化が Row.update() の中で起きるため。
 *
 * 1 は 4-4 で消す予定だったが残っている。**KeyModel.name だけは段階6-5b で解消した** ——
 * 「serializer が String() で受けて name="null" を書く現行仕様を保つ」（段階4-4 の決めたこと 3）
 * の相手だった XML の書き出しが 6-5a で消え、DDL 側にだけ "null" という制約名が残る形に
 * なっていたため、xml-parser.ts が "" に正規化する側へ倒した。
 * 2 は **意図して残す** —— 段階4-5 で「既定 NULL」の内部表現（null）は撤去したが、
 * 正規化そのものは Row.update() の 1 箇所に置いたままにした。parser 側にも同じ規則を
 * 書くと、同じ規則が 2 箇所に分かれて片方だけ直す事故の余地が残る（4-1b の決めたこと 3
 * と同じ立場）。したがって parser は読んだ生値を渡し、正規化は update() だけが行う。
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
    /**
     * 既定値。**"" が「既定なし」**（段階4-5 で「既定 NULL」の内部表現を撤去した）。
     *
     * 出側（extract）は必ずツリーの値＝正規化済みの文字列。入り側（parser）は読んだ
     * 生値なので、4-3b 以前に書き出された <default>NULL</default> を読むと "NULL" が
     * 入りうる。それを "" に潰すのは apply -> Row.update()（上の非対称 2）。
     */
    readonly def: string;
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
     * Key.getName()。**常に string**（段階6-5b）。name 属性の無い <key> は
     * xml-parser.ts が "" にする —— それまでは実行時 null が入り、DDL 生成が
     * String() で受けて制約名 "null" を作っていた。fixture の <key> 11 個は
     * すべて name を持つので golden はこの違いを 1 行も写さない
     * （tests/node/ddl.test.ts に恒久テストがある）。
     */
    readonly name: string;
    /** <part> に書く行名（Key.rows の getTitle()） */
    readonly parts: readonly string[];
}
