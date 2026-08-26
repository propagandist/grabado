/* ------------------------- ddl: postgresql -------------------- */
/*
 * grabado: DesignModel -> PostgreSQL 18 の DDL（HANDOVER §6 段階6-5a 移植 / 6-5b 是正）。
 *
 * **段階6-7b で本体が js/io/ddl/ansi.ts へ移った。** h2 が構文レベルで postgresql と同一で、
 * 170 行のコピーを作るしかなくなったため。ここに残るのは「このプロファイルは何者か」だけで、
 * **出力はバイト単位で不変**（tests/golden/ddl/postgresql/ の 7 本がその保証）。
 *
 * 6-5a が db/postgresql/output.xsl（170 行）を逐語移植し、**6-5b で §6.3 の規約へ寄せた**。
 * XSLT と違うのは次の 8 点で、どれが golden のどの行に出るかまで CUSTOMIZATIONS.md の
 * 段階6-5b に対応表がある。
 *
 *   1. 制約名は key/@name を優先し、空のときだけ規約で組む（known-issues #6）
 *   2. PRIMARY / UNIQUE 以外は CREATE INDEX。PG に KEY (...) 構文は無い
 *   3. 列を持たないキーは 1 文字も出さない（PRIMARY KEY (); を作らない）
 *   4. @autoincrement=1 は <datatype> を捨てず GENERATED ALWAYS AS IDENTITY を足す
 *   5. identity 列に NOT NULL / DEFAULT を出さない（PG が暗黙 NOT NULL・DEFAULT は併用不可）
 *   6. 識別子は必要なときだけ " で囲む（本体も COMMENT ON も同じ規則。js/io/ddl/naming.ts）
 *   7. 列コメントは COMMENT ON COLUMN だけ。列定義の / * ... * / は二重なので出さない
 *   8. FK 名は fk_<table>_<参照元の列>（§6.3）。<table>_<column>_fkey ではない
 *
 * **共通で使える規則は js/io/ddl/naming.ts に置いてある。** 6-8a 〜 6-8d で残る 4 本を
 * 現代化したとき、命名規約の側は実際に呼ぶだけで済んだ（足したのは IdentifierRules と語彙表）。
 */

import { generateAnsi, type AnsiDialect } from "./ansi.ts";
import type { DdlTable } from "./shared.ts";
import { POSTGRESQL_IDENTIFIER } from "./naming.ts";

/** PostgreSQL 18。COMMENT ON も CREATE INDEX も持つ（どちらも標準には無い拡張） */
const POSTGRESQL: AnsiDialect = {
    rules: POSTGRESQL_IDENTIFIER,
    hasCommentOn: true,
    hasCreateIndex: true,
};

export function generatePostgresql(tables: readonly DdlTable[]): string {
    return generateAnsi(tables, POSTGRESQL);
}
