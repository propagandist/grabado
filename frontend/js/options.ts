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
import { _ } from "./globals.ts";
/* owner の型。必ず import type で受ける（理由は js/table.ts の冒頭） */
import type { Designer } from "./wwwsqldesigner.ts";

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
    declare owner: Designer;
    declare dom: OptionsDom;

    constructor(owner: Designer) {
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

        /*
         * grabado: #235。**"auto" は CONFIG.STYLES に入れない** —— あれは
         * 「実在する CSS の一覧」で、特殊値を混ぜると意味が変わる。出すのはここ 1 か所
         * なので、先頭に足すのもここでよい。
         */
        var styles = [CONFIG.STYLE_AUTO as string].concat(CONFIG.STYLES);
        /*
         * ★★ **突き合わせるのは storedStyle()。** getOption("style") は "auto" を
         *   実在のテーマへ解決して返すので、それで比べると **auto を選んでいるのに
         *   material-dark が選択済みに見え、OK を押した瞬間に本当に焼かれる**。
         */
        var stored = this.owner.storedStyle();
        OZ.DOM.clear(this.dom.optionstyle);
        for (var i = 0; i < styles.length; i++) {
            var o = OZ.DOM.elm("option");
            o.value = styles[i]!;
            /*
             * 他の 3 本は CSS 名をそのまま出す（名前なので訳さない）。"auto" だけは
             * 名前ではなく語なので _() を通す —— **キーが "auto" 自身**なので、
             * 訳の無い locale では "auto" と出る（js/globals.ts の _()）。
             * 21 本のうち 19 本は元から部分訳で、そこへ壊れたキー名を出さないための形。
             */
            o.innerHTML =
                styles[i] === CONFIG.STYLE_AUTO ? _(CONFIG.STYLE_AUTO) : styles[i]!;
            this.dom.optionstyle.appendChild(o);
            if (stored == styles[i]) {
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

        /*
         * grabado: #172 で足した 1 行。**ここが無いと、テーマを変えてもリロードするまで
         * 見た目が変わらない** —— applyStyle() の呼び出しはコンストラクタの 1 か所しか
         * なかった。テーマが 2 本のあいだは気づきにくく、
         * tests/dist ／ tests/image は手で d.applyStyle() を呼んでいたので見えていなかった。
         */
        this.owner.applyStyle();
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
