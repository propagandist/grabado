/* ------------------ minimize/restore bar ----------- */

/*
 * grabado: ES クラス化した（HANDOVER §3 段階3-3）。段階2 で SQL.Visual 階層に施した変換と
 * 同じ形で、prototype メソッドをクラス本体へ移しただけ。フィールド代入の順序も呼び出し順も
 * 1 行も変えていない（クラスフィールド初期化子は使わない）。
 */
class Toggle {
    constructor(elm) {
        this._state = null;
        this._elm = elm;
        OZ.Event.add(elm, "click", this._click.bind(this));

        var defaultState = true;
        if (document.location.href.match(/toolbar=hidden/)) {
            defaultState = false;
        }
        this._switch(defaultState);
    }

    _click(e) {
        this._switch(!this._state);
    }

    _switch(state) {
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

SQL.Toggle = Toggle;
