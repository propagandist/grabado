/* ------------------------- ddl naming ------------------------- */
/*
 * grabado: §6.3 の命名規約と識別子の引用（HANDOVER §6 段階6-5b）。
 *
 * 6-5a まで、この 2 つは 5 本の output.xsl の中にそれぞれ手書きで散っていた。6-5b は
 * **postgresql だけ**をここへ寄せる（6-3 / 6-4 と同じ型紙 —— 未現代化の 4 本は 6-8 で移る）。
 *
 * 規則を性質で 2 つに割ってある:
 *
 *   命名規約   dialect 非依存。fk_<t>_<c> / idx_<t>_<c> / <t>_pkey / <t>_<c>_key
 *              -> 6-8 は**呼ぶだけ**
 *   引用       dialect 依存。囲む文字が 5 通りある（" / ` / [ ] / ' / 大文字の扱い）
 *              -> 6-8 は IdentifierRules を 4 つ足す。規則本体（裸で出せる条件）は共有
 *              **6-7c の mariadb が ` を使う初めてのプロファイル**で、規則本体は変えずに済んだ
 *
 * **段階6-7a で sql-standard が、6-7b で h2 が入った。** 命名規約はどちらもそのまま呼ぶだけで
 * 済み（dialect 非依存という切り方が効いた）、足したのは IdentifierRules と語彙表だけ。
 *
 * **順序の規約: 名前は引用前の生名で組み、返り値を呼び手が quoteIdentifier() へ通す。**
 * 逆にすると fk_"顧客"_"参照" のような名前ができる。正しくは "fk_顧客_参照"。
 * keyConstraintName() / foreignKeyName() はどちらも**引用しない文字列**を返す。
 */

import type { DdlKey } from "./shared.ts";
import {
    H2_RESERVED,
    MARIADB_RESERVED,
    MSSQL_RESERVED,
    MYSQL_RESERVED,
    ORACLE_RESERVED,
    POSTGRESQL_RESERVED,
    SQLITE_RESERVED,
    SQL_STANDARD_RESERVED,
} from "./keywords.ts";

/** プロファイルごとの識別子の囲み方 */
export interface IdentifierRules {
    /** 開き記号 */
    readonly open: string;
    /** 閉じ記号 */
    readonly close: string;
    /** 囲む前に値の中へ施すエスケープ（PG なら " -> ""） */
    escape(name: string): string;
    /** 裸で書けない語（小文字で持つ。js/io/ddl/keywords.ts） */
    readonly reserved: ReadonlySet<string>;
    /**
     * 裸で書ける識別子の形（段階6-8c で足した）。**畳む向きがプロファイルで違う。**
     *
     * 大半の DB は裸の識別子を小文字へ畳む（PostgreSQL）か、大小を保つ（MySQL 系・SQL Server）
     * ので BARE_LOWER でよい。**Oracle と H2 と標準は大文字へ畳む** —— そのうち Oracle だけは
     * 引用符を使わない限り必ず大文字になるので、house 標準の snake_case を保つには
     * **すべて囲むしかない**（BARE_UPPER を渡すと小文字の名前は 1 つも裸で通らない）。
     *
     * h2 / sql-standard も大文字へ畳むが、**そちらは畳んだ結果で一貫していれば動く**ので
     * 小文字を裸で出している（6-7a / 6-7b の判断）。Oracle と違うのは、この 2 本が
     * introspection の対象ではなく「書いて渡す」用途だから —— 読み直して設計と突き合わせる
     * 経路（§5.2）を持つのは Oracle のほう。
     */
    readonly bare: RegExp;
}

/**
 * 裸で書ける識別子の形。**小文字・数字・アンダースコアだけ**で、先頭が数字でないもの。
 *
 * house 標準が snake_case なので通常の DDL は 1 つも囲まれない（tests/golden/ddl/postgresql/
 * house-defaults.sql が丸ごとその証拠）。囲まれるのは日本語・大文字混じり・記号入り・
 * 予約語の 4 通りで、そのどれもが**囲まないと壊れる**か**意味が変わる**（PG は裸の識別子を
 * 小文字へ畳むので Table と table が同じ列になる）。
 */
const BARE_LOWER = /^[a-z_][a-z0-9_]*$/;

/**
 * 大文字へ畳むプロファイル用（段階6-8c）。**小文字の識別子は 1 つも通らない**ので、
 * house 標準の snake_case な設計はすべて引用される。
 */
const BARE_UPPER = /^[A-Z_][A-Z0-9_]*$/;

export const POSTGRESQL_IDENTIFIER: IdentifierRules = {
    open: '"',
    close: '"',
    escape: (name) => name.split('"').join('""'),
    reserved: POSTGRESQL_RESERVED,
    bare: BARE_LOWER,
};

/**
 * ANSI SQL の区切り識別子（段階6-7a）。囲み方は PostgreSQL と同じ " で、**違うのは語彙だけ**
 * （SQL:2016 は 365 語。関数名まで予約しているため PG の 101 語より遥かに多い）。
 *
 * 裸の識別子を標準は**大文字へ**畳み、PG は小文字へ畳む。BARE_IDENTIFIER が小文字だけを
 * 裸で通すので、どちらでも「囲まなければ一貫する」ことは変わらない。
 */
export const SQL_STANDARD_IDENTIFIER: IdentifierRules = {
    open: '"',
    close: '"',
    escape: (name) => name.split('"').join('""'),
    reserved: SQL_STANDARD_RESERVED,
    bare: BARE_LOWER,
};

/**
 * H2 2.x の区切り識別子（段階6-7b）。囲み方は上の 2 本と同じ " で、**やはり語彙だけが違う**
 * （H2 2.4.240 で 90 語。標準の 365 語より少なく、PostgreSQL の 101 語とも重ならない部分がある
 * —— if / key / minus / qualify / rownum / _rowid_ は H2 にしかない）。
 *
 * 裸の識別子を H2 は**大文字へ**畳む（標準と同じ。PG は小文字へ）。BARE_IDENTIFIER が
 * 小文字だけを裸で通すので、どちらでも「囲まなければ一貫する」ことは変わらない。
 */
export const H2_IDENTIFIER: IdentifierRules = {
    open: '"',
    close: '"',
    escape: (name) => name.split('"').join('""'),
    reserved: H2_RESERVED,
    bare: BARE_LOWER,
};

/**
 * MariaDB のバッククォート識別子（段階6-7c）。**囲む記号が " ではない初めてのプロファイル。**
 *
 * 値の中のバッククォートは 2 重にして逃がす（MariaDB / MySQL の規則。PG の " と同じ形）。
 * 語彙は 247 語で、**型名まで予約されている**ぶん他の 3 本より遥かに多い
 * （bigint / char / blob …。js/io/ddl/keywords.ts の採取手順）。
 */
export const MARIADB_IDENTIFIER: IdentifierRules = {
    open: "`",
    close: "`",
    escape: (name) => name.split("`").join("``"),
    reserved: MARIADB_RESERVED,
    bare: BARE_LOWER,
};

/**
 * MySQL のバッククォート識別子（段階6-8a）。**mariadb と同じ形で語彙だけが違う**
 * （MySQL 8.4.11 で 262 語 / MariaDB 11.8.8 で 247 語）。
 */
export const MYSQL_IDENTIFIER: IdentifierRules = {
    open: "`",
    close: "`",
    escape: (name) => name.split("`").join("``"),
    reserved: MYSQL_RESERVED,
    bare: BARE_LOWER,
};

/**
 * SQL Server の区切り識別子（段階6-8b）。**囲みが `[ ]` と非対称な唯一のプロファイル。**
 *
 * 値の中の `]` を `]]` にして逃がす（開き `[` は中に現れても構わない）。語彙は 179 語で、
 * PG の 101 語より多く MySQL の 262 語より少ない（js/io/ddl/keywords.ts の採取手順）。
 */
export const MSSQL_IDENTIFIER: IdentifierRules = {
    open: "[",
    close: "]",
    escape: (name) => name.split("]").join("]]"),
    reserved: MSSQL_RESERVED,
    bare: BARE_LOWER,
};

/**
 * Oracle の区切り識別子（段階6-8c）。**bare が BARE_UPPER の唯一のプロファイル。**
 *
 * Oracle は引用符の無い識別子を**必ず大文字へ畳む**ので、house 標準の snake_case を
 * そのまま保つには全部囲むしかない。囲まないと設計の `users` が DB では `USERS` になり、
 * introspection（§5.2）で読み直したときに設計と突き合わせられなくなる。
 * 6-5b の「囲まないと意味が変わるものだけ囲む」という基準の、いちばん広い側に当たる。
 */
export const ORACLE_IDENTIFIER: IdentifierRules = {
    open: '"',
    close: '"',
    escape: (name) => name.split('"').join('""'),
    reserved: ORACLE_RESERVED,
    bare: BARE_UPPER,
};

/**
 * SQLite の区切り識別子（段階6-8d）。**囲み方は postgresql / sql-standard / h2 と同じ "。**
 *
 * SQLite は互換のため [ ] や ` ` や ' ' も識別子として受けるが、標準の " を採る ——
 * 6-8d まで upstream が ' で囲んでいたのが、この段階で消える粗さの 1 つ（' は文字列
 * リテラルの記号でもあり、文脈で意味が割れる）。値の中の " は "" にする。
 * **Oracle と違って SQLite は識別子の中の " を受ける**ので、known-issue #15 に
 * 当たる制約はここには無い（実測: "say ""hi""" が通る）。
 *
 * bare は BARE_LOWER。SQLite の裸の識別子は**大小を畳まず書いたまま保つ**（照合が
 * ASCII 大小無視なだけ）ので、Oracle のように全部囲む理由が無い。
 */
export const SQLITE_IDENTIFIER: IdentifierRules = {
    open: '"',
    close: '"',
    escape: (name) => name.split('"').join('""'),
    reserved: SQLITE_RESERVED,
    bare: BARE_LOWER,
};


/**
 * 識別子を必要なときだけ囲む（段階6-5b の決定 2）。
 *
 * 常に囲む案は採らなかった —— PG としては最も安全だが "users"."id" だらけの DDL になり、
 * 人が読んでから実行する成果物としての品質が落ちる。囲む/囲まないの境界は上の
 * BARE_IDENTIFIER と reserved の 2 つだけで、迷ったら囲む側に倒れる。
 */
export function quoteIdentifier(name: string, rules: IdentifierRules): string {
    if (rules.bare.test(name) && !rules.reserved.has(name)) {
        return name;
    }
    return rules.open + rules.escape(name) + rules.close;
}

/**
 * キー制約 / index の名前（段階6-5b の決定 4。known-issue #6 の是正）。
 *
 * **key/@name を優先する。** 6-5a まで postgresql は @name を読まずテーブル名から
 * <table>_pkey を組んでいたので、1 テーブルに PRIMARY と UNIQUE があると同じ名前の制約が
 * 2 つ出て PG に弾かれていた（known-issue #6）。名前欄は UI（js/keymanager.ts）が持つ
 * 編集可能な値で、無視してよいものではない。
 *
 * 空のときだけ規約で組む。生成名は **PG が自分で付ける名前に合わせてある**ので、
 * introspection で読み直しても名前が動かない:
 *
 *   PRIMARY   <table>_pkey        PG の自動名と一致
 *   UNIQUE    <table>_<cols>_key  PG の自動名と一致
 *   その他     idx_<table>_<cols>  **§6.3 の規約**（PG の自動名は <table>_<cols>_idx で別物。
 *                                 index は名前がモデルに残るので往復では動かない）
 *
 * type は検査しない（docs/FORMAT.md のとおり任意の文字列が来うる）。INDEX / FULLTEXT は
 * どちらも既定の分岐に落ちて CREATE INDEX になる。
 */
export function keyConstraintName(key: DdlKey, table: string): string {
    if (key.name !== "") {
        return key.name;
    }
    const cols = key.parts.join("_");
    if (key.type === "PRIMARY") {
        return table + "_pkey";
    }
    if (key.type === "UNIQUE") {
        return table + "_" + cols + "_key";
    }
    return "idx_" + table + "_" + cols;
}

/**
 * FK 制約の名前（§6.3 `fk_<table>_<ref>`。段階6-5b の決定 1）。
 *
 * `<ref>` は**参照元の列名**を採った。列名は 1 テーブル内で必ず一意なので制約名も必ず一意に
 * なる —— 参照先テーブル名にすると orders.billing_address_id と shipping_address_id が
 * どちらも fk_orders_addresses になって衝突する。idx_<table>_<cols> が列を並べる規約なのとも揃う。
 *
 * **FK 名はモデルに保存先が無い**（docs/FORMAT.md の references[] は table / column だけ）。
 * introspection で読んだ外部由来の FK 名は保持されず、ここで必ず組み直される。
 */
export function foreignKeyName(table: string, column: string): string {
    return "fk_" + table + "_" + column;
}
