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
 *
 *   **Prisma のスカラーは 9 つで DB 非依存**（provider は datasource ブロックだけ）だったが、
 *   **Drizzle は型そのものが DB 依存**。1 本に括ると「どの DB でもない型名」になる。
 *
 * ★ **core は 3 つしかない**（issue #120 の実測。drizzle-orm 0.45.2）。6-9f は
 *   **`mssql-core` があるつもりで書いていたが、実在しない** —— Drizzle が持つのは
 *   pg / mysql / sqlite / singlestore / gel で、**SQL Server 用の core は無い**。
 *   `mssql` は h2 / oracle / sql-standard と同じ「対応する core が無い」側へ移した。
 *
 * ★ **逆参照は出さない**（6-9d の JPA と同じ側へ戻る）。Drizzle は
 *   `references(() => users.id)` の**片側だけでスキーマが成立する** —— 両側を要求した
 *   Prisma のほうが例外だった。`relations()` ヘルパは**クエリ層の宣言**であって
 *   スキーマ定義ではないので出さない（grabado が出すのはテーブル定義）。
 *
 * ★ **キー（複合 PK / UNIQUE / INDEX）はテーブル設定に出す**（issue #123）。6-9f は
 *   **単一列 PK しか見ておらず、3 種とも落としていた** —— JPA と Prisma は同じ設計から
 *   3 種とも出しているので、**Drizzle だけが情報を落としていた**。型検査では捕まらない
 *   （複合 PK が無くても TypeScript としては妥当）ので、#120 の道具も PASS していた。
 *
 * ★ **sqlite の `mode` は書く。** `integer({ mode: "boolean" })` の mode を落とすと
 *   **真偽が数値になる** —— Prisma で `@db.*` を出さないと決めたのとは事情が違う。
 *   あちらは「無くてもスキーマは正しい」だったが、こちらは**無いと意味が変わる**。
 */

import type { DdlKey, DdlRow, DdlTable } from "../ddl/shared.ts";
import type { TypeKind } from "../palette.ts";
import { camelCase, entityName } from "./naming.ts";

/** Drizzle が core を分けている単位。**db プロファイルとは 1 対 1 ではない** */
type DrizzleCore = "pg" | "mysql" | "sqlite";

/**
 * db プロファイル -> core。**8 本のうち 4 本にしか対応が無い。**
 *
 * `mariadb` に専用の core は無く、**`mysql-core` で扱う**（Prisma が mariadb を
 * mysql provider で扱っているのと同じ判断）。`h2` / `mssql` / `oracle` / `sql-standard` は
 * 対応が無いので、**理由を先頭のコメントで言う** —— 黙って pg-core と書くと、
 * 動かないスキーマを動くように見せることになる。
 *
 * ★ **`mssql` は 6-9f では core を持っていた**が、**`drizzle-orm/mssql-core` は実在しない**
 * （issue #120 の実測。`TS2307: Cannot find module`）。**Prisma とは本数が違う** ——
 * あちらは `sqlserver` provider を持つので 5 本。
 */
const DRIZZLE_CORES: Readonly<Record<string, DrizzleCore>> = {
    postgresql: "pg",
    mysql: "mysql",
    mariadb: "mysql",
    sqlite: "sqlite",
};

/** core -> import するパッケージ */
const CORE_PACKAGES: Readonly<Record<DrizzleCore, string>> = {
    pg: "drizzle-orm/pg-core",
    mysql: "drizzle-orm/mysql-core",
    sqlite: "drizzle-orm/sqlite-core",
};

/** core -> テーブルを作る関数名 */
const CORE_TABLE_FN: Readonly<Record<DrizzleCore, string>> = {
    pg: "pgTable",
    mysql: "mysqlTable",
    sqlite: "sqliteTable",
};

/**
 * core -> 列の型名（**自己参照 FK の戻り型注釈**に要る）。
 *
 * ★ **注釈が無いと `tsc --strict` が通らない** —— `references(() => employees.id)` は
 * 自分自身の初期化子を参照するので、**戻り型を推論できず TS7022/TS7024 になる**
 * （issue #120 の実測）。**他テーブルへの参照では要らない**ので、自己参照のときだけ出す。
 */
const CORE_COLUMN_TYPE: Readonly<Record<DrizzleCore, string>> = {
    pg: "AnyPgColumn",
    mysql: "AnyMySqlColumn",
    sqlite: "AnySQLiteColumn",
};

/**
 * 型の表 1 つぶん。`fn` が呼ぶ関数名、`args` が第 2 引数（オプション）。
 * `null` は「その core に対応が無いので丸めた」ことを 1 行のコメントで残すもの。
 */
interface DrizzleType {
    readonly fn: string;
    /** `text("name", { … })` の第 2 引数。空なら出さない */
    readonly args?: string;
    /**
     * **その core に組み込みの型関数が無いので、`customType` で定義してから使う**もの。
     * 埋まっていると、ファイル先頭に定義を 1 つ出し、import には `fn` ではなく
     * `customType` を足す。`sqlType` が DB 側の型名、`tsType` が値の型。
     *
     * ★ **基準は「組み込みで正規型の意味を表せるか」**（issue #120）。表せるなら組み込みを使う
     * ——`customType` は出力が膨らむので、避けられるなら避ける。
     */
    readonly custom?: { readonly sqlType: string; readonly tsType: string };
}

/**
 * 正規型 -> core ごとの型（段階6-9f）。**`null` は対応が無い**（コメントを残して text に丸める）。
 *
 * ★ 丸めどころが core で違う:
 *   - **uuid は pg にしか無い**。mysql / sqlite では文字列に落ちる
 *   - **sqlite は 5 型しか無い**ので、真偽も日時も `integer` の mode で表す
 *   - **tz を表せるのは pg だけ**（`withTimezone`）
 *   - **binary は pg / mysql とも組み込みが無い**ので `customType`（下の★）
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
            /* ★ pg-core に bytea の型関数は無い（binary 系は bit と customType だけ。#120 の実測） */
            binary: { fn: "bytea", custom: { sqlType: "bytea", tsType: "Uint8Array" } },
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
            /*
             * ★ mysql-core に blob の型関数は無い（あるのは binary / varbinary。#120 の実測）。
             *   **varbinary に落とすと上限が 4GB から 64KB に狭まる**ので customType にする ——
             *   パレットの `bytea` は LONGBLOB で、DDL 側も「上限が広がる（安全側）」で選んでいる。
             */
            binary: { fn: "longblob", custom: { sqlType: "longblob", tsType: "Uint8Array" } },
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
    /* `customType` で定義してから使う型（関数名 -> 定義）。**使ったものだけ出す** */
    const customs = new Map<string, { sqlType: string; tsType: string }>();
    /* 自己参照 FK の戻り型注釈に要る型名。**出したときだけ import する** */
    let needsColumnType = false;
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
                customs: customs,
                markSql: () => {
                    needsSql = true;
                },
                markColumnType: () => {
                    needsColumnType = true;
                },
            }),
        );
        bodies.push("");
    }

    const head: string[] = [
        "// grabado が生成した Drizzle のスキーマ。",
        "//",
        "// **型は core ごとに違う** —— pg / mysql / sqlite で関数名も表せる意味も",
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

    const pkg = tsString(CORE_PACKAGES[effective]);
    if (needsColumnType) {
        head.push("import type { " + CORE_COLUMN_TYPE[effective] + " } from " + pkg + ";");
    }
    const imports = [...used].sort();
    head.push("import { " + imports.join(", ") + " } from " + pkg + ";");
    if (needsSql) {
        head.push('import { sql } from "drizzle-orm";');
    }
    head.push("");

    /*
     * `customType` の定義（**使ったものだけ・名前順**）。core に組み込みが無い型はここで作る
     * —— 存在しない関数名を import すると、**そもそも読み込めないスキーマになる**（#120）。
     */
    for (const fn of [...customs.keys()].sort()) {
        const def = customs.get(fn)!;
        head.push(
            "/** " + effective + "-core に " + def.sqlType + " の型関数は無いので自分で定義する */",
        );
        head.push("const " + fn + " = customType<{ data: " + def.tsType + " }>({");
        head.push("    dataType() {");
        head.push("        return " + tsString(def.sqlType) + ";");
        head.push("    },");
        head.push("});");
        head.push("");
    }

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
    /** `customType` で定義してから使う型。**呼ぶたびに足す** */
    readonly customs: Map<string, { sqlType: string; tsType: string }>;
    readonly markSql: () => void;
    readonly markColumnType: () => void;
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
        out.push(
            ...columnLines(
                row,
                props.get(row.name)!,
                singlePk && pk.parts[0] === row.name,
                table.name,
                ctx,
            ),
        );
    }

    /*
     * ★ **キーはテーブル設定（第 3 引数）に出す**（issue #123）。**1 つも無ければ第 3 引数ごと
     *   出さない** —— 空の配列を渡す形は Drizzle として無意味で、キーを持たないテーブルの
     *   出力が動く理由も無い。
     */
    const config = tableConfigLines(table, ctx);
    if (config.length === 0) {
        out.push("});");
    } else {
        out.push("}, (t) => [");
        out.push(...config);
        out.push("]);");
    }
    return out;
}

/**
 * テーブル設定（`pgTable` の第 3 引数）に出すキー（issue #123）。
 *
 * ★ **単一列 PK はここに来ない** —— 列修飾子 `.primaryKey()` で出しているので、
 *   複合 PK のときだけ `primaryKey({ columns: [...] })` を出す。
 *
 * ★ **形は配列を返すコールバック**（drizzle-orm 0.45.2 の現行。オブジェクトを返す形は
 *   deprecated）。列は**プロパティ名**で参照するので、`propOf` がそのまま使える。
 *
 * ★ **PK の制約名は出さない。** Drizzle は `primaryKey({ name, columns })` を許すが、
 *   **JPA（`@IdClass`）も Prisma（`@@id` に `map` 無し）も落としている** —— Drizzle だけ
 *   出すと非対称になる。**UNIQUE / INDEX の名前は 3 本とも出しているので出す。**
 */
function tableConfigLines(table: DdlTable, ctx: BlockContext): string[] {
    const props = ctx.propOf.get(table.name)!;
    const ref = (col: string): string => "t." + (props.get(col) ?? col);
    const out: string[] = [];

    const pk = primaryKeyOf(table);
    if (pk !== null && pk.parts.length > 1) {
        ctx.used.add("primaryKey");
        out.push("    primaryKey({ columns: [" + pk.parts.map(ref).join(", ") + "] }),");
    }

    /* PRIMARY / UNIQUE 以外は index（DDL 側の CREATE INDEX と同じ振り分け。JPA も同じ） */
    for (const key of table.keys) {
        if (key.parts.length === 0 || key.type === "PRIMARY") {
            continue;
        }
        const fn = key.type === "UNIQUE" ? "unique" : "index";
        ctx.used.add(fn);
        /* 名前が無ければ引数を省く（Drizzle は `unique()` を許す。空文字を渡さない） */
        const named = key.name === "" ? "" : tsString(key.name);
        out.push("    " + fn + "(" + named + ").on(" + key.parts.map(ref).join(", ") + "),");
    }
    return out;
}

/** 列 1 本ぶん（コメント行を含む） */
function columnLines(
    row: DdlRow,
    prop: string,
    isSinglePk: boolean,
    tableName: string,
    ctx: BlockContext,
): string[] {
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
    if (type.custom === undefined) {
        ctx.used.add(type.fn);
    } else {
        /* 定義するものは import しない —— **import すると存在しない名前を要求することになる** */
        ctx.used.add("customType");
        ctx.customs.set(type.fn, type.custom);
    }

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
        /*
         * ★ **自己参照だけ戻り型を注釈する**（#120 の実測）。自分自身の初期化子を参照するので、
         *   注釈が無いと **TS7022/TS7024（暗黙の any・循環推論）** で型検査が通らない。
         *   他テーブルへの参照では推論できるので付けない —— 全部に付けると読みにくくなる。
         */
        const self = rel.table === tableName;
        if (self) {
            ctx.markColumnType();
        }
        const arrow = self ? "(): " + CORE_COLUMN_TYPE[ctx.core] + " => " : "() => ";
        expr += ".references(" + arrow + target + "." + targetProp + ")";
    }

    out.push("    " + prop + ": " + expr + ",");
    return out;
}
