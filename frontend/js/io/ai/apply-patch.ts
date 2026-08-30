/* ------------------------- ai patch application --------------- */
/*
 * grabado: AI の提案を設計モデルへ適用する（HANDOVER §11 段階11-1）。
 *
 * **DesignModel -> DesignModel の純関数**で、ライブツリーには 1 バイトも触らない
 * （触るのは既存の applyDesignModel() = js/io/apply.ts）。CLAUDE.md 制約7
 * 「AI 出力は自動適用しない・適用は §4 の決定論パスに合流」の実体がこれで、
 * **LLM の非決定性は「生成」だけに閉じ込め、「適用」はテスト済みロジックに合流する**。
 *
 * 契約は docs/ARCHITECTURE.md §8.3、patch の形は隣の suggestion.ts。
 * ここは提案が来る前に完成させられる（LLM が 1 バイトも関わらない）ので §11 の先頭に置いた。
 *
 * ## 例外を投げない（Result 型で返す）
 *
 * js/io/ のエラー処理は性質で 2 つに割れている —— **正本を読む側は throw**
 * （json-parser.ts の「壊れた JSON は部分的に読み込まない」）、**1 件の失敗で全体を
 * 落とせない側は Result ＋ 理由の一覧**（convert.ts の losses / introspect-parser.ts /
 * ddl/naming.ts の identifierIssue）。**AI patch は後者**で、理由は 3 つ:
 *
 *   1. **入力が正本ではない。** LLM の出力で、しかも提案が返ってから承認までの間に人が
 *      設計を編集しうる。「対象のテーブルがもう無い」は異常ではなく通常の帰結
 *   2. **11-4 は 1 件ずつ承認する UI。** 例外だと「何件目がなぜ落ちたか」が message
 *      文字列に潰れ、呼び手は patch ごとに try/catch を書くことになる
 *   3. **理由をユーザーに見せる必要がある。** js/io/ は locale を通せない（§5.6 規約3）ので
 *      訳す側が使えるキーを返すしかない。PatchRejection.kind がそのまま locale のキーで、
 *      これは ddl/naming.ts の IdentifierIssue が同じ問題を同じ形で解いた前例
 *
 * したがって **well-typed な入力に対して 1 つも例外を投げない**。
 *
 * ## 触っていない枝は同一参照で返す
 *
 * 変更が届かなかった TableModel / RowModel / KeyModel はそのまま返す（構造共有）。
 * 効用は 2 つ —— 決定論の証明が「触った枝だけ見ればよい」に縮むこと、そして
 * **「この patch はこのテーブルしか触っていない」をテストが toBe で機械的に押さえられる**こと。
 * 適用できなかったときは入力の model をそのまま返す（部分適用を作らない）。これは
 * convert.ts が同じ db なら引数のインスタンスをそのまま返すのと同じイディオム。
 *
 * ## モデルの写し方
 *
 * **オブジェクトの spread（{ ...row, title: name }）を使う。** js/io/ の他の層（convert.ts /
 * introspect-parser.ts）が全フィールドを明示で書き写しているのは「写し漏らしがそのまま
 * 欠落になる」層だからで、**ここは逆** —— patch の意味論は「指定した 1 つを変えて残りは
 * そのまま」であり、モデルに将来フィールドが増えても「そのまま持ち越す」が常に正しい。
 *
 * 内部関数に patch を冠しているのは、js/io/apply.ts の applyTable / applyRow / applyKey や
 * convert.ts の convertTable / convertRow とバンドル上で衝突させないため（衝突すると
 * rolldown は旧側に $1 を付け、挙動不変の判定が濁る。js/io/json-serializer.ts の冒頭を参照）。
 */

import type { TypePalette } from "../palette.ts";
import type { DesignModel, KeyModel, RelationRef, RowModel, TableModel } from "../model.ts";
import type { AiPatch, AiReference, AiSuggestion, AiTarget } from "./suggestion.ts";

/**
 * 適用できなかった理由。**kind が locale のキーになる**（訳語を足すのは 11-4）。
 *
 * ここに drop 系が無いのは patch に drop 系が無いから（§8.3）。「壊れている」ものと
 * 「もう当たらない」ものを 1 つの型に混ぜているが、呼び手にとってはどちらも
 * 「この提案は適用できない」で同じ扱いになる。
 */
export type PatchRejection =
    /** 提案が patch を持たない（§8.3 が明示的に許した形。rationale だけを読む） */
    | { readonly kind: "patchnopatch" }
    | { readonly kind: "patchtablemissing"; readonly table: string }
    | { readonly kind: "patchcolumnmissing"; readonly table: string; readonly column: string }
    /** 列に掛かる op なのに target.column が無い */
    | { readonly kind: "patchtargetcolumn" }
    /** 改名先 / 新設する名前が既にある */
    | { readonly kind: "patchnametaken"; readonly name: string }
    /** その SQL 名の型が実行中のパレットに無い。**先頭型には落とさない** */
    | { readonly kind: "patchunknowntype"; readonly sqlType: string }
    | { readonly kind: "patchkeyexists"; readonly keyType: string }
    | { readonly kind: "patchrefmissing"; readonly table: string; readonly column: string }
    | { readonly kind: "patchrefexists"; readonly table: string; readonly column: string }
    /** add-comment に空文字が来た（実質の削除を add- という名の op で通さない） */
    | { readonly kind: "patchemptyvalue" }
    /** op に要るフィールドが欠けている（add-key の columns / references） */
    | { readonly kind: "patchmalformed"; readonly op: string };

/**
 * 1 件の適用結果。**applied: true と rejection が同時に立つ状態を型で潰す。**
 *
 * 失敗時も model を持つのは呼び手を分岐だらけにしないため（値は入力と同一参照）。
 */
export type PatchResult =
    | { readonly applied: true; readonly model: DesignModel }
    | {
          readonly applied: false;
          readonly model: DesignModel;
          readonly rejection: PatchRejection;
      };

export interface PatchesResult {
    readonly model: DesignModel;
    /**
     * 入力と 1 対 1・同じ並び。**適用できたものは null**
     * （ddl/naming.ts の identifierIssue が「問題が無ければ null」を返すのと同じ読み方）。
     */
    readonly rejections: readonly (PatchRejection | null)[];
}

/**
 * 提案 1 件を適用する。
 *
 * palette が要るのは型を SQL 名で受けるから（§8.2。change-type / add-column の 2 つだけ）。
 */
export function applyPatch(
    model: DesignModel,
    suggestion: AiSuggestion,
    palette: TypePalette,
): PatchResult {
    const patch = suggestion.patch;
    if (patch === undefined) {
        return rejected(model, { kind: "patchnopatch" });
    }

    const target = suggestion.target;
    const tableIndex = indexOfTable(model, target.table);
    if (tableIndex === -1) {
        return rejected(model, { kind: "patchtablemissing", table: target.table });
    }

    switch (patch.op) {
        case "rename-table":
            return patchRenameTable(model, tableIndex, patch.name);
        case "rename-column":
            return withColumn(model, tableIndex, target, (rowIndex) =>
                patchRenameColumn(model, tableIndex, rowIndex, patch.name),
            );
        case "change-type":
            return withColumn(model, tableIndex, target, (rowIndex) =>
                patchChangeType(model, tableIndex, rowIndex, patch.sqlType, patch.size, palette),
            );
        case "add-column":
            return patchAddColumn(model, tableIndex, patch, palette);
        case "add-key":
            /* FK だけは書き込み先が RowModel.relations なので、先に列を引く */
            return patch.keyType === "FOREIGN"
                ? withColumn(model, tableIndex, target, (rowIndex) =>
                      patchAddForeignKey(model, tableIndex, rowIndex, patch.references),
                  )
                : patchAddKey(model, tableIndex, target.table, patch.keyType, patch.columns);
        case "set-nullable":
            return withColumn(model, tableIndex, target, (rowIndex) =>
                patchRow(model, tableIndex, rowIndex, (row) => ({ ...row, nll: patch.nullable })),
            );
        case "set-default":
            /*
             * **"NULL" -> "" の正規化はここでしない。** 正規化は Row.update() の 1 箇所に
             * 置いたままにするのが 4-1b の決めたこと 3 で、同じ規則を 2 か所に分けると
             * 片方だけ直す事故の余地が残る（js/io/model.ts の非対称 2 を参照）。
             */
            return withColumn(model, tableIndex, target, (rowIndex) =>
                patchRow(model, tableIndex, rowIndex, (row) => ({ ...row, def: patch.value })),
            );
        case "add-comment":
            return patchAddComment(model, tableIndex, target, patch.value);
        default: {
            /* op は閉じた 8 種（§8.3）。ここに落ちたら型と実装が割れている */
            const exhaustive: never = patch;
            return rejected(model, { kind: "patchmalformed", op: (exhaustive as AiPatch).op });
        }
    }
}

/**
 * 提案を順に適用する。**配列順の左畳み込みで、並べ替えも依存解決もしない。**
 *
 * その順序は backend が返した順 ＝ ユーザーが承認 UI で見た順なので、実装が入れ替えると
 * 「見た順と違う結果になる」。**後の patch は前の結果を見る** —— rename-table のあとは
 * 新しい名前を指す提案が通り、古い名前を指す提案は patchtablemissing で落ちる。
 *
 * **1 件落ちても残りを中断しない**（convert.ts / introspect-parser.ts の losses と同じ立場）。
 * 中断すると「どこまで適用されたか」がユーザーに見えなくなる。
 */
export function applyPatches(
    model: DesignModel,
    suggestions: readonly AiSuggestion[],
    palette: TypePalette,
): PatchesResult {
    let current = model;
    const rejections: (PatchRejection | null)[] = [];

    for (const suggestion of suggestions) {
        const result = applyPatch(current, suggestion, palette);
        current = result.model;
        rejections.push(result.applied ? null : result.rejection);
    }

    return { model: current, rejections: rejections };
}

/* ------------------------- op ごとの適用 ---------------------- */

/**
 * テーブルの改名。**名前で参照している全テーブルの relations も追随させる。**
 *
 * 追随を忘れると例外も警告も出ないまま FK が消える（js/io/apply.ts の applyRelations は
 * 両端を名前で引き直し、引けなければ continue するだけ）。
 *
 * 衝突を拒むのは、同名テーブルが「復元時に両端が同じテーブルに解決される」既知の壊れ方の
 * 入口だから（js/io/model.ts の RelationRef）。保存側（json-serializer.ts）も同名を throw で
 * 拒むので、ここで作らせると保存できない設計ができあがる。
 *
 * **Table.setTitle() の関連行リネーム（js/table.ts）は再現しない。** あれはライブツリーの
 * UI 挙動で、行を 1 つも持たない状態で呼ばれる読み込み経路では 1 度も発火しない。
 * 持ち込むと「読み込み経路と patch 経路で結果が違う」が生まれる。
 */
function patchRenameTable(model: DesignModel, tableIndex: number, name: string): PatchResult {
    const table = model.tables[tableIndex]!;
    if (name === table.title) {
        return accepted(model);
    }
    if (indexOfTable(model, name) !== -1) {
        return rejected(model, { kind: "patchnametaken", name: name });
    }

    const previous = table.title;
    const tables = model.tables.map((t, i) =>
        retargetRelations(i === tableIndex ? { ...t, title: name } : t, (ref) =>
            ref.table === previous ? { table: name, row: ref.row } : ref,
        ),
    );
    return accepted({ tables: tables });
}

/**
 * 列の改名。書き換え先は 3 つ —— 行そのもの・**同テーブルのキーの part**・
 * **この行を親とする全テーブルの relations**。
 *
 * 子側（この行自身が持つ relations）は 1 バイトも触らない。参照先の名前は変わっていない。
 */
function patchRenameColumn(
    model: DesignModel,
    tableIndex: number,
    rowIndex: number,
    name: string,
): PatchResult {
    const table = model.tables[tableIndex]!;
    const row = table.rows[rowIndex]!;
    if (name === row.title) {
        return accepted(model);
    }
    if (indexOfRow(table, name) !== -1) {
        return rejected(model, { kind: "patchnametaken", name: name });
    }

    const previous = row.title;
    const owner = table.title;
    const renamed: TableModel = {
        ...table,
        rows: table.rows.map((r, i) => (i === rowIndex ? { ...r, title: name } : r)),
        keys: table.keys.map((k) => renamePart(k, previous, name)),
    };

    const tables = model.tables.map((t, i) =>
        retargetRelations(i === tableIndex ? renamed : t, (ref) =>
            ref.table === owner && ref.row === previous ? { table: owner, row: name } : ref,
        ),
    );
    return accepted({ tables: tables });
}

/**
 * 型の差し替え。**サイズは寄せ先の length に従う**（CHAR(10) が TEXT に寄ったときに
 * TEXT(10) を出さないための既存の規則で、js/io/xml-parser.ts・js/io/ddl/shared.ts・
 * js/io/convert.ts に続く **4 人目の読み手**）。
 *
 * 一致が無ければ落とす。**先頭型には落とさない** —— introspect-parser.ts が既定型へ倒すのは
 * 「1 列のせいで import が全滅する」のを避けるためで、こちらは 1 件の提案なので落とせばよい。
 *
 * 既定値（def）は触らない（convert.ts と同じ立場。寄せ先で通るかは型の写像とは別の問題）。
 */
function patchChangeType(
    model: DesignModel,
    tableIndex: number,
    rowIndex: number,
    sqlType: string,
    size: string | undefined,
    palette: TypePalette,
): PatchResult {
    const index = palette.indexOfTypeName(sqlType);
    if (index === -1) {
        return rejected(model, { kind: "patchunknowntype", sqlType: sqlType });
    }
    return patchRow(model, tableIndex, rowIndex, (row) => ({
        ...row,
        type: index,
        size: palette.hasSize(index) ? (size ?? row.size) : "",
    }));
}

/**
 * 列の追加。**末尾に足す**（挿入位置を推測しない。差分も最小になる）。
 *
 * **autoincrement（ai）は patch から受け取らない。** identity 列を AI に足させる需要が
 * category の 7 語に無く（missing_pk は add-key PRIMARY で足りる）、house 既定の PK は
 * uuid DEFAULT uuidv7()（CLAUDE.md §6）。op を増やさずに済むものは増やさない。
 */
function patchAddColumn(
    model: DesignModel,
    tableIndex: number,
    patch: Extract<AiPatch, { op: "add-column" }>,
    palette: TypePalette,
): PatchResult {
    const table = model.tables[tableIndex]!;
    if (indexOfRow(table, patch.name) !== -1) {
        return rejected(model, { kind: "patchnametaken", name: patch.name });
    }
    const index = palette.indexOfTypeName(patch.sqlType);
    if (index === -1) {
        return rejected(model, { kind: "patchunknowntype", sqlType: patch.sqlType });
    }

    const row: RowModel = {
        title: patch.name,
        type: index,
        size: palette.hasSize(index) ? (patch.size ?? "") : "",
        def: patch.default ?? "",
        nll: patch.nullable ?? false,
        ai: false,
        comment: patch.comment ?? "",
        relations: [],
    };
    return accepted(replaceTable(model, tableIndex, { ...table, rows: [...table.rows, row] }));
}

/**
 * PRIMARY / UNIQUE / INDEX の追加。
 *
 * **name は必ず ""。規約名をここで組まない。** 空のときだけ生成器が §6.3 の規約で名前を
 * 組む（js/io/ddl/naming.ts の keyConstraintName）というのが docs/FORMAT.md の契約で、
 * ここで焼き込むと introspection の往復でも名前が動かない保証が壊れる。
 *
 * 既にある PRIMARY を 2 つ目にしない・同じ形のキーを重ねないのは、DB が拒む DDL を
 * 設計の側で作らせないため。
 */
function patchAddKey(
    model: DesignModel,
    tableIndex: number,
    tableName: string,
    keyType: string,
    columns: readonly string[] | undefined,
): PatchResult {
    const table = model.tables[tableIndex]!;
    if (columns === undefined || columns.length === 0) {
        return rejected(model, { kind: "patchmalformed", op: "add-key" });
    }
    for (const column of columns) {
        if (indexOfRow(table, column) === -1) {
            return rejected(model, {
                kind: "patchcolumnmissing",
                table: tableName,
                column: column,
            });
        }
    }
    const duplicate = table.keys.some(
        (k) =>
            (keyType === "PRIMARY" && k.type === "PRIMARY") ||
            (k.type === keyType && samePartsAs(k.parts, columns)),
    );
    if (duplicate) {
        return rejected(model, { kind: "patchkeyexists", keyType: keyType });
    }

    const key: KeyModel = { type: keyType, name: "", parts: [...columns] };
    return accepted(replaceTable(model, tableIndex, { ...table, keys: [...table.keys, key] }));
}

/**
 * FK の追加。**書き込み先は KeyModel ではなく RowModel.relations**（モデルは FK を
 * 「子の行が親を名前で指す」形で持つ。js/io/extract.ts が正本）。
 *
 * target.column が子（FK を持つ側）、references が親。**FK 名は書かない** ——
 * モデルに保存先が無く、fk_<table>_<column> は DDL 生成時に組まれる（ddl/naming.ts）。
 *
 * **UI 経路（js/rowmanager.ts）の副作用は再現しない** —— 子行の型を親に寄せる・
 * autoincrement を落とす、のいずれもあちらだけの挙動で、読み込み経路（apply.ts の
 * applyRelations）は型を 1 ビットも触らない。patch は読み込み経路に揃える
 * （型を変えたいなら AI が change-type を別に出せばよい）。
 */
function patchAddForeignKey(
    model: DesignModel,
    tableIndex: number,
    rowIndex: number,
    references: AiReference | undefined,
): PatchResult {
    if (references === undefined) {
        return rejected(model, { kind: "patchmalformed", op: "add-key" });
    }

    const parentIndex = indexOfTable(model, references.table);
    if (parentIndex === -1 || indexOfRow(model.tables[parentIndex]!, references.column) === -1) {
        return rejected(model, {
            kind: "patchrefmissing",
            table: references.table,
            column: references.column,
        });
    }

    const row = model.tables[tableIndex]!.rows[rowIndex]!;
    const exists = row.relations.some(
        (ref) => ref.table === references.table && ref.row === references.column,
    );
    if (exists) {
        return rejected(model, {
            kind: "patchrefexists",
            table: references.table,
            column: references.column,
        });
    }

    const relation: RelationRef = { table: references.table, row: references.column };
    return patchRow(model, tableIndex, rowIndex, (r) => ({
        ...r,
        relations: [...r.relations, relation],
    }));
}

/**
 * コメントの追加。target.column の有無でテーブルと列に振り分ける。
 *
 * **空文字は拒む。** op 名が add- である以上、「既存のコメントを空にする」＝実質の削除を
 * 通すのは「破壊的な op を作らない」（§8.3）に反する。上書きは許す（コメントは設計そのもの
 * ではない）。テーブル側に "" を入れると title="" 属性が生えて状態 golden が動く問題
 * （js/io/apply.ts の if (model.comment)）も、同じ判断でまとめて避けられる。
 */
function patchAddComment(
    model: DesignModel,
    tableIndex: number,
    target: AiTarget,
    value: string,
): PatchResult {
    if (value === "") {
        return rejected(model, { kind: "patchemptyvalue" });
    }
    if (target.column === undefined) {
        const table = model.tables[tableIndex]!;
        return accepted(replaceTable(model, tableIndex, { ...table, comment: value }));
    }
    return withColumn(model, tableIndex, target, (rowIndex) =>
        patchRow(model, tableIndex, rowIndex, (row) => ({ ...row, comment: value })),
    );
}

/* ------------------------- ヘルパー --------------------------- */

function accepted(model: DesignModel): PatchResult {
    return { applied: true, model: model };
}

function rejected(model: DesignModel, rejection: PatchRejection): PatchResult {
    return { applied: false, model: model, rejection: rejection };
}

function indexOfTable(model: DesignModel, name: string): number {
    return model.tables.findIndex((t) => t.title === name);
}

function indexOfRow(table: TableModel, name: string): number {
    return table.rows.findIndex((r) => r.title === name);
}

/**
 * 列を要する op の前段。**target.column が無い**（patchtargetcolumn）と
 * **あるが引けない**（patchcolumnmissing）を分けるのは、前者が提案の形の問題で
 * 後者が設計とのずれだから —— 呼び手が出す文言が変わる。
 */
function withColumn(
    model: DesignModel,
    tableIndex: number,
    target: AiTarget,
    apply: (rowIndex: number) => PatchResult,
): PatchResult {
    if (target.column === undefined) {
        return rejected(model, { kind: "patchtargetcolumn" });
    }
    const rowIndex = indexOfRow(model.tables[tableIndex]!, target.column);
    if (rowIndex === -1) {
        return rejected(model, {
            kind: "patchcolumnmissing",
            table: target.table,
            column: target.column,
        });
    }
    return apply(rowIndex);
}

/** テーブルを 1 枚だけ差し替える（他のテーブルは同一参照のまま） */
function replaceTable(model: DesignModel, index: number, table: TableModel): DesignModel {
    return { tables: model.tables.map((t, i) => (i === index ? table : t)) };
}

/** 行を 1 つだけ差し替える（同テーブルの他の行・キー、他のテーブルは同一参照のまま） */
function patchRow(
    model: DesignModel,
    tableIndex: number,
    rowIndex: number,
    change: (row: RowModel) => RowModel,
): PatchResult {
    const table = model.tables[tableIndex]!;
    const rows = table.rows.map((r, i) => (i === rowIndex ? change(r) : r));
    return accepted(replaceTable(model, tableIndex, { ...table, rows: rows }));
}

/**
 * テーブル内の全行の参照を写す。**1 つも変わらなければテーブルを同一参照で返す。**
 *
 * rename の 2 つがモデル全体を走るのはここを通るからで、写像が恒等だったテーブルは
 * 元のまま残る（触った枝だけが新しくなる）。
 */
function retargetRelations(table: TableModel, map: (ref: RelationRef) => RelationRef): TableModel {
    let touched = false;
    const rows = table.rows.map((row) => {
        let moved = false;
        const relations = row.relations.map((ref) => {
            const next = map(ref);
            if (next.table !== ref.table || next.row !== ref.row) {
                moved = true;
                return next;
            }
            return ref;
        });
        if (!moved) {
            return row;
        }
        touched = true;
        return { ...row, relations: relations };
    });
    return touched ? { ...table, rows: rows } : table;
}

/** キーの part を 1 つ改名する（含まれていなければ同一参照） */
function renamePart(key: KeyModel, previous: string, name: string): KeyModel {
    if (!key.parts.includes(previous)) {
        return key;
    }
    return { ...key, parts: key.parts.map((p) => (p === previous ? name : p)) };
}

/** 同じ列の並び（順序も含めて一致するか）。複合キーは順序が意味を持つ */
function samePartsAs(parts: readonly string[], columns: readonly string[]): boolean {
    return parts.length === columns.length && parts.every((p, i) => p === columns[i]);
}
