/* ------------------------- ddl shared ------------------------- */
/*
 * grabado: DesignModel -> DDL の共通層（HANDOVER §6 段階6-5a）。
 *
 * 6-5a は db/<db>/output.xsl（XSLT 1.0・5 本）を TS へ**逐語移植**する段階で、
 * tests/golden/ddl/ の 35 本が 1 バイトも動かないことが完了判定。したがって
 * ここが提供するのは「XSLT が見ていた入力そのもの」——つまり段階4-4 までの
 * buildDdlInputXml() が組み立てていた DDL 入力 XML と 1 対 1 に対応する構造体で、
 * XPath 式をそのまま TS の条件式へ写せる形にしてある。
 *
 *   XSLT                          本ファイル
 *   ----------------------------  --------------------------------
 *   <xsl:if test="comment">       if (table.comment)      ← "" が「要素が無い」
 *   <xsl:if test="default">       if (row.hasDefault)
 *   <xsl:if test="@null = 0">     if (!row.nullable)
 *   <xsl:value-of select="datatype" />  row.datatype      ← sql + (size) 解決済み
 *
 * **型パレットを読むのはここだけ。** 5 つのプロファイル実装は解決済みの文字列しか
 * 見ない —— XSLT 側が datatypes.xml を一度も参照していなかったのと同じ分業を保つ
 * （その実測は段階4-4 の記録にある）。docs/ARCHITECTURE.md §5.6 の規約2
 * 「型パレット依存の解決は引数で渡す」もこの位置。
 *
 * XML を経由しないので、エスケープは 1 つも要らない。XSLT 経路では escapeXML() で
 * 実体参照にしたものを method="text" の出力が元に戻していただけで、往復の net が
 * 生値だった（& を含む識別子が現行どおり生のまま DDL に出るのはこのため）。
 */

import type { TypeKind, TypePalette } from "../palette.ts";
import type { DesignModel, TableModel, RowModel, KeyModel } from "../model.ts";

/** <relation table="..." row="..." /> */
export interface DdlRelation {
    readonly table: string;
    readonly row: string;
}

/** <row> ＋ 解決済みの <datatype> / <default> */
export interface DdlRow {
    readonly name: string;
    /** <datatype> のテキスト。型の sql 属性 ＋ size があれば "(size)" */
    readonly datatype: string;
    /**
     * 正規型（段階6-9c）。**ORM 出力（6-9d〜）だけが読む** —— 8 本の DDL 生成器は
     * 解決済みの datatype しか見ない。旧 XML 同梱のパレットには kind が無いので null になりうる。
     */
    readonly kind: TypeKind | null;
    /** サイズ / 精度（"255" や "12,2"）。DDL は datatype に畳んであるが ORM は別々に要る */
    readonly size: string;
    /** <default> 要素が在るか（XSLT の test="default"）。"" は要素ごと出ない */
    readonly hasDefault: boolean;
    /** <default> のテキスト。型の quote を適用済み */
    readonly def: string;
    /** @null="1"（NULL 許可）。XSLT の test="@null = 0" は !nullable */
    readonly nullable: boolean;
    /** @autoincrement="1" */
    readonly autoincrement: boolean;
    /** <comment> のテキスト。"" が「要素が無い」 */
    readonly comment: string;
    readonly relations: readonly DdlRelation[];
}

/** <key type="..." name="..."><part>... */
export interface DdlKey {
    readonly type: string;
    /**
     * name 属性の値。**常に string で、属性が無ければ ""**（段階6-5b で
     * js/io/xml-parser.ts が正規化するようになった。それまでは "null" という文字列）。
     * 空のときに §6.3 の規約で名前を組むのは js/io/ddl/naming.ts。
     */
    readonly name: string;
    readonly parts: readonly string[];
}

/** <table x=".." y=".." name=".."> ※ x / y はどの output.xsl も参照しないので持たない */
export interface DdlTable {
    readonly name: string;
    readonly comment: string;
    readonly rows: readonly DdlRow[];
    readonly keys: readonly DdlKey[];
}

export function buildDdlModel(model: DesignModel, palette: TypePalette): DdlTable[] {
    return model.tables.map((t) => buildTable(t, palette));
}

function buildTable(table: TableModel, palette: TypePalette): DdlTable {
    return {
        name: table.title,
        comment: table.comment,
        rows: table.rows.map((r) => buildRow(r, palette)),
        keys: table.keys.map(buildKey),
    };
}

function buildRow(row: RowModel, palette: TypePalette): DdlRow {
    const elm = palette.typeAt(row.type);

    /* js/io/ddl-xml.ts:147-154 の逐語。sql 属性の無い型は datatypes.xml に存在しない */
    let datatype = elm.getAttribute("sql")!;
    /*
     * **size を取らない型（length="0"）には括弧を付けない**（段階6-8d）。
     * db/postgresql/datatypes.xml の頭が「UI の size 欄を型ごとに閉じるかは、全プロファイルが
     * strict になる 6-8 まで片側だけ閉じる形になる」と送っていた、その時点。読み込み側
     * （js/io/xml-parser.ts）は寄せ先が length="0" なら size を捨てるが、**UI で打った size は
     * そこを通らない** —— sqlite は全型が length="0" なので、閉じないと TEXT(255) という
     * STRICT SQLite が必ず拒む DDL が出る。既存 golden 56 本への影響は 0（サイズ付きで
     * length="0" に解決する列が 1 つも無いため）。**UI の size 欄は 6-9a で閉じた**
     * （js/row.ts の syncSizeField と update の正規化）ので、読み込み・DDL・UI の
     * 3 経路が同じ TypePalette.hasSize を共有している。
     */
    if (row.size.length && palette.hasSize(row.type)) {
        datatype += "(" + row.size + ")";
    }

    return {
        name: row.title,
        datatype: datatype,
        kind: palette.kindAt(row.type),
        size: row.size,
        hasDefault: row.def !== "",
        def: row.def === "" ? "" : quoteDefault(row.def, elm),
        nullable: row.nll,
        autoincrement: row.ai,
        comment: row.comment,
        relations: row.relations.map((r) => ({ table: r.table, row: r.row })),
    };
}

function buildKey(key: KeyModel): DdlKey {
    return { type: key.type, name: key.name, parts: key.parts.slice() };
}

/**
 * 既定値に型の quote を適用する（js/io/ddl-xml.ts:158-169 の逐語移設）。
 *
 * 「囲まない側」の判定は下の isSqlExpression（段階6-4）、囲む側の値のエスケープは
 * escapeLiteral（段階6-5b。known-issues #11）。
 *
 * **段階6-8d で規則が 1 つになった。** 6-8c まではここに strict / 未現代化の分岐があり、
 * 未現代化側は「CURRENT_TIMESTAMP 以外は中を見ずに囲む」という upstream の規則だった
 * （O'Brien が DEFAULT 'O'Brien' になる #11 が残っていたのはそちら）。sqlite が現代化されて
 * 寄せ先が尽きたので、分岐ごと落とした —— **#11 は 8 本すべてで消えた**。
 */
function quoteDefault(def: string, elm: Element): string {
    /* quote 属性が無い型では現行も "null" が連結される（挙動不変） */
    const q = elm.getAttribute("quote")!;
    return isSqlExpression(def) ? def : q + escapeLiteral(def, q) + q;
}

/**
 * 引用符で囲む前に、値の中の同じ記号を二重化する（known-issues #11。段階6-5b）。
 *
 * upstream は quote 属性を前後に足すだけで値の中を一度も見ておらず、O'Brien を既定値に
 * すると DEFAULT 'O'Brien' という壊れた DDL が出ていた。§6.2 のテンプレートで「文字列の
 * 既定値を打つ」が house 既定の一部になった（段階6-4）ぶん、実際に踏む道が増えている。
 *
 * quote が空の型（数値・boolean）は囲まないので分解もしない —— 空文字で split すると
 * 値が 1 文字ずつに割れる。
 */
function escapeLiteral(def: string, quote: string): string {
    if (quote === "") {
        return def;
    }
    return replaceSubstring(def, quote, quote + quote);
}

/**
 * 囲まずにそのまま出す SQL キーワード（isSqlExpression の判定 2）。照合は大小を無視する。
 *
 * **SYSDATE / SYSTIMESTAMP は Oracle 固有だが同じ表に置いた**（段階6-8c）。どちらも
 * **括弧を付けられない擬似列**で、関数呼び出しの判定（isFunctionCall）に掛からないため
 * ここに無いと `DEFAULT 'SYSTIMESTAMP'` と引用されて壊れる。house 既定の監査列が
 * Oracle でそのまま踏む道なので、実物に流して見つけた（CUSTOMIZATIONS.md 段階6-8c）。
 *
 * dialect ごとにリストを分ける案は採らなかった —— 分けるほどの数ではなく、他プロファイルで
 * SYSDATE という**文字列**を既定値にしたい場面が現実的に無いため。必要になったら
 * IdentifierRules と同じ形（プロファイルごとの規則オブジェクト）へ移す。
 */
const SQL_DEFAULT_KEYWORDS = [
    "TRUE",
    "FALSE",
    "NULL",
    "CURRENT_DATE",
    "CURRENT_TIME",
    "CURRENT_TIMESTAMP",
    "CURRENT_USER",
    "SESSION_USER",
    "LOCALTIME",
    "LOCALTIMESTAMP",
    /* Oracle の擬似列（括弧を付けられない） */
    "SYSDATE",
    "SYSTIMESTAMP",
];

/**
 * 既定値が関数呼び出しの形か（`now()` / `UUID()` / `pg_catalog.now()`）。
 *
 * **MySQL 8 は式の既定値を括弧で包むことを要求する**（`DEFAULT (UUID())`）。8.0.13 で入った
 * 式デフォルトの構文で、包まないと構文エラーになる —— **MariaDB は `DEFAULT UUID()` を
 * そのまま受ける**ので、この 2 本の間の実際の差。段階6-8a で生成 DDL を MySQL 8.4.11 に
 * 流して見つけた（CUSTOMIZATIONS.md の段階6-8a）。
 *
 * キーワード（`CURRENT_TIMESTAMP` ほか）は**包んではいけない** —— MySQL では
 * `DEFAULT CURRENT_TIMESTAMP` が TIMESTAMP 列の自動初期化という別の意味を持ち、
 * `DEFAULT (CURRENT_TIMESTAMP)` にすると式デフォルトとして扱われて意味が変わる。
 * だから isSqlExpression 全体ではなく**関数呼び出しだけ**を切り出してある。
 */
export function isFunctionCall(def: string): boolean {
    return /^[A-Za-z_][\w$]*(\.[A-Za-z_][\w$]*)*\s*\(.*\)$/.test(def);
}

/**
 * <default> を型の quote で囲まずにそのまま出す値か（段階6-4。**strict プロファイル限定**）。
 *
 * 判定は「囲まない側」を列挙する形にしてある —— 迷ったら囲む（＝従来どおり）に倒れるので、
 * 判定漏れが「文字列既定値が裸で出る」方向に働かない。規則の表は docs/FORMAT.md。
 * 6-4 が js/io/ddl-xml.ts に置いたものを 6-5a がそのまま引き取った（規則は不変）。
 */
function isSqlExpression(def: string): boolean {
    /* 数値リテラル。0 / -1.5 / 1e3 */
    if (/^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/.test(def)) {
        return true;
    }
    /* キーワード。大小は無視する（手書きの true も受ける） */
    if (SQL_DEFAULT_KEYWORDS.includes(def.toUpperCase())) {
        return true;
    }
    /* 関数呼び出し。now() / uuidv7() / gen_random_uuid() / pg_catalog.now() */
    if (isFunctionCall(def)) {
        return true;
    }
    /* ユーザーが自分で引用符を書いた（囲むと二重になる） */
    if (def.startsWith("'")) {
        return true;
    }
    /* キャスト式。'{}'::jsonb / ARRAY[]::text[] */
    if (def.includes("::")) {
        return true;
    }
    /* 配列コンストラクタ。ARRAY[1,2] */
    if (/^ARRAY\[/i.test(def)) {
        return true;
    }
    return false;
}

/**
 * XSLT の replace-substring テンプレート（postgresql / mysql / oracle が持っていた再帰）。
 * 使われ方は ' -> '' の 1 通りだけで、split/join と同じ結果になる。
 */
export function replaceSubstring(value: string, from: string, to: string): string {
    return value.split(from).join(to);
}
