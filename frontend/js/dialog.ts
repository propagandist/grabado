/* --------------------- dialog ------------ */

/*
 * grabado: alert / confirm / prompt の置き換え（#173）。
 *
 * ★★ **ネイティブの 3 つはページの見た目から完全に浮く。** 着手前は alert 28 か所が
 *   HTTP エラー・JSON パース失敗・クリップボード拒否・AI 応答の不整合を伝えており、
 *   **アプリが失敗を伝える主要な手段になっていた**。prompt の 6 か所は保存名・
 *   キーワード・DB 名・AI 提案の適用番号を訊いており、**入力の検証もプレースホルダも
 *   出せなかった**。
 *
 * ★ js/window.ts（4 枚のパネルを付け替えるモーダル）とは別に持つ。あちらは
 *   **開いているあいだ他の操作を受ける画面**で、こちらは**答えを待つ 1 問**。
 *   同じ <dialog> を使い回すと、パネルを開いたまま alert を出す経路で壊れる。
 *
 * ★ **AI 出力を HTML にしない**（org security-baseline §5.2、js/io/ai/notice.ts）。
 *   メッセージは必ず textContent で入れる。
 *
 * ★ テストの差し替え口は Designer.dialogs（インスタンスのプロパティ）。
 *   tests/browser/harness.ts と tests/node/harness.ts が、ここのメソッドを
 *   自前の関数で覆って「何が出たか」を集める。
 */

import { OZ } from "./oz.ts";
import { _ } from "./globals.ts";

type Kind = "alert" | "confirm" | "prompt";

interface DialogDom {
    dlg: HTMLDialogElement;
    message: HTMLParagraphElement;
    input: HTMLInputElement;
    ok: HTMLInputElement;
    cancel: HTMLInputElement;
}

export class Dialogs {
    declare dom: DialogDom;
    /*
     * ★★ 1 問ずつ順に出す待ち行列（#173）。
     *
     * **alert は戻り値を持たないので呼び手が await しない**が、そのままだと
     * 「警告を出してから保存し、失敗したらもう 1 本 alert」のような経路で
     * **開いている <dialog> に showModal() を呼んで InvalidStateError になる**。
     * ネイティブの alert は同期でブロックしていたので、この形は起きなかった。
     */
    private _queue: Promise<unknown> = Promise.resolve();

    constructor() {
        const dlg = OZ.DOM.elm("dialog", { id: "prompt" }) as HTMLDialogElement;
        const form = OZ.DOM.elm("form");
        form.setAttribute("method", "dialog");

        const message = OZ.DOM.elm("p", { className: "dialog-message" }) as HTMLParagraphElement;
        const input = OZ.DOM.elm("input", { className: "dialog-input" }) as HTMLInputElement;
        input.type = "text";

        const buttons = OZ.DOM.elm("div", { className: "dialog-buttons" });
        const cancel = OZ.DOM.elm("input", { className: "dialog-cancel" }) as HTMLInputElement;
        cancel.type = "button";
        const ok = OZ.DOM.elm("input", { className: "dialog-ok" }) as HTMLInputElement;
        ok.type = "submit";

        OZ.DOM.append([buttons, cancel, ok], [form, message, input, buttons], [dlg, form]);
        document.body.appendChild(dlg);

        this.dom = { dlg, message, input, ok, cancel };
    }

    /** 失敗や結果を伝える。**戻り値を持たないので、呼び手は await しなくてもよい** */
    alert(message: string): Promise<void> {
        return this._open("alert", message).then(() => undefined);
    }

    /** はい / いいえ。**Esc と Cancel はどちらも false** */
    confirm(message: string): Promise<boolean> {
        return this._open("confirm", message).then((v) => v !== null);
    }

    /** 1 行の入力。**Esc と Cancel はどちらも null**（ネイティブの prompt と同じ） */
    prompt(message: string, def?: string): Promise<string | null> {
        return this._open("prompt", message, def ?? "");
    }

    /**
     * 1 問を開いて、閉じるまで待つ。
     *
     * ★ <dialog method="dialog"> の submit は returnValue に submit ボタンの value を入れて
     *   閉じる。**Esc は returnValue を空にする**ので、そこで OK と取り違えないよう
     *   `_ok` フラグを別に持つ（value を i18n の訳文に依存させない）。
     */
    private _open(kind: Kind, message: string, def = ""): Promise<string | null> {
        const run = () => this._show(kind, message, def);
        /* 前の 1 問が失敗しても列は止めない（both の引数に同じ run を渡す） */
        const next = this._queue.then(run, run);
        this._queue = next.catch(() => undefined);
        return next;
    }

    private _show(kind: Kind, message: string, def: string): Promise<string | null> {
        const { dlg, message: p, input, ok, cancel } = this.dom;

        /* AI 出力が混ざる経路があるので、必ず textContent（innerHTML を使わない） */
        p.textContent = message;
        ok.value = _("windowok");
        cancel.value = _("windowcancel");
        input.value = def;
        input.hidden = kind !== "prompt";
        cancel.hidden = kind === "alert";
        dlg.dataset["kind"] = kind;

        let accepted = false;
        const accept = () => {
            accepted = true;
        };
        const decline = () => {
            accepted = false;
            dlg.close();
        };

        return new Promise<string | null>((resolve) => {
            const done = () => {
                dlg.removeEventListener("close", done);
                ok.removeEventListener("click", accept);
                cancel.removeEventListener("click", decline);
                /* alert は「閉じた」だけで足りるので、常に受理として返す */
                resolve(accepted || kind === "alert" ? input.value : null);
            };
            dlg.addEventListener("close", done);
            ok.addEventListener("click", accept);
            cancel.addEventListener("click", decline);

            dlg.showModal();
            if (kind === "prompt") {
                input.select();
            } else {
                ok.focus();
            }
        });
    }
}

/*
 * ★★ モジュール関数として取り出す理由（#173）。
 *
 * 置き換える 39 か所のうち **いくつかは `function` コールバックの中**にいる
 * （clipboard の then / catch、FileReader の onerror）。**そこから this.owner は
 * 届かない**ので、`var self = this` を足して回るか、全部アロー関数に書き換えるかに
 * なる —— **どちらも io.ts の書き方を alert の都合で変えることになる**。
 *
 * ★ 生成は遅延させる。**モジュールの読み込み時に document.body へ append すると、
 *   Node 側のハーネスが jsdom を組む前に走る**。
 *
 * ★ Designer.dialogs は**この同じインスタンス**を指す。テストが d.dialogs.alert を
 *   覆えば、ここから呼んでも覆ったほうが効く。
 */
let instance: Dialogs | null = null;

export function dialogs(): Dialogs {
    if (!instance) {
        instance = new Dialogs();
    }
    return instance;
}

/** テスト用。jsdom を組み直したら、前の <dialog> を掴んだままにしない */
export function resetDialogs(): void {
    instance = null;
}
