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
 * **段階6-5a で XML の書き出しが 1 つ残らず消えた。** 4-3b の時点で残っていたのは
 * clientsql() の DDL 生成だけで（output.xsl の入力に XML が要った）、その XSLT が
 * TS 生成器になったので中間 XML ごと落ちている（js/io/ddl-xml.ts の撤去）。
 * 読み込みが JSON と XML の両方なのは変わらない。introspection（serverimport）も
 * XML のままで、こちらは §5.2。
 *
 * ## 段階4-6（外部変更検知）→ 段階5-4b（条件付き更新）
 *
 * 4-6 では **server への保存が 2 往復**だった —— serversave() がまず load（プリフライト）を
 * 投げ、応答を this.baseline（最後に観測したバイト列）と突き合わせてから本番の save を出す。
 * **TOCTOU の窓が残っていた**（プリフライトと save の間に他者が書けば、そちらが負ける）。
 *
 * **5-4b で 1 往復になった。** backend が ETag を返すようになったので、baseline は
 * バイト列ではなく ETag を持ち、save は条件ヘッダ（`If-Match` / `If-None-Match: *`）を
 * 載せて 1 回で出す。衝突していればサーバが **412** を返し、そこで初めて confirm を出す
 * ——**判定の主体がクライアントからサーバへ移り、窓が閉じた**。
 * ここが持つのは台帳（baseline）と UI（confirm）だけで、規則は js/io/conflict.ts の純粋関数。
 *
 * 対象は **server 経路だけ**。localStorage / textarea / クリップボード / ファイルは
 * 「app 外で変わる正本」ではないので触らない（introspection も同じ）。
 */

import { OZ } from "./oz.ts";
import { CONFIG } from "./config.ts";
import { ORM_LABELS, ORM_TARGETS } from "./io/orm/generate.ts";
import { _ } from "./globals.ts";
import { detectDesignFormat } from "./io/detect.ts";
import {
    etagFromHeaders,
    preconditionFor,
    verdictAfterConflict,
    type Baseline,
    type Precondition,
} from "./io/conflict.ts";
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
    /** ORM 出力（段階6-9d）。**出力の 2 本目の軸** */
    clientorm: HTMLInputElement;
    ormtarget: HTMLSelectElement;
    /**
     * 出力先の db プロファイル（段階6-10b）。**空文字が「設計と同じ」**。
     * DDL と ORM の**両方に効く** —— どちらも「下敷きのプロファイル」を選ぶ話で、
     * select を 2 つ置くと同じ設定が 2 か所に分かれる。
     */
    outputdb: HTMLSelectElement;
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
    /**
     * 今の編集セッションの派生元（段階4-6 → 5-4b で ETag へ）。server から最後に観測した版で、
     * 保存はこれを `If-Match` に載せる。まだ一度も load / save していなければ null。
     */
    declare baseline: Baseline | null;
    /**
     * 発行中の save の内容（段階5-4b）。応答を待つ間だけ埋まる。
     *
     * 412 を受けたら**同じ内容を無条件で再送する**ので、名前と本文をここで橋渡しする
     * （saveresponse は「何を書こうとしたか」を知らない）。
     */
    declare pendingSave: { file: string; name: string; json: string } | null;
    declare dom: IoDom;

    constructor(owner: Designer) {
        this.owner = owner;
        this._name = ""; /* last used name with server load/save */
        this.lastUsedName = ""; /* last used name with local storage load/save */
        this.baseline = null;
        this.pendingSave = null;
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
            "clientorm",
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

        var ids = ["client", "server", "output", "backendlabel", "outputdblabel"];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i]!;
            /* grabado: 上のループの elm と型が違う（こちらはラベル要素）ため改名した。
               型のためのコード変更で、読み出しは直後の 1 行だけ（段階3-3b） */
            var labelElm = OZ.$(id);
            labelElm.innerHTML = _(id);
        }

        this.dom.ta = OZ.$<HTMLTextAreaElement>("textarea");
        this.dom.backend = OZ.$<HTMLSelectElement>("backend");
        this.dom.ormtarget = OZ.$<HTMLSelectElement>("ormtarget");
        this.dom.outputdb = OZ.$<HTMLSelectElement>("outputdb");

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
        OZ.Event.add(this.dom.clientorm, "click", this.clientorm.bind(this));
        OZ.Event.add(this.dom.outputdb, "change", this.outputdbchange.bind(this));
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
        /*
         * grabado: 段階6-9d。ORM ターゲットの select。**表示名は locale を通さない** ——
         * JPA / Prisma は製品名なので翻訳しない（db プロファイル名を訳さないのと同じ）。
         */
        OZ.DOM.clear(this.dom.ormtarget);
        for (var t = 0; t < ORM_TARGETS.length; t++) {
            var target = ORM_TARGETS[t]!;
            var opt = OZ.DOM.elm("option");
            opt.value = target;
            opt.innerHTML = ORM_LABELS[target];
            this.dom.ormtarget.appendChild(opt);
        }

        /*
         * grabado: 段階6-10b。出力先の db プロファイル。**先頭が「設計と同じ」で値は空文字**で、
         * これが既定 —— 選ばないかぎり 6-10a 以前とバイト単位で同じ DDL が出る。
         *
         * db 名は locale を通さない（backend の select と同じ立場。プロファイル名は訳さない）。
         * 「設計と同じ」だけは文なので通す。
         */
        OZ.DOM.clear(this.dom.outputdb);
        var same = OZ.DOM.elm("option");
        same.value = "";
        same.innerHTML = _("outputdbsame") + " (" + this.owner.palette.db() + ")";
        this.dom.outputdb.appendChild(same);
        for (var d = 0; d < CONFIG.AVAILABLE_DBS.length; d++) {
            var dbName = CONFIG.AVAILABLE_DBS[d]!;
            if (dbName === this.owner.palette.db()) {
                continue;
            }
            var dbOpt = OZ.DOM.elm("option");
            dbOpt.value = dbName;
            dbOpt.innerHTML = dbName;
            this.dom.outputdb.appendChild(dbOpt);
        }

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
        this.syncOutputLabel();
        this.owner.window.open(_("saveload"), this.dom.container);
    }

    /**
     * SQL ボタンのラベルに**どのプロファイル向けに出るか**を出す（段階6-10b）。
     *
     * 6-9d までは `SQL (postgresql)` で、パレットが 1 つしか無いのだから db 名 1 つで
     * 足りていた。出力先を選べるようになると**設計側と出力側のどちらの話か**が曖昧に
     * なるので、選んでいるときだけ `SQL (postgresql -> mysql)` の形にする。
     */
    syncOutputLabel(): void {
        var target = this.dom.outputdb.value;
        var design = String(this.owner.palette.db());
        this.dom.clientsql.value =
            _("clientsql") + " (" + (target ? design + " -> " + target : design) + ")";
    }

    /**
     * 出力先が変わったとき（段階6-10b）。
     *
     * **ここでパレットを先読みしておく。** 取得だけが非同期なので、ボタンを押した時点で
     * 読み込み済みなら生成は同期で通る（clientsql も loadPalette 経由なので、先読みが
     * 間に合わなくても結果は同じ。押した瞬間の待ちが無くなるだけ）。
     */
    outputdbchange(): void {
        this.syncOutputLabel();
        var target = this.dom.outputdb.value;
        if (target) {
            this.owner.loadPalette(target, function () {});
        }
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

    /**
     * DDL を生成して textarea に入れる（「SQLを生成」ボタン）。
     *
     * **段階6-5a で XHR と XSLT が消え、同期の 1 行になった。** それまでは
     * db/<db>/output.xsl を OZ.Request で取りに行き（throbber を出し）、応答の
     * Document を finish() が XSLTProcessor に食わせていた。生成が TS になったので
     * 待ち時間そのものが無くなり、throbber も finish() も要らない。
     *
     * 失敗の伝え方は現行のまま alert（js/io.ts の他経路と同じ）。生成器が投げるのは
     * 「型パレットに db 属性が無い」「対応していない DB プロファイル」「パレットに
     * 無い型の添字」で、XSLT 経路の 404 / No XSLT processor available より理由が細かい。
     */
    clientsql(): void {
        this.withOutputPalette((target) => {
            var sql = "";
            try {
                sql = this.owner.toDdl(target);
            } catch (e) {
                alert(_("xmlerror") + ": " + (e as Error).message);
                return;
            }
            this.dom.ta.value = sql;
        });
    }

    /**
     * 出力先のパレットを用意してから body を呼ぶ（段階6-10b）。
     *
     * **「設計と同じ」なら 1 バイトも寄り道しない**（target が undefined のまま同期で通る）。
     * 出力先を選んでいるときだけ loadPalette を挟むが、**読み込み済みなら loadPalette も
     * 同期で callback を呼ぶ**ので、2 回目以降の押下も待たない。
     */
    withOutputPalette(body: (target?: string) => void): void {
        var target = this.dom.outputdb.value;
        if (!target) {
            body(undefined);
            return;
        }
        this.owner.loadPalette(target, (ok) => {
            if (!ok) {
                alert(_("xmlerror") + ": " + target);
                return;
            }
            body(target);
        });
    }

    /**
     * ORM のモデル定義を textarea に出す（段階6-9d）。**clientsql と対で、経路は同じ形**。
     *
     * ボタンを分けたのは、既存の「SQL 出力」を 1 ビットも変えないため（6-9a の判断）。
     * ターゲットは隣の select が持つ。db プロファイルは切り替えない —— ORM は下敷きの
     * プロファイルの上に乗り、同じ設計から DDL と ORM の両方を出せる。
     */
    clientorm(): void {
        this.withOutputPalette((target) => {
            var out = "";
            try {
                out = this.owner.toOrm(this.dom.ormtarget.value, target);
            } catch (e) {
                alert(_("xmlerror") + ": " + (e as Error).message);
                return;
            }
            this.dom.ta.value = out;
        });
    }

    /**
     * server への保存（段階4-6 でプリフライトを挟んだ）。
     *
     * ここが投げるのは save ではなく **load**。保存先の現物を読んでから
     * preflightresponse() が判定し、通れば sendSave() が本番の save を投げる。
     * setTitle() も保存が確定してから呼ぶ —— 中止したのにタイトルだけ変わると、
     * 保存できたように見える。
     */
    serversave(e?: Event, keyword?: string): void {
        var name = keyword || prompt(_("serversaveprompt"), this._name);
        if (!name) {
            return;
        }
        this._name = name;
        const json = this.toJsonOrAlert();
        if (json === null) {
            return;
        }
        /*
         * 段階5-4b: **プリフライトの load は投げない。** 派生元の有無から条件ヘッダを決めて、
         * 保存を 1 往復で出す。衝突していればサーバが 412 を返し、saveresponse() が
         * confirm に流す（＝衝突したときだけ 2 往復）。
         */
        this.sendSave(name, json, preconditionFor(this.baseline, jsonKeyword(name)));
    }

    /**
     * 本番の save。URL / Content-type / body は段階4-3b から 1 バイトも変わらない。
     *
     * @param precondition 条件ヘッダ（段階5-4b）。412 を受けた後の再送では
     *   `{ ifMatch: "*" }`（存在すれば無条件で上書き）を渡す。
     */
    sendSave(name: string, json: string, precondition: Precondition): void {
        var bp = this.owner.getOption("xhrpath");
        var url =
            bp +
            "backend/" +
            this.dom.backend.value +
            "/?action=save&keyword=" +
            encodeURIComponent(jsonKeyword(name));
        /*
         * ★ getXhrHeaders() は **Designer が持つオブジェクトをそのまま返す**（共有）。
         *   条件ヘッダは排他（If-Match と If-None-Match のどちらか一方だけが立つ）なので、
         *   直に書くと**前回の保存で載せたヘッダが次の保存にも残る**。1 回ぶんのコピーを作る。
         *   段階5-4b 以前は Content-type しか足しておらず、毎回同じ値だったので露見しなかった。
         */
        var h: Record<string, string> = {};
        var shared = this.owner.getXhrHeaders();
        for (var key in shared) {
            h[key] = shared[key]!;
        }
        h["Content-type"] = "application/json";
        if (precondition.ifMatch) {
            h["If-Match"] = precondition.ifMatch;
        }
        if (precondition.ifNoneMatch) {
            h["If-None-Match"] = precondition.ifNoneMatch;
        }
        this.owner.window.showThrobber();
        /* タイトルは素の名前のまま（.json はファイル名の都合で、設計の名前ではない） */
        this.owner.setTitle(name);
        /* 412 を受けたら同じ内容を再送するので、名前と本文を控えておく */
        this.pendingSave = { file: jsonKeyword(name), name: name, json: json };
        /* xml: true は**応答**の解釈指定。送る body とは無関係 */
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

    /**
     * 「表示すべき応答」なら textarea に文言を出して false を返す。
     *
     * ★ **知らない status は `default: return true` に落ちて「成功」に倒れる。**
     * backend が新しい status を返すようになったら、**同じ PR で**ここと locale を広げること
     * （分けると、無言で成功扱いになる期間が develop に残る＝ CLAUDE.md 制約1 違反）。
     * 抜けは `tests/node/backend-contract.test.ts` が契約表と突き合わせて機械的に捕まえる。
     *
     * - `201` は save 成功（locale の `http201` は `Saved`）。**唯一の保存完了通知**なので落とさない
     * - `400` / `405` は段階5-1b の Kotlin 実装から。`keyword` が空・パスを脱出しうる形・
     *   action に対して HTTP メソッドが違う
     * - `403` は段階5-3 の `READONLY`。**501 に寄せない** —— 寄せると「このデプロイでは
     *   禁止されている」と「サーバが壊れている」が同じ画面になる
     * - `412`（If-Match 不一致）は **check() に通さない** —— フロントが握って confirm に流す
     *   （プリフライトの 404 を通さないのと同じ理屈）。入るのは段階5-4
     */
    check(code: number): boolean {
        switch (code) {
            case 201:
            case 400:
            case 403:
            case 404:
            case 405:
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

    saveresponse(data: unknown, code: number, headers?: Record<string, string>): void {
        this.owner.window.hideThrobber();
        var pending = this.pendingSave;
        this.pendingSave = null;

        /*
         * 段階5-4b: **412 は check() に通さない。** 「衝突したので上書きするか？」は
         * エラー表示ではなく**分岐**で、textarea に文言を出すと confirm と二重になる
         * （プリフライトの 404 を通さなかったのと同じ理屈）。
         */
        if (code === 412) {
            if (!pending) {
                return;
            }
            var verdict = verdictAfterConflict(this.baseline, pending.file);
            var message = verdict === "conflict" ? "saveconflict" : "saveexists";
            if (!confirm(pending.file + "\n\n" + _(message))) {
                return;
            }
            /* 上書きすると答えた。存在すれば無条件で置き換える */
            this.sendSave(pending.name, pending.json, { ifMatch: "*" });
            return;
        }

        /* 現行どおり戻り値は使わない（201 も「表示すべき応答」なので save 成功でも文言が出る） */
        this.check(code);
        /*
         * 書けた版だけを派生元にする（段階4-6）。save 成功は **201**
         * （docs/ARCHITECTURE.md §4.3 の実測）で、200 は移植先の実装を見越して受けてある。
         *
         * 段階5-4b から、記録するのは**応答の ETag**。save の応答にも付いてくるので、
         * 書いた直後に load し直す必要が無い。
         */
        if (pending && (code === 200 || code === 201)) {
            var etag = etagFromHeaders(headers);
            this.baseline = etag ? { name: pending.file, etag: etag } : null;
        }
    }

    loadresponse(data: unknown, code: number, headers?: Record<string, string>): void {
        this.owner.window.hideThrobber();
        if (!this.check(code)) {
            return;
        }
        /*
         * 観測した版を派生元にする（段階4-6 → 5-4b で ETag へ）。**読めたかどうかとは独立**
         * —— 壊れた JSON でも「サーバ上の版はこれ」は事実で、次の保存でそれを黙って
         * 上書きしないための記録。loadDesignText() の戻り値契約（void）は触らない。
         */
        var etag = etagFromHeaders(headers);
        this.baseline = etag ? { name: jsonKeyword(this.name), etag: etag } : null;
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
