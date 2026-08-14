/* --------------------- options ------------ */

/*
 * grabado: ES クラス化（HANDOVER §3 段階3-3a）。段階3-3b で .ts 化した。
 *
 * this.save の bind 再代入は「プロトタイプのメソッドをインスタンスの own property で
 * 上書きする」現行の形を温存している（Window.open にコールバックとして渡すため）。
 * インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 *
 * dom は container / btn をコンストラクタで、残り 9 個を build() で埋める（キーは固定なので
 * 形態 (i)）。型は完成形を宣言し、嘘は初期化の 1 行に閉じ込める（段階3-2 の原理）。
 */

import { OZ } from "./oz.ts";
import { CONFIG } from "./config.ts";
import { _, type SqlDesigner } from "./globals.ts";

/** 不変条件は「build() を抜けた時点で全キーが埋まっている」 */
export interface OptionsDom {
    container: HTMLElement;
    btn: HTMLInputElement;
    optionlocale: HTMLSelectElement;
    optiondb: HTMLSelectElement;
    optionsnap: HTMLInputElement;
    optionpattern: HTMLInputElement;
    optionstyle: HTMLSelectElement;
    optionhide: HTMLInputElement;
    optionvector: HTMLInputElement;
    optionshowsize: HTMLInputElement;
    optionshowtype: HTMLInputElement;
}

export class Options {
    declare owner: SqlDesigner;
    declare dom: OptionsDom;

    constructor(owner: SqlDesigner) {
        this.owner = owner;
        /* 型は構築完了後の状態。残り 9 個は build() が埋める */
        this.dom = {
            container: OZ.$("opts"),
            btn: OZ.$<HTMLInputElement>("options"),
        } as unknown as OptionsDom;
        this.dom.btn.value = _("options");
        this.save = this.save.bind(this);
        this.build();
    }

    build(): void {
        this.dom.optionlocale = OZ.$<HTMLSelectElement>("optionlocale");
        this.dom.optiondb = OZ.$<HTMLSelectElement>("optiondb");
        this.dom.optionsnap = OZ.$<HTMLInputElement>("optionsnap");
        this.dom.optionpattern = OZ.$<HTMLInputElement>("optionpattern");
        this.dom.optionstyle = OZ.$<HTMLSelectElement>("optionstyle");
        this.dom.optionhide = OZ.$<HTMLInputElement>("optionhide");
        this.dom.optionvector = OZ.$<HTMLInputElement>("optionvector");
        this.dom.optionshowsize = OZ.$<HTMLInputElement>("optionshowsize");
        this.dom.optionshowtype = OZ.$<HTMLInputElement>("optionshowtype");

        var ids = [
            "language",
            "db",
            "snap",
            "pattern",
            "style",
            "hide",
            "vector",
            "showsize",
            "showtype",
            "optionsnapnotice",
            "optionpatternnotice",
            "optionsnotice",
        ];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i]!;
            var elm = OZ.$(id);
            elm.innerHTML = _(id);
        }

        var ls = CONFIG.AVAILABLE_LOCALES;
        OZ.DOM.clear(this.dom.optionlocale);
        for (var i = 0; i < ls.length; i++) {
            var o = OZ.DOM.elm("option");
            o.value = ls[i]!;
            o.innerHTML = ls[i]!;
            this.dom.optionlocale.appendChild(o);
            if (this.owner.getOption("locale") == ls[i]) {
                this.dom.optionlocale.selectedIndex = i;
            }
        }

        var dbs = CONFIG.AVAILABLE_DBS;
        OZ.DOM.clear(this.dom.optiondb);
        for (var i = 0; i < dbs.length; i++) {
            var o = OZ.DOM.elm("option");
            o.value = dbs[i]!;
            o.innerHTML = dbs[i]!;
            this.dom.optiondb.appendChild(o);
            if (this.owner.getOption("db") == dbs[i]) {
                this.dom.optiondb.selectedIndex = i;
            }
        }

        var styles = CONFIG.STYLES;
        OZ.DOM.clear(this.dom.optionstyle);
        for (var i = 0; i < styles.length; i++) {
            var o = OZ.DOM.elm("option");
            o.value = styles[i]!;
            o.innerHTML = styles[i]!;
            this.dom.optionstyle.appendChild(o);
            if (this.owner.getOption("style") == styles[i]) {
                this.dom.optionstyle.selectedIndex = i;
            }
        }

        OZ.Event.add(this.dom.btn, "click", this.click.bind(this));

        this.dom.container.parentNode!.removeChild(this.dom.container);
    }

    save(): void {
        this.owner.setOption("locale", this.dom.optionlocale.value);
        this.owner.setOption("db", this.dom.optiondb.value);
        this.owner.setOption("snap", this.dom.optionsnap.value);
        this.owner.setOption("pattern", this.dom.optionpattern.value);
        this.owner.setOption("style", this.dom.optionstyle.value);
        this.owner.setOption("hide", this.dom.optionhide.checked ? "1" : "");
        this.owner.setOption(
            "vector",
            this.dom.optionvector.checked ? "1" : ""
        );
        this.owner.setOption(
            "showsize",
            this.dom.optionshowsize.checked ? "1" : ""
        );
        this.owner.setOption(
            "showtype",
            this.dom.optionshowtype.checked ? "1" : ""
        );
    }

    click(): void {
        this.owner.window.open(_("options"), this.dom.container, this.save);
        /*
         * grabado: getOption の戻りは string | number（既定値に 0 と false がある）で、
         * ここは現行が暗黙変換に依存している。値側にキャストを置いて書き方を揃えた
         * （実行コードは無変更。段階3-2 の setAttribute 4 箇所と同じ扱い）。
         */
        this.dom.optionsnap.value = this.owner.getOption("snap") as string;
        this.dom.optionpattern.value = this.owner.getOption(
            "pattern"
        ) as string;
        this.dom.optionhide.checked = this.owner.getOption(
            "hide"
        ) as unknown as boolean;
        this.dom.optionvector.checked = this.owner.getOption(
            "vector"
        ) as unknown as boolean;
        this.dom.optionshowsize.checked = this.owner.getOption(
            "showsize"
        ) as unknown as boolean;
        this.dom.optionshowtype.checked = this.owner.getOption(
            "showtype"
        ) as unknown as boolean;
    }
}
