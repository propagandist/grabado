/* ------------------------- orm: drizzle ----------------------- */
/*
 * grabado: DdlTable[] -> Drizzle ORM のスキーマ定義（HANDOVER §6 段階6-9f）。
 *
 * ★ **型の表が core ごとに要る。** これが Prisma との決定的な違いで、段階6-9e が
 *   「Prisma / Drizzle / SQLAlchemy は『正規型 -> 言語型』の表 1 つで書ける」と書いた
 *   見立ては **Drizzle には当たらなかった**（issue #114 の実測）:
 *
 *     pg-core      integer / text / boolean / timestamp(withTimezone) / uuid()
 *     mysql-core   int     / text / boolean / datetime               / uuid は無い
 *     sqlite-core  integer（**mode で真偽と日時を表す**）/ text      / uuid は無い
 *     mssql-core   int     / varchar / bit  / datetime2              / uuid は明記なし
 *
 *   **Prisma のスカラーは 9 つで DB 非依存**（provider は datasource ブロックだけ）だったが、
 *   **Drizzle は型そのものが DB 依存**。1 本に括ると「どの DB でもない型名」になる。
 *
 * ★ **逆参照は出さない**（6-9d の JPA と同じ側へ戻る）。Drizzle は
 *   `references(() => users.id)` の**片側だけでスキーマが成立する** —— 両側を要求した
 *   Prisma のほうが例外だった。`relations()` ヘルパは**クエリ層の宣言**であって
 *   スキーマ定義ではないので出さない（grabado が出すのはテーブル定義）。
 *
 * ★ **sqlite の `mode` は書く。** `integer({ mode: "boolean" })` の mode を落とすと
 *   **真偽が数値になる** —— Prisma で `@db.*` を出さないと決めたのとは事情が違う。
 *   あちらは「無くてもスキーマは正しい」だったが、こちらは**無いと意味が変わる**。
 */

import type { DdlKey, DdlRow, DdlTable } from "../ddl/shared.ts";
import type { TypeKind } from "../palette.ts";
import { camelCase, entityName } from "./naming.ts";

/** Drizzle が core を分けている単位。**db プロファイルとは 1 対 1 ではない** */
type DrizzleCore = "pg" | "mysql" | "sqlite" | "mssql";

/**
 * db プロファイル -> core。**8 本のうち 5 本にしか対応が無い**（Prisma と同じ本数）。
 *
 * `mariadb` に専用の core は無く、**`mysql-core` で扱う**（Prisma が mariadb を
 * mysql provider で扱っているのと同じ判断）。`h2` / `oracle` / `sql-standard` は
 * 対応が無いので、**理由を先頭のコメントで言う** —— 黙って pg-core と書くと、
 * 動かないスキーマを動くように見せることになる。
 */
const DRIZZLE_CORES: Readonly<Record<string, DrizzleCore>> = {
    postgresql: "pg",
    mysql: "mysql",
    mariadb: "mysql",
    sqlite: "sqlite",
    mssql: "mssql",
};

/** core -> import するパッケージ */
const CORE_PACKAGES: Readonly<Record<DrizzleCore, string>> = {
    pg: "drizzle-orm/pg-core",
    mysql: "drizzle-orm/mysql-core",
    sqlite: "drizzle-orm/sqlite-core",
    mssql: "drizzle-orm/mssql-core",
};

/** core -> テーブルを作る関数名 */
const CORE_TABLE_FN: Readonly<Record<DrizzleCore, string>> = {
    pg: "pgTable",
    mysql: "mysqlTable",
    sqlite: "sqliteTable",
    mssql: "mssqlTable",
};

/**
 * 型の表 1 つぶん。`fn` が呼ぶ関数名、`args` が第 2 引数（オプション）。
 * `null` は「その core に対応が無いので丸めた」ことを 1 行のコメントで残すもの。
 */
interface DrizzleType {
    readonly fn: string;
    /** `text("name", { … })` の第 2 引数。空なら出さない */
    readonly args?: string;
}

/**
 * 正規型 -> core ごとの型（段階6-9f）。**`null` は対応が無い**（コメントを残して text に丸める）。
 *
 * ★ 丸めどころが core で違う:
 *   - **uuid は pg にしか無い**。mysql / sqlite / mssql では文字列に落ちる
 *   - **sqlite は 5 型しか無い**ので、真偽も日時も `integer` の mode で表す
 *   - **tz の有無**は pg（`withTimezone`）と mssql（`datetimeoffset`）だけが表せる
 */
const DRIZZLE_TYPES: Readonly<Record<DrizzleCore, Readonly<Record<TypeKind, DrizzleType | null>>>> =
    {
        pg: {
            int8: { fn: "smallint" },
            int16: { fn: "smallint" },
            int32: { fn: "integer" },
            int64: { fn: "bigint", args: '{ mode: "bigint" }' },
            decimal: { fn: "numeric" },
            float32: { fn: "real" },
            float64: { fn: "doublePrecision" },
            string: { fn: "text" },
            binary: { fn: "bytea" },
            boolean: { fn: "boolean" },
            date: { fn: "date" },
            time: { fn: "time" },
            time_tz: { fn: "time", args: "{ withTimezone: true }" },
            timestamp: { fn: "timestamp" },
            timestamp_tz: { fn: "timestamp", args: "{ withTimezone: true }" },
            interval: { fn: "interval" },
            uuid: { fn: "uuid" },
            json: { fn: "jsonb" },
            xml: null,
            geometry: null,
            other: null,
        },
        mysql: {
            int8: { fn: "tinyint" },
            int16: { fn: "smallint" },
            int32: { fn: "int" },
            int64: { fn: "bigint", args: '{ mode: "bigint" }' },
            decimal: { fn: "decimal" },
            float32: { fn: "float" },
            float64: { fn: "double" },
            string: { fn: "text" },
            binary: { fn: "blob" },
            boolean: { fn: "boolean" },
            date: { fn: "date" },
            time: { fn: "time" },
            /* MySQL に time with tz は無い */
            time_tz: null,
            timestamp: { fn: "datetime" },
            /* TIMESTAMP は UTC 基準で保存されるので tz つきの受け皿になる */
            timestamp_tz: { fn: "timestamp" },
            interval: null,
            /* MySQL に uuid 型は無い */
            uuid: null,
            json: { fn: "json" },
            xml: null,
            geometry: null,
            other: null,
        },
        sqlite: {
            int8: { fn: "integer" },
            int16: { fn: "integer" },
            int32: { fn: "integer" },
            int64: { fn: "blob", args: '{ mode: "bigint" }' },
            decimal: { fn: "numeric" },
            float32: { fn: "real" },
            float64: { fn: "real" },
            string: { fn: "text" },
            binary: { fn: "blob" },
            /* ★ mode を落とすと真偽が数値になる */
            boolean: { fn: "integer", args: '{ mode: "boolean" }' },
            date: { fn: "text" },
            time: { fn: "text" },
            time_tz: { fn: "text" },
            timestamp: { fn: "integer", args: '{ mode: "timestamp" }' },
            timestamp_tz: { fn: "integer", args: '{ mode: "timestamp" }' },
            interval: null,
            uuid: null,
            json: { fn: "text", args: '{ mode: "json" }' },
            xml: null,
            geometry: null,
            other: null,
        },
        mssql: {
            int8: { fn: "tinyint" },
            int16: { fn: "smallint" },
            int32: { fn: "int" },
            int64: { fn: "bigint", args: '{ mode: "bigint" }' },
            decimal: { fn: "decimal" },
            float32: { fn: "real" },
            float64: { fn: "float" },
            string: { fn: "nvarchar", args: "{ length: 4000 }" },
            binary: { fn: "varbinary" },
            boolean: { fn: "bit" },
            date: { fn: "date" },
            time: { fn: "time" },
            time_tz: null,
            timestamp: { fn: "datetime2" },
            timestamp_tz: { fn: "datetimeoffset" },
            interval: null,
            uuid: null,
            json: null,
            xml: null,
            geometry: null,
            other: null,
        },
    };

/**
 * TypeScript の識別子にする。**非 ASCII は `_` に潰れる**ので、潰れた名前どうしが
 * ぶつかりうる（`氏名` も `メモ` も同じ形になる）。一意化は呼び手がまとめてやる。
 *
 * **DB の名前は必ず出力に残る** —— 型関数の第 1 引数がそれである。
 */
function tsIdentifier(name: string): string {
    const safe = name.replace(/[^A-Za-z0-9_]/g, "_");
    return /^[A-Za-z_]/.test(safe) ? safe : "c" + safe;
}

/**
 * 名前を一意化する。**重複したものだけに通し番号が付く**（`_2` / `_3` …）。
 * 入力の順にしか依らないので決定論が保たれる。
 *
 * **prisma.ts が同じ形を持っているが括らない** —— 6-9e の「言語ごとの識別子の規則は
 * 各生成器が持つ」に沿う。**括ると、片方を直したときにもう片方の golden が動く。**
 */
function uniqueNames(raw: readonly string[]): string[] {
    const used = new Map<string, number>();
    return raw.map((one) => {
        const seen = used.get(one) ?? 0;
        used.set(one, seen + 1);
        return seen === 0 ? one : one + "_" + String(seen + 1);
    });
}

/** TypeScript の文字列リテラル */
function tsString(value: string): string {
    return '"' + value.split("\\").join("\\\\").split('"').join('\\"') + '"';
}

/** 1 行に畳んだコメント（`//` は行末までなので改行を潰す） */
function lineComment(text: string): string {
    return text.split("\r").join(" ").split("\n").join(" ");
}

function isGenerated(row: DdlRow): boolean {
    return row.autoincrement || /IDENTITY|AUTO_INCREMENT/i.test(row.datatype);
}

function primaryKeyOf(table: DdlTable): DdlKey | null {
    return table.keys.find((k) => k.type === "PRIMARY" && k.parts.length > 0) ?? null;
}

/**
 * 自動採番の書き方。**core ごとに違う。**
 *
 * ★ **sqlite だけ PK と一体**（`primaryKey({ autoIncrement: true })`）なので、
 *   単独の修飾子として出せない —— 呼び手が PK の分岐で扱う。
 */
const AUTO_INCREMENT: Readonly<Record<DrizzleCore, string | null>> = {
    pg: ".generatedAlwaysAsIdentity()",
    mysql: ".autoincrement()",
    sqlite: null,
    mssql: ".identity()",
};

/** テーブル名 -> export する変数名（`articles` -> `articles`。**複数形のまま**） */
function tableVar(table: string): string {
    return tsIdentifier(camelCase(table));
}

/**
 * Drizzle のスキーマ定義を作る（段階6-9f）。
 *
 * `db` が `null` か対応外のときは **core を決められない** ので、理由を先頭のコメントで言い、
 * **pg-core で出す**（Prisma が datasource を出さずにモデルだけ出すのと同じ立場 ——
 * 形が読めれば移せる）。
 */
export function generateDrizzle(tables: readonly DdlTable[], db: string | null): string {
    /* テーブルが 0 件なら 1 バイトも出さない（DDL の empty.sql と揃える。段階6-9d の判断） */
    if (tables.length === 0) {
        return "";
    }

    const core: DrizzleCore | undefined = db === null ? undefined : DRIZZLE_CORES[db];
    const effective: DrizzleCore = core ?? "pg";
    const types = DRIZZLE_TYPES[effective];

    /* 変数名は**スキーマ全体で**一意化する（非 ASCII のテーブル名どうしが潰れてぶつかる） */
    const varNames = new Map<string, string>();
    const resolvedVars = uniqueNames(tables.map((t) => tableVar(t.name)));
    tables.forEach((t, i) => varNames.set(t.name, resolvedVars[i]!));

    /* PK の列名を引く（references の右辺に要る）。**単一 PK のときだけ** */
    const pkColumnOf = new Map<string, string>();
    /* 列名 -> プロパティ名（references の右辺は**プロパティ名**で書く） */
    const propOf = new Map<string, Map<string, string>>();

    const bodies: string[] = [];
    const used = new Set<string>([CORE_TABLE_FN[effective]]);
    let needsSql = false;

    /* 1 周目: 名前を決める（references が他テーブルのプロパティ名を引くため） */
    for (const table of tables) {
        const names = uniqueNames(table.rows.map((r) => tsIdentifier(camelCase(r.name))));
        const map = new Map<string, string>();
        table.rows.forEach((r, i) => map.set(r.name, names[i]!));
        propOf.set(table.name, map);
        const pk = primaryKeyOf(table);
        if (pk !== null && pk.parts.length === 1) {
            pkColumnOf.set(table.name, map.get(pk.parts[0]!) ?? pk.parts[0]!);
        }
    }

    /* 2 周目: 本体を組む */
    for (const table of tables) {
        bodies.push(
            ...tableBlock(table, {
                core: effective,
                types: types,
                varNames: varNames,
                propOf: propOf,
                pkColumnOf: pkColumnOf,
                used: used,
                markSql: () => {
                    needsSql = true;
                },
            }),
        );
        bodies.push("");
    }

    const head: string[] = [
        "// grabado が生成した Drizzle のスキーマ。",
        "//",
        "// **型は core ごとに違う** —— pg / mysql / sqlite / mssql で関数名も表せる意味も",
        "// 変わるので、正規型からの表を core ごとに持っている（段階6-9f）。",
        "//",
        "// **TypeScript の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で",
        "// 一意化してある。**元の名前は型関数の第 1 引数に必ず残る**。",
    ];
    if (core === undefined) {
        head.push("//");
        head.push(
            "// **" +
                (db ?? "このプロファイル") +
                " に対応する Drizzle の core は無い。** pg-core の形で出しているので、",
        );
        head.push("// 使うときは対応する core へ読み替えること（型名が変わる）。");
    }
    head.push("");

    const imports = [...used].sort();
    head.push(
        "import { " + imports.join(", ") + " } from " + tsString(CORE_PACKAGES[effective]) + ";",
    );
    if (needsSql) {
        head.push('import { sql } from "drizzle-orm";');
    }
    head.push("");

    return head.concat(bodies).join("\n");
}

interface BlockContext {
    readonly core: DrizzleCore;
    readonly types: Readonly<Record<TypeKind, DrizzleType | null>>;
    readonly varNames: ReadonlyMap<string, string>;
    readonly propOf: ReadonlyMap<string, ReadonlyMap<string, string>>;
    readonly pkColumnOf: ReadonlyMap<string, string>;
    /** import に集める関数名。**呼ぶたびに足す**（使ったものだけを import する） */
    readonly used: Set<string>;
    readonly markSql: () => void;
}

/** `export const users = pgTable("users", { … });` 1 つぶん */
function tableBlock(table: DdlTable, ctx: BlockContext): string[] {
    const pk = primaryKeyOf(table);
    const singlePk = pk !== null && pk.parts.length === 1;
    const props = ctx.propOf.get(table.name)!;

    const out: string[] = [];
    if (table.comment) {
        out.push("/** " + lineComment(table.comment) + " */");
    }
    out.push(
        "export const " +
            ctx.varNames.get(table.name)! +
            " = " +
            CORE_TABLE_FN[ctx.core] +
            "(" +
            tsString(table.name) +
            ", {",
    );

    for (const row of table.rows) {
        out.push(...columnLines(row, props.get(row.name)!, singlePk && pk.parts[0] === row.name, ctx));
    }

    out.push("});");
    return out;
}

/** 列 1 本ぶん（コメント行を含む） */
function columnLines(row: DdlRow, prop: string, isSinglePk: boolean, ctx: BlockContext): string[] {
    const out: string[] = [];

    if (row.comment) {
        out.push("    /** " + lineComment(row.comment) + " */");
    }

    const mapped = row.kind === null ? null : ctx.types[row.kind];
    if (mapped === null || mapped === undefined) {
        out.push(
            "    // " +
                (row.kind ?? "不明") +
                ": " +
                ctx.core +
                "-core に対応が無いので text で出す（" +
                row.datatype +
                "）",
        );
    }
    const type = mapped ?? { fn: "text" };
    ctx.used.add(type.fn);

    const args = [tsString(row.name)];
    if (type.args !== undefined) {
        args.push(type.args);
    }
    let expr = type.fn + "(" + args.join(", ") + ")";

    /*
     * ★ **sqlite の自動採番は PK と一体**（`primaryKey({ autoIncrement: true })`）。
     *   他の 3 つは独立した修飾子なので、順序は「PK -> 採番 -> notNull -> default -> FK」。
     */
    const generated = isGenerated(row);
    if (isSinglePk) {
        expr +=
            ctx.core === "sqlite" && generated
                ? ".primaryKey({ autoIncrement: true })"
                : ".primaryKey()";
    }
    if (generated && !(ctx.core === "sqlite" && isSinglePk)) {
        const auto = AUTO_INCREMENT[ctx.core];
        if (auto !== null) {
            expr += auto;
        }
    }
    if (!row.nullable && !isSinglePk) {
        expr += ".notNull()";
    }
    if (!generated && row.def !== "") {
        /*
         * ★ **既定値は sql テンプレートで出す。** grabado が持っているのは DDL の既定値
         *   （`now()` のような式を含む）で、**リテラルとして書き直すと意味が変わりうる**。
         *   1 つの形に揃えておけば、写したものがそのまま DB へ渡る。
         */
        ctx.markSql();
        expr += ".default(sql`" + row.def.split("`").join("\`") + "`)";
    }

    /* ★ **逆参照は出さない**（冒頭の★）。片側の references だけでスキーマが成立する */
    for (const rel of row.relations) {
        const target = ctx.varNames.get(rel.table);
        const targetProp = ctx.propOf.get(rel.table)?.get(rel.row) ?? ctx.pkColumnOf.get(rel.table);
        if (target === undefined || targetProp === undefined) {
            out.push("    // 参照先 " + rel.table + "." + rel.row + " が設計に無い");
            continue;
        }
        expr += ".references(() => " + target + "." + targetProp + ")";
    }

    out.push("    " + prop + ": " + expr + ",");
    return out;
}
