import type { DesignModel } from "./model.ts";

/*
 * 設計モデルの不変条件（#232 / #233）。
 *
 * ★★ **規則はここ 1 か所。メッセージは用途ごとに呼び手が書く。** 保存側
 * （json-serializer.ts）は「1 バイトも書かずに落ちる」ためのガードで、読み込み側
 * （wwwsqldesigner.ts の fromJson / fromXML）は「今開いている設計を消す前に落ちる」ため。
 * **同じ規則を 2 か所に書くと、片方だけ直る日が来る。**
 *
 * ★★ **読み込みが保存より緩いのは不具合だった。** 保存側は同名テーブルを拒んでいたのに
 * 読み込み側が空いていたので、「読めて、黙って別の設計になり、保存だけができない」
 * 行き止まりができていた（#233）。
 */

/** 重複したテーブル名と、それが現れた添字。無ければ null */
export function findDuplicateTableName(
    model: DesignModel
): { name: string; index: number } | null {
    const seen = new Set<string>();
    for (let i = 0; i < model.tables.length; i++) {
        const name = model.tables[i]!.title;
        if (seen.has(name)) {
            return { name, index: i };
        }
        seen.add(name);
    }
    return null;
}

/** キーが指す列がそのテーブルに無い最初の 1 件。無ければ null */
export function findMissingKeyColumn(model: DesignModel): {
    table: string;
    tableIndex: number;
    keyIndex: number;
    partIndex: number;
    column: string;
} | null {
    for (let t = 0; t < model.tables.length; t++) {
        const table = model.tables[t]!;
        const names = new Set<string>();
        for (let r = 0; r < table.rows.length; r++) {
            names.add(table.rows[r]!.title);
        }
        for (let k = 0; k < table.keys.length; k++) {
            const parts = table.keys[k]!.parts;
            for (let p = 0; p < parts.length; p++) {
                const column = parts[p]!;
                if (!names.has(column)) {
                    return {
                        table: table.title,
                        tableIndex: t,
                        keyIndex: k,
                        partIndex: p,
                        column,
                    };
                }
            }
        }
    }
    return null;
}

/**
 * **読み込む前**に見る不変条件。破れていれば例外を投げる。
 *
 * ★★ 呼ぶ場所が要件になっている —— **`clearTables()` より前**。
 *   `Designer.fromJson` は「壊れた JSON で例外が出たときに今開いている設計を消さない」ために
 *   parse を clear の前に置いており、その不変条件はキーの検査にも掛かる。
 *
 * ★ **XML 互換読み込みにも同じ関門を掛ける**（#233 の判断）。同梱パレットを持たない XML は
 *   parse が clear より前なのでそのまま守れる。**同梱パレットを持つ経路だけは clear が先**で
 *   守れないが、そちらは「4-4 以前に grabado が書いた XML と一部の upstream ファイル」に
 *   限られる（wwwsqldesigner.ts の fromXML の KDoc）—— **拒みはするが、設計は既に消えている**。
 */
export function assertLoadableDesign(model: DesignModel): void {
    const dup = findDuplicateTableName(model);
    if (dup) {
        throw new Error(
            `テーブル名 "${dup.name}" が重複している（tables[${dup.index}]）。` +
                `設計は relation を名前で参照するため、同名テーブルがあると` +
                `参照先が入れ替わり、保存もできなくなる。` +
                `どちらかの名前を変えてから開くこと`
        );
    }

    const missing = findMissingKeyColumn(model);
    if (missing) {
        throw new Error(
            `列 "${missing.column}" がテーブル "${missing.table}" に無い` +
                `（tables[${missing.tableIndex}].keys[${missing.keyIndex}]` +
                `.columns[${missing.partIndex}]）。` +
                `キーが指す列は同じテーブルの列でなければならない`
        );
    }
}
