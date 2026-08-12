/* (c) 2007 - now() Ondrej Zara, 1.7 */
/*
 * grabado: HANDOVER §3 段階3-1 で .ts 化した（js/ で最初の 1 本）。
 *
 * export ＋ window 登録の 2 本立てにしてある。まだ .js のままの 15 本が裸の OZ を
 * 参照するので、window への登録は参照側が全部 .ts になる段階3-4 まで残す
 * （docs/ARCHITECTURE.md §5.1）。そのとき declare global ごと消える。
 *
 * IE 専用分岐と参照 0 の API（select / gecko / webkit / khtml）は撤去した。
 * 段階2 の polyfill 撤去と同じ論法で、対象実行系（Chromium 151 / jsdom 29）の
 * どちらでも一度も評価されないことを実測してある（CUSTOMIZATIONS.md の決定ログ）。
 *
 * ブラウザ判別子（opera / ie）は段階3-1 では値 false のプロパティだけを残していた
 * （まだ .js だった js/io.js と js/tablemanager.js が読むため）。段階3-3b で参照側の
 * 分岐を畳んだので、プロパティごと撤去した。
 */

export interface OzRequestOptions {
    data?: string | false;
    method?: string;
    headers?: Record<string, string>;
    xml?: boolean;
}

export type OzRequestCallback = (
    data: unknown,
    status: number,
    headers: Record<string, string>,
) => void;

/** OZ.DOM.elm / OZ.Style.set が受ける「属性とスタイルの混在バッグ」 */
export type OzElmOptions = Record<string, unknown>;

/** OZ.Event が控えるリスナー 1 件分（element / イベント名 / 実際に登録した関数） */
type OzEventRecord = [EventTarget | null, string, EventListener];

export const OZ = {
    /*
     * 文字列なら getElementById、それ以外は素通し。
     * 戻りを non-null で宣言してあるのは、呼び出し 60 箇所に実行時ガードを足させないため
     * （存在しない id を渡せば現行も同じ場所で落ちる）。
     *
     * grabado: 型にだけオーバーロードを被せた（HANDOVER §3 段階3-2。実行コードは無変更で、
     * as は emit で消える）。単一シグネチャ <T extends EventTarget = HTMLElement>(x: string | T): T
     * だと、文字列を渡したとき T の推論候補に string が入り、制約違反で EventTarget に
     * フォールバックする（既定の HTMLElement は候補が 1 つも無いときしか使われない）。
     * .js のうちは checkJs: false で露見しなかったが、.ts から呼ぶと
     * OZ.$("rubberband") が EventTarget になって代入先と合わない。
     * 3 本目は引数が union の呼び出し（本ファイル内の OZ.$(elm) / OZ.$(arr[0]) など）用。
     */
    $: function <T extends EventTarget = HTMLElement>(x: string | T): T {
        return (typeof x == "string" ? document.getElementById(x) : x) as T;
    } as {
        (x: string): HTMLElement;
        <T extends EventTarget>(x: T): T;
        <T extends EventTarget>(x: string | T): T;
    },
    Event: {
        _id: 0,
        _byName: {} as Record<string, Record<number, OzEventRecord>>,
        _byID: {} as Record<number, OzEventRecord>,
        /*
         * grabado: cb をジェネリックにした（HANDOVER §3 段階3-2。型だけの変更）。
         *
         * EventListener は (e: Event) => void の呼び出しシグネチャなので strictFunctionTypes が
         * 効き、click(e: MouseEvent) を bind して渡すと引数が反変で TS2345 になる。登録側で
         * as EventListener を撒くと段階3-2 の 21 箇所＋段階3-3 の 40 箇所超に散るため、
         * ここで 1 度だけ受け側の型を広げる。実行コードは変えていない（下の as は emit で消える）。
         */
        add: function <E extends Event = Event>(
            elm: string | EventTarget,
            event: string,
            cb: (e: E) => void,
        ): number {
            var id = OZ.Event._id++;
            var element = OZ.$(elm);
            /* grabado: 元は attachEvent がある環境だけ cb を this 束縛でラップしていた */
            var fnc = cb as EventListener;
            var rec: OzEventRecord = [element, event, fnc];
            var parts = event.split(" ");
            while (parts.length) {
                var e = parts.pop()!;
                if (element) {
                    element.addEventListener(e, fnc, false);
                }
                if (!(e in OZ.Event._byName)) {
                    OZ.Event._byName[e] = {};
                }
                OZ.Event._byName[e]![id] = rec;
            }
            OZ.Event._byID[id] = rec;
            return id;
        },
        remove: function (id: number): void {
            var rec = OZ.Event._byID[id];
            if (!rec) {
                return;
            }
            var elm = rec[0];
            var parts = rec[1].split(" ");
            while (parts.length) {
                var e = parts.pop()!;
                if (elm) {
                    elm.removeEventListener(e, rec[2], false);
                }
                delete OZ.Event._byName[e]![id];
            }
            delete OZ.Event._byID[id];
        },
        stop: function (e: Event): void {
            /* grabado: cancelBubble フォールバックを撤去（IE 専用） */
            e.stopPropagation();
        },
        prevent: function (e: Event): void {
            /* grabado: returnValue フォールバックを撤去（IE 専用） */
            e.preventDefault();
        },
        /*
         * grabado: srcElement フォールバックを撤去（IE 専用）。
         * 戻りを non-null の HTMLElement にしてあるのは $ と同じ理由で、
         * 呼び出し 5 箇所（nodeName を読む / dom.title と比較する）がそのまま通るため。
         */
        target: function (e: Event): HTMLElement {
            return e.target as HTMLElement;
        },
    },
    /*
     * grabado: OZ.Class / implement / extend / dispatch を削除した（HANDOVER §3 段階2）。
     * アプリからの参照が 1 件も無く、arguments.callee 依存で strict では動かないため。
     * 実際に使われている継承は SQL.Visual を頂点とする ES クラス階層（js/visual.js）、
     * pub/sub は SQL.publish / SQL.subscribe（js/globals.js）。
     */
    DOM: {
        elm: function <K extends keyof HTMLElementTagNameMap>(
            name: K,
            opts?: OzElmOptions,
        ): HTMLElementTagNameMap[K] {
            var elm = document.createElement(name);
            for (var p in opts) {
                var val = opts[p];
                if (p == "class") {
                    p = "className";
                }
                if (p in elm) {
                    (elm as unknown as Record<string, unknown>)[p] = val;
                }
            }
            OZ.Style.set(elm, opts);
            return elm;
        },
        text: function (str: string): Text {
            return document.createTextNode(str);
        },
        clear: function (node: Node): void {
            while (node.firstChild) {
                node.removeChild(node.firstChild);
            }
        },
        pos: function (elm: string | HTMLElement): [number, number] {
            /* relative to _viewport_ */
            var cur = OZ.$(elm) as HTMLElement;
            var html = cur.ownerDocument.documentElement;
            var parent = cur.parentNode as HTMLElement;
            /* grabado: 元は var x = (y = 0); で y が暗黙グローバルだった
               （HANDOVER §3 段階2）。ESM は常に strict なので Vite ビルドでは
               ここで ReferenceError になり、ミニマップをドラッグできなかった。 */
            var x = 0;
            var y = 0;
            if (cur == html) {
                return [x, y];
            }
            /* grabado: 元は while (1)。TS の制御フロー解析が無限ループと認識するのは
               while (true) だけで、1 のままだと「戻り値が undefined になりうる」と
               判定される。定数の真偽値としては完全に同値（HANDOVER §3 段階3-1）。 */
            while (true) {
                if (OZ.Style.get(cur, "position") == "fixed") {
                    x += cur.offsetLeft;
                    y += cur.offsetTop;
                    return [x, y];
                }

                /* grabado: 元は OZ.opera のときだけスクロール量を引かない分岐があった */
                x -= parent.scrollLeft;
                y -= parent.scrollTop;
                if (parent == cur.offsetParent || cur.parentNode == html) {
                    x += cur.offsetLeft;
                    y += cur.offsetTop;
                    cur = parent;
                }

                if (parent == html) {
                    return [x, y];
                }
                parent = parent.parentNode as HTMLElement;
            }
        },
        scroll: function (): [number, number] {
            var x =
                document.documentElement.scrollLeft ||
                document.body.scrollLeft ||
                0;
            var y =
                document.documentElement.scrollTop ||
                document.body.scrollTop ||
                0;
            return [x, y];
        },
        win: function (avail?: boolean): [number, number] {
            return avail
                ? [window.innerWidth, window.innerHeight]
                : [
                      document.documentElement.clientWidth,
                      document.documentElement.clientHeight,
                  ];
        },
        hasClass: function (node: string | Element, className: string): boolean {
            var cn = OZ.$<Element>(node).className;
            var arr = cn ? cn.split(" ") : [];
            return arr.indexOf(className) != -1;
        },
        addClass: function (node: string | Element, className: string): void {
            if (OZ.DOM.hasClass(node, className)) {
                return;
            }
            var cn = OZ.$<Element>(node).className;
            var arr = cn ? cn.split(" ") : [];
            arr.push(className);
            OZ.$<Element>(node).className = arr.join(" ");
        },
        removeClass: function (node: string | Element, className: string): void {
            if (!OZ.DOM.hasClass(node, className)) {
                return;
            }
            var cn = OZ.$<Element>(node).className;
            var arr = cn ? cn.split(" ") : [];
            var arr = arr.filter(function ($) {
                return $ != className;
            });
            OZ.$<Element>(node).className = arr.join(" ");
        },
        /*
         * [root, child, child, …] を可変長で受ける。シグネチャだけ与えて本体は
         * arguments のまま（rest 変数を読む形に書き換えると実行コードが変わるため）。
         */
        append: function (..._groups: Array<Array<string | Node>>): void {
            if (arguments.length == 1) {
                var arr = arguments[0] as Array<string | Node>;
                var root = OZ.$(arr[0]!);
                for (var i = 1; i < arr.length; i++) {
                    root.appendChild(OZ.$(arr[i]!));
                }
            } else
                for (var i = 0; i < arguments.length; i++) {
                    OZ.DOM.append(arguments[i]);
                }
        },
    },
    Style: {
        /*
         * grabado: currentStyle フォールバック（IE 専用）と、その相方だった
         * 「getComputedStyle があるか」の外側 if を撤去した。getComputedStyle が
         * 実在することは両実行系で実測済みで、取得に失敗する場合は元から try/catch が
         * false を返して受け止めている。
         */
        get: function (elm: Element, prop: string): string | false {
            try {
                var cs = elm.ownerDocument.defaultView!.getComputedStyle(elm, "");
            } catch (e) {
                return false;
            }
            if (!cs) {
                return false;
            }
            return (cs as unknown as Record<string, string>)[prop] as string;
        },
        set: function (elm: HTMLElement, obj?: OzElmOptions): void {
            for (var p in obj) {
                var val = obj[p];
                /* grabado: opacity -> filter（IE 専用）を撤去。float は cssFloat 固定 */
                if (p == "float") {
                    p = "cssFloat";
                }
                if (p in elm.style) {
                    (elm.style as unknown as Record<string, unknown>)[p] = val;
                }
            }
        },
    },
    /*
     * grabado: ActiveXObject 分岐と、その相方だった「XMLHttpRequest があるか」の
     * 判定を撤去した（HANDOVER §3 段階3-1）。両実行系で window.XMLHttpRequest の
     * 実在を実測しており、else 側の return false には到達しない。
     * 戻り型に false を残してあるのは、tests/node/harness.ts が Request を
     * fs 読みに差し替えて false を返すため（呼び出し側の契約は現行のまま）。
     */
    Request: function (
        url: string,
        callback?: OzRequestCallback,
        options?: OzRequestOptions,
    ): XMLHttpRequest | false {
        var o: Required<OzRequestOptions> = {
            data: false,
            method: "get",
            headers: {},
            xml: false,
        };
        for (var p in options) {
            (o as unknown as Record<string, unknown>)[p] = (
                options as unknown as Record<string, unknown>
            )[p];
        }
        o.method = o.method.toUpperCase();

        var xhr = new XMLHttpRequest();
        xhr.open(o.method, url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState != 4) {
                return;
            }
            if (!callback) {
                return;
            }
            var data = o.xml ? xhr.responseXML : xhr.responseText;
            var headers: Record<string, string> = {};
            var h: string | string[] = xhr.getAllResponseHeaders();
            if (h) {
                h = h.split(/[\r\n]/);
                for (var i = 0; i < h.length; i++)
                    if (h[i]) {
                        var v = h[i]!.match(/^([^:]+): *(.*)$/);
                        headers[v![1]!] = v![2]!;
                    }
            }
            callback(data, xhr.status, headers);
        };
        if (o.method == "POST") {
            xhr.setRequestHeader(
                "Content-Type",
                "application/x-www-form-urlencoded"
            );
        }
        for (var p in o.headers) {
            xhr.setRequestHeader(p, o.headers[p]!);
        }
        xhr.send(o.data || null);
        return xhr;
    },
};

declare global {
    interface Window {
        OZ: typeof OZ;
    }
}

/* grabado: ESM バンドル後もグローバルであり続けるよう window に載せる（HANDOVER §3 段階1） */
window.OZ = OZ;

/*
 * grabado: ES5 polyfill 群を削除した（HANDOVER §3 段階2）。
 *
 * prototype 版（Function.prototype.bind、Array.prototype の indexOf / lastIndexOf /
 * forEach / every / some / map / filter）は if (!X) ガード付きで、jsdom / Chromium の
 * どちらにもネイティブが実在するため本体は一度も評価されていなかった（実測確認済み）。
 *
 * 非標準の静的版（Array.indexOf / lastIndexOf / forEach / every / some / map / filter）は
 * ネイティブに無く実際にインストールされていたが、参照が 1 件も無いことを確認して削除した。
 */
