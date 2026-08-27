/* ------------------------- ddl: sql-standard ------------------ */
/*
 * grabado: DesignModel -> ANSI SQL の DDL（HANDOVER §6 段階6-7a で新設）。
 *
 * **ベンダ非依存のプロファイル。** 出すのは ISO/IEC 9075（SQL:2016 / SQL:2023）が定める
 * 構文だけで、どの製品の拡張も使わない。db/sql-standard/datatypes.xml と対になる。
 *
 * **段階6-7b で本体が js/io/ddl/ansi.ts へ移った**（postgresql / h2 と同じ骨格のため）。
 * このプロファイル固有の判断は 2 つで、どちらも AnsiDialect の false 側に畳んである:
 *
 *   COMMENT ON      標準に無い（PostgreSQL / Oracle / H2 の拡張）-> 行コメントで出す
 *   CREATE INDEX    **索引は標準の範囲外**（実装依存）-> 行コメントで出す
 *
 * どちらも「出さない」ではなく「コメントで出す」を採った。設計が持っている情報を落とすと、
 * このプロファイルの用途（ベンダ非依存で書いて各製品へ持っていく出発点）で移し先に渡すものが
 * 減るため。**コメントなので標準 SQL として実行できることは変わらない。**
 *
 * 識別子の語彙は SQL:2016 の 365 語（js/io/ddl/keywords.ts）。標準が関数名まで予約するので
 * PostgreSQL の 101 語より遥かに多く、year や value のようなありふれた列名が引用される。
 */

import { generateAnsi, type AnsiDialect } from "./ansi.ts";
import type { DdlTable } from "./shared.ts";
import { SQL_STANDARD_IDENTIFIER } from "./naming.ts";

/** ANSI SQL。COMMENT ON も CREATE INDEX も標準に無いので、どちらも行コメントに落ちる */
const SQL_STANDARD: AnsiDialect = {
    rules: SQL_STANDARD_IDENTIFIER,
    hasCommentOn: false,
    hasCreateIndex: false,
};

export function generateSqlStandard(tables: readonly DdlTable[]): string {
    return generateAnsi(tables, SQL_STANDARD);
}
