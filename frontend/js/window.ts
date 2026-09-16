/* --------------------- window ------------ */

/*
 * grabado: ES クラス化（HANDOVER §3 段階3-3a）。段階3-3b で .ts 化した。
 *
 * this.sync の bind 再代入は「プロトタイプのメソッドをインスタンスの own property で
 * 上書きする」現行の形を温存している（OZ.Event.add に同一の関数オブジェクトを渡すため）。
 * インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 *
 * クラス名 Window は lib.dom のグローバル型と同名。モジュールなので衝突はしないが、
 * import する側は名前を変える（js/globals.ts の import type { Window as SqlWindow }）。
 */

import { OZ } from "./oz.ts";
import { _ } from "./globals.ts";
/* owner の型。必ず import type で受ける（理由は js/table.ts の冒頭） */
import type { Designer } from "./wwwsqldesigner.ts";

/**
 * ボタンを包む `span.tb` を返す（grabado: #311）。
 *
 * **無ければ落とす。** input へ黙って落とすと、**隠したつもりでアイコンだけ残る** ——
 * それが #311 で 9 日間見えていた形そのもの。
 */
function wrapperOf(input: HTMLInputElement, id: string): HTMLElement {
    const wrapper = input.closest<HTMLElement>(".tb");
    if (!wrapper) {
        throw new Error(`#${id} を包む .tb が無い（index.html の構造が変わった）`);
    }
    return wrapper;
}

/** ダイアログの DOM。すべてコンストラクタで埋まる（後付けキーは無い） */
export interface WindowDom {
    container: HTMLDialogElement;
    ok: HTMLInputElement;
    cancel: HTMLInputElement;
    /*
     * grabado: #311。**アイコンはラッパーの ::before が描く**（#220 で全ボタンを
     * span.tb で包んだ）。**input に visibility を当てても span は残る**ので、
     * 隠す当て先はこちら。**取れなければ構築時に落とす**（`OZ.$` と同じ立場で、
     * 黙って input へ落とすと「隠したつもりで残る」= #311 そのものが再発する）。
     */
    okWrapper: HTMLElement;
    cancelWrapper: HTMLElement;
    title: HTMLElement;
    content: HTMLElement;
    throbber: HTMLImageElement;
}

export class Window {
    declare owner: Designer;
    declare dom: WindowDom;
    /** 0 = 閉じている / 1 = 開いている */
    declare state: number;
    /** open() が受け取る OK 時のコールバック。省略時は cancel ボタンを隠す */
    declare callback: (() => void) | undefined;

    constructor(owner: Designer) {
        this.owner = owner;
        const ok = OZ.$<HTMLInputElement>("windowok");
        const cancel = OZ.$<HTMLInputElement>("windowcancel");
        this.dom = {
            container: OZ.$<HTMLDialogElement>("window"),
            ok: ok,
            cancel: cancel,
            okWrapper: wrapperOf(ok, "windowok"),
            cancelWrapper: wrapperOf(cancel, "windowcancel"),
            title: OZ.$("windowtitle"),
            content: OZ.$("windowcontent"),
            throbber: OZ.$<HTMLImageElement>("throbber"),
        };
        this.dom.ok.value = _("windowok");
        this.dom.cancel.value = _("windowcancel");
        this.dom.throbber.alt = this.dom.throbber.title = _("throbber");
        OZ.Event.add(this.dom.ok, "click", this.ok.bind(this));
        OZ.Event.add(this.dom.cancel, "click", this.close.bind(this));
        OZ.Event.add(document, "keydown", this.key.bind(this));
        /*
         * grabado: #173。Esc は <dialog> が自分で拾って cancel → close を出す。
         * **close() を経由しないので、状態の後始末はここで受ける。**
         */
        OZ.Event.add(this.dom.container, "close", () => {
            this.state = 0;
            /*
             * grabado: #288。**OK / cancel / Esc の 3 経路がここに集まる。**
             * ok() は callback -> close() の順なので、モデルが変わった後に届く。
             * キー編集はダイアログの中で即座にモデルを変える（OK を待たない）ので、
             * **「閉じたとき」でないと 1 手にまとまらない**。テーブルの追加も、直後に
             * edit() が開くのでここで「生成 ＋ 命名」が 1 手になる。
             */
            this.owner.historyManager.commit();
        });

        this.state = 0;
        this.hideThrobber();
    }

    showThrobber(): void {
        this.dom.throbber.style.visibility = "";
    }

    hideThrobber(): void {
        this.dom.throbber.style.visibility = "hidden";
    }

    open(title: string, content: HTMLElement, callback?: () => void): void {
        this.state = 1;
        this.callback = callback;
        while (this.dom.title.childNodes.length > 1) {
            this.dom.title.removeChild(this.dom.title.childNodes[1]!);
        }

        const txt = OZ.DOM.text(title);
        this.dom.title.appendChild(txt);
        OZ.DOM.clear(this.dom.content);
        this.dom.content.appendChild(content);

        /*
         * grabado: #311。**確定があるかどうかで、右下のボタンの意味が変わる。**
         *
         *   callback あり（オプション / キー / テーブル編集）  [✓ OK] [× キャンセル]
         *   callback 無し（#io）                              [× 閉じる] だけ
         *
         * ★★ **隠す当て先はラッパー。** input に当てても、アイコンを描いているのは
         *   `span.tb` の ::before なので**アイコンだけ残る**（#220 で包んだ日から
         *   9 日間、押しても何も起きない × が出ていた）。
         *
         * ★ **`visibility` のままにする。`display: none` にしない** —— visibility は
         *   場所を保持するので、`float: right` の OK の位置が今と変わらない。
         *
         * ★ **class は `i-windowok` を残したまま `is-close` を足す** —— 差し替えると
         *   tests/dist/smoke.spec.ts が見ている `.tb.i-windowok` のセレクタが外れる。
         *   アイコンの実体は styles/icons.css が `--icon` を上書きして替える。
         */
        this.dom.cancelWrapper.style.visibility = this.callback ? "" : "hidden";
        this.dom.ok.value = _(this.callback ? "windowok" : "close");
        this.dom.okWrapper.classList.toggle("is-close", !this.callback);
        /*
         * grabado: #173。showModal() が中央寄せ・::backdrop・フォーカストラップ・
         * 背後の inert 化・Esc を持つ。**JS の px 計算（scroll + (win - offsetWidth) / 2）と
         * #background のサイズ追従（sync）は、まるごと要らなくなった。**
         */
        this.dom.container.showModal();

        const formElements = ["input", "select", "textarea"];
        const all = this.dom.container.getElementsByTagName("*");
        for (let i = 0; i < all.length; i++) {
            if (formElements.indexOf(all[i]!.tagName.toLowerCase()) != -1) {
                (all[i] as HTMLElement).focus();
                break;
            }
        }
    }

    key(e: KeyboardEvent): void {
        if (!this.state) {
            return;
        }
        /*
         * grabado: #173。**Esc の分岐は消えた** —— <dialog> が標準で拾う。
         * keyCode（非推奨）も key に移した。Enter = OK だけがここに残る。
         */
        if (e.key === "Enter") {
            this.ok(e);
        }
    }

    ok(e?: Event): void {
        if (this.callback) {
            this.callback();
        }
        this.close();
    }

    close(): void {
        if (!this.state) {
            return;
        }
        this.state = 0;
        this.dom.container.close();
    }
}
