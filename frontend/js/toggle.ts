/* ------------------ minimize/restore bar ----------- */
/*
 * grabado: ES クラス化（HANDOVER §3 段階3-3a）。段階3-3b で .ts 化した。
 * インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 */

import { OZ } from "./oz.ts";

export class Toggle {
    /* 初期値は null で、コンストラクタが呼ぶ _switch() が必ず boolean を入れる */
    declare _state: boolean | null;
    declare _elm: HTMLElement;

    constructor(elm: HTMLElement) {
        this._state = null;
        this._elm = elm;
        OZ.Event.add(elm, "click", this._click.bind(this));

        var defaultState = true;
        if (document.location.href.match(/toolbar=hidden/)) {
            defaultState = false;
        }
        this._switch(defaultState);
    }

    _click(e: MouseEvent): void {
        this._switch(!this._state);
    }

    _switch(state: boolean): void {
        this._state = state;
        if (this._state) {
            OZ.$("bar").style.maxHeight = "";
        } else {
            OZ.$("bar").style.overflow = "hidden";
            OZ.$("bar").style.maxHeight = this._elm.offsetHeight + "px";
        }
        this._elm.className = this._state ? "on" : "off";
    }
}
