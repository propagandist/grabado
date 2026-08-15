/* ------------------------- json format ------------------------ */
/*
 * grabado: 設計 JSON（formatVersion: 2）の形（HANDOVER §4 段階4-2 / 4-2b）。
 *
 * js/io/json-serializer.ts（書き出し）と js/io/json-parser.ts（読み込み）が共有する
 * **形式の正本**。仕様の散文は docs/FORMAT.md にある。
 *
 * 本ファイルは型だけで emit が空なので、src/app.ts（読み込み順の文書）には載せない
 * （js/io/model.ts と同じ扱い）。
 *
 * ## モデル（js/io/model.ts）との違い
 *
 * DesignModel は「描画エンジンが実際に保持している値」の写しで、型は**パレットの添字**、
 * 語彙は描画エンジンのもの（title / row / relations）。こちらは**ファイル正本の形**で、
 * 型は**パレットの id**、語彙は ER 設計のもの（name / column / references）。
 * 添字 <-> id の変換は形式側 2 本が palette 引数を使って行う（段階4-1a の規約）。
 *
 * ## 決定論の契約（CLAUDE.md 制約3）
 *
 * - **キー順は下の interface の宣言順**。JSON.stringify は挿入順を保つので、
 *   serializer のオブジェクトリテラル / 代入の並びがそのまま出力順になる。
 * - 整形は 2 スペース、末尾に LF 1 つ（tests/support/state.ts と同じ形）。
 * - **既定値と同じ値のキーは出さない**（? が付いているものがそれ）。省略時の既定は
 *   各フィールドのコメントにある。テーブル 1 件が独立ブロックになり、テーブル追加が
 *   最小差分として出る。
 */

/** 組み立て用。readonly を外すだけで、形は下の interface が正本 */
export type Writable<T> = { -readonly [K in keyof T]: T[K] };

export interface JsonDesign {
    /**
     * 形式の版。読み込み側は 2 以外を拒否する。
     *
     * リテラル型にしてあるのは、版を増やすときに serializer / parser の両方が
     * typecheck で赤くなるようにするため（定数を 1 か所に置くと片方だけ直せてしまう）。
     * 4-2b で 1 -> 2 に上げたときに実際そう動いた。
     */
    readonly formatVersion: 2;
    /**
     * 書き出したときの型パレット（db/<db>/datatypes.xml の db 属性）。
     * パレット全文は入れない —— 数百行のノイズが全設計ファイルに乗り、
     * diff フレンドリー要件と噛み合わないため（CUSTOMIZATIONS.md 段階4-2）。
     *
     * **必須。読み込み側は実行中のパレットと照合し、食い違えば例外**（4-2b）。
     * id はプロファイル内で一意なだけなので、db が load-bearing でないと
     * 型キーの安全性が成立しない —— 実測では postgresql と mysql が **label を 12 個共有**
     * しており（Integer / Text / Timestamp / Char / Varchar ...）、4-2 の「db を読んで捨てる」
     * ままだと PG の設計を mysql パレットで開いたときに 12 型が例外にならず
     * **黙って別の型に解決される**（PG の Text=TEXT -> mysql の Text=MEDIUMTEXT）。
     */
    readonly db: string;
    /** 空でも出す（"tables": []） */
    readonly tables: readonly JsonTable[];
}

export interface JsonTable {
    readonly name: string;
    /** 座標は省略しない。省略を許すと原点に重なるテーブルが黙って生まれる */
    readonly x: number;
    readonly y: number;
    /** 既定 ""（コメント無し） */
    readonly comment?: string;
    /** 空でも出す */
    readonly columns: readonly JsonColumn[];
    /** 既定 []（key 無し） */
    readonly keys?: readonly JsonKey[];
}

export interface JsonColumn {
    readonly name: string;
    /**
     * 型パレットの **id**（"bigint" など。db/<db>/datatypes.xml の `<type id="...">`）。
     *
     * label でも sql 名でもないのは、**どちらもパレット差し替えで動く**から。
     * label は表示名で §6 のパレット現代化が変え、sql は §6 が変えることを目的にしている
     * 属性そのもの（SERIAL -> identity、CHAR -> TEXT、TIMESTAMP -> TIMESTAMPTZ）。
     * 正本ファイルの型キーに最も不安定な属性を選ぶわけにいかない。
     *
     * id の契約は「意味が同じ型の id は変えない・意味が変わったら必ず変える・
     * 別の意味で再利用しない」の 1 つだけ。詳細は docs/FORMAT.md。
     */
    readonly type: string;
    /** 既定 ""（サイズ指定なし）。"11" / "10,2" のような生文字列 */
    readonly size?: string;
    /** 既定 false */
    readonly nullable?: boolean;
    /** 既定 false */
    readonly autoincrement?: boolean;
    /**
     * 既定 = 既定値なし。**引用符は付けない**（XML は型の quote 属性で囲んでいた）。
     *
     * モデルの def は段階4-2 の時点では null（＝ DEFAULT NULL）と ""（＝既定なし）の
     * 2 つを持ち、JSON はどちらも「キーを出さない」に潰していた。known-issue #2
     * （nullable な行が保存で <default>NULL</default> を獲得する）と #5（空の <default>）を
     * JSON 経路に最初から持ち込まないため。**段階4-5 で内部表現から null が消えた**ので、
     * いま潰しているのは "" だけ。読み戻しもキーが無ければ "" を入れる。
     */
    readonly default?: string;
    /** 既定 "" */
    readonly comment?: string;
    /** 既定 []。この列を子（FK 側）とする参照 */
    readonly references?: readonly JsonReference[];
}

/**
 * 参照先（親）の指し方。**名前で持つ**（現行 XML と同じ）。
 *
 * 同名のテーブルが 2 つあると復元時に両端が先頭のテーブルへ解決される既知の不具合は
 * この名前解決に由来するが、id 参照へ移すとライブ側（js/io/extract.ts /
 * js/io/apply.ts と描画クラス）に id の発番が要る。4-2 は形式側 2 本を足す段階なので
 * 名前のままとし、「壊れた設計を保存させない」方向の始末を 4-4 に申し送る
 * （CUSTOMIZATIONS.md 段階4-2）。
 */
export interface JsonReference {
    readonly table: string;
    readonly column: string;
}

export interface JsonKey {
    readonly type: string;
    /** 既定 ""（Key のコンストラクタ既定と同じ） */
    readonly name?: string;
    readonly columns: readonly string[];
}
