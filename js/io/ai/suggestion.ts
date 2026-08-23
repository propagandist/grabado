/* ------------------------- ai suggestion ---------------------- */
/*
 * grabado: AI が返す提案と patch の形（HANDOVER §11 段階11-1）。
 *
 * **契約の正は docs/ARCHITECTURE.md §8.3**（決定と根拠は CUSTOMIZATIONS.md の段階11-0）。
 * 本ファイルはその JSON と 1 対 1 の型で、11-2 が Kotlin 側に書く structured outputs の
 * スキーマと**同じ語彙**を持つ。片方だけ動かすと契約が割れる。
 *
 * ## js/io/ai/ は §4 の 2x2 格子の外
 *
 * 格子（js/io/model.ts の冒頭）はライブ側 / 形式側 × 入 / 出 の 4 象限で、そのどれでもない。
 * ここは**設計モデルを入力に取り、設計モデルを返す第 3 の軸**なので、extract / apply /
 * parser / serializer のどれにも同居させない（段階11-0 の申し送り）。位置づけがいちばん
 * 近いのは js/io/convert.ts（モデル -> モデルの純関数）。
 *
 * ## ランタイムの検証を持たない
 *
 * js/io/introspect-model.ts と同じで、型だけで emit が空（src/app.ts には載せない）。
 * 「形が違うものは受け取らない」層は backend 側の structured outputs が持つ
 * （§8.1。決めたこと 1「自由テキストをパースしない」）ので、ここに二重に置くと
 * 11-2 が持つべき契約が 11-1 に漏れる。
 *
 * ## 破壊的な op を型で潰す
 *
 * AiPatch の union に drop-table / drop-column の枝が**無い**ことが、そのまま
 * 「AI の提案を承認したら設計が消えた」を作らない保証になる（§8.3）。実行時の検査ではなく
 * 形式で潰すのが決めたこと 6 の要点で、消したい列の指摘は `patch` を持たない提案
 * （rationale だけ）として出す。
 */

/** 指摘の分類（HANDOVER §11.3 の 7 語）。**適用には影響しない** —— 見せ方は 11-3 / 11-4 */
export type AiCategory =
    | "type_smell"
    | "missing_index"
    | "naming"
    | "normalization"
    | "missing_audit"
    | "missing_pk"
    | "fk_gap";

export type AiSeverity = "info" | "warn" | "error";

/**
 * 指摘の対象。**常に「設計に実在するもの」を指す。**
 *
 * add-column / add-key のような追加系でも、ここに入るのは**追加先**であって新設する名前では
 * ない（新しい名前は patch 側が持つ）。column を省くとテーブル全体に掛かる指摘になる。
 */
export interface AiTarget {
    readonly table: string;
    readonly column?: string;
}

export interface AiSuggestion {
    readonly category: AiCategory;
    readonly severity: AiSeverity;
    readonly target: AiTarget;
    /** 人間向けの理由。**locale を通さない**（§5.6 規約3。見せ方は 11-4 が決める） */
    readonly rationale: string;
    /**
     * 機械可読な変更。**optional**（§8.3）。
     *
     * 「この列は使われていないのでは」のように、承認しても自動では直せない指摘はこれを
     * 持たずに出す。drop 系の op が無いことの受け皿でもある。
     */
    readonly patch?: AiPatch;
}

/**
 * add-key が作れるキーの種類。
 *
 * FULLTEXT を入れていないのは、PG では btree の CREATE INDEX に落ちるだけ（docs/FORMAT.md）で
 * AI が提案する意味が無いため。UI（js/keymanager.ts）は 4 つ作れるが、ここは「AI に作らせて
 * よいもの」の集合で、UI の写しではない。
 */
export type AiKeyType = "PRIMARY" | "UNIQUE" | "INDEX" | "FOREIGN";

/** FK の参照先（親）。DesignModel の RelationRef と同じものを AI 側の語彙で書いたもの */
export interface AiReference {
    readonly table: string;
    readonly column: string;
}

/**
 * 適用できる変更。**op は閉じた 8 種**（§8.3）で、11-2 の JSON Schema に enum として出る。
 *
 * 対象は patch ではなく AiSuggestion.target が持つ。両方に持たせると「食い違ったら
 * どちらが勝つか」という答えの無い分岐が生まれる。
 *
 * add-key を入れ子の union（非 FK は columns / FOREIGN は references）にせず平坦にしたのは、
 * structured outputs の JSON Schema に制約がある（再帰不可・additionalProperties: false 必須。
 * 決めたこと 1）ためで、**スキーマの形は 11-2 が決める**。組み合わせ違反は apply-patch.ts が
 * patchmalformed で受ける。
 */
export type AiPatch =
    | { readonly op: "rename-table"; readonly name: string }
    | { readonly op: "rename-column"; readonly name: string }
    | {
          /** 型は**解決済みの SQL 名**（§8.2。型 id やパレットの添字ではない） */
          readonly op: "change-type";
          readonly sqlType: string;
          readonly size?: string;
      }
    | {
          readonly op: "add-column";
          readonly name: string;
          readonly sqlType: string;
          readonly size?: string;
          /** 省略時は NOT NULL（設計 JSON の既定と同じ。js/io/json-format.ts） */
          readonly nullable?: boolean;
          /** 省略時 / "" は「既定なし」。モデルに null は無い（段階4-5） */
          readonly default?: string;
          readonly comment?: string;
      }
    | {
          readonly op: "add-key";
          readonly keyType: AiKeyType;
          /** 非 FK のとき必須。FOREIGN では見ない */
          readonly columns?: readonly string[];
          /** FOREIGN のとき必須。非 FK では見ない */
          readonly references?: AiReference;
      }
    | { readonly op: "set-nullable"; readonly nullable: boolean }
    | {
          /** **"" が「既定を外す」**。"NULL" を「既定 NULL」の意味では受けない */
          readonly op: "set-default";
          readonly value: string;
      }
    | { readonly op: "add-comment"; readonly value: string };
