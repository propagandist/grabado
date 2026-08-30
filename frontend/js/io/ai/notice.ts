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

import type { PatchRejection } from "./apply-patch.ts";
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

    const ordered = orderedSuggestions(suggestions);
    for (let i = 0; i < ordered.length; i++) {
        const one = ordered[i]!;
        const column = one.target.column;
        const target = column === undefined ? one.target.table : `${one.target.table}.${column}`;
        /* ★ 番号は 1 始まり。**これが承認の単位**（段階11-4 の prompt がこの番号を受ける） */
        out.push(`  ${i + 1}. [${one.severity}] ${one.category} / ${target}`);
        out.push(`     ${one.rationale}`);
        out.push(`     patch: ${one.patch === undefined ? "無し（人が判断する指摘）" : one.patch.op}`);
        out.push("");
    }
    return out.join("\n");
}

/**
 * 一覧に出す順（段階11-4）。**承認の番号はこの順に振られる。**
 *
 * ★ **適用もこの順で行う。** `applyPatches` は配列順の畳み込みで**後の patch は前の結果を
 *   見る**ので、ユーザーが `3,1` と打っても一覧の順に当てる —— 打った順で結果が変わるのは
 *   説明できない。
 */
export function orderedSuggestions(
    suggestions: readonly AiSuggestion[],
): readonly AiSuggestion[] {
    return sorted(suggestions);
}

/**
 * 適用した結果を人が読む 1 枚にする（段階11-4）。
 *
 * ★ **`translate` を引数で受ける。** `js/io/` は locale を通せない（§5.6 規約3）ので、
 *   `PatchRejection.kind` を訳すのは呼び手（`js/io.ts`）の仕事 ——
 *   `ddl/naming.ts` の `IdentifierIssue` を `js/row.ts` が `_()` に通すのと同じ形。
 *   テストは恒等関数を渡せる。
 *
 * ★ **「保存はされない」と必ず書く。** grabado に undo は無く、正本は git 管理のファイルで
 *   save するまで変わらない —— **気に入らなければ保存せず読み直せば戻る**ことが undo の
 *   代わりになっている。それを知らせないと、戻れることに気づけない。
 */
export function applyNotice(
    chosen: readonly AiSuggestion[],
    rejections: readonly (PatchRejection | null)[],
    translate: (key: string) => string,
): string {
    const applied = rejections.filter((one) => one === null).length;
    const out = [
        `grabado: ${chosen.length} 件のうち ${applied} 件を適用した。`,
        "**まだ保存していない** —— 保存するまで正本のファイルは変わらない。",
        "気に入らなければ保存せずに読み直せば元に戻る（grabado に undo は無い）。",
        "",
    ];

    for (let i = 0; i < chosen.length; i++) {
        const one = chosen[i]!;
        const rejection = rejections[i] ?? null;
        const column = one.target.column;
        const target = column === undefined ? one.target.table : `${one.target.table}.${column}`;
        const op = one.patch === undefined ? "-" : one.patch.op;
        if (rejection === null) {
            out.push(`  適用: ${target}（${op}）`);
        } else {
            out.push(`  見送り: ${target}（${op}） —— ${translate(rejection.kind)}`);
        }
    }
    return out.join("\n") + "\n";
}

/**
 * `all` か、1 始まりの番号の並び（`1,3,5` / `1 3 5`）を選択に変える（段階11-4）。
 *
 * **範囲外と重複は黙って捨てる。** 打ち間違いで全部が落ちるより、選べたものを当てるほうが
 * 実際の使い方に合う —— 何が当たったかは [applyNotice] が 1 件ずつ出す。
 * 順序は**入力順ではなく一覧の順**（上の [orderedSuggestions] の理由）。
 */
export function parseSelection(input: string, count: number): readonly number[] {
    const trimmed = input.trim().toLowerCase();
    if (trimmed === "all") {
        return Array.from({ length: count }, (_unused, index) => index);
    }

    const seen = new Set<number>();
    for (const token of trimmed.split(/[\s,]+/)) {
        if (token === "") {
            continue;
        }
        const value = Number(token);
        if (!Number.isInteger(value) || value < 1 || value > count) {
            continue;
        }
        seen.add(value - 1);
    }
    return [...seen].sort((a, b) => a - b);
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
