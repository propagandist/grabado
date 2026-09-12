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

import { OZ } from "./oz.ts";
import { _ } from "./globals.ts";
import { DesignHistory } from "./history.ts";
import { extractModel } from "./io/extract.ts";
import { applyDesignModel } from "./io/apply.ts";
import { findDuplicateTableName } from "./io/validate.ts";
import type { DesignModel } from "./io/model.ts";
/* owner の型。必ず import type で受ける（理由は js/table.ts の冒頭） */
import type { Designer } from "./wwwsqldesigner.ts";

/** ツールバーの 2 ボタン。コンストラクタで埋まる（後付けキーは無い） */
export interface HistoryManagerDom {
    undo: HTMLInputElement;
    redo: HTMLInputElement;
}

export class HistoryManager {
    /* 新規クラスなのでフィールド初期化子を使う（js/io/palette.ts:74 と同じ判断） */
    private readonly owner: Designer;
    private readonly stack: DesignHistory;
    private readonly dom: HistoryManagerDom;
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
        this.dom = {
            undo: OZ.$<HTMLInputElement>("undo"),
            redo: OZ.$<HTMLInputElement>("redo"),
        };
        /*
         * ショートカットをラベルに出す（js/io.ts の quicksave が " (F2)" を足すのと
         * 同じ形）。**キーボードショートカットが UI のどこにも書かれていないのは
         * 発見可能性の問題**でもある。
         */
        this.dom.undo.value = _("undo") + " (Ctrl+Z)";
        this.dom.redo.value = _("redo") + " (Ctrl+Shift+Z)";
        OZ.Event.add(this.dom.undo, "click", this.undo.bind(this));
        OZ.Event.add(this.dom.redo, "click", this.redo.bind(this));
        OZ.Event.add(document, "keydown", this.press.bind(this));
        this.redraw();
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
        this.redraw();
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
        this.redraw();
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
        this.redraw();
    }

    /** 履歴を捨てて、いまの状態を起点にし直す */
    reset(): void {
        this.lastDb = this.owner.palette.db();
        this.stack.reset(this.snapshot());
        this.redraw();
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


    /**
     * ボタンの可否を組み直す。
     *
     * ★ **owner.redrawSuspended を見る**（#210）—— 見ないと読み込み中に N x C 回走る。
     *   js/rowmanager.ts の redraw() と同じ形。
     */
    redraw(): void {
        if (this.owner.redrawSuspended) {
            return;
        }
        /*
         * ★ **aria-disabled を足さない。** ネイティブの disabled は既にアクセシビリティ
         *   ツリーに現れるので二重管理になる（#175。tests/node/a11y.test.ts が 0 件で固定）。
         */
        this.dom.undo.disabled = !this.canUndo();
        this.dom.redo.disabled = !this.canRedo();
    }

    /**
     * Ctrl/Cmd+Z = undo、Ctrl+Shift+Z / Ctrl+Y = redo（document への **5 本目**）。
     *
     * ★ **プラットフォーム分岐を書かない** —— `ctrlKey || metaKey` の 1 本で足りる。
     *   このコードベースに UA 判定は 1 つも残っていない（OZ.opera は段階3-3b、
     *   OZ.ie は js/tablemanager.ts で撤去済み）。Ctrl+Y は macOS に慣習が無いが、
     *   **受けても害が無く、断ると分岐が 1 本増える**。
     *
     * ★ 既存 3 本に相乗りしない —— js/io.ts の press() は I/O 専用で、manager 2 本は
     *   **選択が無いと即 return** する。**undo は何も選択されていなくても効く**必要がある。
     */
    press(e: KeyboardEvent): void {
        /*
         * ★ **フォーム欄ではブラウザ標準のテキスト undo に譲る。** 判定は
         *   js/tablemanager.ts / js/rowmanager.ts の press() と同じ形で、**修飾キーを
         *   見るより前に置く**。これで Save/Load の textarea・行編集のインライン input・
         *   テーブル名 / コメント欄・キー名欄が守られる（展開中の行はフォーカスが
         *   input にあるので、ここで一緒に拾われる）。
         */
        var el = OZ.Event.target(e) as HTMLInputElement;
        var name = el.nodeName.toLowerCase();
        /*
         * ★★ **input[type=button] は「フォーム欄」ではない。** ダイアログの OK を
         *   押した直後はフォーカスがボタンに残るので、ここを除外しないと
         *   **閉じた直後の Ctrl+Z が効かない**（2026-09-12 実測。tests/browser/undo.spec.ts
         *   の「テーブル追加は 1 手」が最初に踏んだ）。ブラウザのテキスト undo も
         *   ボタンの上では起きないので、譲る相手がいない。
         *
         *   js/tablemanager.ts / js/rowmanager.ts の press() は type を見ていないが、
         *   **あちらは Delete キー**で、押す相手がツールバーのボタンにフォーカスが
         *   ある状況とほぼ重ならない。触らない。
         */
        if (name == "textarea" || (name == "input" && el.type != "button")) {
            return;
        } /* not when in form field */

        if (!(e.ctrlKey || e.metaKey) || e.altKey) {
            return;
        }

        /*
         * ★★ **キーは既存 4 本と衝突しないが、状態が衝突する。** #window が開いている
         *   あいだ TableManager.save() は selection[0] を、KeyManager は table / key を
         *   掴んだままなので、undo が clearTables() すると**破棄済みオブジェクトに
         *   OK が書き込む**。dialog[open] の 1 本で #window（js/window.ts）と
         *   #prompt（js/dialog.ts）の両方を覆う —— 新しい状態を増やさない。
         */
        if (document.querySelector("dialog[open]")) {
            return;
        }

        /*
         * ★ 戻れるものが無くても alert も音も出さない（守れているのに出る警告は、
         *   無視する習慣を作る）。undo() / redo() が静かに何もしない。
         */
        var k = e.key.toLowerCase();
        if (k == "z" && !e.shiftKey) {
            this.undo();
        } else if ((k == "z" && e.shiftKey) || k == "y") {
            this.redo();
        } else {
            return;
        }
        OZ.Event.prevent(e);
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
        this.redraw();
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
