/* ------------------------- edit history ----------------------- */
/*
 * grabado: 編集の履歴（undo / redo）を積むスタック（#288）。
 *
 * **string しか知らない。** DOM も Designer も DesignModel も知らないので、jsdom を
 * 組まずに上限・同値スキップ・redo の破棄をテストで固定できる。js/io/conflict.ts が
 * 「保存前の判定だけを持つ純粋なモジュール」であるのと同じ立場で、**何を積むか**
 * （スナップショットの作り方・復元・キーバインド）を決めるのは js/historymanager.ts。
 *
 * ## なぜ文字列で、DesignModel のまま持たないか
 *
 * N=300 の実測で、オブジェクトのまま 1 件持つと **532KB / live オブジェクト 7,197 個**、
 * JSON.stringify した文字列なら **313KB / 1 個**。stringify 2.35ms ＋ parse 2.24ms は
 * undo 1 回の 1,250〜2,150ms（復元は読み込みと同じ重さ。docs/ARCHITECTURE.md §5.7）に
 * 対して誤差なので、**払って構わない**。
 *
 * ★★ 効くのはメモリ量より **GC と参照の寿命**のほう。tests/node/listeners.test.ts が
 *   縛っている OZ.Event._byID は**素のオブジェクトで GC が効かない**（#209）。スタックが
 *   ライブオブジェクトを掴むと、リスナーを外しても参照だけが残り続ける。
 *   **文字列なら構造的に掴めない。**
 *
 * 同値比較・文字数の計上・復元が 1 つの表現で片づくのも、この形を採る理由。
 *
 * ## past / present / future の 3 本で持つ
 *
 * present（いま確定している状態）を自分で持つので、push() が同値かどうかを**呼び手に
 * 聞かずに**判定できる。呼び手は「今の状態」を渡すだけでよく、「前の状態は何だったか」を
 * 覚えなくてよい —— これが js/historymanager.ts の commit() を**冪等**にしている。
 */

/** 積める手の上限。**どちらかに当たったら古い側から捨てる。** */
export interface HistoryLimits {
    /**
     * 積める手の数。
     *
     * 無制限にしないのは、undo が**セッション中ずっと積み上がる唯一の構造**だから
     * （OZ.Event._byID が素のオブジェクトで GC が効かなかった #209 と同じ種類の単調増加）。
     */
    readonly entries: number;
    /**
     * 積める文字数の合計（`length` の和。**バイト数ではない**）。
     *
     * ★ 文字数で数えるのは、js/io.ts の clientlocalsave() が既に `json.length` で
     *   2,621,440 文字の上限を持っているから —— **「大きすぎる設計」の語彙をこのプロジェクトに
     *   2 つ作らない**。バイト数に換算し直すと 2 つ目の尺度が生まれる。
     */
    readonly chars: number;
}

/**
 * 既定の上限。
 *
 * N=300（実測済みの天井。docs/ARCHITECTURE.md §5.7）の設計 JSON が 423,836 バイトなので、
 * **300 テーブルでも約 39 手**が文字数側に収まる。実在規模（docs/samples/ は 6 テーブルと
 * 3 テーブル）では 1 件が 10KB 前後なので、**件数側が先に効き、文字数側には一度も当たらない**。
 * **「重い設計ほど浅い」が自動的に出る。**
 *
 * 16,000,000 は localStorage 1 本の上限（2,621,440 文字）の約 6 倍。
 */
export const DEFAULT_LIMITS: HistoryLimits = {
    entries: 50,
    chars: 16000000,
};

export class DesignHistory {
    /* 新規クラスなのでフィールド初期化子を使う（js/io/palette.ts:74 と同じ判断） */
    private past: string[] = [];
    private future: string[] = [];
    private present: string;
    private readonly limits: HistoryLimits;

    constructor(initial: string, limits: HistoryLimits = DEFAULT_LIMITS) {
        this.present = initial;
        this.limits = limits;
    }

    /**
     * 1 手を確定する。**同じ文字列なら何もしない。**
     *
     * 呼び手（js/historymanager.ts の commit()）は操作の**後**に呼ぶので、
     * 「実際には変わらなかった」経路がここで自動的に捨てられる —— confirm で
     * キャンセルされた削除、先頭行で早期 return する Row.up()、snap 未満のドラッグ、
     * 編集ダイアログを開いて何も変えずに閉じた場合。**撒きすぎても害が無い**のは
     * この性質による。
     */
    push(text: string): void {
        if (text === this.present) {
            return;
        }
        this.past.push(this.present);
        this.present = text;
        /* 新しい枝に入ったので、やり直せる先は無くなる */
        this.future.length = 0;
        this.trim();
    }

    /** 戻した先の文字列。戻せなければ null */
    undo(): string | null {
        const previous = this.past.pop();
        if (previous === undefined) {
            return null;
        }
        this.future.push(this.present);
        this.present = previous;
        return previous;
    }

    /** やり直した先の文字列。やり直せなければ null */
    redo(): string | null {
        const next = this.future.pop();
        if (next === undefined) {
            return null;
        }
        this.past.push(this.present);
        this.present = next;
        return next;
    }

    canUndo(): boolean {
        return this.past.length > 0;
    }

    canRedo(): boolean {
        return this.future.length > 0;
    }

    /**
     * 履歴を捨てて、渡された状態を起点にし直す。
     *
     * 呼ばれるのは「別の設計に入れ替わったが、戻す先として意味を持たない」とき ——
     * 型パレットが差し替わる経路（js/historymanager.ts の判断）と、生成直後。
     */
    reset(text: string): void {
        this.past.length = 0;
        this.future.length = 0;
        this.present = text;
    }

    /** いま確定している状態。commit() の同値判定と isCommitted() が読む */
    current(): string {
        return this.present;
    }

    /** 戻れる手の数。**テストが「1 ジェスチャで 1 手だけ増える」を見る面** */
    depth(): number {
        return this.past.length;
    }

    /**
     * 上限を守る。**古い側から捨てる。**
     *
     * push() からしか呼ばれないので、ここに来た時点で future は必ず空。
     */
    private trim(): void {
        while (this.past.length > this.limits.entries) {
            this.past.shift();
        }
        /*
         * ★ **最低 1 手は残す。** 1 件だけで文字数上限を超える設計（16,000,000 文字 =
         *   N=300 の 38 倍）でも、**直前の状態には戻れる**ようにする。ここを
         *   `length > 0` にすると、大きい設計で undo が 1 度も効かなくなる。
         */
        while (this.past.length > 1 && this.chars() > this.limits.chars) {
            this.past.shift();
        }
    }

    private chars(): number {
        let total = this.present.length;
        for (const text of this.past) {
            total += text.length;
        }
        for (const text of this.future) {
            total += text.length;
        }
        return total;
    }
}
