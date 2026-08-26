/* --------------------- identifier hint ---------------------- */
/*
 * grabado: 識別子の警告文（HANDOVER §6 段階6-9b）。
 *
 * 規則そのものは js/io/ddl/naming.ts（DDL 生成が使う IdentifierRules と同じ表）。
 * ここが持つのは**それを人が読む 1 行にする**ところだけで、Row と Table の 2 か所から
 * 呼ばれる。8 行の重複を 2 クラスに置くかわりに 1 本にしてある。
 *
 * **止めるのではなく警告する。** 6-5b が「生成器が識別子を書き換えるのは採らない」と
 * 決着させ（設計と DDL が食い違い、introspection の往復が壊れる）、残った手が
 * 「入力側で気づけるようにする」だけになった。入力を拒まないのは、**PG で作った設計を
 * oracle で開いた瞬間に既存の名前が不正になる**ため —— 拒むと直せない状態に落ちる。
 *
 * 文言は locale の 3 キー（identifierempty / identifiertoolong / identifierforbidden）で、
 * **数字と記号は文に混ぜず括弧の中に出す** —— 翻訳の無い言語でも数字は読めるし、
 * 置換子を持つ locale の仕組みが今は無い（js/globals.ts の _() は辞書引きだけ）。
 */

import { _ } from "./globals.ts";
import { identifierIssue, identifierRulesFor } from "./io/ddl/naming.ts";
import type { TypePalette } from "./io/palette.ts";

/**
 * 識別子の警告文。問題が無ければ ""（呼び手は空かどうかで印を付け外しする）。
 *
 * パレット未読込と、対応 DB から外れたプロファイル名（旧い設計 XML の同梱 <datatypes>）は
 * どちらも「規則が引けない」として警告しない —— 規則を知らないのに警告するほうが害。
 */
export function identifierHint(name: string, palette: TypePalette): string {
    if (!palette.isLoaded()) {
        return "";
    }
    const db = palette.db();
    const rules = identifierRulesFor(db);
    if (!rules) {
        return "";
    }

    const issue = identifierIssue(name, rules);
    if (!issue) {
        return "";
    }

    const label = _(issue.kind);
    if (issue.kind === "identifierempty") {
        return label;
    }
    if (issue.kind === "identifierforbidden") {
        return label + " (" + db + ": " + issue.char + ")";
    }
    /*
     * 長さは「実際の長さ > 上限 単位」を出す。**postgresql だけは超えても DB が拒まず
     * 黙って切る**ので、そこだけ印を足す（設計と DB がエラー無しで食い違う唯一の形）。
     */
    const over = issue.length + " > " + issue.limit.max + " " + issue.limit.unit;
    const cut = issue.limit.onExceed === "truncate" ? ", " + _("identifiertruncated") : "";
    return label + " (" + db + ": " + over + cut + ")";
}
