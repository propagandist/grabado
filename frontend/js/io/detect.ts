/* ------------------------- format detect ---------------------- */
/*
 * grabado: 読み込むテキストが設計 JSON か設計 XML かを見分ける（HANDOVER §4 段階4-3b）。
 *
 * 段階4-3b で保存はすべて JSON になったが、**読み込みは XML も受ける**（HANDOVER §4 の
 * 「XML は読み込み専用の互換変換器として残す」）。読込 5 経路のうち拡張子を持つのは
 * clientloadfromfile だけで、textarea / クリップボード / localStorage / server には
 * 拡張子が無い。だから判別は**中身の先頭 1 文字**でやる —— 設計 JSON は必ず `{`
 * （js/io/json-serializer.ts が JSON.stringify のオブジェクトを書く）、設計 XML は必ず
 * `<`（js/io/ddl-xml.ts が `<?xml` から始める）。
 *
 * ## 「試して駄目なら他方」のフォールバックを作らないこと
 *
 * これが本ファイルの要件。フォールバックを書くと、壊れた JSON を XML として読み直して
 * 「Null document」と出る —— **ユーザーが直せない位置に例外が着地する**。先頭 1 文字で
 * 行き先を確定させると、`{` で始まる入力は必ず json-parser の位置つきメッセージ
 * （tables[0].columns[2].name）だけを出し、`<` で始まる入力は必ず xmlerror だけを出す。
 *
 * 判別を厳しくしない（`{"formatVersion"` まで見る等）のも同じ理由。中身の妥当性は
 * parser の仕事で、ここが担うのは**行き先の決定だけ**。JSON として壊れているなら
 * json-parser が位置つきで落とすほうが、ここで「unknown」に落とすより情報が多い。
 */

/** 読み込みの行き先。unknown は「どちらの parser にも渡さない」 */
export type DesignFormat = "json" | "xml" | "empty" | "unknown";

export function detectDesignFormat(text: string): DesignFormat {
    /*
     * ECMAScript の WhiteSpace は U+FEFF（BOM）を含むので trim() だけで足りる。
     * この依存は tests/node/detect.test.ts が BOM 付きの入力で固定している。
     */
    const head = text.trim()[0];
    if (head === undefined) {
        return "empty";
    }
    if (head === "{") {
        return "json";
    }
    if (head === "<") {
        return "xml";
    }
    return "unknown";
}
