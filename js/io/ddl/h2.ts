/* ------------------------- ddl: h2 ---------------------------- */
/*
 * grabado: DesignModel -> H2 2.x の DDL（HANDOVER §6 段階6-7b で新設）。
 *
 * **house が Kotlin/Spring Boot なので、テスト用途で効くプロファイル。** 6-7 の設計
 * （2026-08-16）が「house 既定の 4 点がすべてネイティブ」と実測した唯一の非 PostgreSQL で、
 * **PG で設計して H2 でテストする経路が型レベルで通る**ことが対応 DB に入れた理由そのもの。
 *
 * 生成器としては **postgresql と構文レベルで同一**（COMMENT ON も CREATE INDEX も
 * GENERATED ALWAYS AS IDENTITY も持ち、識別子は " で囲む）。違うのは予約語の語彙だけなので、
 * 本体は js/io/ddl/ansi.ts にあり、ここは何者かを書くだけ。**6-7b がその抽出をした段階。**
 *
 * **バージョンは 2.x を対象にする**（6-7 の設計エントリの指示）。1.4 とは型システムが違い、
 * 1.4 の IDENTITY 型は廃止されて GENERATED 句に統一された。パレット・予約語とも
 * **2.4.240 の実物から採った**（db/h2/datatypes.xml と js/io/ddl/keywords.ts の採取手順）。
 */

import { generateAnsi, type AnsiDialect } from "./ansi.ts";
import type { DdlTable } from "./shared.ts";
import { H2_IDENTIFIER } from "./naming.ts";

/** H2 2.x。COMMENT ON も CREATE INDEX も持つ（postgresql と同じ側） */
const H2: AnsiDialect = {
    rules: H2_IDENTIFIER,
    hasCommentOn: true,
    hasCreateIndex: true,
};

export function generateH2(tables: readonly DdlTable[]): string {
    return generateAnsi(tables, H2);
}
