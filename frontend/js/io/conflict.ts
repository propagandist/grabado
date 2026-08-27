/* ------------------------- external change ---------------------- */
/*
 * grabado: 保存しようとしているファイルが app の外で変わっていないかを判定する
 * （HANDOVER §4 段階4-6「外部変更検知」→ §5 段階5-4 で条件付き更新へ移行）。
 *
 * 正本は git 管理の JSON ファイル（CLAUDE.md 制約2）なので、**他人の PR を git pull で
 * 取り込んだ後に古い編集状態のまま保存すると、相手の変更が黙って消える**。HANDOVER §4 は
 * これを「ファイルが app 外で変化したら検知し再読込を促す。古い編集状態でファイルを
 * 上書きしない」と定義している。
 *
 * ## 段階4-6（read-before-write）から 5-4（条件付き更新）へ
 *
 * 現行 backend が PHP だった頃は `save` が 201 空 body、`load` が保存バイト列を返すだけで
 * **ETag も Last-Modified も返さなかった**ので、**save の直前に load を 1 回投げて、自分が
 * 最後に観測したバイト列と比べる**のが上限だった。**TOCTOU の窓は残っていた** ——
 * プリフライトの load と save の間に他者が書けば、そちらが負ける。
 *
 * **段階5-4 で backend（server/）が ETag を返すようになり、その窓が閉じた。** いまの流れ:
 *
 * | 状況 | 送る条件ヘッダ | サーバ |
 * |---|---|---|
 * | 観測済み（baseline あり・同名） | `If-Match: "<etag>"` | 一致 → 201 ／ 不一致 → **412** |
 * | 新規のつもり（baseline なし・別名） | `If-None-Match: *` | 不在 → 201 ／ 実在 → **412** |
 * | 412 を受けて confirm した後 | `If-Match: *` | 存在すれば無条件で上書き |
 *
 * **プリフライトの load は無くなった。** 保存は 1 往復で、衝突したときだけ 2 往復になる。
 *
 * ## 時間駆動にしないこと
 *
 * 検知は **save / load のイベント境界だけ**で行う（CLAUDE.md 制約2「時間駆動の一方向同期を
 * 作らない」）。定期ポーリングも自動再読込も入れない —— 編集中に勝手に読み直すと、
 * pull 上書き事故を別の形（編集の消失）で作り直すことになる。
 */

/**
 * 「サーバ上のこのファイルは、自分が最後に観測した時点でこの版だった」の記録。
 *
 * `name` は**ファイル名**（js/io.ts の `jsonKeyword()` を通した後の値）。素の設計名で持つと
 * `orders` と `orders.json` が別物になり、serverlist の出力を prompt に貼っただけで
 * 「初めて触る名前」に見えてしまう。
 *
 * `etag` は**サーバが返した ETag**（引用符込み）。段階5-4 まではバイト列そのもの（`text`）を
 * 持っていたが、比較をサーバへ移したので保持する必要が無くなった —— **設計 1 件ぶんの
 * 文字列をクライアントに抱え続けない**のは副次的な利点で、主眼は「比較の主体がサーバに
 * 移り、TOCTOU の窓が閉じたこと」。
 */
export interface Baseline {
    name: string;
    etag: string;
}

/**
 * 412 を受けたときの分岐（段階5-4）。
 *
 * - `conflict` —— 観測した後に外部で変わった。**本機能の主眼**
 * - `exists` —— 派生元を持たない（または別名）のに実体があった。他人／別セッションのファイルを踏む
 *
 * 段階4-6 の `verdictForSave()` が持っていた `absent` / `clean` は消えた ——
 * **それらは 412 にならない**（サーバが 201 で応え、そもそもここへ来ない）。
 * 判定の主体がクライアントからサーバへ移ったぶん、残るのは「衝突したときに何と言うか」だけ。
 */
export type SaveVerdict = "exists" | "conflict";

/**
 * @param baseline 今の編集セッションの派生元（まだ一度も load / save していなければ null）
 * @param name 保存しようとしていたファイル名（`jsonKeyword()` 後）
 */
export function verdictAfterConflict(baseline: Baseline | null, name: string): SaveVerdict {
    /*
     * 別名で保存するときは派生元が変わる（baseline は今開いているファイルの記録なので、
     * 別の名前について何も言っていない）。
     */
    return !baseline || baseline.name !== name ? "exists" : "conflict";
}

/** save に載せる条件ヘッダ。どれか 1 つだけが立つ。 */
export interface Precondition {
    ifMatch?: string;
    ifNoneMatch?: string;
}

/**
 * 保存前に、派生元の有無から条件ヘッダを決める（段階5-4）。
 *
 * @param baseline 今の編集セッションの派生元
 * @param name 保存しようとしているファイル名（`jsonKeyword()` 後）
 */
export function preconditionFor(baseline: Baseline | null, name: string): Precondition {
    if (baseline && baseline.name === name) {
        return { ifMatch: baseline.etag };
    }
    /* 派生元が無い＝「新規のつもり」。実在したらサーバが 412 を返し、confirm に流れる */
    return { ifNoneMatch: "*" };
}

/**
 * 応答ヘッダから ETag を取り出す。
 *
 * **大小を無視して探す。** `XMLHttpRequest.getAllResponseHeaders()` はヘッダ名を小文字化して
 * 返す（仕様）ので `ETag` では引けないが、テストの仮想 backend や将来の実装が
 * 元の大小のまま渡してくることもある。どちらでも読めるようにしておく。
 */
export function etagFromHeaders(headers: Record<string, string> | undefined): string | null {
    if (!headers) {
        return null;
    }
    for (const key in headers) {
        if (key.toLowerCase() === "etag") {
            const value = headers[key];
            return value ? value : null;
        }
    }
    return null;
}
