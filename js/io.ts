/*
 * grabado: ES クラス化（HANDOVER §3 段階3-3a）。段階3-3b で .ts 化した。
 *
 * this.saveresponse 以下 4 本の bind 再代入は「プロトタイプのメソッドをインスタンスの
 * own property で上書きする」現行の形を温存している（OZ.Request に同一の関数オブジェクトを
 * 渡すため）。インスタンスプロパティを declare で宣言する理由は js/visual.ts の冒頭。
 *
 * dom バッグは「文字列キーの動的代入」形態（docs/ARCHITECTURE.md §5.4 の (ii)）。
 * 型は完成形（IoDom）を宣言し、嘘は初期化とループ代入の 2 行に閉じ込める（段階3-2 の原理）。
 *
 * Dropbox 連携は段階4-3a で撤去した（dropbox.js の CDN 依存・dropbox-oauth-receiver.html・
 * CONFIG.DROPBOX_KEY・ボタン 3 つ・locale 21 行ごと）。「Docker で各自ローカル稼働・正本は
 * git 管理ファイル・共有は PR」という HANDOVER §2 の形と役割が重複し、これで index.html の
 * 外部依存が 0 になる。判断の根拠は CUSTOMIZATIONS.md の決定ログ。
 */

import { OZ } from "./oz.ts";
import { CONFIG } from "./config.ts";
import { _ } from "./globals.ts";
/* owner の型。必ず import type で受ける（理由は js/table.ts の冒頭） */
import type { Designer } from "./wwwsqldesigner.ts";

/**
 * 保存/読込ダイアログの DOM。
 *
 * 不変条件は「コンストラクタを抜けた時点で全キーが埋まっている」。ボタン 17 個は
 * id 配列のループが埋め、直後に elm.value を書くのでいずれも input 要素。
 */
export interface IoDom {
    container: HTMLElement;
    ta: HTMLTextAreaElement;
    backend: HTMLSelectElement;
    saveload: HTMLInputElement;
    clientlocalsave: HTMLInputElement;
    clientsave: HTMLInputElement;
    clientlocalload: HTMLInputElement;
    clientlocallist: HTMLInputElement;
    clientload: HTMLInputElement;
    clientsql: HTMLInputElement;
    quicksave: HTMLInputElement;
    serversave: HTMLInputElement;
    serverload: HTMLInputElement;
    serverlist: HTMLInputElement;
    clientcopy: HTMLInputElement;
    clientpaste: HTMLInputElement;
    clientdownloadxml: HTMLInputElement;
    clientdownloadtxt: HTMLInputElement;
    clientloadfromfile: HTMLInputElement;
    serverimport: HTMLInputElement;
}

export class IO {
    declare owner: Designer;
    /** server load/save で最後に使った名前 */
    declare _name: string;
    /** localStorage で最後に使った名前 */
    declare lastUsedName: string;
    /** serverload が控える名前。loadresponse が setTitle に渡す */
    declare name: string;
    declare dom: IoDom;

    constructor(owner: Designer) {
        this.owner = owner;
        this._name = ""; /* last used name with server load/save */
        this.lastUsedName = ""; /* last used name with local storage load/save */
        /* 型は構築完了後の状態（IoDom）。この行から下の 2 つのループが残りを埋める */
        this.dom = {
            container: OZ.$("io"),
        } as unknown as IoDom;

        var ids = [
            "saveload",
            "clientlocalsave",
            "clientsave",
            "clientlocalload",
            "clientlocallist",
            "clientload",
            "clientsql",
            "quicksave",
            "serversave",
            "serverload",
            "serverlist",
            "clientcopy",
            "clientpaste",
            "clientdownloadxml",
            "clientdownloadtxt",
            "clientloadfromfile",
            "serverimport",
        ];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i]!;
            var elm = OZ.$<HTMLInputElement>(id);
            /* 動的キーの代入はこの 1 行だけ。完成形は上の IoDom が宣言している */
            (this.dom as unknown as Record<string, HTMLInputElement>)[id] = elm;
            elm.value = _(id);
        }

        this.dom.quicksave.value += " (F2)";

        var ids = ["client", "server", "output", "backendlabel"];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i]!;
            /* grabado: 上のループの elm と型が違う（こちらはラベル要素）ため改名した。
               型のためのコード変更で、読み出しは直後の 1 行だけ（段階3-3b） */
            var labelElm = OZ.$(id);
            labelElm.innerHTML = _(id);
        }

        this.dom.ta = OZ.$<HTMLTextAreaElement>("textarea");
        this.dom.backend = OZ.$<HTMLSelectElement>("backend");

        this.dom.container.parentNode!.removeChild(this.dom.container);
        this.dom.container.style.visibility = "";

        this.saveresponse = this.saveresponse.bind(this);
        this.loadresponse = this.loadresponse.bind(this);
        this.listresponse = this.listresponse.bind(this);
        this.importresponse = this.importresponse.bind(this);

        OZ.Event.add(this.dom.saveload, "click", this.click.bind(this));
        OZ.Event.add(
            this.dom.clientlocalsave,
            "click",
            this.clientlocalsave.bind(this)
        );
        OZ.Event.add(this.dom.clientsave, "click", this.clientsave.bind(this));
        OZ.Event.add(
            this.dom.clientlocalload,
            "click",
            this.clientlocalload.bind(this)
        );
        OZ.Event.add(
            this.dom.clientlocallist,
            "click",
            this.clientlocallist.bind(this)
        );
        OZ.Event.add(this.dom.clientload, "click", this.clientload.bind(this));
        OZ.Event.add(this.dom.clientsql, "click", this.clientsql.bind(this));
        OZ.Event.add(this.dom.quicksave, "click", this.quicksave.bind(this));
        OZ.Event.add(this.dom.serversave, "click", this.serversave.bind(this));
        OZ.Event.add(this.dom.serverload, "click", this.serverload.bind(this));
        OZ.Event.add(this.dom.serverlist, "click", this.serverlist.bind(this));
        OZ.Event.add(this.dom.serverimport, "click", this.serverimport.bind(this));
        OZ.Event.add(this.dom.clientcopy, "click", this.clientcopy.bind(this));
        OZ.Event.add(this.dom.clientpaste, "click", this.clientpaste.bind(this));
        OZ.Event.add(this.dom.clientdownloadxml, "click", this.clientdownloadxml.bind(this));
        OZ.Event.add(this.dom.clientdownloadtxt, "click", this.clientdownloadtxt.bind(this));
        OZ.Event.add(this.dom.clientloadfromfile, "click", this.clientloadfromfile.bind(this));
        OZ.Event.add(document, "keydown", this.press.bind(this));
        this.build();
    }

    build(): void {
        OZ.DOM.clear(this.dom.backend);

        var bs = CONFIG.AVAILABLE_BACKENDS;
        /*
         * grabado: CONFIG.DEFAULT_BACKEND は文字列ではなく配列 ["php-mysql"]（upstream の
         * 取り違え）。下の bs[i] == be が緩い比較で配列を文字列化するため現行は意図どおり
         * 動いており、値を直すのは実行コード変更になるので型で受けるだけにした。
         * 是正は HANDOVER §5 の backend 移植で既定 backend の扱いごと決める（段階3-3b）。
         */
        var be: string | string[] = CONFIG.DEFAULT_BACKEND;
        var r = window.location.search.substring(1).match(/backend=([^&]*)/);
        if (r) {
            /* grabado: var 宣言が抜けていた（HANDOVER §3 段階2）。ESM は常に strict なので
               Vite ビルドではここで ReferenceError になり、?backend= 付き URL で
               アプリが起動しなかった。 */
            var req = r[1]!;
            if (bs.indexOf(req) != -1) {
                be = req;
            }
        }
        for (var i = 0; i < bs.length; i++) {
            var o = OZ.DOM.elm("option");
            o.value = bs[i]!;
            o.innerHTML = bs[i]!;
            this.dom.backend.appendChild(o);
            if (bs[i] == (be as string)) {
                this.dom.backend.selectedIndex = i;
            }
        }
    }

    click(): void {
        /* open io dialog */
        this.build();
        this.dom.ta.value = "";
        this.dom.clientsql.value =
            _("clientsql") + " (" + this.owner.palette.db() + ")";
        this.owner.window.open(_("saveload"), this.dom.container);
    }

    fromXMLText(xml: string): void {
        try {
            /*
             * grabado: ActiveXObject 分岐と、その相方だった「DOMParser があるか」の判定を
             * 撤去した（HANDOVER §3 段階3-3b）。Chromium 151 / jsdom 29 の両方で
             * "ActiveXObject" in window は false、window.DOMParser は true と実測済み。
             */
            var parser = new DOMParser();
            var xmlDoc = parser.parseFromString(xml, "text/xml");
        } catch (e) {
            alert(_("xmlerror") + ": " + (e as Error).message);
            return;
        }
        this.fromXML(xmlDoc);
    }

    fromXML(xmlDoc: Document | null): boolean {
        if (!xmlDoc || !xmlDoc.documentElement) {
            alert(_("xmlerror") + ": Null document");
            return false;
        }
        this.owner.fromXML(xmlDoc.documentElement);
        this.owner.window.close();
        return true;
    }

    clientsave(): void {
        var xml = this.owner.toXML();
        this.dom.ta.value = xml;
    }

    clientload(): void {
        var xml = this.dom.ta.value;
        if (!xml) {
            alert(_("empty"));
            return;
        }

        this.fromXMLText(xml);
    }

    clientcopy(): void {
        var xml = this.owner.toXML();
        navigator.clipboard.writeText(xml).then(function() {
            alert(_("clientsave") + " - Copied to clipboard!");
        }).catch(function(err) {
            alert("Failed to copy: " + err);
        });
    }

    clientpaste(): void {
        var self = this;
        navigator.clipboard.readText().then(function(xml) {
            if (!xml) {
                alert(_("empty"));
                return;
            }
            self.fromXMLText(xml);
        }).catch(function(err) {
            alert("Failed to paste: " + err);
        });
    }

    clientdownloadxml(): void {
        var xml = this.owner.toXML();
        this.downloadFile(xml, "new-database.xml", "application/xml");
    }

    clientdownloadtxt(): void {
        var xml = this.owner.toXML();
        this.downloadFile(xml, "new-database.txt", "text/plain");
    }
    downloadFile(content: string, filename: string, mimeType: string): void {
        var blob = new Blob([content], { type: mimeType });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    /*
     * grabado: suffix 引数は段階4-3a で撤去した。唯一の呼び手が Dropbox（".xml" を
     * 剥がしてから付け直す経路）で、しかも実装が name.length - 4 の決め打ちだったので
     * suffix の長さが 4 でなければ壊れる。撤去する側に呼び手ごとあるので直さず消した。
     */
    promptName(title: string): string | null {
        var lastUsedName = (this.owner.getOption("lastUsedName") ||
            this.lastUsedName) as string;
        var name = prompt(_(title), lastUsedName);
        if (!name) {
            return null;
        }
        this.owner.setOption("lastUsedName", name);
        this.lastUsedName = name; // save this also in variable in case cookies are disabled
        return name;
    }

    clientloadfromfile(): void {
        var self = this;
        var input = document.createElement("input");
        input.type = "file";
        input.accept = ".xml,.txt";
        input.onchange = function(e) {
            var file = (e.target as HTMLInputElement).files![0];
            if (!file) {
                return;
            }
            
            // Check file extension
            var fileName = file.name.toLowerCase();
            if (!fileName.endsWith(".xml") && !fileName.endsWith(".txt")) {
                alert(_("clientloadfromfile") + ": Please select an XML or TXT file.");
                return;
            }
            
            var reader = new FileReader();
            reader.onload = function(e) {
                var xml = (e.target as FileReader).result as string;
                if (!xml || xml.trim() === "") {
                    alert(_("empty"));
                    return;
                }
                self.fromXMLText(xml);
            };
            reader.onerror = function(e) {
                alert(_("xmlerror") + ": Failed to read file.");
            };
            reader.readAsText(file);
        };
        input.click();
    }

    clientlocalsave(): void {
        if (!window.localStorage) {
            alert("Sorry, your browser does not seem to support localStorage.");
            return;
        }

        var xml = this.owner.toXML();
        if (xml.length >= (5 * 1024 * 1024) / 2) {
            /* this is a very big db structure... */
            alert(
                "Warning: your database structure is above 5 megabytes in size, this is above the localStorage single key limit allowed by some browsers, example Mozilla Firefox 10"
            );
            return;
        }

        var key = this.promptName("serversaveprompt");
        if (!key) {
            return;
        }

        key = "wwwsqldesigner_databases_" + (key || "default");

        try {
            localStorage.setItem(key, xml);
            if (localStorage.getItem(key) != xml) {
                throw new Error("Content verification failed");
            }
        } catch (e) {
            alert(
                "Error saving database structure to localStorage! (" +
                    (e as Error).message +
                    ")"
            );
        }
    }

    clientlocalload(): void {
        if (!window.localStorage) {
            alert("Sorry, your browser does not seem to support localStorage.");
            return;
        }

        var key = this.promptName("serverloadprompt");
        if (!key) {
            return;
        }

        key = "wwwsqldesigner_databases_" + (key || "default");

        try {
            var xml = localStorage.getItem(key);
            if (!xml) {
                throw new Error("No data available");
            }
        } catch (e) {
            alert(
                "Error loading database structure from localStorage! (" +
                    (e as Error).message +
                    ")"
            );
            return;
        }

        this.fromXMLText(xml);
    }

    clientlocallist(): void {
        if (!window.localStorage) {
            alert("Sorry, your browser does not seem to support localStorage.");
            return;
        }

        /* --- Define some useful vars --- */
        var baseKeysName = "wwwsqldesigner_databases_";
        var localLen = localStorage.length;
        var data = "";
        var schemasFound = false;
        var code = 200;

        /* --- work --- */
        try {
            for (var i = 0; i < localLen; ++i) {
                var key = localStorage.key(i)!;
                if (new RegExp(baseKeysName).test(key)) {
                    var result = key.substring(baseKeysName.length);
                    schemasFound = true;
                    data += result + "\n";
                }
            }
            if (!schemasFound) {
                throw new Error("No data available");
            }
        } catch (e) {
            alert(
                "Error loading database names from localStorage! (" +
                    (e as Error).message +
                    ")"
            );
            return;
        }
        this.listresponse(data, code);
    }

    clientsql(): void {
        var bp = this.owner.getOption("staticpath");
        var path = bp + "db/" + this.owner.palette.db() + "/output.xsl";
        var h = this.owner.getXhrHeaders();
        this.owner.window.showThrobber();
        OZ.Request(path, this.finish.bind(this), { xml: true, headers: h });
    }

    finish(xslDoc: unknown): void {
        this.owner.window.hideThrobber();
        var xml = this.owner.toXML();
        var sql = "";
        try {
            /*
             * grabado: ActiveXObject 分岐だけを撤去した（HANDOVER §3 段階3-3b）。
             * window.XSLTProcessor の判定は残す — Chromium では true だが jsdom では
             * false で（実測）、条件ごと畳むと Node ハーネス側の挙動が変わる。
             * XSLTProcessor が無い実行系は現行どおり下の throw に落ちる。
             */
            if (window.XSLTProcessor && window.DOMParser) {
                var parser = new DOMParser();
                var xmlDoc = parser.parseFromString(xml, "text/xml");
                var xsl = new XSLTProcessor();
                xsl.importStylesheet(xslDoc as Document);
                var result = xsl.transformToDocument(xmlDoc);
                sql = result.documentElement.textContent!;
            } else {
                throw new Error("No XSLT processor available");
            }
        } catch (e) {
            alert(_("xmlerror") + ": " + (e as Error).message);
            return;
        }
        this.dom.ta.value = sql.trim();
    }

    serversave(e?: Event, keyword?: string): void {
        var name = keyword || prompt(_("serversaveprompt"), this._name);
        if (!name) {
            return;
        }
        this._name = name;
        var xml = this.owner.toXML();
        var bp = this.owner.getOption("xhrpath");
        var url =
            bp +
            "backend/" +
            this.dom.backend.value +
            "/?action=save&keyword=" +
            encodeURIComponent(name);
        var h = this.owner.getXhrHeaders();
        h["Content-type"] = "application/xml";
        this.owner.window.showThrobber();
        this.owner.setTitle(name);
        OZ.Request(url, this.saveresponse, {
            xml: true,
            method: "post",
            data: xml,
            headers: h,
        });
    }

    quicksave(e?: Event): void {
        this.serversave(e, this._name);
    }

    serverload(e?: Event | false, keyword?: string): void {
        var name = keyword || prompt(_("serverloadprompt"), this._name);
        if (!name) {
            return;
        }
        this._name = name;
        var bp = this.owner.getOption("xhrpath");
        var url =
            bp +
            "backend/" +
            this.dom.backend.value +
            "/?action=load&keyword=" +
            encodeURIComponent(name);
        var h = this.owner.getXhrHeaders();
        this.owner.window.showThrobber();
        this.name = name;
        OZ.Request(url, this.loadresponse, { xml: true, headers: h });
    }

    serverlist(e?: Event): void {
        var bp = this.owner.getOption("xhrpath");
        var url = bp + "backend/" + this.dom.backend.value + "/?action=list";
        var h = this.owner.getXhrHeaders();
        this.owner.window.showThrobber();
        OZ.Request(url, this.listresponse, { headers: h });
    }

    serverimport(e?: Event): void {
        var name = prompt(_("serverimportprompt"), "");
        if (!name) {
            return;
        }
        var bp = this.owner.getOption("xhrpath");
        var url =
            bp +
            "backend/" +
            this.dom.backend.value +
            "/?action=import&database=" +
            name;
        var h = this.owner.getXhrHeaders();
        this.owner.window.showThrobber();
        OZ.Request(url, this.importresponse, { xml: true, headers: h });
    }

    check(code: number): boolean {
        switch (code) {
            case 201:
            case 404:
            case 500:
            case 501:
            case 503:
                var lang = "http" + code;
                this.dom.ta.value = _("httpresponse") + ": " + _(lang);
                return false;
                break;
            default:
                return true;
        }
    }

    saveresponse(data: unknown, code: number): void {
        this.owner.window.hideThrobber();
        this.check(code);
    }

    loadresponse(data: unknown, code: number): void {
        this.owner.window.hideThrobber();
        if (!this.check(code)) {
            return;
        }
        this.fromXML(data as Document | null);
        this.owner.setTitle(this.name);
    }

    listresponse(data: unknown, code: number): void {
        this.owner.window.hideThrobber();
        if (!this.check(code)) {
            return;
        }
        this.dom.ta.value = data as string;
    }

    importresponse(data: unknown, code: number): void {
        this.owner.window.hideThrobber();
        if (!this.check(code)) {
            return;
        }
        if (this.fromXML(data as Document | null)) {
            this.owner.alignTables();
        }
    }

    press(e: KeyboardEvent): void {
        switch (e.keyCode) {
            case 113:
                /*
                 * grabado: OZ.opera の分岐を撤去した（HANDOVER §3 段階3-3b）。
                 * 元式 !!window.opera は Chromium / jsdom のどちらでも false（段階3-1 の
                 * 実測）なので、この preventDefault には到達しない。
                 */
                this.quicksave(e);
                break;
        }
    }
}
