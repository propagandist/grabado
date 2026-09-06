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

/** ダイアログの DOM。すべてコンストラクタで埋まる（後付けキーは無い） */
export interface WindowDom {
    container: HTMLDialogElement;
    ok: HTMLInputElement;
    cancel: HTMLInputElement;
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
        this.dom = {
            container: OZ.$<HTMLDialogElement>("window"),
            ok: OZ.$<HTMLInputElement>("windowok"),
            cancel: OZ.$<HTMLInputElement>("windowcancel"),
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

        var txt = OZ.DOM.text(title);
        this.dom.title.appendChild(txt);
        OZ.DOM.clear(this.dom.content);
        this.dom.content.appendChild(content);

        this.dom.cancel.style.visibility = this.callback ? "" : "hidden";
        /*
         * grabado: #173。showModal() が中央寄せ・::backdrop・フォーカストラップ・
         * 背後の inert 化・Esc を持つ。**JS の px 計算（scroll + (win - offsetWidth) / 2）と
         * #background のサイズ追従（sync）は、まるごと要らなくなった。**
         */
        this.dom.container.showModal();

        var formElements = ["input", "select", "textarea"];
        var all = this.dom.container.getElementsByTagName("*");
        for (var i = 0; i < all.length; i++) {
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
