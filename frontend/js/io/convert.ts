/* ------------------------- convert ---------------------------- */
/*
 * grabado: DesignModel -> 別プロファイルの DesignModel（HANDOVER §6 段階6-10a）。
 *
 * **設計の db と出力の db を別にする。** それまで `db` の 1 文字列が「型パレット」と
 * 「DDL 生成器」と「設計 JSON の型キーの名前空間」と「識別子規則」を同時に決めていたため、
 * **PostgreSQL で設計したものを MySQL 向けに出す**という ER 設計ツールとして当たり前の
 * 使い方が通らなかった。6-8d が「8 本そろったことで実際の欠落になった」と送った項目。
 *
 * **スコープは出力時だけ**（6-10 の決定）。読み込み時の変換（別プロファイルの設計を開く）は
 * やらない —— js/io/json-parser.ts の db 照合は型キーの安全性そのもの（4-2b）で、そこに
 * 穴を開けると「正本を黙って別の型で開く」に倒れる。ここは**設計に 1 バイトも触らず、
 * 出力の直前にモデルの写しを作るだけ**なので、保存されるファイルは何も変わらない。
 *
 * **写像は正規型（kind）1 段**（6-9c）。(db, 型 id) の表を持つと 8×8 = 56 表になる ——
 * ORM 出力が「kind -> 言語型」の表 1 つで済んでいるのと同じ理由でこちらも 1 段にした。
 *
 * ここは純関数で、描画エンジンにも locale にも触らない（docs/ARCHITECTURE.md §5.6 の規約1・3）。
 */

import type { DesignModel, RowModel, TableModel } from "./model.ts";
import type { TypeKind, TypePalette } from "./palette.ts";
import { newRowType } from "./template.ts";

/**
 * 変換で意味が落ちた理由。**「落ちた」を黙らせないための型**で、呼び手（DDL 生成）は
 * これを生成物のコメントに出す。6-9d / 6-9e の ORM 出力が「写せない型は既定型に落として
 * 理由を行コメントで残す」とやったのと同じ立場。
 */
export type LossReason =
    /** その kind を持つ型も、劣化して受けられる型も寄せ先に無い。既定型に落とした */
    | "unmappable"
    /** 別の kind に劣化して写した（tz が落ちる / 日付に時刻が付く / uuid が文字列になる） */
    | "kind-widened"
    /** 寄せ先が length="0" なのでサイズを捨てた（TEXT(10) という壊れた DDL を出さない） */
    | "size-dropped"
    /**
     * **寄せ先はサイズを要求するのに、設計側にサイズが無い。**（段階6-10a）
     *
     * mssql は文字列型が 4 本とも length="1" で、サイズを取らない型を 1 つも持たない ——
     * postgresql の `TEXT` を持っていくと `nvarchar` とだけ書かれ、**SQL Server はこれを
     * nvarchar(1) と解釈する**（生成物を読んで気づいた）。補うべき値はどこにも無いので
     * 出力はそのままにし、**流す前に長さを足せ**と言う側に倒してある。
     */
    | "size-required";

export interface TypeLoss {
    readonly table: string;
    readonly column: string;
    /** 元の型の sql 名（サイズは含まない） */
    readonly from: string;
    /**
     * 元の型の正規型。**sql 名だけでは何が変わったのか分からない**ので添える ——
     * postgresql の `INTEGER` は int32、sqlite の `INTEGER` は int64 で、名前が同じまま
     * 値の域だけが動く（生成物を読んで気づいた。段階6-10a）。
     */
    readonly fromKind: TypeKind | null;
    /** 寄せ先の型の sql 名（サイズは含まない） */
    readonly to: string;
    readonly toKind: TypeKind | null;
    readonly reason: LossReason;
}

export interface ConvertResult {
    readonly model: DesignModel;
    /** 設計の順（テーブル -> 列 -> 理由）。1 列に 2 つ出ることがある */
    readonly losses: readonly TypeLoss[];
}

/**
 * kind を写せないときに**代わりに受けられる kind**（劣化の向きつき。段階6-10a）。
 *
 * **入っているのは「値が保たれる」か「劣化が明白で表現はできる」向きだけ。** 逆向き
 * （timestamp -> date、float64 -> float32、decimal -> float64）は情報が黙って消えるので
 * 1 つも入れない —— 変換層が最も避けるべきなのは「開いたら別の意味になっていた」で、
 * それは 6-8d が `aka` を膨らませる案を却下した理由そのもの。
 *
 * **この表が要るのは、無いと実用にならないから。** sqlite は型が 5 つしか無く、PG が使う
 * kind のうち 14 種類を持たない。表が無いと sqlite 向けの出力はほぼ全列が既定型落ち＋警告に
 * なるが、実際には uuid も date も TEXT に置くのが sqlite の慣行で、**それは劣化ではなく
 * その DB のやり方**。同じことが「mysql に uuid 型が無い（CHAR(36) を使う）」にも言える。
 *
 * **(db, 型 id) の表ではない**（6-9c が避けた形）。21 語の kind の中だけで閉じており、
 * プロファイルが 1 本増えても 1 行も増えない。
 */
export interface KindFallback {
    readonly kind: TypeKind;
    /**
     * 寄せ先がサイズを取る型なら**補う値**。設計側にサイズが無くても、この kind なら
     * 値の幅が決まっているという知識がある場合だけ持つ（いまは uuid だけ）。
     *
     * **無いと PRIMARY KEY が作れない。** postgresql の uuid を mysql へ写すと
     * サイズを取らない `LONGTEXT` に寄り、MySQL は `BLOB/TEXT column used in key
     * specification without a key length` で **CREATE TABLE ごと拒む** ——
     * house 既定の PK が uuid なので、補わないと変換した DDL がまず流せない
     * （**生成物を MySQL 8.4 に流して見つけた**。段階6-10a）。
     */
    readonly size?: string;
}

export const KIND_FALLBACKS: Readonly<Record<TypeKind, readonly KindFallback[]>> = {
    /* 整数は幅の広い側へ。値は 1 つも失われない */
    int8: [{ kind: "int16" }, { kind: "int32" }, { kind: "int64" }, { kind: "decimal" }],
    int16: [{ kind: "int32" }, { kind: "int64" }, { kind: "decimal" }],
    int32: [{ kind: "int64" }, { kind: "decimal" }],
    int64: [{ kind: "decimal" }, { kind: "string" }],
    /* 小数。float32 -> float64 は値が保たれる。decimal -> float64 は精度が落ちるので入れない */
    float32: [{ kind: "float64" }, { kind: "decimal" }],
    float64: [{ kind: "decimal" }, { kind: "string" }],
    decimal: [{ kind: "string" }],
    /* string は最後の受け皿なので自分の逃げ道を持たない（8 本すべてが string を持つ） */
    string: [],
    binary: [{ kind: "string" }],
    /* sqlite に boolean は無く、整数 0/1 で持つのが慣行 */
    boolean: [
        { kind: "int8" },
        { kind: "int16" },
        { kind: "int32" },
        { kind: "int64" },
        { kind: "string" },
    ],
    /* 日時。**落とす向きだけ**。Oracle の DATE は時刻を含むので date -> timestamp に当たる */
    date: [{ kind: "timestamp" }, { kind: "string" }],
    time: [{ kind: "string" }],
    time_tz: [{ kind: "time" }, { kind: "string" }],
    timestamp: [{ kind: "string" }],
    timestamp_tz: [{ kind: "timestamp" }, { kind: "string" }],
    interval: [{ kind: "string" }],
    /*
     * **サイズを持つ唯一の逃げ道。** 36 は正準形（8-4-4-4-12 のハイフン付き）の文字数で
     * mysql / oracle の慣行（CHAR(36) / VARCHAR2(36)）、16 は生のバイト数（oracle の RAW(16)）。
     * サイズを取らない型（sqlite の TEXT）に寄ったときは下で捨てられる。
     */
    uuid: [
        { kind: "string", size: "36" },
        { kind: "binary", size: "16" },
    ],
    json: [{ kind: "string" }],
    xml: [{ kind: "string" }],
    geometry: [{ kind: "binary" }, { kind: "string" }],
    /* other は「正規型に写せない」の主張（6-9c）。ここで止まる */
    other: [],
};

/**
 * 設計を別プロファイルの型に写す。
 *
 * **同じ db なら恒等**（同一の添字・同一の size をそのまま返す）。既存の golden
 * （ddl 56 / orm 28）が 1 バイトも動かない根拠がここで、寄せ先の選び方を通すと
 * 「同じ kind の先頭型」に寄って別の型になりうる（PG の varchar と text は同じ string）。
 */
export function convertDesign(
    model: DesignModel,
    from: TypePalette,
    to: TypePalette,
): ConvertResult {
    const fromDb = from.db();
    if (from === to || (fromDb !== null && fromDb === to.db())) {
        return { model: model, losses: [] };
    }

    const losses: TypeLoss[] = [];
    const tables = model.tables.map((t) => convertTable(t, from, to, losses));
    return { model: { tables: tables }, losses: losses };
}

function convertTable(
    table: TableModel,
    from: TypePalette,
    to: TypePalette,
    losses: TypeLoss[],
): TableModel {
    return {
        title: table.title,
        x: table.x,
        y: table.y,
        comment: table.comment,
        rows: table.rows.map((r) => convertRow(r, table, from, to, losses)),
        /* キーと関係は型に触れないのでそのまま（列名で持っているため添字の付け替えも要らない） */
        keys: table.keys,
    };
}

function convertRow(
    row: RowModel,
    table: TableModel,
    from: TypePalette,
    to: TypePalette,
    losses: TypeLoss[],
): RowModel {
    const target = resolveType(row.type, from, to);
    const fromSql = sqlNameAt(from, row.type);
    const toSql = sqlNameAt(to, target.index);
    const note = (reason: LossReason): void => {
        losses.push({
            table: table.title,
            column: row.title,
            from: fromSql,
            fromKind: from.kindAt(row.type),
            to: toSql,
            toKind: to.kindAt(target.index),
            reason: reason,
        });
    };

    if (target.reason !== null) {
        note(target.reason);
    }

    /*
     * サイズは寄せ先の length に従う（js/io/xml-parser.ts と js/io/ddl/shared.ts が
     * 共有している既存の規則。**これで 3 つ目の読み手**になる）。CHAR(10) が TEXT に
     * 寄ったときに TEXT(10) を出さないための規則で、寄せ先が strict でも同じ。
     */
    let size = row.size;
    /* 逃げ道が値の幅を知っているなら補う（uuid -> CHAR(36)）。寄せ先が取らないなら下で捨てる */
    if (size === "" && target.fillSize !== undefined && to.hasSize(target.index)) {
        size = target.fillSize;
    }
    if (size !== "" && !to.hasSize(target.index)) {
        size = "";
        note("size-dropped");
    } else if (size === "" && to.hasSize(target.index) && to.kindAt(target.index) === "string") {
        /*
         * **文字列型に限る。** `length="1"` は「サイズを取れる」であって「必須」ではなく、
         * 日時や数値の精度（mssql の `time` / `datetimeoffset`）は省略が通例で警告する意味が
         * 無い。危ないのは文字列型で、省略時の既定が 1 文字だったりエラーになったりする。
         */
        note("size-required");
    }

    /*
     * **既定値（def）は 1 文字も触らない。** `uuidv7()` や `now()` が寄せ先の DB で通るかは
     * 型の写像とは別の問題で、関数名の対応表を持つのは (db, 関数) の表を作ることになる
     * （6-9c が避けた形）。DDL 生成側は既存どおり寄せ先の型の quote を当てるだけで、
     * 通らない既定値は**そのまま出て DB が拒む** —— 黙って別の関数に変えるより気づける。
     */
    return {
        title: row.title,
        type: target.index,
        size: size,
        def: row.def,
        nll: row.nll,
        ai: row.ai,
        comment: row.comment,
        relations: row.relations,
    };
}

interface Resolved {
    readonly index: number;
    /** 素直に写せたなら null */
    readonly reason: LossReason | null;
    /** 寄せ先がサイズを取るなら補う値（uuid -> CHAR(36) の 36） */
    readonly fillSize?: string;
}

/**
 * 寄せ先の型を決める。**4 段で、上ほど正確**。
 *
 *   1. **同じ id** —— 6-7 が「同じ意味の型には全プロファイルで同じ id を振る」と決めている
 *      ので、これが引ければ最も確か（PG の 24 型のうち h2 で 18 本、mysql で 15 本が当たる）
 *   2. **同じ kind** —— 6-9c の正規型。候補が複数なら size を取るかどうかで絞り、
 *      なお複数ならパレット順で先勝ち
 *   3. **劣化して受けられる kind**（KIND_FALLBACKS）—— 落ちたことを kind-widened で残す
 *   4. **寄せ先の既定型**（newrowtype）に落として unmappable
 *
 * **sql 名での照合（indexOfTypeName）は kind を持たないパレットにしか使わない。**
 * 名前で寄せると Oracle の `DATE` が PG の `DATE` を受けてしまう —— 前者は時刻を含むので
 * kind は timestamp で、6-9c が「名前ではなく値の域で決める」と書いたのはこの罠のこと。
 * kind を持つ型については、名前が一致しても意味が違いうるので見ない。
 */
function resolveType(index: number, from: TypePalette, to: TypePalette): Resolved {
    const id = from.idAt(index);
    if (id !== null) {
        const byId = to.indexOfId(id);
        if (byId !== -1) {
            /*
             * **同じ id でも値の域は違いうる。** postgresql の `integer` は int32 だが
             * sqlite の `INTEGER` は 8 バイトなので int64 —— id は「同じ意味の型」を
             * 指す手がかりであって、kind の一致まで約束するものではない（6-7 が id を
             * 共有させたのは差分表を読めるようにするため）。**違えば黙らせない。**
             */
            return {
                index: byId,
                reason: from.kindAt(index) === to.kindAt(byId) ? null : "kind-widened",
            };
        }
    }

    const kind = from.kindAt(index);
    if (kind === null) {
        /*
         * kind を持たないのは旧 XML 同梱の <datatypes>（段階4-2b 以前の設計ファイル）だけ。
         * そこは名前で寄せるしかない —— 値の域が分からないので上の罠も判定できず、
         * 「読めていたものが読めなくなる」より名前一致に賭けるほうが害が小さい。
         */
        const byName = to.indexOfTypeName(sqlNameAt(from, index));
        return byName === -1
            ? { index: fallbackIndex(to), reason: "unmappable" }
            : { index: byName, reason: null };
    }

    /*
     * **other どうしは寄せない。** other は「正規型に写せない」という主張であって値の域では
     * ない（6-9c の「other は逃げ道ではなく主張」）。postgresql の INET を mysql の別の
     * other 型に寄せると、写せないものを**別の写せないもの**に置き換えただけになり、
     * しかも losses に出ないので黙って別の型になる。id が一致する場合（上）だけは通す ——
     * そちらは「同じ意味の型」だと 6-7 が保証している。
     */
    if (kind !== "other") {
        const exact = pickForKind(kind, from.hasSize(index), to);
        if (exact !== -1) {
            return { index: exact, reason: null };
        }
    }
    for (const fallback of KIND_FALLBACKS[kind]) {
        /* 補う値を持つ逃げ道は、サイズを取る型のほうを探しに行く（uuid -> CHAR(36)） */
        const wantSize = fallback.size !== undefined || from.hasSize(index);
        const widened = pickForKind(fallback.kind, wantSize, to);
        if (widened !== -1) {
            return { index: widened, reason: "kind-widened", fillSize: fallback.size };
        }
    }
    return { index: fallbackIndex(to), reason: "unmappable" };
}

/**
 * その kind を持つ型から 1 つ選ぶ。無ければ -1。
 *
 * **size を取るかどうかが一致するものを優先する。** `VARCHAR(255)` を length="0" の型に
 * 寄せるとサイズが落ちる（それ自体は size-dropped として記録されるが、寄せ先に
 * サイズを取れる型があるならそちらのほうが設計の意味を保てる）。
 * なお複数ならパレット順で先勝ち —— db/<db>/datatypes.xml は group ごとに意味の順で
 * 並んでいるので、先頭に近いほどその kind の代表に近い。
 */
function pickForKind(kind: TypeKind, wantSize: boolean, to: TypePalette): number {
    const candidates = to.candidatesForKind(kind);
    if (candidates.length === 0) {
        return -1;
    }
    for (const i of candidates) {
        if (to.hasSize(i) === wantSize) {
            return i;
        }
    }
    /*
     * サイズの有無が合う型が無かった。**元がサイズを持たないなら、サイズを要求する型には
     * 寄せない** —— 補うべき値がどこにも無く、`VARCHAR` とだけ書いた DDL を MySQL は
     * 長さ必須で拒む（**生成物を MySQL 8.4 に流して見つけた**。段階6-10a）。
     * この kind では受けられないものとして返し、呼び手に次の逃げ道を試させる。
     */
    if (!wantSize) {
        return -1;
    }
    return candidates[0]!;
}

/**
 * 写せないときの落とし先（段階6-10a）。
 *
 * **`newrowtype` をそのまま使えない。** 8 本中 6 本の既定型はサイズを要求する型
 * （`varchar` / `nvarchar` / `varchar2`）で、あれは「UI で Add row したときの既定」——
 * 人がその場でサイズを入れる前提の値なので、サイズを補えない変換の落とし先には向かない。
 * サイズを取らない文字列型があればそちらへ逃がす。
 */
export function fallbackIndex(to: TypePalette): number {
    const preferred = newRowType(to);
    if (!to.hasSize(preferred)) {
        return preferred;
    }
    const sizeless = to.candidatesForKind("string").find((i) => !to.hasSize(i));
    return sizeless ?? preferred;
}

/** <type sql="..."> のテキスト。sql を持たない型は datatypes.xml に存在しない（6-5a の逐語） */
function sqlNameAt(palette: TypePalette, index: number): string {
    return palette.typeAt(index).getAttribute("sql") ?? "";
}
