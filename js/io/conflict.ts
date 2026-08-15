/* ------------------------- external change ---------------------- */
/*
 * grabado: 保存しようとしているファイルが app の外で変わっていないかを判定する
 * （HANDOVER §4 段階4-6「外部変更検知」）。
 *
 * 正本は git 管理の JSON ファイル（CLAUDE.md 制約2）なので、**他人の PR を git pull で
 * 取り込んだ後に古い編集状態のまま保存すると、相手の変更が黙って消える**。HANDOVER §4 は
 * これを「ファイルが app 外で変化したら検知し再読込を促す。古い編集状態でファイルを
 * 上書きしない」と定義している。
 *
 * ## なぜ read-before-write なのか
 *
 * 現行 backend（PHP）は `save` が 201 空 body、`load` が保存バイト列をそのまま返すだけで、
 * **ETag も Last-Modified も返さない**（docs/ARCHITECTURE.md §4.3 の実測）。条件付き更新の
 * 手がかりが応答に無いので、**save の直前に load を 1 回投げて、自分が最後に観測した
 * バイト列と比べる**のが上限になる。PHP に手を入れないのは CLAUDE.md 制約6（捨てる資産に
 * 投資しない）。
 *
 * **TOCTOU の窓は残る** —— プリフライトの load と save の間に他者が書けば、そちらが負ける。
 * 閉じるには backend 側の条件付き更新が要るので、ETag + If-Match（不一致は 412）は
 * Kotlin 実装（HANDOVER §5.1）への申し送りにしてある。
 *
 * ## 時間駆動にしないこと
 *
 * 検知は **save / load のイベント境界だけ**で行う（CLAUDE.md 制約2「時間駆動の一方向同期を
 * 作らない」）。定期ポーリングも自動再読込も入れない —— 編集中に勝手に読み直すと、
 * pull 上書き事故を別の形（編集の消失）で作り直すことになる。
 */

/**
 * 「サーバ上のこのファイルは、自分が最後に観測した時点でこうだった」の記録。
 *
 * `name` は**ファイル名**（js/io.ts の `jsonKeyword()` を通した後の値）。素の設計名で持つと
 * `orders` と `orders.json` が別物になり、serverlist の出力を prompt に貼っただけで
 * 「初めて触る名前」に見えてしまう。
 *
 * `text` は**サーバから届いたバイト列そのもの**で、モデルに反映できたか（＝壊れた JSON
 * だったか）とは独立。ここが持つのは「サーバ上の版の観測結果」で、読めたかどうかは
 * js/io.ts 側の関心。
 */
export interface Baseline {
    name: string;
    text: string;
}

/**
 * 保存前の判定。
 *
 * - `absent` —— サーバに無い。そのまま保存してよい（失うものが無い）
 * - `clean` —— 観測した版と一致。そのまま保存してよい
 * - `exists` —— 派生元を持たないのに実体がある。他人／別セッションのファイルを踏む
 * - `conflict` —— 観測した後に外部で変わった。**本機能の主眼**
 */
export type SaveVerdict = "absent" | "clean" | "exists" | "conflict";

/**
 * @param baseline 今の編集セッションの派生元（まだ一度も load / save していなければ null）
 * @param name 保存しようとしているファイル名（`jsonKeyword()` 後）
 * @param server プリフライトの応答。**404 以外はすべて「実体あり」として扱う**ので、
 *   500 / 501 / 503 のような「そもそも読めなかった」応答は呼び手が先に落とすこと
 *   （js/io.ts の preflightresponse）。ここで確認を出す側に倒れるのは安全側だが、
 *   backend が壊れているときに「上書きしますか」と聞くのは筋が悪い。
 */
export function verdictForSave(
    baseline: Baseline | null,
    name: string,
    server: { status: number; text: string | null },
): SaveVerdict {
    if (server.status === 404) {
        return "absent";
    }
    /*
     * 別名で保存するときは派生元が変わる（baseline は今開いているファイルの記録なので、
     * 別の名前について何も言っていない）。安全側の exists に倒し、確認を出す。
     */
    if (!baseline || baseline.name !== name) {
        return "exists";
    }
    return baseline.text === (server.text ?? "") ? "clean" : "conflict";
}
