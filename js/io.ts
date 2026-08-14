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
 * Dropbox 連携は index.html が CDN から読む dropbox.js に依存する。存廃は未決で、判断は
 * HANDOVER §4 の IO 作り替えと同時（CUSTOMIZATIONS.md の決定ログ）。ここでは本ファイルが
 * 触る面だけを宣言し、実装には触れていない。
 */

import { OZ } from "./oz.ts";
import { CONFIG } from "./config.ts";
import { _, type SqlDesigner } from "./globals.ts";

/* dropbox.js のうち本ファイルが触る面。存廃は §4（上のコメント） */
interface DropboxError {
    status: number;
}
interface DropboxClient {
    reset(): void;
    authDriver(driver: unknown): void;
    authenticate(
        cb: (error: DropboxError | null, client: unknown) => void
    ): void;
    writeFile(
        name: string,
        data: string,
        cb: (error: DropboxError | null, stat: unknown) => void
    ): void;
    readFile(
        name: string,
        cb: (error: DropboxError | null, data: string) => void
    ): void;
    readdir(
        path: string,
        cb: (error: DropboxError | null, entries: string[]) => void
    ): void;
}
declare const Dropbox: {
    Client: new (options: { key: string }) => DropboxClient;
    ApiError: Record<
        | "INVALID_TOKEN"
        | "NOT_FOUND"
        | "OVER_QUOTA"
        | "RATE_LIMITED"
        | "NETWORK_ERROR"
        | "INVALID_PARAM"
        | "OAUTH_ERROR"
        | "INVALID_METHOD",
        number
    >;
    AuthDriver: { Popup: new (options: { receiverUrl: string }) => unknown };
};

/**
 * 保存/読込ダイアログの DOM。
 *
 * 不変条件は「コンストラクタを抜けた時点で全キーが埋まっている」。ボタン 20 個は
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
    dropboxsave: HTMLInputElement;
    dropboxload: HTMLInputElement;
    dropboxlist: HTMLInputElement;
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
    declare owner: SqlDesigner;
    /** server load/save で最後に使った名前 */
    declare _name: string;
    /** localStorage / Dropbox で最後に使った名前 */
    declare lastUsedName: string;
    /** serverload が控える名前。loadresponse が setTitle に渡す */
    declare name: string;
    declare dom: IoDom;
    /** CONFIG.DROPBOX_KEY が未設定なら null（dropBoxInit） */
    declare dropboxClient: DropboxClient | null;

    constructor(owner: SqlDesigner) {
        this.owner = owner;
        this._name = ""; /* last used name with server load/save */
        this.lastUsedName =
            ""; /* last used name with local storage or dropbox load/save */
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
            "dropboxsave",
            "dropboxload",
            "dropboxlist",
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

        /* init dropbox before hiding the container so it can adjust its buttons */
        this.dropBoxInit();

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
        OZ.Event.add(this.dom.dropboxload, "click", this.dropboxload.bind(this));
        OZ.Event.add(this.dom.dropboxsave, "click", this.dropboxsave.bind(this));
        OZ.Event.add(this.dom.dropboxlist, "click", this.dropboxlist.bind(this));
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
    promptName(title: string, suffix?: string): string | null {
        var lastUsedName = (this.owner.getOption("lastUsedName") ||
            this.lastUsedName) as string;
        var name = prompt(_(title), lastUsedName);
        if (!name) {
            return null;
        }
        if (suffix && name.endsWith(suffix)) {
            // remove suffix from name
            name = name.substr(0, name.length - 4);
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

    /* ------------------------- Dropbox start ------------------------ */

    /**
     * The following code uses this lib: https://github.com/dropbox/dropbox-js
     */
    dropBoxInit(): void {
        if (CONFIG.DROPBOX_KEY) {
            this.dropboxClient = new Dropbox.Client({ key: CONFIG.DROPBOX_KEY });
        } else {
            this.dropboxClient = null;
            // Hide the Dropbox buttons
            var elems = document.querySelectorAll("[id^=dropbox]"); // gets all tags whose id start with "dropbox"
            ([] as HTMLElement[]).slice.call(elems).forEach(function (elem) {
                elem.style.display = "none";
            });
        }
    }

    showDropboxError(error: DropboxError): void {
        var prefix = _("Dropbox error") + ": ";
        var msg: string | number = error.status;

        switch (error.status) {
            case Dropbox.ApiError.INVALID_TOKEN:
                // If you're using dropbox.js, the only cause behind this error is that
                // the user token expired.
                // Get the user through the authentication flow again.
                msg = _(
                    "Token expired - retry the operation, authenticating again with Dropbox"
                );
                this.dropboxClient!.reset();
                break;

            case Dropbox.ApiError.NOT_FOUND:
                // The file or folder you tried to access is not in the user's Dropbox.
                // Handling this error is specific to your application.
                msg = _("File not found");
                break;

            case Dropbox.ApiError.OVER_QUOTA:
                // The user is over their Dropbox quota.
                // Tell them their Dropbox is full. Refreshing the page won't help.
                msg = _("Dropbox is full");
                break;

            case Dropbox.ApiError.RATE_LIMITED:
                // Too many API requests. Tell the user to try again later.
                // Long-term, optimize your code to use fewer API calls.
                break;

            case Dropbox.ApiError.NETWORK_ERROR:
                // An error occurred at the XMLHttpRequest layer.
                // Most likely, the user's network connection is down.
                // API calls will not succeed until the user gets back online.
                msg = _("Network error");
                break;

            case Dropbox.ApiError.INVALID_PARAM:
            case Dropbox.ApiError.OAUTH_ERROR:
            case Dropbox.ApiError.INVALID_METHOD:
            default:
            // Caused by a bug in dropbox.js, in your application, or in Dropbox.
            // Tell the user an error occurred, ask them to refresh the page.
        }

        alert(prefix + msg);
    }

    showDropboxAuthenticate(connectedCallBack: () => void): boolean {
        if (!this.dropboxClient) return false;

        // We want to use a popup window for authentication as the default redirection won't work for us as it'll make us lose our schema data
        var href = window.location.href;
        var prefix = href.substring(0, href.lastIndexOf("/")) + "/";
        this.dropboxClient.authDriver(
            new Dropbox.AuthDriver.Popup({
                receiverUrl: prefix + "dropbox-oauth-receiver.html",
            })
        );

        // Now let's authenticate us
        var sql_io = this;
        sql_io.dropboxClient!.authenticate(function (error, client) {
            if (error) {
                sql_io.showDropboxError(error);
            } else {
                // We're authenticated
                connectedCallBack();
            }
            return;
        });

        return true;
    }

    dropboxsave(): void {
        var sql_io = this;
        sql_io.showDropboxAuthenticate(function () {
            var key = sql_io.promptName("serversaveprompt", ".xml");
            if (!key) {
                return;
            }

            var filename = (key || "default") + ".xml";

            sql_io.listresponse("Saving...", 200);
            var xml = sql_io.owner.toXML();
            sql_io.dropboxClient!.writeFile(filename, xml, function (error, stat) {
                if (error) {
                    sql_io.listresponse("", 200);
                    return sql_io.showDropboxError(error);
                }
                sql_io.listresponse(
                    filename + " " + _("was saved to Dropbox"),
                    200
                );
            });
        });
    }

    dropboxload(): void {
        var sql_io = this;
        sql_io.showDropboxAuthenticate(function () {
            var key = sql_io.promptName("serverloadprompt", ".xml");
            if (!key) {
                return;
            }

            var filename = (key || "default") + ".xml";

            sql_io.listresponse("Loading...", 200);
            sql_io.dropboxClient!.readFile(filename, function (error, data) {
                sql_io.listresponse("", 200);
                if (error) {
                    return sql_io.showDropboxError(error);
                }
                sql_io.fromXMLText(data);
            });
        });
    }

    dropboxlist(): void {
        var sql_io = this;
        sql_io.showDropboxAuthenticate(function () {
            sql_io.listresponse("Loading...", 200);
            sql_io.dropboxClient!.readdir("/", function (error, entries) {
                if (error) {
                    sql_io.listresponse("", 200);
                    return sql_io.showDropboxError(error);
                }
                var data = entries.join("\n") + "\n";
                sql_io.listresponse(data, 200);
            });
        });
    }

    /* ------------------------- Dropbox end ------------------------ */

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
