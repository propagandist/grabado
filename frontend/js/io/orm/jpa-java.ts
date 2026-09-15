/* ------------------------- orm: jpa (java) -------------------- */
/*
 * grabado: DesignModel -> Jakarta Persistence の entity（Java）。**ORM 出力の 4 本目。**
 *
 * **1 本目（jpa.ts）と同じ JPA だが、生成器は別ファイルにしてある。** 括れる「言語非依存の
 * 骨格」がほとんど残らないため —— 注釈の配列が [...] と {...} で違い、ネストした注釈には
 * @ が要り、`class X(` とコンストラクタ引数 vs `public class X {` とフィールドで構造が違い、
 * identity 列の初期値は Kotlin だけが要る。括ると「どちらでもない生成器」になる。
 * 6-9e の「言語ごとの識別子の規則は各生成器が持つ」と同じ立場で、**jpa.ts は 1 バイトも
 * 触っていない**（既存 golden が動かないことを検証で言えるようにするため）。
 *
 * **Kotlin 版と違うところ**（どれも Java 側の都合で、設計の判断ではない）:
 *
 *   ファイル分割  **1 コンパイル単位に public クラスは 1 つ**しか置けず、@IdClass の
 *                 id クラスも public が要る（JPA 3.2 §2.4）。出力は**完結したコンパイル単位の
 *                 連結**にして、区切りをマーカーの行で示す。**import はセクションごとに持つ**
 *                 —— Java の import はファイル単位なので、先頭に束ねると分割した瞬間に壊れる
 *   コンストラクタ **1 行も出さない。** JPA は引数の無いコンストラクタを要求するが、明示の
 *                 コンストラクタが 1 つも無ければ Java がそれを作る。Kotlin 版が
 *                 kotlin("plugin.jpa") を要求していたのは、この裏返し
 *   型            **常にボクシング型**（int ではなく Integer）。primitive は null を表せず、
 *                 outer join / 部分ロード / 未保存判定が壊れる。**決定論にも効く** ——
 *                 null 許容が 1 ビット変わっただけで型名まで動くのを避けられる
 *   識別子        **バッククォートの逃げ道が無い**ので、予約語は末尾に _ を足す。
 *                 **ただし非 ASCII は保つ** —— Java の識別子は Unicode を許すので、
 *                 Prisma の「ASCII だけ」をここへ写すと理由なく名前が変わる
 *   id クラス     data class が無いので **equals / hashCode を出す**（JPA 3.2 §2.4 の要求）
 *
 * **出すもの / 出さないものは 1 本目と同じ。** 逆参照（@OneToMany）は出さず、多重度も
 * 推論しない（6-9d の判断。設計モデルが親側のコレクション名を持たないため）。
 */

import { isGenerated, primaryKeyOf, type DdlKey, type DdlRow, type DdlTable } from "../ddl/shared.ts";
import type { TypeKind } from "../palette.ts";
import { camelCase, entityName } from "./naming.ts";

/**
 * 正規型 -> Java の型。**常にボクシング型。**
 *
 * **Kotlin 版（jpa.ts の KOTLIN_TYPES）と違うのは 2 セルだけ** —— int32 が Integer、
 * binary が byte[]。残りは同じ綴りになる（Kotlin が java.time / java.math をそのまま
 * 使っているため）。
 *
 * `null` は「JPA に対応する型が無い」で、String に落としたうえで**理由を行コメントで残す**
 * （黙って落とすと、設計が持っていた意味が生成物から消えたことに誰も気づけない）。
 */
const JAVA_TYPES: Readonly<Record<TypeKind, string | null>> = {
    /* int8 は Byte ではなく Short。mssql の tinyint は 0..255 で、Java の Byte は符号付き */
    int8: "Short",
    int16: "Short",
    int32: "Integer",
    int64: "Long",
    decimal: "BigDecimal",
    float32: "Float",
    float64: "Double",
    string: "String",
    /* byte[] は参照型なので null を表せる。java.lang でもないが import は要らない */
    binary: "byte[]",
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

/** Java の型 -> import 文。java.lang と byte[] は要らない */
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
 * 識別子に使えない語（Java SE の予約語 ＋ 予約リテラル）。**末尾に _ を足して避ける。**
 *
 * **contextual keyword（var / yield / record / sealed / permits）は入れない** ——
 * 識別子として使えるので、足すと理由なく名前が変わる。`_` は Java 9 から予約されている。
 */
const JAVA_RESERVED: ReadonlySet<string> = new Set([
    "_", "abstract", "assert", "boolean", "break", "byte", "case", "catch",
    "char", "class", "const", "continue", "default", "do", "double", "else",
    "enum", "extends", "false", "final", "finally", "float", "for", "goto",
    "if", "implements", "import", "instanceof", "int", "interface", "long",
    "native", "new", "null", "package", "private", "protected", "public",
    "return", "short", "static", "strictfp", "super", "switch", "synchronized",
    "this", "throw", "throws", "transient", "true", "try", "void", "volatile",
    "while",
]);

/** 生成物の中でファイルの境目を示す行。**名前がそのままファイル名になる** */
export function fileMarker(className: string): string {
    return "/* ==== " + className + ".java ==== */";
}

/**
 * fileMarker() が出した行から名前を取り出す正規表現。
 *
 * **検証側（tests/orm-tools/verify.ts）がこれで切って javac に渡す**ので、
 * **正本をここに置く** —— 向こうに同じ形を書くと、片方を直したときに黙ってずれる。
 */
export const FILE_MARKER = /^\/\* ==== (.+)\.java ==== \*\/$/;

/**
 * Java の識別子として書ける形にする。
 *
 * **DB の名前は書き換えない** —— 元の名前は @Table(name) / @Column(name) に必ず残るので、
 * ここで直すのは「Java のソースとして書けるか」だけ。
 *
 * 3 段:
 *   1. そのまま書けて、予約語でない          -> そのまま（**顧客 / 氏名 はここ**）
 *   2. 形は識別子だが予約語 / 予約リテラル   -> 末尾に _（class -> class_）
 *   3. 書けない文字を含む                    -> _ に置換、先頭が不正なら _ を前置
 *
 * **Prisma の「ASCII だけ」を写していない。** あちらが潰したのは Prisma の文法が
 * [A-Za-z][A-Za-z0-9_]* しか受けないからで、**Java の識別子は Unicode を許す**
 * （Character.isJavaIdentifierStart / isJavaIdentifierPart）。写すと Kotlin 版が保てている
 * 名前を理由なく壊すことになる。
 *
 * 文字集合を \p{Nd}\p{Nl} にして \p{N} にしないのは、**\p{No}（½ / ①）が
 * isJavaIdentifierPart に入らない**ため。
 */
export function javaIdentifier(name: string): string {
    if (/^[\p{L}\p{Nl}_$][\p{L}\p{Nd}\p{Nl}_$]*$/u.test(name)) {
        return JAVA_RESERVED.has(name) ? name + "_" : name;
    }
    const safe = name.replace(/[^\p{L}\p{Nd}\p{Nl}_$]/gu, "_");
    return /^[\p{L}\p{Nl}_$]/u.test(safe) ? safe : "_" + safe;
}

/**
 * テーブル名 -> Java のクラス名。単数化と PascalCase は naming.ts で、ここは
 * Java の識別子にするところだけ。**一意化は呼び手**（generateJpaJava）。
 */
export function className(table: string): string {
    return javaIdentifier(entityName(table));
}

/** 列名 -> Java のフィールド名（`created_at` -> `createdAt`）。**一意化は呼び手** */
export function fieldName(column: string): string {
    return javaIdentifier(camelCase(column));
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

/**
 * 名前を一意化する。**重複したものだけに通し番号が付く**（`_2` / `_3` …）。
 * 入力の順にしか依らないので決定論が保たれる。
 *
 * **jpa.ts には無い。** Kotlin はバッククォートで囲めるので潰れず、衝突が起きなかった
 * （prisma.ts / drizzle.ts は同じ理由で持っている）。**3 本目の写しなので #332 の
 * 再測定の対象に入る** —— あちらが測っているのは isGenerated / primaryKeyOf の 2 本で、
 * この形の射程は測り直していない。
 */
function uniqueNames(raw: readonly string[]): string[] {
    const used = new Map<string, number>();
    return raw.map((one) => {
        const seen = used.get(one) ?? 0;
        used.set(one, seen + 1);
        return seen === 0 ? one : one + "_" + String(seen + 1);
    });
}

/** Javadoc を 1 行に畳む。値がコメントの閉じ記号を含んでいてもコメントが切れないようにする */
function javadoc(text: string, indent: string): string[] {
    const oneLine = text.split("\r").join(" ").split("\n").join(" ").split("*/").join("* /");
    return [indent + "/** " + oneLine + " */"];
}

function quote(value: string): string {
    return '"' + value.split("\\").join("\\\\").split('"').join('\\"') + '"';
}

/** フィールド名 -> accessor の語幹（`createdAt` -> `CreatedAt`） */
function pascal(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

/** 複合 PK なら返す（@IdClass が要るのはこのときだけ） */
function compositeKeyOf(table: DdlTable): DdlKey | null {
    const pk = primaryKeyOf(table);
    return pk !== null && pk.parts.length > 1 ? pk : null;
}

export function generateJpaJava(tables: readonly DdlTable[]): string {
    /*
     * テーブルが 1 つも無ければ**何も出さない**（DDL の empty.sql が 0 バイトなのと揃える）。
     * 見出しだけのファイルは「生成に失敗した」と見分けが付かない。
     */
    if (tables.length === 0) {
        return "";
    }

    /*
     * **クラス名はファイル全体で一意化する。** 分割したあとに同名のファイルができると
     * 上書きになるため。**id クラスも同じ名前空間に入れる**（Article と ArticleId が
     * それぞれ別のテーブルから出ることがありうる）。
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

    const head = [
        "/*",
        " * grabado が生成した Jakarta Persistence の entity（Java）。",
        " *",
        " * **1 クラス 1 ファイルに分けてから使う。** Java は 1 つのコンパイル単位に public な",
        " * クラスを 1 つしか置けない。区切りの行が次のファイルの始まりで、そこに書いてある名前が",
        " * ファイル名になる。import はファイルごとに付けてあるので、切ればそのまま通る。",
        " *",
        " * package 宣言は出さない（置き場所は生成物を受け取る側が決める）。",
        " * **コンストラクタも出していない** —— JPA は引数の無いコンストラクタを要求するが、",
        " * 明示のコンストラクタが 1 つも無ければ Java がそれを作る。**足すときは引数無しも残すこと。**",
        " *",
        " * 型はすべてボクシング型（int ではなく Integer）。primitive は null を表せないので、",
        " * outer join や部分ロードで壊れる。NOT NULL は @Column(nullable = false) が表す。",
        " */",
    ];

    const sections: string[] = [];
    for (const table of tables) {
        const name = entityNames.get(table.name)!;
        const idName = idNames.get(table.name) ?? null;
        sections.push(entitySection(table, name, idName, entityNames));
        const composite = compositeKeyOf(table);
        if (composite !== null && idName !== null) {
            sections.push(idClassSection(table, composite, idName));
        }
    }

    return head.join("\n") + "\n\n" + sections.join("\n\n");
}

/** import は使ったものだけを昇順で出す。**決定論のため並べ替えは必須** */
function importLines(imports: ReadonlySet<string>): string[] {
    return [...imports].sort().map((one) => "import " + one + ";");
}

/** 列が関連として出るか（**PK 列は必ずスカラー**。derived identity に踏み込まない） */
function isRelation(row: DdlRow, pkParts: ReadonlySet<string>): boolean {
    return !pkParts.has(row.name) && row.relations.length > 0;
}

/** 列 -> Java の型。写せない型は String に落ちる（理由は field() が行コメントで出す） */
function typeOf(
    row: DdlRow,
    pkParts: ReadonlySet<string>,
    entityNames: ReadonlyMap<string, string>,
    imports: Set<string>,
): string {
    if (isRelation(row, pkParts)) {
        const rel = row.relations[0]!;
        return entityNames.get(rel.table) ?? className(rel.table);
    }
    const mapped = row.kind === null ? null : JAVA_TYPES[row.kind];
    const type = mapped ?? "String";
    const imported = TYPE_IMPORTS[type];
    if (imported) {
        imports.add(imported);
    }
    return type;
}

function entitySection(
    table: DdlTable,
    name: string,
    idName: string | null,
    entityNames: ReadonlyMap<string, string>,
): string {
    const pk = primaryKeyOf(table);
    const pkParts = new Set(pk?.parts ?? []);
    const imports = new Set<string>();
    const body: string[] = [];

    imports.add("jakarta.persistence.Entity");
    imports.add("jakarta.persistence.Table");

    if (table.comment) {
        body.push(...javadoc(table.comment, ""));
    }
    body.push("@Entity");
    body.push(...tableAnnotation(table, imports));

    /* 複合 PK は @IdClass。JPA は @Id を複数持つ entity に id クラスを要求する */
    if (idName !== null) {
        imports.add("jakarta.persistence.IdClass");
        body.push("@IdClass(" + idName + ".class)");
    }

    body.push("public class " + name + " {");

    /* **フィールド名はクラスの中でまとめて一意化する**（列と関連が同じ名前空間） */
    const fields = uniqueNames(
        table.rows.map((row) =>
            isRelation(row, pkParts) ? relationFieldName(row.name) : fieldName(row.name),
        ),
    );
    /*
     * **accessor は別に一意化する。** aB と AB は別のフィールドとして通るが、
     * どちらも getAB になる —— フィールド側の一意化では防げない衝突。
     */
    const accessors = uniqueNames(fields.map(pascal));
    const types = table.rows.map((row) => typeOf(row, pkParts, entityNames, imports));

    const declared: string[] = [];
    table.rows.forEach((row, i) => {
        declared.push(field(row, pkParts, fields[i]!, types[i]!, imports));
    });
    body.push(declared.join("\n\n"));

    const methods: string[] = [];
    table.rows.forEach((_row, i) => {
        methods.push(accessor(types[i]!, fields[i]!, accessors[i]!));
    });
    if (methods.length > 0) {
        body.push("");
        body.push(methods.join("\n\n"));
    }

    body.push("}");

    return [fileMarker(name), "", ...importLines(imports), "", ...body].join("\n");
}

function tableAnnotation(table: DdlTable, imports: Set<string>): string[] {
    const args: string[] = ["name = " + quote(table.name)];

    const uniques = table.keys.filter((k) => k.type === "UNIQUE" && k.parts.length > 0);
    if (uniques.length) {
        imports.add("jakarta.persistence.UniqueConstraint");
        args.push(
            "uniqueConstraints = {" +
                uniques
                    .map(
                        (k) =>
                            "@UniqueConstraint(name = " +
                            quote(k.name) +
                            ", columnNames = {" +
                            k.parts.map(quote).join(", ") +
                            "})",
                    )
                    .join(", ") +
                "}",
        );
    }

    /* PRIMARY / UNIQUE 以外は index（DDL 側の CREATE INDEX と同じ振り分け） */
    const indexes = table.keys.filter(
        (k) => k.type !== "PRIMARY" && k.type !== "UNIQUE" && k.parts.length > 0,
    );
    if (indexes.length) {
        imports.add("jakarta.persistence.Index");
        args.push(
            "indexes = {" +
                indexes
                    .map(
                        (k) =>
                            "@Index(name = " +
                            quote(k.name) +
                            ", columnList = " +
                            quote(k.parts.join(", ")) +
                            ")",
                    )
                    .join(", ") +
                "}",
        );
    }

    return ["@Table(" + args.join(", ") + ")"];
}

function field(
    row: DdlRow,
    pkParts: ReadonlySet<string>,
    name: string,
    type: string,
    imports: Set<string>,
): string {
    const out: string[] = [];
    const isPk = pkParts.has(row.name);

    if (row.comment) {
        out.push(...javadoc(row.comment, "    "));
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

    if (isRelation(row, pkParts)) {
        imports.add("jakarta.persistence.ManyToOne");
        imports.add("jakarta.persistence.JoinColumn");
        /*
         * **多重度は推論しない。** 設計モデルに 1:1 / 1:N の別が無いので、
         * FK は常に @ManyToOne（1:1 なら手で @OneToOne へ直す）。
         * 逆参照（@OneToMany）は親側のフィールド名を発明することになるので出さない。
         */
        out.push("    @ManyToOne");
        out.push(
            "    @JoinColumn(name = " + quote(row.name) + ", nullable = " + String(row.nullable) + ")",
        );
        out.push("    private " + type + " " + name + ";");
        if (row.relations.length > 1) {
            out.push("    /* 2 本目以降の関係は 1 列に 1 つしか書けないので落とした */");
        }
        return out.join("\n");
    }

    imports.add("jakarta.persistence.Column");
    out.push("    @Column(" + columnArgs(row, isPk).join(", ") + ")");

    if (row.kind === null || JAVA_TYPES[row.kind] === null) {
        out.push(
            "    /* " +
                (row.kind ?? "不明") +
                ": JPA の標準に対応する型が無いので String で出す（" +
                row.datatype +
                "） */",
        );
    }

    /*
     * **初期値を出さない。** Kotlin 版は非 null プロパティに初期化が要るので identity 列に
     * = 0 を出していたが、Java のフィールドは既定が null で、**型がボクシングなので
     * そのまま「まだ採番されていない」を表せる**。
     */
    out.push("    private " + type + " " + name + ";");
    return out.join("\n");
}

/**
 * getter / setter。**注釈はフィールドに付けてある**ので JPA の access type は FIELD で、
 * この 2 本は**利用者への便宜**（JPA が呼ぶわけではない）。
 *
 * getter は Boolean でも get を使う —— **型が常にボクシング**なので、primitive boolean の
 * ときだけ is になる JavaBeans の分岐が起きない（決定論の分岐点を 1 つ減らしている）。
 */
function accessor(type: string, field: string, name: string): string {
    return [
        "    public " + type + " get" + name + "() {",
        "        return " + field + ";",
        "    }",
        "",
        "    public void set" + name + "(" + type + " " + field + ") {",
        "        this." + field + " = " + field + ";",
        "    }",
    ].join("\n");
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

/**
 * @IdClass に渡す主キークラス。**JPA 3.2 §2.4 が 4 つ要求する** ——
 * public であること / 引数の無いコンストラクタ / Serializable / equals と hashCode。
 *
 * Kotlin 版は data class がそのうち 2 つ（equals / hashCode）を無償でくれていた。
 * Java には無いので出す。**record は使えない** —— JPA が引数の無いコンストラクタを
 * 要求するのに対し、record は持てない。
 */
function idClassSection(table: DdlTable, pk: DdlKey, name: string): string {
    const imports = new Set<string>(["java.io.Serializable", "java.util.Objects"]);
    const fields = uniqueNames(pk.parts.map((part) => fieldName(part)));
    const types = pk.parts.map((part) => {
        const row = table.rows.find((r) => r.name === part);
        const kind = row?.kind ?? null;
        const mapped = kind === null ? null : JAVA_TYPES[kind];
        const type = mapped ?? "String";
        const imported = TYPE_IMPORTS[type];
        if (imported) {
            imports.add(imported);
        }
        return type;
    });

    /* byte[] は Objects.equals / Objects.hash が参照で見てしまうので Arrays に替える */
    if (types.includes("byte[]")) {
        imports.add("java.util.Arrays");
    }

    const body: string[] = [
        "/** " + table.name + " の複合主キー（JPA は @IdClass に id クラスを要求する） */",
        "public class " + name + " implements Serializable {",
    ];

    fields.forEach((one, i) => {
        body.push("    private " + types[i]! + " " + one + ";");
    });

    const accessors = uniqueNames(fields.map(pascal));
    fields.forEach((one, i) => {
        body.push("");
        body.push(accessor(types[i]!, one, accessors[i]!));
    });

    body.push("");
    body.push("    @Override");
    body.push("    public boolean equals(Object other) {");
    body.push("        if (this == other) {");
    body.push("            return true;");
    body.push("        }");
    /* instanceof のパターン変数（Java 16+）は使わない —— 下限を下げる余地を残す */
    body.push("        if (!(other instanceof " + name + ")) {");
    body.push("            return false;");
    body.push("        }");
    body.push("        " + name + " that = (" + name + ") other;");
    body.push(
        "        return " +
            fields
                .map((one, i) =>
                    types[i] === "byte[]"
                        ? "Arrays.equals(" + one + ", that." + one + ")"
                        : "Objects.equals(" + one + ", that." + one + ")",
                )
                .join(" && ") +
            ";",
    );
    body.push("    }");
    body.push("");
    body.push("    @Override");
    body.push("    public int hashCode() {");
    body.push(
        "        return Objects.hash(" +
            fields
                .map((one, i) => (types[i] === "byte[]" ? "Arrays.hashCode(" + one + ")" : one))
                .join(", ") +
            ");",
    );
    body.push("    }");
    body.push("}");

    return [fileMarker(name), "", ...importLines(imports), "", ...body].join("\n");
}
