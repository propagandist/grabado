/* ------------------------- orm: prisma ------------------------ */
/*
 * grabado: DesignModel -> Prisma のスキーマ（HANDOVER §6 段階6-9e）。
 *
 * **ORM 出力の 2 本目。** 1 本目（JPA）と違うのは 2 点で、そこが本段階の判断そのもの。
 *
 * **1. Prisma は逆参照を形式として要求する。**
 * 6-9d は「逆参照（@OneToMany）は出さない」と決めた —— 設計モデルが親側のコレクション名を
 * 持たず、発明するしかないため。JPA ではそれが**選べた**（逆参照の無い entity も有効）が、
 * Prisma では選べない（片側だけの relation はスキーマ検証が拒む）。
 * だから **Prisma だけは名前を発明する**。規則は 2 つで、どちらも設計から機械的に導ける:
 *
 *   通常              子テーブル名の camelCase（`articles` -> `articles`）
 *   同じ子から 2 本以上  子テーブル名 ＋ FK 列名（`projectsOwnerId`）
 *
 * 名前付き relation（`@relation("...")`）が要るのは「同じ (親, 子) が 2 本以上」か
 * **自己参照**のとき。自己参照は 1 本でも Prisma が要求する。
 *
 * **2. Prisma の識別子は ASCII だけ。**
 * Kotlin のバッククォートに当たる逃げ道が無く、`[A-Za-z][A-Za-z0-9_]*` しか書けない ——
 * **日本語の名前はここで必ず変わる**（JPA / Python は変わらなかった）。潰れた名前どうしが
 * ぶつかるので、モデル名もフィールド名も**通し番号で一意化する**。
 * **元の名前は @@map / @map に必ず残る**ので、往復は壊れない。
 *
 * **native type 属性（@db.Uuid / @db.VarChar）は出さない。** provider ごとに別の表が要り、
 * それは 6-9c が「(db, 型 id) の表を ORM ごとに持たない」として避けた形そのもの。
 * 正規型（kind）1 段だけで写し、丸めた分は先頭のコメントに書く。
 */

import type { DdlKey, DdlRow, DdlTable } from "../ddl/shared.ts";
import type { TypeKind } from "../palette.ts";
import { camelCase, entityName } from "./naming.ts";

/**
 * 正規型 -> Prisma のスカラー（段階6-9e）。
 *
 * Prisma のスカラーは 9 つしか無い（String / Boolean / Int / BigInt / Float / Decimal /
 * DateTime / Json / Bytes）ので、**丸めが JPA より大きい** —— uuid も date も time も
 * String / DateTime に畳まれる。`null` は「丸めたことを 1 行のコメントで残す」もの。
 */
const PRISMA_TYPES: Readonly<Record<TypeKind, string | null>> = {
    int8: "Int",
    int16: "Int",
    int32: "Int",
    int64: "BigInt",
    decimal: "Decimal",
    float32: "Float",
    float64: "Float",
    string: "String",
    binary: "Bytes",
    boolean: "Boolean",
    /* 日付 / 時刻 / tz の別は Prisma のスカラーに無い（native type 属性でしか表せない） */
    date: "DateTime",
    time: "DateTime",
    time_tz: "DateTime",
    timestamp: "DateTime",
    timestamp_tz: "DateTime",
    interval: null,
    /* uuid も Prisma のスカラーには無い。String に丸める（@db.Uuid は provider 依存） */
    uuid: "String",
    json: "Json",
    xml: null,
    geometry: null,
    other: null,
};

/**
 * db プロファイル -> Prisma の provider。**8 本のうち 5 本にしか対応が無い。**
 *
 * h2 / oracle / sql-standard に provider は存在しない。その 3 本では datasource ブロックを
 * 出さず、**理由を先頭のコメントで言う** —— 黙って postgresql と書くと、動かないスキーマを
 * 動くように見せることになる。
 */
const PRISMA_PROVIDERS: Readonly<Record<string, string>> = {
    postgresql: "postgresql",
    mysql: "mysql",
    /* Prisma に mariadb の provider は無く、mysql で扱うのが公式の案内 */
    mariadb: "mysql",
    sqlite: "sqlite",
    mssql: "sqlserver",
};

/**
 * Prisma の識別子として書ける形にする。**ASCII しか通らない。**
 *
 * 非 ASCII は `_` に潰れるので、**潰れた名前どうしがぶつかりうる**（`氏名` も `メモ` も
 * 同じ形になる）。一意化は呼び手（uniqueNames）がまとめてやる —— 1 つずつ直すと
 * 「何番目の衝突か」が呼ぶ順に依ってしまう。
 */
export function prismaIdentifier(name: string): string {
    const safe = name.replace(/[^A-Za-z0-9_]/g, "_");
    return /^[A-Za-z]/.test(safe) ? safe : "m" + safe;
}

/** テーブル名 -> Prisma のモデル名（`articles` -> `Article`）。一意化は呼び手 */
export function prismaModelName(table: string): string {
    return prismaIdentifier(entityName(table));
}

/**
 * 名前を一意化する（段階6-9e）。**重複したものだけに通し番号が付く。**
 *
 * 入力の順に見て、既に出た名前なら `_2` / `_3` … を足す。**設計の順にしか依らない**ので
 * 決定論が保たれる。番号が付くのは Prisma が受けない文字を含む名前だけ（house 標準の
 * snake_case では 1 つも付かない）。
 */
function uniqueNames(raw: readonly string[]): string[] {
    const used = new Map<string, number>();
    return raw.map((one) => {
        const seen = used.get(one) ?? 0;
        used.set(one, seen + 1);
        return seen === 0 ? one : one + "_" + String(seen + 1);
    });
}

function prismaString(value: string): string {
    return '"' + value.split("\\").join("\\\\").split('"').join('\\"') + '"';
}

function isGenerated(row: DdlRow): boolean {
    return row.autoincrement || /IDENTITY|AUTO_INCREMENT/i.test(row.datatype);
}

function primaryKeyOf(table: DdlTable): DdlKey | null {
    return table.keys.find((k) => k.type === "PRIMARY" && k.parts.length > 0) ?? null;
}

/** 1 行に畳んだコメント（Prisma の // は行末までなので改行を潰す） */
function lineComment(text: string): string {
    return text.split("\r").join(" ").split("\n").join(" ");
}

/** 親モデルに生やす逆参照 1 本ぶん */
interface BackRelation {
    /** 親テーブル名（DB の名前） */
    readonly parent: string;
    /** 子テーブル名（DB の名前） */
    readonly child: string;
    /** 子側の FK 列名 */
    readonly column: string;
    /**
     * 名前付き relation が要るか。条件は 2 つ（どちらかで要る）:
     *   - 同じ (親, 子) の組が 2 本以上ある（どの relation の対か書式から決まらない）
     *   - **自己参照**（親も子も同じモデルなので、1 本でも Prisma が要求する）
     */
    readonly named: boolean;
    /** 親側のフィールド名に FK 列名を混ぜるか。**同じ子から 2 本以上**のときだけ */
    readonly ambiguous: boolean;
}

/** 逆参照を集める。**Prisma が両側を要求するのでここが要る**（JPA では丸ごと不要だった） */
function collectBackRelations(tables: readonly DdlTable[]): BackRelation[] {
    const raw: Array<{ parent: string; child: string; column: string }> = [];
    for (const table of tables) {
        for (const row of table.rows) {
            for (const rel of row.relations) {
                raw.push({ parent: rel.table, child: table.name, column: row.name });
            }
        }
    }
    const count = new Map<string, number>();
    for (const one of raw) {
        const key = one.parent + " " + one.child;
        count.set(key, (count.get(key) ?? 0) + 1);
    }
    return raw.map((one) => {
        const many = (count.get(one.parent + " " + one.child) ?? 0) > 1;
        return {
            parent: one.parent,
            child: one.child,
            column: one.column,
            named: many || one.parent === one.child,
            ambiguous: many,
        };
    });
}

/** 名前付き relation の名前。両側で一致していなければならない */
function relationName(rel: BackRelation): string {
    return rel.child + "_" + rel.column;
}

export function generatePrisma(tables: readonly DdlTable[], db: string | null): string {
    /* テーブルが 0 件なら 1 バイトも出さない（DDL の empty.sql と揃える。段階6-9d の判断） */
    if (tables.length === 0) {
        return "";
    }

    const provider = db === null ? undefined : PRISMA_PROVIDERS[db];
    const backRelations = collectBackRelations(tables);

    /* モデル名は**スキーマ全体で**一意化する（非 ASCII のテーブル名どうしが潰れてぶつかる） */
    const modelNames = new Map<string, string>();
    const resolved = uniqueNames(tables.map((t) => prismaModelName(t.name)));
    tables.forEach((t, i) => modelNames.set(t.name, resolved[i]!));

    const out: string[] = [
        "// grabado が生成した Prisma のスキーマ。",
        "//",
        "// **native type 属性（@db.Uuid / @db.VarChar）は出さない** —— provider ごとに別の表が",
        "// 要り、正規型 1 段で写すという設計（段階6-9c）と噛み合わないため。uuid は String に、",
        "// date / time / timestamp は DateTime に丸まる。丸めた列にはその旨のコメントが付く。",
        "//",
        "// **Prisma の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で",
        "// 一意化してある。**元の名前は @@map / @map に必ず残る**。",
    ];

    if (provider === undefined) {
        out.push("//");
        out.push(
            "// **datasource は出していない** —— " +
                (db ?? "このプロファイル") +
                " に対応する Prisma の provider が無い。",
        );
        out.push("// 使うときは対応する provider の datasource を自分で足すこと。");
        out.push("");
    } else {
        out.push("");
        out.push("datasource db {");
        out.push("  provider = " + prismaString(provider));
        out.push('  url      = env("DATABASE_URL")');
        out.push("}");
        out.push("");
        out.push("generator client {");
        out.push('  provider = "prisma-client-js"');
        out.push("}");
        out.push("");
    }

    for (const table of tables) {
        out.push(...model(table, backRelations, modelNames));
        out.push("");
    }

    return out.join("\n");
}

function model(
    table: DdlTable,
    backRelations: readonly BackRelation[],
    modelNames: ReadonlyMap<string, string>,
): string[] {
    const pk = primaryKeyOf(table);
    const pkParts = new Set(pk?.parts ?? []);
    const singlePk = pk !== null && pk.parts.length === 1;

    /*
     * **フィールド名はモデル 1 つの中でまとめて一意化する。** 列・関連フィールド・逆参照が
     * 同じ名前空間を共有するので、3 つを 1 本の配列にしてから通し番号を振る ——
     * 別々に振ると `氏名` と `メモ` が同じ名前になったまま通ってしまう。
     */
    const backs = backRelations.filter((one) => one.parent === table.name);
    const raw: string[] = [];
    for (const row of table.rows) {
        raw.push(prismaIdentifier(camelCase(row.name)));
        for (const _rel of row.relations) {
            raw.push(prismaIdentifier(camelCase(row.name.replace(/_id$/, "") || row.name)));
        }
    }
    for (const back of backs) {
        raw.push(
            prismaIdentifier(
                camelCase(back.ambiguous ? back.child + "_" + back.column : back.child),
            ),
        );
    }
    const names = uniqueNames(raw);

    /* 列名 -> フィールド名。ブロック属性（@@id / @@unique / @@index）が引く */
    const fieldOf = new Map<string, string>();
    let at = 0;
    for (const row of table.rows) {
        fieldOf.set(row.name, names[at]!);
        at += 1 + row.relations.length;
    }

    const out: string[] = [];
    if (table.comment) {
        out.push("/// " + lineComment(table.comment));
    }
    out.push("model " + modelNames.get(table.name)! + " {");

    at = 0;
    for (const row of table.rows) {
        const field = names[at]!;
        const relationFields = names.slice(at + 1, at + 1 + row.relations.length);
        at += 1 + row.relations.length;
        out.push(
            ...column(row, field, relationFields, pkParts.has(row.name) && singlePk, {
                backRelations: backRelations,
                modelNames: modelNames,
                fieldOf: fieldOf,
            }),
        );
    }

    /* 逆参照。**Prisma は両側を要求する**ので親側にここで生やす */
    if (backs.length) {
        out.push("");
        backs.forEach((back, i) => {
            const name = names[names.length - backs.length + i]!;
            const args = back.named ? " @relation(" + prismaString(relationName(back)) + ")" : "";
            out.push("  " + name + " " + modelNames.get(back.child)! + "[]" + args);
        });
    }

    const block: string[] = [];
    if (pk !== null && pk.parts.length > 1) {
        block.push("  @@id([" + pk.parts.map((c) => fieldOf.get(c) ?? c).join(", ") + "])");
    }
    for (const key of table.keys) {
        if (key.parts.length === 0) {
            continue;
        }
        const cols = key.parts.map((c) => fieldOf.get(c) ?? c).join(", ");
        if (key.type === "UNIQUE") {
            block.push("  @@unique([" + cols + "], map: " + prismaString(key.name) + ")");
        } else if (key.type !== "PRIMARY") {
            block.push("  @@index([" + cols + "], map: " + prismaString(key.name) + ")");
        }
    }
    block.push("  @@map(" + prismaString(table.name) + ")");

    out.push("");
    out.push(...block);
    out.push("}");
    return out;
}

interface ModelContext {
    readonly backRelations: readonly BackRelation[];
    readonly modelNames: ReadonlyMap<string, string>;
    readonly fieldOf: ReadonlyMap<string, string>;
}

function column(
    row: DdlRow,
    field: string,
    relationFields: readonly string[],
    isSinglePk: boolean,
    ctx: ModelContext,
): string[] {
    const out: string[] = [];

    if (row.comment) {
        out.push("  /// " + lineComment(row.comment));
    }

    const mapped = row.kind === null ? null : PRISMA_TYPES[row.kind];
    if (mapped === null) {
        out.push(
            "  // " +
                (row.kind ?? "不明") +
                ": Prisma のスカラーに対応が無いので String で出す（" +
                row.datatype +
                "）",
        );
    }
    const type = (mapped ?? "String") + (row.nullable ? "?" : "");

    const attrs: string[] = [];
    if (isSinglePk) {
        attrs.push("@id");
    }
    if (isGenerated(row)) {
        attrs.push("@default(autoincrement())");
    } else if (row.def !== "") {
        attrs.push("@default(" + defaultValue(row.def) + ")");
    }
    if (field !== row.name) {
        attrs.push("@map(" + prismaString(row.name) + ")");
    }

    out.push("  " + field + " " + type + (attrs.length ? " " + attrs.join(" ") : ""));

    /*
     * FK は**スカラー列 ＋ 関連フィールド**の 2 行（Prisma の形）。
     * fields / references が対応を持つので、@map と合わせて DB の名前は失われない。
     */
    row.relations.forEach((rel, i) => {
        const back = ctx.backRelations.find(
            (one) => one.parent === rel.table && one.child !== "" && one.column === row.name,
        );
        const args: string[] = [];
        if (back?.named) {
            args.push(prismaString(relationName(back)));
        }
        args.push("fields: [" + field + "]");
        args.push("references: [" + prismaIdentifier(camelCase(rel.row)) + "]");
        out.push(
            "  " +
                relationFields[i]! +
                " " +
                ctx.modelNames.get(rel.table)! +
                (row.nullable ? "?" : "") +
                " @relation(" +
                args.join(", ") +
                ")",
        );
    });

    return out;
}

/**
 * 既定値を Prisma の @default に写す。
 *
 * Prisma が受けるのは**リテラルと決まった関数だけ**なので、それ以外は
 * `dbgenerated("...")` で生の SQL として渡す（Prisma 公式の逃げ道）。
 */
function defaultValue(def: string): string {
    if (/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(def)) {
        return def;
    }
    if (/^(true|false)$/i.test(def)) {
        return def.toLowerCase();
    }
    if (/^(CURRENT_TIMESTAMP|now\(\))$/i.test(def)) {
        return "now()";
    }
    return "dbgenerated(" + prismaString(def) + ")";
}
