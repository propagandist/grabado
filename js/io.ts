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
 *
 * ## 段階4-3b（形式の切り替え）
 *
 * **保存はすべて JSON、読み込みは JSON と XML の両方**（HANDOVER §4 / CLAUDE.md 制約4）。
 * 書き出し 5 経路は toJsonOrAlert()、読込 5 経路は loadDesignText() を通る。
 *
 * XML の書き出しが残る場所は 1 つだけ —— clientsql() -> finish() の DDL 生成で、
 * output.xsl（XSLT）の入力に XML が要るため（js/io/ddl-xml.ts）。**この 1 か所が
 * Designer.toXML() の唯一の呼び手**で、消えるのは §6.3 で output.xsl を TS 実装に
 * 置き換えるとき。introspection（serverimport）も XML のままで、こちらは §5.2。
 */

import { OZ } from "./oz.ts";
import { CONFIG } from "./config.ts";
import { _ } from "./globals.ts";
import { detectDesignFormat } from "./io/detect.ts";
/* owner の型。必ず import type で受ける（理由は js/table.ts の冒頭） */
import type { Designer } from "./wwwsqldesigner.ts";

/**
 * server 経路の keyword に `.json` をちょうど 1 つ付ける（段階4-3b）。
 *
 * 現行 backend の保存先は拡張子なし（`data/<keyword>`）で、これだと `.gitattributes` /
 * `.prettierignore` / 移行 glob のいずれもファイルを名指しできない（4-2b の申し送り）。
 * backend は body を解釈せずに `basename($keyword)` でファイル名を作るだけなので、
 * **フロントが keyword に付けるだけで済む**（PHP には 1 行も触らない。捨てる資産に
 * 投資しない ＝ 制約6）。拡張子の**強制**（.json 以外の save を拒む・list が *.json だけを
 * 返す）は正本ディレクトリの責務なので Kotlin 実装の §5.1 に送る。
 *
 * 二重付与を防ぐのは、serverlist の出力（backend が返すファイル名。`.json` 付き）を
 * そのまま prompt に貼り付けても壊れないようにするため。
 */
function jsonKeyword(name: string): string {
    return name.toLowerCase().endsWith(".json") ? name : name + ".json";
}

/**
 * 保存/読込ダイアログの DOM。
 *
 * 不変条件は「コンストラクタを抜けた時点で全キーが埋まっている」。ボタン 16 個は
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
    clientdownload: HTMLInputElement;
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
            "clientdownload",
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
        OZ.Event.add(this.dom.clientdownload, "click", this.clientdownload.bind(this));
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

    /*
     * grabado: 段階4-3b 以降、Document を直に受けるこの面の呼び手は importresponse()
     * だけになった（introspection は backend が XML を返すため。JSON 化は HANDOVER §5.2）。
     * 保存/読込の 5 経路はテキストで受けて loadDesignText() を通る。
     */
    fromXML(xmlDoc: Document | null): boolean {
        if (!xmlDoc || !xmlDoc.documentElement) {
            alert(_("xmlerror") + ": Null document");
            return false;
        }
        this.owner.fromXML(xmlDoc.documentElement);
        this.owner.window.close();
        return true;
    }

    /**
     * 読み込みの入口（HANDOVER §4 段階4-3b）。
     *
     * textarea / クリップボード / ファイル / localStorage / server の 5 経路がすべて
     * ここを通る。形式は js/io/detect.ts の先頭 1 文字判定で決め、**行き先が決まったら
     * 他方は試さない**（フォールバックを作らない理由は detect.ts の冒頭）。
     *
     * XML 側は fromXMLText() にそのまま委譲する —— 現行の癖（alert で伝えて戻る）を
     * 1 バイトも変えない。JSON 側は js/io/json-parser.ts が例外で落とすので、**ここが
     * 唯一の受け止め口**になる。例外の message は locale を通さない（開発者向けで、
     * 価値の本体は位置情報 tables[0].columns[2].name。docs/FORMAT.md が宣言済み）。
     *
     * 成功時に window.close() するのは XML 経路の fromXML() と揃えるため
     * （ダイアログが閉じることが「読めた」の合図になっている）。
     */
    loadDesignText(text: string): void {
        switch (detectDesignFormat(text)) {
            case "empty":
                alert(_("empty"));
                return;

            case "xml":
                this.fromXMLText(text);
                return;

            case "json":
                try {
                    this.owner.fromJson(text);
                } catch (e) {
                    alert(_("jsonerror") + ": " + (e as Error).message);
                    return;
                }
                this.owner.window.close();
                return;

            case "unknown":
                alert(_("unknownformat"));
                return;
        }
    }

    /**
     * 書き出しの入口（HANDOVER §4 段階4-3b）。
     *
     * js/io/json-serializer.ts は「型パレットが読めていない」「型 id が無い」ときに
     * **1 バイトも書かずに例外で落ちる**契約。書き出し 5 経路がそれぞれ try を書くと
     * 文言がばらけるので、受け止めをここに集約する。失敗したら null を返し、
     * 呼び手は何もしない（textarea を空で上書きしたり空ファイルを保存したりしない）。
     */
    toJsonOrAlert(): string | null {
        try {
            return this.owner.toJson();
        } catch (e) {
            alert(_("jsonerror") + ": " + (e as Error).message);
            return null;
        }
    }

    clientsave(): void {
        var json = this.toJsonOrAlert();
        if (json === null) {
            return;
        }
        this.dom.ta.value = json;
    }

    clientload(): void {
        /* 空の判定は loadDesignText() が持つ（detect が "empty" を返す。文言も同じ） */
        this.loadDesignText(this.dom.ta.value);
    }

    clientcopy(): void {
        var json = this.toJsonOrAlert();
        if (json === null) {
            return;
        }
        navigator.clipboard.writeText(json).then(function() {
            alert(_("clientsave") + " - Copied to clipboard!");
        }).catch(function(err) {
            alert("Failed to copy: " + err);
        });
    }

    clientpaste(): void {
        var self = this;
        navigator.clipboard.readText().then(function(text) {
            self.loadDesignText(text);
        }).catch(function(err) {
            alert("Failed to paste: " + err);
        });
    }

    /*
     * grabado: 段階4-3b で clientdownloadxml / clientdownloadtxt の 2 本を 1 本に統合した。
     * 中身が JSON になった以上「.txt でも落とせる」ことに意味が無く、id に xml を残すと
     * 落ちるファイルと名前が食い違う。
     */
    clientdownload(): void {
        var json = this.toJsonOrAlert();
        if (json === null) {
            return;
        }
        this.downloadFile(json, "new-database.json", "application/json");
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
        /* grabado: 段階4-3b で .json を先頭に足した（保存が JSON になったため）。
           .xml / .txt は読込互換で残す —— 拡張子で行き先は決めず、中身で判別する */
        input.accept = ".json,.xml,.txt";
        input.onchange = function(e) {
            var file = (e.target as HTMLInputElement).files![0];
            if (!file) {
                return;
            }

            // Check file extension
            var fileName = file.name.toLowerCase();
            if (!fileName.endsWith(".json") && !fileName.endsWith(".xml") && !fileName.endsWith(".txt")) {
                alert(_("clientloadfromfile") + ": Please select a JSON, XML or TXT file.");
                return;
            }

            var reader = new FileReader();
            reader.onload = function(e) {
                self.loadDesignText((e.target as FileReader).result as string);
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

        var json = this.toJsonOrAlert();
        if (json === null) {
            return;
        }
        if (json.length >= (5 * 1024 * 1024) / 2) {
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

        /* grabado: キーの接頭辞は据え置く（段階4-3b）。改名すると既存のエントリが
           行方不明になる。中身が XML から JSON に変わっても読み手は形式で判別する */
        key = "wwwsqldesigner_databases_" + (key || "default");

        try {
            localStorage.setItem(key, json);
            if (localStorage.getItem(key) != json) {
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
            var text = localStorage.getItem(key);
            if (!text) {
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

        /* grabado: 段階4-3b より前に保存した XML のエントリもそのまま読める（形式で判別する） */
        this.loadDesignText(text);
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
        var json = this.toJsonOrAlert();
        if (json === null) {
            return;
        }
        var bp = this.owner.getOption("xhrpath");
        var url =
            bp +
            "backend/" +
            this.dom.backend.value +
            "/?action=save&keyword=" +
            encodeURIComponent(jsonKeyword(name));
        var h = this.owner.getXhrHeaders();
        h["Content-type"] = "application/json";
        this.owner.window.showThrobber();
        /* タイトルは素の名前のまま（.json はファイル名の都合で、設計の名前ではない） */
        this.owner.setTitle(name);
        /* xml: true は**応答**の解釈指定（backend は XML を返す）。送る body とは無関係 */
        OZ.Request(url, this.saveresponse, {
            xml: true,
            method: "post",
            data: json,
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
            encodeURIComponent(jsonKeyword(name));
        var h = this.owner.getXhrHeaders();
        this.owner.window.showThrobber();
        this.name = name;
        /*
         * grabado: 段階4-3b で xml: true を外した。responseText をそのまま受けて
         * loadDesignText() が形式を判別する —— backend は保存されたバイト列を
         * 解釈せずに返すので、JSON と 4-3b 以前に保存した XML の両方が来うる。
         */
        OZ.Request(url, this.loadresponse, { headers: h });
    }

    serverlist(e?: Event): void {
        var bp = this.owner.getOption("xhrpath");
        var url = bp + "backend/" + this.dom.backend.value + "/?action=list";
        var h = this.owner.getXhrHeaders();
        this.owner.window.showThrobber();
        OZ.Request(url, this.listresponse, { headers: h });
    }

    /*
     * grabado: introspection は段階4-3b でも XML のまま据え置く（xml: true と
     * importresponse の fromXML）。ここが受けるのは「保存した設計」ではなく
     * **backend が information_schema から組み立てた XML** で、JSON 化は backend を
     * Kotlin に移す HANDOVER §5.2 の仕事。フロントだけ先に JSON を期待させると
     * 現行 backend との契約が切れる。
     */
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
        /* 読めなくても setTitle するのは現行どおり（fromXML の false も無視していた） */
        this.loadDesignText(data as string);
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
