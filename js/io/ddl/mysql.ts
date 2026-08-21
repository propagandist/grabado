/* ------------------------- ddl: mysql ------------------------- */
/*
 * grabado: DesignModel -> MySQL 8 の DDL（HANDOVER §6 段階6-5a 移植 / 6-8a 現代化）。
 *
 * **段階6-8a で js/io/ddl/mysql-style.ts の上に載せ替えた。** それまでは
 * db/mysql/output.xsl（218 行）の逐語で、upstream の粗さをそのまま持っていた。
 * 6-7c の mariadb が型紙で、**この段階で 2 本が同じ骨格になった**。
 *
 * 6-8a で消えた upstream の粗さ（どれも CUSTOMIZATIONS.md の段階6-5a が記録していたもの）:
 *
 *   1. DROP TABLE IF EXISTS を出す                -> 出さない（生成 DDL が既存データを消しうる）
 *   2. Globals / Table Properties / Test Data の飾り -> 出さない（設計の情報ではない）
 *   3. DROP の直後にタブ 2 個だけの行               -> 飾りごと消えた
 *   4. コメントを 60 字で無言に切り詰める            -> 完全に出す
 *   5. FK に名前が付かない                        -> fk_<table>_<列>（§6.3）
 *   6. FK の参照元列だけ引用符が付かない            -> 規則が 1 本になったので揃う
 *   7. 識別子を常にバッククォートで囲む             -> 必要なときだけ（js/io/ddl/naming.ts）
 *   8. PRIMARY / FULLTEXT / UNIQUE 以外が名前無しの KEY (...) -> keyConstraintName() で名前が付く
 *
 * **known-issues #4 / #10 もこの段階で mysql から消えた**（パレットが strict になったため）。
 * 残るのは mssql / oracle / sqlite の 3 本で、6-8b 以降。
 */

import { generateMysqlStyle, type MysqlDialect } from "./mysql-style.ts";
import type { DdlTable } from "./shared.ts";
import { MYSQL_IDENTIFIER } from "./naming.ts";

/** MySQL 8。語彙は 262 語（mariadb の 247 語とは中身が違う） */
const MYSQL: MysqlDialect = {
    rules: MYSQL_IDENTIFIER,
    /** MySQL 8 は DEFAULT (UUID()) の形を要求する（6-8a で実物に流して見つけた） */
    parenthesizeFunctionDefaults: true,
};

export function generateMysql(tables: readonly DdlTable[]): string {
    return generateMysqlStyle(tables, MYSQL);
}
