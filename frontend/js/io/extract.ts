/* ------------------------- model extraction ------------------- */
/*
 * grabado: ライブツリー -> DesignModel（HANDOVER §4 段階4-1a）。
 *
 * 現行の Table.toXML() / Row.toXML() / Key.toXML() が読んでいた値をそのまま集める。
 * 4 実装とも DOM を一度も読まず data / x / y / relations / rows / keys しか見ない
 * ことを実測したうえでの分離で、ここは「描画エンジンを知っている唯一の出力側」。
 *
 * toModel() を各クラスに生やさないのは 3 つの理由による。
 *   1. 描画中核 3 本の差分が「削除のみ」になり、挙動不変の主張が最も強くなる。
 *   2. 永続化の知識が描画クラスに残ると「全入出力は serializer を通す」（HANDOVER §4）
 *      に反したままになる。
 *   3. js/table.ts -> js/io/ の辺が生えず、依存が描画 -> io の一方向に揃う。
 *
 * import は型だけなので値の辺は生えない（verbatimModuleSyntax で emit から消える）。
 */

import type { Designer } from "../wwwsqldesigner.ts";
import type { Table } from "../table.ts";
import type { Row } from "../row.ts";
import type { Key } from "../key.ts";
import type {
    DesignModel,
    TableModel,
    RowModel,
    KeyModel,
    RelationRef,
} from "./model.ts";

export function extractModel(designer: Designer): DesignModel {
    var tables: TableModel[] = [];
    for (var i = 0; i < designer.tables.length; i++) {
        tables.push(extractTable(designer.tables[i]!));
    }
    return { tables: tables };
}

function extractTable(table: Table): TableModel {
    var rows: RowModel[] = [];
    for (var i = 0; i < table.rows.length; i++) {
        rows.push(extractRow(table.rows[i]!));
    }
    var keys: KeyModel[] = [];
    for (var i = 0; i < table.keys.length; i++) {
        keys.push(extractKey(table.keys[i]!));
    }
    return {
        title: table.getTitle(),
        x: table.x,
        y: table.y,
        comment: table.getComment(),
        rows: rows,
        keys: keys,
    };
}

function extractRow(row: Row): RowModel {
    /*
     * 「自分が row2（＝FK を持つ子）である relation だけを、row.relations の順で」は
     * 現行 js/row.ts の toXML() の逐語。designer.relations 側を走査して割り付ける形にも
     * できる（両者は同じ順序になる — new Relation は Designer.addRelation の 1 箇所だけで、
     * コンストラクタが両 row に push した直後に designer 側にも push されるため、
     * row.relations は designer.relations の順序を保つ部分列）が、逐語なら順序の証明が
     * そもそも要らない。
     */
    var relations: RelationRef[] = [];
    for (var i = 0; i < row.relations.length; i++) {
        var r = row.relations[i]!;
        if (r.row2 != row) {
            continue;
        }
        relations.push({
            table: r.row1.owner.getTitle(),
            row: r.row1.getTitle(),
        });
    }

    return {
        title: row.getTitle(),
        type: row.data.type,
        size: row.data.size,
        def: row.data.def,
        nll: row.data.nll,
        ai: row.data.ai,
        comment: row.data.comment,
        relations: relations,
    };
}

function extractKey(key: Key): KeyModel {
    var parts: string[] = [];
    for (var i = 0; i < key.rows.length; i++) {
        parts.push(key.rows[i]!.getTitle());
    }
    return {
        type: key.getType(),
        name: key.getName(),
        parts: parts,
    };
}
