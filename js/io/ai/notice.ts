/* ------------------------- ai notice -------------------------- */
/*
 * grabado: 返ってきた提案を人が読む 1 枚にする（HANDOVER §11 段階11-3）。
 *
 * `js/io/introspect-parser.ts` の `importNotice()` と同じ立場 —— **落ちたものも含めて
 * 黙らせない**ための層で、textarea の 1 か所で読めるようにする（6-10b の変換注記・
 * 5-7b の import 注記に続く 3 つ目）。
 *
 * ★ **locale を通さない**（`docs/ARCHITECTURE.md` §5.6 規約3）。`js/io/` は形式とモデルしか
 *   知らず、文言は呼び手の `js/io.ts` が決める —— ただしここは `importNotice()` と同じく
 *   **本文そのものが情報**なので、既存に揃えて日本語の固定文字列で書く。
 *
 * ★ **AI の出力をここで HTML にしない。** 返るのは textarea に入る素のテキストで、
 *   `rationale` はモデルが書いた自由文（org security-baseline §5.2「モデルの出力を
 *   HTML としてレンダリングする」が崩れる変更として名指ししている）。**11-4 の適用 UI でも
 *   同じ制約が掛かる。**
 */

import type { AiSeverity, AiSuggestion } from "./suggestion.ts";

/** 重い順（画面の並びもこの順にする —— 設計の順に並べると error が埋もれる）。 */
const ORDER: readonly AiSeverity[] = ["error", "warn", "info"];

export function reviewNotice(suggestions: readonly AiSuggestion[]): string {
    if (suggestions.length === 0) {
        return "grabado: AI からの指摘は 0 件（ルーブリックの範囲では問題が見つからなかった）。\n";
    }

    const counts = new Map<string, number>();
    for (const one of suggestions) {
        counts.set(one.severity, (counts.get(one.severity) ?? 0) + 1);
    }
    const summary = ORDER.filter((level) => counts.has(level))
        .map((level) => `${level} ${counts.get(level)}`)
        .join(" / ");

    const out = [
        `grabado: AI から ${suggestions.length} 件の指摘（${summary}）。`,
        "**まだ 1 件も適用していない** —— 承認して当てるのは段階11-4。",
        "",
    ];

    for (const one of sorted(suggestions)) {
        const column = one.target.column;
        const target = column === undefined ? one.target.table : `${one.target.table}.${column}`;
        out.push(`  [${one.severity}] ${one.category} / ${target}`);
        out.push(`    ${one.rationale}`);
        out.push(`    patch: ${one.patch === undefined ? "無し（人が判断する指摘）" : one.patch.op}`);
        out.push("");
    }
    return out.join("\n");
}

/**
 * severity の重い順に並べ替える。**同じ severity の中では元の順を保つ**
 * （安定ソート。AI が並べた順は「重要なものから」と指示してある）。
 */
function sorted(suggestions: readonly AiSuggestion[]): readonly AiSuggestion[] {
    return [...suggestions].sort((a, b) => rank(a.severity) - rank(b.severity));
}

function rank(severity: AiSeverity): number {
    const index = ORDER.indexOf(severity);
    /* 知らない値は末尾へ（スキーマが閉じているので届かないはずだが、落とさない） */
    return index === -1 ? ORDER.length : index;
}
