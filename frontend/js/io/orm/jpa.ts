/* ------------------------- orm: jpa (kotlin) ------------------ */
/*
 * grabado: DesignModel -> Jakarta Persistence の entity（Kotlin）。HANDOVER §6 段階6-9d。
 *
 * **ORM 出力の 1 本目。** house 標準が Kotlin/Spring Boot なので自社利用でも効き、
 * かつ型の写像（uuid / jsonb / timestamptz -> 言語型）がいちばん難しいので、
 * **骨格の検証としてちょうどよい**（6-0 の判断。CUSTOMIZATIONS.md の段階6-9a）。
 *
 * DDL 生成との違いは「何を見るか」だけで、**入力は同じ解決済みモデル**（js/io/ddl/shared.ts の
 * DdlTable）。型パレットを読むのは今もあちらの buildDdlModel 1 か所で、ここは
 * **正規型（kind）と size と関係**を見る。6-9c が 172 型に kind を入れたのがこのため。
 *
 * 出すもの / 出さないもの（段階6-9d の判断。根拠は CUSTOMIZATIONS.md）:
 *
 *   出す      @Entity / @Table(name) / @Column / @Id / @GeneratedValue /
 *             @ManyToOne ＋ @JoinColumn / @IdClass（複合 PK）/ uniqueConstraints / indexes /
 *             コメントを KDoc に
 *   出さない  **@OneToMany（逆参照）** —— 設計モデルは「子側の FK 1 本」しか持たず、
 *             親側のコレクション名は**発明するしかない**。多重度（1:1 / 1:N）も同じ理由で
 *             推論しない。6-5b の「生成器は識別子を書き換えない」と同じ立場
 *
 * **クラス名は変換する**（articles -> Article）。ORM の慣行に従う判断で、
 * **元のテーブル名は @Table(name = ...) に必ず残す**ので往復が壊れない。
 * 単数化は英語の規則だけを持ち、倒せない語（people / children）はそのまま残す。
 */

import { isGenerated, primaryKeyOf, type DdlKey, type DdlRow, type DdlTable } from "../ddl/shared.ts";
import type { TypeKind } from "../palette.ts";
import { camelCase, entityName } from "./naming.ts";

/**
 * 正規型 -> Kotlin の型（段階6-9d）。**ORM ごとにこの表 1 つで済むのが 6-9c の狙い。**
 *
 * `null` は「JPA に対応する型が無い」で、String に落としたうえで**理由を行コメントで残す**
 * （黙って落とすと、設計が持っていた意味が生成物から消えたことに誰も気づけない）。
 */
const KOTLIN_TYPES: Readonly<Record<TypeKind, string | null>> = {
    /* int8 は Byte ではなく Short。mssql の tinyint は 0..255 で、Kotlin の Byte は符号付き */
    int8: "Short",
    int16: "Short",
    int32: "Int",
    int64: "Long",
    decimal: "BigDecimal",
    float32: "Float",
    float64: "Double",
    string: "String",
    binary: "ByteArray",
    boolean: "Boolean",
    date: "LocalDate",
    time: "LocalTime",
    time_tz: "OffsetTime",
    timestamp: "LocalDateTime",
    timestamp_tz: "OffsetDateTime",
    /* interval は JPA に無い。Duration は年月の interval を表せないので落とさず null */
    interval: null,
    uuid: "UUID",
    /* json / xml / geometry は JPA の標準に無い（Hibernate の拡張なら書けるが標準ではない） */
    json: null,
    xml: null,
    geometry: null,
    other: null,
};

/** Kotlin の型 -> import 文。java.lang と Kotlin の組み込みは要らない */
const TYPE_IMPORTS: Readonly<Record<string, string>> = {
    BigDecimal: "java.math.BigDecimal",
    LocalDate: "java.time.LocalDate",
    LocalTime: "java.time.LocalTime",
    OffsetTime: "java.time.OffsetTime",
    LocalDateTime: "java.time.LocalDateTime",
    OffsetDateTime: "java.time.OffsetDateTime",
    UUID: "java.util.UUID",
};

/**
 * テーブル名 -> Kotlin のクラス名。単数化と PascalCase は js/io/orm/naming.ts
 * （**段階6-9e で 2 本目を書く段に括った**）で、ここは Kotlin 識別子にするところだけ。
 */
export function className(table: string): string {
    return kotlinIdentifier(entityName(table));
}

/** 列名 -> Kotlin のフィールド名（`created_at` -> `createdAt`） */
export function fieldName(column: string): string {
    return kotlinIdentifier(camelCase(column));
}

/**
 * FK 列 -> 関連のフィールド名（`author_id` -> `author`）。
 *
 * 末尾の `_id` を落とすのは §6.3 の FK 命名（`fk_<table>_<列>`）と対になる慣行で、
 * 落とした結果が空になるなら（列名が `id` そのもの）落とさない。
 */
function relationFieldName(column: string): string {
    const stripped = column.replace(/_id$/, "");
    return fieldName(stripped === "" ? column : stripped);
}

/** KDoc を 1 行に畳む。値がコメントの閉じ記号を含んでいてもコメントが切れないようにする */
function kdoc(text: string, indent: string): string[] {
    const oneLine = text.split("\r").join(" ").split("\n").join(" ").split("*/").join("* /");
    return [indent + "/** " + oneLine + " */"];
}

/**
 * Kotlin の識別子として書ける形にする（段階6-9d）。
 *
 * **DB の名前は書き換えない** —— 元の名前は @Table(name) / @Column(name) に必ず残るので、
 * ここで直すのは「Kotlin のソースとして書けるか」だけ。6-5b の「生成器は識別子を
 * 書き換えない」は**出力先の SQL で意味が変わること**を禁じた判断で、言語識別子は別。
 *
 * 3 段:
 *   1. そのまま書ける（文字・数字・_ だけ、先頭が数字でない）  -> そのまま
 *   2. バッククォートで囲めば書ける                            -> 囲む（**名前は 1 文字も失わない**）
 *   3. 囲んでも書けない文字を含む（. ; [ ] / < > : \ 改行 と ` 自身）-> _ に置換
 *
 * 3 に落ちるのは JVM が名前に使えない文字を含むときだけで、そのとき初めて名前が変わる。
 *
 * ★ **文字集合は実測で決めた**（2026-09-16。#340）—— kotlinc 2.4.10 に通した結果:
 *
 *   裸で書く      a½（No） FAIL      aⅧ（Nl） FAIL      a$b  FAIL
 *   囲んで書く    `a½`     PASS      `a$b`    PASS
 *
 *   **第 1 段は \p{Nd} までで、\p{N} にしてはいけない** —— No と Nl を「そのまま書ける」と
 *   誤判定し、**kotlinc が拒む Kotlin を出す**（#340 の穴 1。**2026-09-16 まで実在した**）。
 *   **Java の規則とは違う** —— javac は Nl と $ を受け、No だけを拒む（同日に両方測った）。
 *   **jpa-java.ts の綴りを写さないこと。**
 */
export function kotlinIdentifier(name: string): string {
    if (/^[\p{L}_][\p{L}\p{Nd}_]*$/u.test(name)) {
        return name;
    }
    if (name !== "" && !/[`.;[\]/<>:\\\r\n]/.test(name)) {
        return "`" + name + "`";
    }
    const safe = name.replace(/[^\p{L}\p{Nd}_]/gu, "_");
    return /^[\p{L}_]/u.test(safe) ? safe : "_" + safe;
}

/**
 * 名前を一意化する（**#340**）。**重複したものだけに通し番号が付く**（`_2` / `_3` …）。
 * 入力の順にしか依らないので決定論が保たれる。
 *
 * **Kotlin でも同一ファイルに同名のクラスは置けない。** 第 3 段（`_` への置換）で潰れた名前は
 * 衝突しうる（`a.b` と `a/b` がどちらも `A_b`）ので、**クラス名もフィールド名も**ここを通す。
 * **囲める段があるぶん Kotlin は潰れにくい**が、潰れないわけではない ——
 * **2026-09-16 まで、通していなかった。**
 *
 * prisma.ts / drizzle.ts / jpa-java.ts が同じ形を持つ（これで **4 本目**）。括らない判断は
 * drizzle.ts の KDoc にあり、**#332 が射程を測ったのは別の 2 本**（isGenerated / primaryKeyOf）。
 */
function uniqueNames(raw: readonly string[]): string[] {
    const used = new Map<string, number>();
    return raw.map((one) => {
        const seen = used.get(one) ?? 0;
        used.set(one, seen + 1);
        return seen === 0 ? one : one + "_" + String(seen + 1);
    });
}

/** 複合 PK なら返す（@IdClass と id クラスが要るのはこのときだけ） */
function compositeKeyOf(table: DdlTable): DdlKey | null {
    const pk = primaryKeyOf(table);
    return pk !== null && pk.parts.length > 1 ? pk : null;
}

function quote(value: string): string {
    return '"' + value.split("\\").join("\\\\").split('"').join('\\"') + '"';
}

export function generateJpa(tables: readonly DdlTable[]): string {
    /*
     * テーブルが 1 つも無ければ**何も出さない**（DDL の empty.sql が 0 バイトなのと揃える）。
     * 見出しだけのファイルは「生成に失敗した」と見分けが付かない。
     */
    if (tables.length === 0) {
        return "";
    }

    /*
     * **クラス名はファイル全体で一意化する**（#340）。**id クラスも同じ名前空間に入れる** ——
     * Kotlin でも 1 つのファイルに同名のクラスは置けないので、潰れた名前が衝突すると壊れる。
     */
    const raw: string[] = [];
    for (const table of tables) {
        const base = className(table.name);
        raw.push(base);
        if (compositeKeyOf(table) !== null) {
            raw.push(base + "Id");
        }
    }
    const unique = uniqueNames(raw);

    const entityNames = new Map<string, string>();
    const idNames = new Map<string, string>();
    let at = 0;
    for (const table of tables) {
        entityNames.set(table.name, unique[at++]!);
        if (compositeKeyOf(table) !== null) {
            idNames.set(table.name, unique[at++]!);
        }
    }

    const imports = new Set<string>();
    const bodies: string[] = [];

    for (const table of tables) {
        bodies.push(
            entity(
                table,
                entityNames.get(table.name)!,
                idNames.get(table.name) ?? null,
                entityNames,
                imports,
            ),
        );
    }

    /*
     * import は使ったものだけを昇順で出す。**決定論のため並べ替えは必須**
     * （Set の反復順は挿入順で、テーブルの順に依ってしまう）。
     */
    const head = [
        "/*",
        " * grabado が生成した Jakarta Persistence の entity（Kotlin）。",
        " *",
        " * **kotlin(\"plugin.jpa\") が要る** —— JPA は引数の無いコンストラクタを求めるので、",
        " * コンストラクタ引数で書く形はプラグイン前提になる（Spring Initializr の既定）。",
        " * package 宣言は出さない（置き場所は生成物を受け取る側が決める）。",
        " */",
        "",
        ...[...imports].sort().map((one) => "import " + one),
    ];

    return head.join("\n") + "\n\n" + bodies.join("\n\n");
}

function entity(
    table: DdlTable,
    name: string,
    idName: string | null,
    entityNames: ReadonlyMap<string, string>,
    imports: Set<string>,
): string {
    const pk = primaryKeyOf(table);
    const pkParts = new Set(pk?.parts ?? []);
    const out: string[] = [];

    imports.add("jakarta.persistence.Entity");
    imports.add("jakarta.persistence.Table");

    if (table.comment) {
        out.push(...kdoc(table.comment, ""));
    }
    out.push("@Entity");
    out.push(...tableAnnotation(table, imports));

    /* 複合 PK は @IdClass。JPA は @Id を複数持つ entity に id クラスを要求する */
    if (idName !== null) {
        imports.add("jakarta.persistence.IdClass");
        out.push("@IdClass(" + idName + "::class)");
    }

    out.push("class " + name + "(");

    /* **フィールド名はクラスの中でまとめて一意化する**（#340。列と関連が同じ名前空間） */
    const fieldNames = uniqueNames(
        table.rows.map((row) =>
            !pkParts.has(row.name) && row.relations.length > 0
                ? relationFieldName(row.name)
                : fieldName(row.name),
        ),
    );

    const fields: string[] = [];
    table.rows.forEach((row, i) => {
        fields.push(field(row, pkParts, fieldNames[i]!, entityNames, imports));
    });
    out.push(fields.join(",\n\n") + ",");
    out.push(")");

    if (idName !== null) {
        out.push("");
        out.push(...idClass(table, pk!, idName, imports));
    }

    return out.join("\n");
}

function tableAnnotation(table: DdlTable, imports: Set<string>): string[] {
    const args: string[] = ["name = " + quote(table.name)];

    const uniques = table.keys.filter((k) => k.type === "UNIQUE" && k.parts.length > 0);
    if (uniques.length) {
        imports.add("jakarta.persistence.UniqueConstraint");
        args.push(
            "uniqueConstraints = [" +
                uniques
                    .map(
                        (k) =>
                            "UniqueConstraint(name = " +
                            quote(k.name) +
                            ", columnNames = [" +
                            k.parts.map(quote).join(", ") +
                            "])",
                    )
                    .join(", ") +
                "]",
        );
    }

    /* PRIMARY / UNIQUE 以外は index（DDL 側の CREATE INDEX と同じ振り分け） */
    const indexes = table.keys.filter(
        (k) => k.type !== "PRIMARY" && k.type !== "UNIQUE" && k.parts.length > 0,
    );
    if (indexes.length) {
        imports.add("jakarta.persistence.Index");
        args.push(
            "indexes = [" +
                indexes
                    .map(
                        (k) =>
                            "Index(name = " +
                            quote(k.name) +
                            ", columnList = " +
                            quote(k.parts.join(", ")) +
                            ")",
                    )
                    .join(", ") +
                "]",
        );
    }

    return ["@Table(" + args.join(", ") + ")"];
}

function field(
    row: DdlRow,
    pkParts: ReadonlySet<string>,
    name: string,
    entityNames: ReadonlyMap<string, string>,
    imports: Set<string>,
): string {
    const out: string[] = [];
    const isPk = pkParts.has(row.name);
    /*
     * **PK 列は必ずスカラーで出す。** FK でもある PK 列を関連にすると JPA の
     * derived identity（@IdClass のフィールドが参照先の id 型になる）に踏み込み、
     * 生成物を読む人が JPA の細則を知っていないと直せなくなる。
     * 多対多の中間テーブル（article_tags）がまさにこの形。
     */
    const asRelation = !isPk && row.relations.length > 0;

    if (row.comment) {
        out.push(...kdoc(row.comment, "    "));
    }

    if (isPk) {
        imports.add("jakarta.persistence.Id");
        out.push("    @Id");
    }
    if (isGenerated(row)) {
        imports.add("jakarta.persistence.GeneratedValue");
        imports.add("jakarta.persistence.GenerationType");
        out.push("    @GeneratedValue(strategy = GenerationType.IDENTITY)");
    }

    if (asRelation) {
        const rel = row.relations[0]!;
        imports.add("jakarta.persistence.ManyToOne");
        imports.add("jakarta.persistence.JoinColumn");
        /*
         * **多重度は推論しない。** 設計モデルに 1:1 / 1:N の別が無いので、
         * FK は常に @ManyToOne（1:1 なら手で @OneToOne へ直す）。
         * 逆参照（@OneToMany）は親側のフィールド名を発明することになるので出さない。
         */
        out.push("    @ManyToOne");
        out.push(
            "    @JoinColumn(name = " +
                quote(row.name) +
                ", nullable = " +
                String(row.nullable) +
                ")",
        );
        /* 参照先のクラス名も一意化後の名前で引く（#340。宣言側とずれると解決できない） */
        const type = entityNames.get(rel.table) ?? className(rel.table);
        out.push("    var " + name + ": " + type + (row.nullable ? "? = null" : ""));
        if (row.relations.length > 1) {
            out.push("    /* 2 本目以降の関係は 1 列に 1 つしか書けないので落とした */");
        }
        return out.join("\n");
    }

    imports.add("jakarta.persistence.Column");
    out.push("    @Column(" + columnArgs(row, isPk).join(", ") + ")");

    const mapped = row.kind === null ? null : KOTLIN_TYPES[row.kind];
    if (mapped === null) {
        out.push(
            "    /* " +
                (row.kind ?? "不明") +
                ": JPA の標準に対応する型が無いので String で出す（" +
                row.datatype +
                "） */",
        );
    }
    const type = mapped ?? "String";
    const imported = TYPE_IMPORTS[type];
    if (imported) {
        imports.add(imported);
    }

    out.push("    var " + name + ": " + type + (row.nullable ? "? = null" : ""));
    /* 生成される列は初期値を持てない（DB が入れる）ので、非 null でも既定値を出す */
    if (!row.nullable && isGenerated(row)) {
        out[out.length - 1] = out[out.length - 1]! + " = " + zeroOf(type);
    }
    return out.join("\n");
}

function columnArgs(row: DdlRow, isPk: boolean): string[] {
    const args = ["name = " + quote(row.name)];
    /* @Id は暗黙で NOT NULL。冗長な nullable = false を出さない */
    if (!isPk) {
        args.push("nullable = " + String(row.nullable));
    }
    /* length は文字列にだけ意味がある。数値の精度は @Column の precision / scale で別物 */
    if (row.size !== "" && row.kind === "string" && !row.size.includes(",")) {
        args.push("length = " + row.size);
    }
    return args;
}

/** identity 列の初期値。DB が入れるので何でもよいが、決定論のため型ごとに固定する */
function zeroOf(type: string): string {
    if (type === "Long") {
        return "0L";
    }
    if (type === "Int" || type === "Short") {
        return "0";
    }
    return "0";
}

function idClass(table: DdlTable, pk: DdlKey, name: string, imports: Set<string>): string[] {
    imports.add("java.io.Serializable");
    const out: string[] = [
        "/** " + table.name + " の複合主キー（JPA は @IdClass に id クラスを要求する） */",
        "data class " + name + "(",
    ];
    /* id クラスの中でも一意化する（#340。entity 側とは別のクラスなので名前空間も別） */
    const fieldNames = uniqueNames(pk.parts.map((part) => fieldName(part)));
    pk.parts.forEach((part, i) => {
        const row = table.rows.find((r) => r.name === part);
        const kind = row?.kind ?? null;
        const mapped = kind === null ? null : KOTLIN_TYPES[kind];
        const type = mapped ?? "String";
        const imported = TYPE_IMPORTS[type];
        if (imported) {
            imports.add(imported);
        }
        out.push("    var " + fieldNames[i]! + ": " + type + "? = null,");
    });
    out.push(") : Serializable");
    return out;
}
