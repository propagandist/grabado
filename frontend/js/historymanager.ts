/* ----------------- history manager ---------- */
/*
 * grabado: undo / redo の確定と復元（#288）。
 *
 * js/history.ts が持つのは「文字列のスタック」だけで、**何を積むか・いつ積むか・
 * どう戻すか**をここが決める。既存の js/tablemanager.ts / js/rowmanager.ts /
 * js/keymanager.ts と同じ「Designer に所有されるマネージャ」の形。
 *
 * **js/io/ に置かない。** §5.6 規約3（io/ は locale を通さない）と規約4（UI と通信は
 * js/io.ts に残す）の両方に当たる —— ボタンの disabled もキーバインドも UI そのもの
 * （それが載るのは #289）。io/extract.ts と io/apply.ts を値で import するが、これは
 * js/wwwsqldesigner.ts が既に張っている辺と同じ向き（描画 -> io）で、新しい向きの辺は
 * 1 本も生えない。
 *
 * ★ クラス名を History にしない —— lib.dom のグローバル History と同名になる
 *   （js/window.ts が `Window as SqlWindow` で受けているのと同じ問題）。
 *
 * ## commit() は操作の「後」に呼ぶ。だから撒きすぎても害が無い
 *
 * 現在の状態を採り、直前に確定した状態と**文字列が同じなら何もしない**（js/history.ts の
 * push）。前取りにすると「実際には変わらなかった」経路をメソッドごとに判断することに
 * なるうえ、#173 で Promise になった confirm / prompt を跨げない。
 *
 * ## ★★ undo() は先に commit() を呼ぶ
 *
 * フックを撒き忘れた経路があっても、その変更は undo の瞬間に 1 手として確定してから
 * 巻き戻る。**漏れの代償は「2 つの操作が 1 手になる」だけで、「最後の編集が undo で
 * 消える / 飛ばされる」は構造的に起きない。** 17 の確定点を人が撒く以上、漏れは
 * 「起きるか」ではなく「起きたとき何が壊れるか」で設計する。
 *
 * ## suspendRedraw() をここから呼ばない
 *
 * 束ねているのは applyDesignModel() の内部だけで、そこは try / finally で必ず戻り、
 * resumeRedraw() が rowManager.redraw() -> endCreate() / endConnect() を走らせて
 * **FK 作成モードが解除される**。undo の意味論としてもそれが正しい（作成途中のモードを
 * 跨がせない）。js/wwwsqldesigner.ts の redrawSuspended に付いた ★★「UI 操作の経路には
 * 決して入れない」は、ここでは逆に利いている。
 */

import { DesignHistory } from "./history.ts";
import { extractModel } from "./io/extract.ts";
import { applyDesignModel } from "./io/apply.ts";
import { findDuplicateTableName } from "./io/validate.ts";
import type { DesignModel } from "./io/model.ts";
/* owner の型。必ず import type で受ける（理由は js/table.ts の冒頭） */
import type { Designer } from "./wwwsqldesigner.ts";

export class HistoryManager {
    /* 新規クラスなのでフィールド初期化子を使う（js/io/palette.ts:74 と同じ判断） */
    private readonly owner: Designer;
    private readonly stack: DesignHistory;
    /**
     * 最後に見た型パレットの db 名。**これが変わったら履歴を捨てる。**
     *
     * RowModel.type は型パレットの**添字**（js/io/model.ts）なので、パレットが差し替わると
     * 古いスナップショットの添字は別の型を指す —— 範囲外なら Row.update() が TypeError
     * （tests/node/redraw-suspend.test.ts が type: 9999 で実測している）、**範囲内なら
     * 黙って別の型になる**。後者のほうが悪い。
     *
     * ★ 差し替えの呼び出し箇所（js/wwwsqldesigner.ts の dbResponse と fromXML の 2 つ）に
     *   reset() を置くのではなく、**ここが commit / redo の入口で見る**。dbResponse は
     *   init2() より前にも走る（datatypes の到着が init2 の引き金）ので、置きに行くと
     *   this.historyManager が未生成の経路を踏む。
     */
    private lastDb: string | null;

    constructor(owner: Designer) {
        this.owner = owner;
        this.lastDb = owner.palette.db();
        this.stack = new DesignHistory(this.snapshot());
    }

    /**
     * 1 手を確定する。**操作の後に呼ぶ。何度呼んでも害が無い。**
     *
     * 積まない場合が 2 つある:
     *   1. 型パレットが差し替わっていた -> 履歴ごと捨てて、いまを起点にし直す
     *   2. **同名のテーブルがある** -> 積まない（下記）
     */
    commit(): void {
        if (!this.guardPalette()) {
            return;
        }
        const model = extractModel(this.owner);
        /*
         * ★★ **同名テーブルがあるあいだは積まない。**
         *
         * js/tablemanager.ts の click() が新規テーブルに _("newtable") を付けるので、
         * **同名テーブルは普通の操作で作れる**（2 つ作って編集ダイアログをキャンセルする）。
         * その状態を復元すると applyRelations の先勝ち索引で relation が先頭のテーブルへ
         * 寄る（js/io/apply.ts の既知の不具合。同ファイルが「関門を通らない呼び手」を
         * 名指ししている）。
         *
         * **復元の側で assertLoadableDesign を掛けるのではなく、積む側で弾く。** 関門は
         * 「外から来たバイト列」に掛けるもので、復元に掛けると**ユーザーが手で同名
         * テーブルを作った瞬間に undo が壊れる**。積まなければ present も動かないので、
         * 名前を直した次の commit() で自然に追いつく（同名のあいだの編集が 1 手にまとまる）。
         */
        if (findDuplicateTableName(model) !== null) {
            return;
        }
        this.stack.push(JSON.stringify(model));
    }

    /** 1 手戻す。戻せるものが無ければ何もしない */
    undo(): void {
        /* ★★ 撒き忘れた経路の変更を、ここで 1 手として確定させてから戻る（冒頭の KDoc） */
        this.commit();
        const text = this.stack.undo();
        if (text === null) {
            return;
        }
        this.restore(text);
    }

    /** 1 手やり直す。やり直せるものが無ければ何もしない */
    redo(): void {
        if (!this.guardPalette()) {
            return;
        }
        const text = this.stack.redo();
        if (text === null) {
            return;
        }
        this.restore(text);
    }

    /** 履歴を捨てて、いまの状態を起点にし直す */
    reset(): void {
        this.lastDb = this.owner.palette.db();
        this.stack.reset(this.snapshot());
    }

    canUndo(): boolean {
        return this.stack.canUndo();
    }

    canRedo(): boolean {
        return this.stack.canRedo();
    }

    /** 戻れる手の数。**テストが「1 ジェスチャで 1 手だけ増える」を見る面** */
    depth(): number {
        return this.stack.depth();
    }

    /**
     * ライブツリーが、最後に確定した手と一致しているか。
     *
     * ★ **17 の確定点の漏れを機械で検出する面。** テストはジェスチャを 1 つ駆動する
     *   たびにこれを見るので、「その経路に commit() が無い」が必ず赤になる ——
     *   目視やレビューに頼らずに済む。
     */
    isCommitted(): boolean {
        return this.snapshot() === this.stack.current();
    }

    private snapshot(): string {
        return JSON.stringify(extractModel(this.owner));
    }

    /**
     * 型パレットが差し替わっていないか。差し替わっていたら履歴を捨てて false を返す。
     *
     * @returns 履歴を使い続けてよければ true
     */
    private guardPalette(): boolean {
        const db = this.owner.palette.db();
        if (db === this.lastDb) {
            return true;
        }
        this.lastDb = db;
        this.stack.reset(this.snapshot());
        return false;
    }

    /**
     * スナップショットをライブツリーへ戻す。js/io.ts の aiapply() の逐語。
     *
     * **alignTables() は呼ばない** —— 座標はモデルが持っている（introspection の取り込みと
     * 違う点はここ）。applyDesignModel() の末尾が designer.sync() まで面倒を見る。
     *
     * ★ **失敗したら履歴を捨てて投げ直す。** applyDesignModel は途中で throw しうる
     *   （パレット範囲外の型添字。上の lastDb で塞いでいるが、塞ぎ漏れがありうる）。
     *   そのときツリーは半端な状態で残るので、**壊れた状態を基準に更に巻き戻すのが
     *   いちばん悪い**。利用者への通知は呼び手（#289 のキーハンドラとボタン）が出す。
     */
    private restore(text: string): void {
        const model = JSON.parse(text) as DesignModel;
        /*
         * ★ clearTables() が setTitle(false) を呼ぶ（js/wwwsqldesigner.ts）ので、
         *   何もしないと **undo のたびにファイル名がタイトルから消える**。
         */
        const title = document.title;
        try {
            this.owner.clearTables();
            applyDesignModel(this.owner, model);
        } catch (e) {
            this.reset();
            throw e;
        }
        document.title = title;
    }
}
