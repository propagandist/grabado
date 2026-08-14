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
import { _, type SqlDesigner } from "./globals.ts";

/** ダイアログの DOM。すべてコンストラクタで埋まる（後付けキーは無い） */
export interface WindowDom {
    container: HTMLElement;
    background: HTMLElement;
    ok: HTMLInputElement;
    cancel: HTMLInputElement;
    title: HTMLElement;
    content: HTMLElement;
    throbber: HTMLImageElement;
}

export class Window {
    declare owner: SqlDesigner;
    declare dom: WindowDom;
    /** 0 = 閉じている / 1 = 開いている */
    declare state: number;
    /** open() が受け取る OK 時のコールバック。省略時は cancel ボタンを隠す */
    declare callback: (() => void) | undefined;

    constructor(owner: SqlDesigner) {
        this.owner = owner;
        this.dom = {
            container: OZ.$("window"),
            background: OZ.$("background"),
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

        this.sync = this.sync.bind(this);

        OZ.Event.add(window, "scroll", this.sync);
        OZ.Event.add(window, "resize", this.sync);
        this.state = 0;
        this.hideThrobber();

        this.sync();
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
        this.dom.background.style.visibility = "visible";
        OZ.DOM.clear(this.dom.content);
        this.dom.content.appendChild(content);

        var win = OZ.DOM.win();
        var scroll = OZ.DOM.scroll();
        this.dom.container.style.left =
            Math.round(
                scroll[0] + (win[0] - this.dom.container.offsetWidth) / 2
            ) + "px";
        this.dom.container.style.top =
            Math.round(
                scroll[1] + (win[1] - this.dom.container.offsetHeight) / 2
            ) + "px";

        this.dom.cancel.style.visibility = this.callback ? "" : "hidden";
        this.dom.container.style.visibility = "visible";

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
        if (e.keyCode == 13) {
            this.ok(e);
        }
        if (e.keyCode == 27) {
            this.close();
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
        this.dom.background.style.visibility = "hidden";
        this.dom.container.style.visibility = "hidden";
    }

    sync(): void {
        /* adjust background position */
        var dims = OZ.DOM.win();
        var scroll = OZ.DOM.scroll();
        this.dom.background.style.width = dims[0] + "px";
        this.dom.background.style.height = dims[1] + "px";
        this.dom.background.style.left = scroll[0] + "px";
        this.dom.background.style.top = scroll[1] + "px";
    }
}
