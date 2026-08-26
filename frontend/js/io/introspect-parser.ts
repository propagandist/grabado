/* ------------------------- introspection -> DesignModel ---------------------- */
/*
 * grabado: backend が読んだ DB の姿を設計モデルへ写す（HANDOVER §5.2 / 段階5-6）。
 *
 * `xml-parser.ts` / `json-parser.ts` の兄弟で、**形式側**（ライブツリーに触らない）。
 * 出た `DesignModel` は既存の `applyDesignModel()`（apply.ts）がそのまま受ける。
 *
 * ## ここが型解決の主体
 *
 * backend は「DB がこう言った」だけを返す（`introspect-model.ts` の冒頭）。
 * パレットへの解決は**すべてここ**にある —— `db/postgresql/datatypes.xml` の冒頭が
 * 「`aka` に入れる基準の 2 番目は **introspection の実出力**（`TIMESTAMP WITH TIME ZONE`）」と
 * 明記しているとおり、パレットはこの入力を受けるように作られている。
 * `tests/node/type-resolution.test.ts` が 8 プロファイル全候補名の全数掃きで守っているのも
 * 同じ経路。**Kotlin 側に写像を作らない**のはこのため。
 *
 * ## 解決できない型を throw にしない
 *
 * 段階6-8d で `indexOfTypeName()` は strict 一本になり、**一致しなければ -1 を返す**。
 * PG の `text[]` は `data_type` が `ARRAY`、enum は `USER-DEFINED` で、どちらも
 * **パレットに存在しない** —— 素直に throw すると **1 列のせいで import が全滅する**。
 *
 * 解決は 3 段（上ほど正確）で、落ちた分は [TypeLoss] として返す。呼び手（UI）が
 * 「この列は既定型に落とした」と伝えるための材料で、**黙って落とさない**のが要点。
 * 6-9d / 6-9e の ORM 出力・6-10a の変換層と同じ流儀。
 *
 * ## 座標は入れない
 *
 * `x` / `y` は 0 で埋める。**直後に `alignTables()` がブラウザ実測の幅で並べ直す**
 * （現行の XML 経路と同じ）ので、ここで意味のある値を作る余地は無い。
 */

import { fallbackIndex, type TypeLoss } from "./convert.ts";
import type { TypePalette } from "./palette.ts";
import type {
    DesignModel,
    KeyModel,
    RelationRef,
    RowModel,
    TableModel,
} from "./model.ts";
import type {
    IntrospectedColumn,
    IntrospectionResult,
} from "./introspect-model.ts";

export interface IntrospectResult {
    readonly model: DesignModel;
    /** テーブル順 -> 列順。**空なら 1 列も落ちていない** */
    readonly losses: readonly TypeLoss[];
}

/**
 * 読み込んだ結果を人が読む 1 枚にする（段階5-7b）。
 *
 * **落ちた型を黙って捨てない。** DDL の変換注記（6-10a の `conversionNotice`）と同じ立場で、
 * 「何が起きたか」を textarea の 1 か所で読めるようにする。
 *
 * 1 列 1 行にまとめる —— 同じ列に理由が 2 つ付きうるので、素直に並べると読みにくい。
 */
export function importNotice(losses: readonly TypeLoss[]): string {
    if (losses.length === 0) {
        return "grabado: 読み込んだ型はすべてパレットに写っている（落ちた列は無い）。";
    }

    const order: string[] = [];
    const byColumn = new Map<string, TypeLoss[]>();
    for (const loss of losses) {
        const key = loss.table + "." + loss.column;
        const found = byColumn.get(key);
        if (found) {
            found.push(loss);
        } else {
            order.push(key);
            byColumn.set(key, [loss]);
        }
    }

    const out = [
        `grabado: ${order.length} 列の型がそのままでは写せなかった。`,
        "流す前に型を確かめること（既定型に落としてある）。",
        "",
    ];
    for (const key of order) {
        const group = byColumn.get(key)!;
        const first = group[0]!;
        const reasons = group.map((one) => reasonText(one)).join(" / ");
        out.push(`  ${key}: ${first.from} -> ${first.to}（${reasons}）`);
    }
    return out.join("\n") + "\n";
}

function reasonText(loss: TypeLoss): string {
    switch (loss.reason) {
        case "unmappable":
            return "パレットに無いので既定型に落とした";
        case "kind-widened":
            return "別の型に寄せた";
        case "size-dropped":
            return "サイズを捨てた";
        case "size-required":
            return "寄せ先がサイズを要求する";
        default:
            return loss.reason;
    }
}

/**
 * introspection の結果を設計モデルへ写す。
 *
 * @param result backend の `?action=import` の応答
 * @param palette **実行中の**型パレット。`dialect` とは照合しない ——
 *   PG を読み込んで MySQL のパレットに落とす経路も、寄せ先が決まっていれば成立する
 *   （寄せ方の規則は段階6-10a の変換層が持つ）
 */
export function introspectionToModel(
    result: IntrospectionResult,
    palette: TypePalette,
): IntrospectResult {
    const losses: TypeLoss[] = [];
    const tables: TableModel[] = [];

    for (const table of result.tables) {
        const rows: RowModel[] = [];
        for (const column of table.columns) {
            rows.push(toRow(table.name, column, palette, losses));
        }
        tables.push({
            title: table.name,
            /* 直後に alignTables() が実測の幅で並べ直す。ここで作る値に意味は無い */
            x: 0,
            y: 0,
            comment: table.comment ?? "",
            rows: rows,
            keys: toKeys(table.keys),
        });
    }

    return { model: { tables: tables }, losses: losses };
}

function toRow(
    tableName: string,
    column: IntrospectedColumn,
    palette: TypePalette,
    losses: TypeLoss[],
): RowModel {
    const resolved = resolveType(column, palette);
    if (resolved.loss) {
        losses.push({
            table: tableName,
            column: column.name,
            from: resolved.loss.from,
            fromKind: null,
            to: sqlNameAt(palette, resolved.index),
            toKind: palette.kindAt(resolved.index),
            reason: resolved.loss.reason,
        });
    }

    return {
        title: column.name,
        type: resolved.index,
        size: sizeFor(column, palette, resolved.index),
        def: column.default ?? "",
        nll: column.nullable,
        /*
         * 自動採番は写さない。`information_schema` の identity / serial は方言ごとに
         * 表れ方が違い（PG は `column_default` の nextval、MySQL は `extra`）、
         * 現行の XML 経路も **常に 0** だった（ARCHITECTURE §4.5 の実測）。
         * 拾うなら backend 側で方言ごとに判定してから渡す —— 5-7 以降の判断。
         */
        ai: false,
        comment: column.comment ?? "",
        relations: toRelations(column),
    };
}

interface ResolvedType {
    readonly index: number;
    readonly loss?: { readonly from: string; readonly reason: TypeLoss["reason"] };
}

/**
 * 型の解決（3 段。上ほど正確）。
 *
 * 1. `sqlType` をパレットの `sql` / `aka` に当てる（`indexOfTypeName`。大小無視の完全一致）
 * 2. **`ARRAY` / `USER-DEFINED` の逃げ道** —— `data_type` が実際の型を隠しているので、
 *    要素型（`text[]` の `text`）や `udtName` で引き直す
 * 3. 落とし先（`fallbackIndex`。サイズを取らない文字列型）へ落とし、[TypeLoss] を残す
 */
function resolveType(column: IntrospectedColumn, palette: TypePalette): ResolvedType {
    const direct = palette.indexOfTypeName(column.sqlType);
    if (direct !== -1) {
        return { index: direct };
    }

    /*
     * PG は配列を `data_type = ARRAY` で返し、要素型は `udt_name`（`_text`）にしか無い。
     * 現行 PHP はここを見ておらず、**要素型を落として `ARRAY` とだけ書いていた**
     * （ARCHITECTURE §4.5 の既知の欠落）。要素型で引ければ「配列であること」は落ちるが、
     * 型そのものは保たれる —— **どちらも落とすよりましで、落ちたことは loss で伝える**。
     */
    const element = column.arrayElementType;
    if (element) {
        const byElement = palette.indexOfTypeName(element);
        if (byElement !== -1) {
            return {
                index: byElement,
                loss: { from: column.sqlType, reason: "kind-widened" },
            };
        }
    }

    /* enum は `USER-DEFINED` で、`udt_name` に型名が入る。パレットには無いのが普通 */
    const udt = column.udtName;
    if (udt) {
        const byUdt = palette.indexOfTypeName(udt);
        if (byUdt !== -1) {
            return {
                index: byUdt,
                loss: { from: column.sqlType, reason: "kind-widened" },
            };
        }
    }

    return {
        index: fallbackIndex(palette),
        loss: { from: column.sqlType, reason: "unmappable" },
    };
}

/**
 * サイズ欄。**寄せ先がサイズを取らない型なら空**（`TEXT(10)` という壊れた DDL を出さない）。
 *
 * `numeric(12,2)` は `12,2` に組む —— 現行 PHP は精度もスケールも落として `NUMERIC` と
 * だけ書いていた（ARCHITECTURE §4.5）。
 */
function sizeFor(
    column: IntrospectedColumn,
    palette: TypePalette,
    index: number,
): string {
    if (!palette.hasSize(index)) {
        return "";
    }
    if (column.numericPrecision !== undefined && column.numericPrecision !== null) {
        const scale = column.numericScale;
        return scale !== undefined && scale !== null && scale !== 0
            ? `${column.numericPrecision},${scale}`
            : String(column.numericPrecision);
    }
    if (
        column.characterMaximumLength !== undefined &&
        column.characterMaximumLength !== null
    ) {
        return String(column.characterMaximumLength);
    }
    return "";
}

function toRelations(column: IntrospectedColumn): RelationRef[] {
    const refs = column.references ?? [];
    const relations: RelationRef[] = [];
    for (const ref of refs) {
        relations.push({ table: ref.table, row: ref.column });
    }
    return relations;
}

/**
 * キー。**PRIMARY / UNIQUE / INDEX だけを通す。**
 *
 * CHECK を読まないのは設計モデルに概念が無いからで、これが
 * 「PG18 が NOT NULL を `table_constraints` に CHECK として出す」問題
 * （ARCHITECTURE §4.6-1）を**構造的に不可能**にしている —— 現行 PHP は
 * `_not_null` サフィックスの denylist で除外しようとして `</key>` を余分に出した。
 * **denylist は必ず漏れる。**
 */
function toKeys(keys: readonly { type: string; name: string; columns: readonly string[] }[] | undefined): KeyModel[] {
    const allowed = ["PRIMARY", "UNIQUE", "INDEX"];
    const out: KeyModel[] = [];
    for (const key of keys ?? []) {
        const type = key.type.toUpperCase();
        if (allowed.indexOf(type) === -1) {
            continue;
        }
        out.push({ type: type, name: key.name, parts: key.columns.slice() });
    }
    return out;
}

/** `<type sql="...">` のテキスト（convert.ts と同じ読み方） */
function sqlNameAt(palette: TypePalette, index: number): string {
    return palette.typeAt(index).getAttribute("sql") ?? "";
}
