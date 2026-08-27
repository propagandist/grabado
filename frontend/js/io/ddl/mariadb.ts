/* ------------------------- ddl: mariadb ----------------------- */
/*
 * grabado: DesignModel -> MariaDB 11 の DDL（HANDOVER §6 段階6-7c で新設）。
 *
 * **MySQL のコピーではない**（6-7 の設計の決めたこと 2）。MariaDB だけが持つ型が
 * house 既定に直接効く —— **UUID（10.7+）と INET4 / INET6（10.5+ / 10.10+）**。
 * db/mariadb/datatypes.xml と対になる。
 *
 * **段階6-8a で本体が js/io/ddl/mysql-style.ts へ移った**（mysql の現代化で 2 本目が
 * 同じ骨格になったため）。**出力はバイト単位で不変**（tests/golden/ddl/mariadb/ の 7 本が
 * その保証）。ここに残るのは「このプロファイルは何者か」だけ。
 *
 * upstream の mysql から意図的に落としたもの（6-7c の決めたこと 4。**6-8a で mysql 側も
 * これに揃った**）:
 *   - DROP TABLE IF EXISTS（生成 DDL が既存データを消しうる）
 *   - Globals / Table Properties / Test Data の飾りブロック（設計の情報ではない）
 *   - コメントの 60 字切り詰め（情報が黙って消える）
 */

import { generateMysqlStyle, type MysqlDialect } from "./mysql-style.ts";
import type { DdlTable } from "./shared.ts";
import { MARIADB_IDENTIFIER } from "./naming.ts";

/** MariaDB 11。語彙は 247 語（型名まで予約されている） */
const MARIADB: MysqlDialect = {
    rules: MARIADB_IDENTIFIER,
    /** MariaDB は DEFAULT UUID() をそのまま受ける（実物で確認済み。6-7c の golden がその実物） */
    parenthesizeFunctionDefaults: false,
};

export function generateMariadb(tables: readonly DdlTable[]): string {
    return generateMysqlStyle(tables, MARIADB);
}
