# ARCHITECTURE.md — grabado 現行構成と移行対応

`ondras/wwwsqldesigner` 由来の現行構成の把握と、house 新アーキテクチャ（[`HANDOVER.md`](HANDOVER.md)）への対応図。

> ステータス: **§0「現物確認」実施済み（2026-08-09）／§7「特性化テスト」緑化済み（2026-08-09）／
> §3「フロント TS 化」段階1（Vite バンドル）実施済み（2026-08-09）／
> 同 段階2（ES クラス化・デッドコード撤去）実施済み（2026-08-10、§5.4）／
> 同 段階3-0（Node ハーネスの IIFE バンドル化）実施済み（2026-08-11、§5.1・§5.4）／
> 同 段階3-1（先頭 3 本の `.ts` 化・移行イディオム確定）実施済み（2026-08-12、§5.1・§5.5）／
> 同 段階3-2（描画中核 7 本の `.ts` 化・`dom` バッグの型決定）実施済み（2026-08-12、§5.4・§5.5）／
> 同 段階3-3a（prototype 方式 7 本の class 化）実施済み（2026-08-12、§5.4・§5.5）／
> 同 段階3-3b（残り 8 本の `.ts` 化。`js/` から `.js` が尽きた）実施済み（2026-08-12、§5.1・§5.5）**。
> §4 は実測値。実測環境・手順も §4.1 に記載。テストの構成と走らせ方は [`TESTING.md`](TESTING.md)。

---

## 1. 現行（wwwsqldesigner）ディレクトリ構成（取り込み時点）

```
index.html                アプリ本体（SPA エントリ。§3 段階1 で <script type="module" src="/src/main.ts"> 1 本に）
src/app.ts                ★ §3 で追加。js/ を読み込み順どおり import するだけ（起動しない）
src/main.ts               ★ §3 で追加。src/app.ts を読んで new SQL.Designer() する起動エントリ
js/                        描画エンジン・UI・IO（保持＝Tier 2 で TS 化。§3 段階3 で全 18 本が .ts に）
  oz.ts config.ts globals.ts        ★ 段階3-1 で .ts 化
  visual/row/table/relation/key/rubberband/map .ts  ★ 段階3-2 で .ts 化
  toggle/io/tablemanager/rowmanager/keymanager/window/options/wwwsqldesigner .ts
                                    ★ 段階3-3a で class 化 → 3-3b で .ts 化
  config.ts                アプリ設定（CONFIG.*。旧 config.xml ではなく JS リテラル）
styles/                    スタイル（保持）
locale/                    多言語（日本語ロケール微調整の対象）
db/<db>/                   DB プロファイル。型パレット差分の対象
  datatypes.xml            型パレット定義
  output.xsl               ★ DDL 生成の実体（XSLT 1.0）
backend/                   各種 backend 実装（下記）。PHP は廃止予定
  php-file/                ファイル I/O 版。house 到達点に最も近い（§4 実測の主対象）
  php-postgresql/          PostgreSQL 版。introspection(import) の実測対象
  php-mysql/ php-s3/ ...   その他多数（参照のみ）
  php-s3/amazon-s3-php/    submodule（未初期化。PHP 撤去時に削除）
license.txt               BSD License（保持必須）
Dockerfile                upstream の Dockerfile（busybox httpd。house 版で置換予定）
```

## 2. 移行対応図（現行 → house）

| 層 | 現行 | house 到達点（HANDOVER） | Tier |
|---|---|---|---|
| frontend | 素の JS（`js/`）＋グローバル `SQL.*`。**§3 段階1 で Vite バンドル化・段階2 で ES クラス化・段階3-1〜3-3b で 18 本すべてを `.ts` 化**（`window` 登録と `declare global` は段階3-4 で撤去） | 完全 TS 化（Vite/strict）。描画エンジンは温存 | Tier 2 |
| **DDL 生成** | **`db/<db>/output.xsl`（XSLT 1.0 をブラウザの `XSLTProcessor` で実行）** | **TS 実装**（§6.3 の規約を含む） | — |
| IO | XML 永続化（読み書き） | JSON 統一・決定論出力。XML は読込専用に | — |
| backend | PHP（`backend/php-*`） | Kotlin/Spring Boot（file I/O ＋ introspection＋AI proxy） | — |
| 永続化 | 共有 PG / ファイル 各種 | git 管理 JSON ファイル正本（DB レス既定） | — |
| 型パレット | `db/*/datatypes.xml` | PostgreSQL 18 型パレット（§6.1） | — |
| 配布 | 共有サーバ＋外部 PG | マルチステージ Docker・各自ローカル | — |

## 3. 現物確認（HANDOVER §0）— 実施済み

- [x] 現行 backend を起動（ローカルに php が無いため Docker の `php:8.3-cli` を使用。§4.1）
- [x] **save / load / list** の実通信をキャプチャ（`backend/php-file`）
- [x] **import（introspection）** の実通信とレスポンス構造をキャプチャ（`backend/php-postgresql` ＋ PostgreSQL 18）
  - [x] action 名・パラメータ・body・Content-Type・レスポンス本文
  - [x] introspection のレスポンス構造（XML）→ [`samples/introspection-postgresql.xml`](samples/introspection-postgresql.xml)
- [x] 実測を本書 §4 に記載、HANDOVER との差分を [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) に記録
- [x] 特性化テスト（DDL golden ＋ serializer round-trip/決定論）を緑化（HANDOVER §7 / §6・[`TESTING.md`](TESTING.md)）
- [x] ブラウザ UI からの end-to-end 操作確認（§3 段階1 で実施。テーブル追加・カラム追加・SQL 出力・
      スタイル切替・ロケール切替・cookie 保存が Vite バンドル後も動くことを確認）

## 4. backend 契約（実測）

### 4.1 実測環境

ローカルに `php` が無いため Docker を使用。PHP built-in server は**リクエスト処理時にスクリプトのディレクトリへ chdir する**ため、`php-file` が使う相対パス `data/*` は正しく解決される（Apache 実行時と同じ）。

```
# php-file 用
docker run -d --name grabado-php-survey -p 8000:8000 -v "<repo>:/app" -w /app \
  php:8.3-cli php -S 0.0.0.0:8000 -t .

# introspection 用（php:8.3-cli には pgsql 拡張が無いので docker-php-ext-install pgsql を足す）
docker run -d --name grabado-pg-survey --network <net> -e POSTGRES_PASSWORD=... \
  -e POSTGRES_DB=grabado_survey postgres:18
```

実測に使ったサンプルスキーマ: [`samples/introspection-sample-schema.sql`](samples/introspection-sample-schema.sql)（house 既定に沿った uuidv7 PK・timestamptz・jsonb・複合 PK・FK・index・日本語コメント）。

### 4.2 URL の組み立て（フロント側）

[`../js/io.js`](../js/io.js) が発行する URL は次の形。

```
<xhrpath>backend/<backend名>/?action=<action>[&keyword=<name>|&database=<name>]
```

- `<xhrpath>` = `CONFIG.XHR_PATH || ""`（[`../js/config.js`](../js/config.js) の実値は **空文字**）。cookie `wwwsqldesigner` で上書き可。
- `<backend名>` は画面の backend セレクタの値（`CONFIG.AVAILABLE_BACKENDS`、既定 `php-mysql`）。URL クエリ `?backend=<name>` でも選択できる。
- `keyword` は `encodeURIComponent` 済み。
- **XHR 追加ヘッダは既定で無し**（`SQL.Designer` の `xhrheaders` 初期値は `{}`）。`setXhrHeaders()` は `index.html` にコメントアウトされた例（`Authorization` / `X-CSRF-TOKEN`）があるだけの拡張ポイントで、**現行に CSRF トークンの仕組みは存在しない**。

### 4.3 action 一覧（実測）

`remove` / `connect` は**存在しない**。実装されているのは以下 4 つのみで、未知の action はすべて 501 を返す。

| action | method | 追加パラメータ | リクエスト Content-Type / body | 成功時ステータス | レスポンス Content-Type | レスポンス body |
|---|---|---|---|---|---|---|
| `list` | GET | — | — | 200 | `text/html; charset=UTF-8`（**未指定＝PHP 既定**） | 名前を `\n` 区切り（末尾にも改行） |
| `save` | POST | `keyword` | `application/xml` / 設計 XML | **201 Created** | `text/html; charset=UTF-8` | 空 |
| `load` | GET | `keyword` | — | 200 | `text/xml;charset=UTF-8` | 保存した XML（**バイト単位で同一**） |
| `import` | GET | `database`（php-postgresql では**未使用**） | — | 200 | `text/xml;charset=UTF-8` | introspection XML（§4.5） |
| 上記以外 / 指定なし | — | — | — | **501 Not Implemented** | — | 空 |

その他の実測値（`backend/php-file`）:

- `load` で対象が無い場合 **404 Not Found**。
- `save` は body をそのままファイルに書く。**backend は内容を一切解釈しない**（round-trip はバイト一致を確認済み）。
- `keyword` は `basename()` を通るのでパストラバーサルは封じられる（`../../../traversal-probe` → `data/traversal-probe`）。
- 日本語 `keyword` は URL エンコードで往復し、ファイル名も UTF-8 でそのまま作られる。
- **`keyword` 省略時は 200 + PHP の Fatal error 本文**を返す（`fopen("data/")` が失敗 → `fwrite(false, ...)` で TypeError）。移植先では 400 を返すべき。

`SQL.IO.prototype.check`（[`../js/io.js`](../js/io.js)）は 201 / 404 / 500 / 501 / 503 を「表示すべき応答」として扱い、textarea にロケール文言を出す。**201 も含まれる**ため、save 成功時もメッセージが出る。

### 4.4 backend 実装ごとの差（移植の観点）

| backend | list | save | load | import | 備考 |
|---|---|---|---|---|---|
| `php-file` | ✓ | ✓ | ✓ | — | `data/` に平置き。house 到達点に最も近い |
| `php-postgresql` | ✓ | ✓ | ✓ | ✓ | save/load/list は PG テーブル `wwwsqldesigner` に XML を格納。**`save` は `get_magic_quotes_gpc()` を呼ぶため PHP 8 では動作しない**（PHP 8.0 で削除済み）。実測で save/load/list を php-file で行ったのはこのため |

### 4.5 introspection（`import`）のレスポンス構造 — 実測

実出力: [`samples/introspection-postgresql.xml`](samples/introspection-postgresql.xml)（PostgreSQL 18.4 / 5311 bytes）。

構造は `db/<db>/datatypes.xml` の全文を先頭に連結し、その後ろにテーブル定義を並べたもの。

```xml
<sql db="postgresql">
  <datatypes db="postgresql"> … db/postgresql/datatypes.xml の中身をそのまま … </datatypes>
  <table name="users">
    <comment>ユーザー</comment>
    <row name="id" null="0" autoincrement="0">
      <datatype>UUID</datatype><default>uuidv7()</default>
    </row>
    <row name="author_id" null="0" autoincrement="0">
      <datatype>UUID</datatype><default></default><comment>…</comment>
      <relation table="users" row="id" />          <!-- FK は row の中 -->
    </row>
    <key name="users_pkey" type="PRIMARY"><part>id</part></key>
  </table>
</sql>
```

- テーブル順は `table_name` 昇順。`null="0"` が NOT NULL、`autoincrement` は**常に 0**。
- `<default>` は PG の `column_default` をそのまま（`uuidv7()` / `now()` / `'{}'::jsonb` / `true` / `0`）。
- comment はテーブル・カラムとも出力され、日本語も UTF-8 でそのまま通る。
- 複合 PK は `<part>` の並びで表現される。

**型マッピング（`information_schema.columns.data_type` がそのまま大文字化される）**

| PG の型 | `<datatype>` | 移植時の注意 |
|---|---|---|
| `uuid` | `UUID` | |
| `text` | `TEXT` | |
| `boolean` | `BOOLEAN` | |
| `integer` | `INTEGER` | |
| `date` | `DATE` | |
| `jsonb` | `JSONB` | |
| `timestamptz` | `TIMESTAMP WITH TIME ZONE` | |
| `numeric(12,2)` | `NUMERIC` | **精度・スケールが落ちる** |
| `text[]` | `ARRAY` | **要素型が落ちる**（`udt_name` を見ていないため） |

### 4.6 現行 introspection の既知の不具合（PG18 実測で判明）

移植時に「挙動不変」を目指してはいけない箇所。詳細な判断は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログを参照。

1. **出力 XML が well-formed でない（`</key>` が余分に出る）**
   PostgreSQL 18 は NOT NULL 制約を `information_schema.table_constraints` に `<table>_<col>_not_null` / `CHECK` として出す（実測: サンプル 3 テーブルで 22 制約中 15 件がこれ）。
   `backend/php-postgresql/index.php` の keys ループは `_not_null` + CHECK を読み飛ばす際、**直前に `</key>` を出力してから `continue` する**ため、開始タグの無い `</key>` が残る。
   実測では `articles` と `users` で発生し、XML パーサが `The 'table' start tag … does not match the end tag of 'key'` で失敗する。**つまり PG18 に対する現行 import はフロントでも読み込めない。**
   （`article_tags` は制約名の並び順の偶然で発生しなかった。）
2. **index が一切出力されない**
   index 収集ループが `indisunique == 't'` / `indisprimary == 't'` のときに `continue` ではなく **`break`** しており、PK の index に当たった時点でループごと抜ける。
   実測でも `idx_articles_author_id` / `idx_articles_published_on_title` が実在するのに出力に現れない。

## 5. フロント構成の把握（実測）

### 5.1 読み込み順（＝依存の薄い順のおおよその指標）

かつて `index.html` に並んでいた 18 本の `<script src>` は、**§3 段階1 で `src/main.ts` の
import 列に移し、段階3-0 で [`../src/app.ts`](../src/app.ts) に分離した**（順序はどちらも同じ）。
`src/app.ts` は js/ を評価するだけで起動はせず、[`../src/main.ts`](../src/main.ts) が
`import "./app.ts"` ＋ `new SQL.Designer()` を持つ。読み込み順の定義はこの 1 か所だけで、
Node ハーネスも同じ `src/app.ts` を束ねて使う（§5.4）。

```
oz.ts  →  config.ts  →  globals.ts  →  visual.ts  →  row.ts  →  table.ts  →  relation.ts
      →  key.ts  →  rubberband.ts  →  map.ts  →  toggle.js  →  io.js
      →  tablemanager.js  →  rowmanager.js  →  keymanager.js  →  window.js  →  options.js
      →  wwwsqldesigner.js
```

**この順序がそのまま `.ts` 化の順序**でもある（§5.5）。段階3-1 で先頭 3 本、段階3-2 で
続く描画中核 7 本、段階3-3b で末尾 8 本が `.ts` になり、**`js/` に `.js` は 1 本も残っていない**。

- `oz.ts` は upstream 独自の DOM / イベント / XHR ライブラリ（`OZ.*`）。`OZ.Request` が全通信の入口。
  **§3 段階2 で `OZ.Class` 系（参照 0）と ES5 polyfill 群を撤去**し、
  **段階3-1 で `.ts` 化とともに IE 専用分岐・参照 0 の API（`select` / `gecko` / `webkit` / `khtml`）を撤去**した。
- `globals.ts` はロケール関数 `_()` と `SQL` 名前空間（`publish` / `subscribe` / `escape`）。
  polyfill は段階2 で撤去。`SqlNamespace` 型もここにある（段階3-1）。**段階3-2 で
  `SqlDesigner`（`Designer` インスタンスの面）が [`../types/globals.d.ts`](../types/globals.d.ts)
  から移設され、描画中核 7 本の `this.owner` はすべてこの 1 つの宣言を見る**。
- `visual.ts` → `row.ts` / `table.ts` / `relation.ts` / `key.ts` が描画中核（Tier 2 で温存）。
  **段階2 で ES クラス階層になり、段階3-2 で `.ts` 化した**（§5.4）。
- `wwwsqldesigner.js` の `SQL.Designer` が全体のオーナー（オプション・cookie・XHR ヘッダ・`toXML()`）。
  **段階2 でクラス（`SQL.Designer`）と唯一のインスタンス（`SQL.designer`）に分離**した。
- **`.ts` 化はこの読み込み順の先頭から進める**（§5.5）。葉から進めると未 `.ts` のグローバルに対する
  ambient 宣言が要り、それ自体が後で捨てる作業になるため。

**相互参照はすべて import に置き換わった。** 裸のグローバル（`OZ` / `CONFIG` / `SQL` / `DATATYPES` /
`LOCALE` / `_`）を読むファイルはもう無い。ただし定義側の `window` 登録（[`../js/oz.ts`](../js/oz.ts) /
[`../js/config.ts`](../js/config.ts) / [`../js/globals.ts`](../js/globals.ts) の
`OZ`・`CONFIG`・`_`・`DATATYPES`・`LOCALE`・`SQL`）と `declare global` は**段階3-4 まで残す**
（`index.html` や外部から触る面の確認と同時に撤去するほうが安全なため）。`DATATYPES` と `LOCALE` は
[`../js/wwwsqldesigner.ts`](../js/wwwsqldesigner.ts) とテストが `window` 越しに差し替えるので、
撤去時にその経路の設計が要る。
クラスは `window` にではなく `SQL` 名前空間に載る（`SQL.Row = Row;` 等）ので、その型は
`SqlNamespace` が持つ（§5.5）。段階2 の class 化でも段階3 の `.ts` 化でもこの前提は崩していない
（§5.4 の「2 つの実行系」を参照）。

### 5.1.1 ビルドと配信

| | 何が配る | 用途 |
|---|---|---|
| `npm run dev` | Vite dev server（127.0.0.1:4173、root＝リポジトリルート） | 開発。`npm run test:browser` の webServer もこれ |
| `npm run build` | `dist/`（index.html ＋ bundle ＋ CSS、`db/` `locale/` `images/` は static-copy） | 配布物。`npm run test:dist` がスモークを張る |
| `npm test` | vite の build API が `src/app.ts` を単一 IIFE に束ねる（`write: false` なのでディスクには出さない） | Node ハーネスが jsdom に流す（§5.4・[`TESTING.md`](TESTING.md)） |

`db/` `locale/` は `OZ.Request` が相対 URL で取りに行き、`images/` はバンドル後の CSS が
`url(../images/…)` のまま参照するので、いずれも Rollup の依存グラフに乗らない。
[`../vite.config.ts`](../vite.config.ts) の `viteStaticCopy` がこの 3 つを dist へコピーしている。

### 5.2 DDL 生成が XSLT である点（特性化テストへの影響）

SQL 出力は JS ではなく **`db/<db>/output.xsl`（XSLT 1.0）をブラウザの `XSLTProcessor` で適用**して得ている（[`../js/io.js`](../js/io.js) の `clientsql()`（:530）と `finish()`（:538-562））。`<xsl:output method="text"/>` で `CREATE TABLE …` を直接組み立て、`.trim()` して `#textarea` に入れる。

> 旧版の本書はこのメソッドを `sql()` と書いていたが、実装名は **`clientsql()`**。

このため HANDOVER §7 の **DDL golden テストは XSLT の出力に対して組む**必要がある。Node/Vitest には `XSLTProcessor` が無い。**この分岐点は 2026-08-09 に決着済み**（[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログ）— golden は実ブラウザ（Playwright/Chromium）で採り、日常回帰は jsdom + `xslt-processor` で回すハイブリッド構成。詳細は [`TESTING.md`](TESTING.md)。HANDOVER §6.3 の SQL エクスポート規約も最終的にこの層の置き換えになる。

### 5.3 外部依存

`index.html` は Dropbox 連携のため **CDN から `dropbox.js` を読み込む**（`//cdnjs.cloudflare.com/…`）。Docker でローカル完結させる方針（HANDOVER §2）と噛み合わないため、Dropbox 機能の存廃とあわせて扱いを決める必要がある。特性化テストは常にこの読み込みを遮断してオフラインで走らせている（[`../tests/browser/harness.ts`](../tests/browser/harness.ts)）。§3 段階1 でも据え置いた（`<script src="//cdnjs…">` は Vite が外部 URL として素通しする）。

### 5.4 クラス階層と 2 つの実行系（§3 段階2）

`SQL.Visual` を頂点とする 8 クラスは段階2 で ES クラス構文になった。判断の根拠は
[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログ。**`Visual` を継承しない 7 クラス
（`IO` / `Toggle` / `TableManager` / `RowManager` / `KeyManager` / `Window` / `Options`）は段階2 では
見送られていたが、段階3-3a で同じ規則で class 化した**（`js/` に `function` ＋ prototype 方式は残っていない）。

| クラス | ファイル | `_build` | 親メソッド呼び出し | 静的 | `dom` の形（`.ts` 化後の型） |
|---|---|---|---|---|---|
| `Visual`（基底） | `visual.ts` | 空 | — | — | `VisualDom = {container, title}`。**型引数 `D` で差し替える** |
| `Key` | `key.ts` | 継承 | **なし**（`destroy` は基底を呼ばない） | — | 使わない（基底のまま） |
| `Rubberband` | `rubberband.ts` | 継承 | — | — | `VisualDom`（`title` は永久に null・参照 0） |
| `Minimap`（`SQL.Map`） | `map.ts` | 継承 | — | — | `MinimapDom = VisualDom + port` |
| `Relation` | `relation.ts` | 継承 | **なし**（`destroy` は基底を呼ばない） | `_counter` | **配列**（SVG path 1 本 or div 3 本）＝ `[RelationNode, ...RelationNode[]]` |
| `Row` | `row.ts` | **上書き** | `super.setTitle` / `super.destroy` | — | `RowDom = VisualDom + 固定 3 + RowEditDom`（後付け 8 個） |
| `Table` | `table.ts` | **上書き** | `super.setTitle` / `super.destroy` | `active` / `x` / `y` | `TableDom = VisualDom + content + mini` |
| `Designer` | `wwwsqldesigner.ts` | 継承 | **なし**（`setTitle` は `document.title` のみ） | — | `DesignerDom = VisualDom + svg`。段階3-3b で `Visual<DesignerDom>` に乗った |

構造上おさえておく点。

- **二相構築（`_init` / `_build`）の呼び出しは基底コンストラクタに無い。** 各サブクラスが自分の
  コンストラクタで呼ぶ。`Table._build()` が `this.owner.map.dom.container` を読むため、
  ES クラスの「`super()` 前に `this` を触れない」制約と両立させるにはこの形しかない。
  クラスフィールド初期化子も同じ理由で使っていない（`super()` 直後に走って順序が変わる）。
- **`Relation` だけ `dom` が配列**で、基底が入れた `{container, title}` を上書きする。基底で `dom` の型を
  決められない原因そのもので、`dom` バッグは全体で 3 形態ある（(i) 固定キー＋後付け／(ii) 文字列キーの
  動的代入 `this.dom[id] = elm`／(iii) この配列）。**段階3-2 で (i) と (iii) が決着した**：
  基底 `Visual` を `class Visual<D = VisualDom>` にして各サブクラスが型引数で自分の形を渡す。
  基底を固定型にしてサブクラスで `declare dom` 再宣言する案は `Relation` が TS2415 で成立せず、
  `D extends VisualDom` の制約も配列を排除する。
  **(ii) は段階3-3b で決着した**：該当する `io` / `keymanager` / `rowmanager` / `tablemanager` は
  `Visual` を継がないので、完成形（`IoDom` ほか）を interface で宣言し、初期化とループ代入の
  2 行にだけキャストを置く（4 本で合計 8 個）。形態 (i) の `Designer` は `Visual<DesignerDom>` に乗った。
- クラス名 `Minimap` は ES 標準の `Map` との衝突を避けるため。公開名は `SQL.Map` のまま。

**2 つの実行系の差は §3 段階3-0 でほとんど消えた。** Node ハーネスも
[`../src/app.ts`](../src/app.ts) を vite で束ねた単一 IIFE を評価する形になり、
スコープの性質と strict がブラウザ側と揃った（[`TESTING.md`](TESTING.md)）。

| | ESM（`npm run dev` / `build` / `test:browser` / `test:dist`） | Node ハーネス（`npm test`） |
|---|---|---|
| 評価の単位 | モジュール | **同じ `src/app.ts` を束ねた単一 IIFE** |
| スコープ | モジュールスコープ | IIFE スコープ（同じく閉じている） |
| strict | **常に strict** | **`"use strict";` を前置**。ただし暗黙グローバル代入だけは jsdom の Window（vm の contextified global＝Proxy）で素通りする |
| DOM | 本物 | jsdom。レイアウトしないので `offsetWidth` / `offsetHeight` は常に 0 |

- どちらの実行系でも、`class X { … }` と書いたら**同一ファイル内で必ず `SQL.X = X;`** する。
  `js/` に import/export が無く、ファイル跨ぎの参照が `SQL.` 経由だから。
  （段階2 の時点では「`window.eval` では lexical 宣言がグローバルに残らない」ことが直接の理由
  だったが、バンドル経由になった今は両実行系とも閉じたスコープなので、理由は依存グラフ側に
  一本化された。**段階3-1 で `.ts` 化した 3 本はこの制約から外れ**、`export` ＋ `window` 登録に
  移行している。残り 15 本は `.ts` になるまで従来どおり。）
- 暗黙グローバルは**ブラウザでだけ落ちる**。段階2 で直した 2 件（`js/io.js` の `req`、
  `js/oz.js` の `y`）はこれに当たり、「現行挙動」が実行系で割れていたため挙動不変の例外として修正した。
  段階3-0 の `"use strict"` 前置でも jsdom 側は捕まえられない（上表・実測は
  [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログ）。

### 5.5 `.ts` 化の進捗と移行イディオム（§3 段階3）

段階3 は `js/` 18 本・4,183 行を `.ts` にする作業で、**読み込み順（§5.1）の先頭から 1 本ずつ**進める。
判断の根拠は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログ。

| 段階 | 対象 | 状態 |
|---|---|---|
| 3-0 | Node ハーネスを IIFE バンドル化（`js/` は無改修） | 済（2026-08-11） |
| 3-1 | `oz` / `config` / `globals` | 済（2026-08-12） |
| 3-2 | 描画中核 `visual` / `row` / `table` / `relation` / `key` / `rubberband` / `map` | 済（2026-08-12） |
| 3-3a | prototype 方式 7 本（`io` / `toggle` / `tablemanager` / `rowmanager` / `keymanager` / `window` / `options`）を class 化（`.js` のまま。§5.4） | 済（2026-08-12） |
| 3-3b | `toggle` / `io` / `tablemanager` / `rowmanager` / `keymanager` / `window` / `options` / `wwwsqldesigner` の `.ts` 化 | 済（2026-08-12） |
| 3-4 | `window` 登録と `declare global` の撤去、`strict` の最終確認 | 未 |

段階3-3b で **`types/globals.d.ts` は役目を終えて削除**した（最後まで残っていた `window.d` の宣言は
[`../src/main.ts`](../src/main.ts) へ移した）。[`../tsconfig.json`](../tsconfig.json) の `checkJs` も
落としてある（`allowJs` だけは [`../vitest.config.ts`](../vitest.config.ts) が
`scripts/canonical-cwd.mjs` を import するために残る）。

着手前の実測（`tsc --allowJs --checkJs --noEmit --strict --noUncheckedIndexedAccess`）は **1,281 件**。
うち TS2304 の 364 件は「裸グローバルが宣言されていないだけ」で import 化すれば消える。実質の型作業は
TS2339 381 / TS2532+2531 251 / TS7006 210 で、**本丸は `dom` バッグの 3 形態**（§5.4）＝ 段階3-2
（同段階の内訳は 550 件）。**段階3-3 の残り 8 本は 619 件**（TS2339 239 / TS2304 223 / TS7006 105 /
その他 52）で、TS2339 の大半は `SQL.X = function(){}` ＋ prototype 方式そのものに由来する。
`.ts` 化の前に構造を正すのが安いので、class 化だけを 3-3a として切り出した（段階2 が
「承認済みスコープを広げない」として見送っていた分）。

守る規約は 5 つ。

1. **`.ts` 化 ＝ モジュール化。** 非モジュールのまま `.ts` にすると `class Window` / `Options` / `Key` /
   `Table` がグローバル型空間に出て `lib.dom` と衝突する。ただし未 `.ts` の参照側のために
   `window.X = X` と `declare global` は残し、段階3-4 でまとめて撤去する。
2. **読み込み順の先頭から。** 移行用の ambient 宣言ファイルは作らない。例外は実行時インスタンス
   （`SQL.designer`）で、import にすると循環するため `SQL` 名前空間オブジェクト経由のまま。
3. **実行コードは変えない。** 型は注釈・`as`・オーバーロードで通す。`if (!x) return;` のような
   実行時ガードを足さない（挙動が変わる）。`any` で埋めない。
4. **死にコードの撤去は実測してから。** 「対象実行系（Chromium / jsdom）で一度も評価されない」ことを
   両方で計測し、結果を台帳に残す（段階2 の polyfill 撤去と同じ論法）。
5. **インスタンスプロパティは必ず `declare` で宣言する**（段階3-2 で追加。3-3 / 3-4 でも効き続ける）。
   [`../tsconfig.json`](../tsconfig.json) の `target` が ES2022 ＝ `useDefineForClassFields` が既定 true
   なので、`declare` なしの宣言はクラス本体に emit され、構築時に own property が生えて挙動が変わる
   （`!` による definite assignment assertion でも emit される）。Vite/esbuild も同じフラグを見るので
   dist にも出る。逆に `Table` の `static active` / `x` / `y` には**付けない**（現行が既に emit している）。
   この規則が守れていれば `.ts` 化のバンドル差分は「module 配線＋意図したコード変更」に収束するので、
   `npm run build` の出力 diff を副次的な成功判定に使える（実際に段階3-2 で検算した）。

型設計を貫く原理は「**型は構築完了後の状態を記述し、嘘は初期化の 1 行に閉じ込める**」。
`Visual._init()` の `container: null`、`Row` の後付け 8 キー、`Relation.dom = []` はいずれも
「型と食い違う瞬間があるが、その間に誰も読めない」構造で、optional や union で毎回の読み出しに
不確実性を撒くより、初期化の 1 行に `as unknown as` を置いて不変条件をコメントで残すほうが安い
（規約 3 と衝突しない）。

段階3-1・3-2 で決めた型のうち、後続に効くもの。

| API | 型 | 理由 |
|---|---|---|
| `OZ.$` | `<T extends EventTarget = HTMLElement>(x: string \| T) => T` | 戻りを non-null に。`null` を出すと呼び出し 60 箇所がガード追加を要求され規約 3 と衝突する。制約が `EventTarget` なのは `document` / `window` を渡す呼び出しが 11 件あるため |
| `OZ.DOM.elm` | `<K extends keyof HTMLElementTagNameMap>(name: K, opts?) => HTMLElementTagNameMap[K]` | 呼び出し 38 箇所のタグ名がすべてリテラル。段階3-2 で `dom` バッグの型を決める材料になる |
| `OZ.Event.target` | `(e: Event) => HTMLElement` | 呼び出し 5 箇所は `nodeName` を読むか `dom.title` と比較するだけ |
| `OZ.Request` | `(url, callback?, options?) => XMLHttpRequest \| false` | `false` は [`../tests/node/harness.ts`](../tests/node/harness.ts) の差し替え実装が返す |
| `OZ.$`（3-2 で追補） | 上に加えて `(x: string) => HTMLElement` のオーバーロード | 単一シグネチャだと文字列を渡したとき `T` の推論候補に `string` が入り、制約違反で `EventTarget` にフォールバックする（既定の `HTMLElement` は候補が 1 つも無いときしか使われない） |
| `OZ.Event.add`（3-2） | `<E extends Event = Event>(elm, event, cb: (e: E) => void) => number` | `EventListener` は呼び出しシグネチャなので `strictFunctionTypes` が効き、`click(e: MouseEvent)` を bind して渡すと反変で TS2345。登録は 3-2 で 21 箇所、3-3 でさらに 40 箇所超 |
| `SqlDesigner`（3-2） | [`../js/globals.ts`](../js/globals.ts) の `export interface` | 描画中核 7 本の `this.owner` の面を 1 か所に集約。7 本にローカル interface を書くと面がずれても気づけず、削除コストも 7 倍。段階3-3 で `import type { Designer }` に置き換わる |
| `SqlNamespace`（3-2） | `Visual` / `Row` / `Table` / `Relation` / `Key` / `Rubberband` / `Map` を追加 | `.ts` 側は import した `SQL` に代入するので、宣言が無いと代入自体が TS2339（`.js` のようなグローバル型の合成は起きない）。同時にこれが `new SQL.Row(...)` を import に書き換えずに済む根拠でもある |
| `SqlDesigner`（3-3b） | `export type SqlDesigner = Designer;`（実体への型エイリアス） | 3-2 の構造的 interface を実体に置き換えた。参照している 13 本は無改修。近似で書いていた面は実体との食い違いが `typecheck` で出る（`getOption` の戻りが `string \| number \| boolean` だったのはこれで判明） |
| `dom` 形態 (ii)（3-3b） | 完成形を `IoDom` / `TableManagerDom` / `RowManagerDom` / `KeyManagerDom` で宣言 | 初期化に `as unknown as XxxDom` 1 個、ループ代入に `(this.dom as unknown as Record<string, HTMLInputElement>)[id]` 1 個。4 本で計 8 個のキャストと引き換えに読み出しが全部注釈ゼロで通る |
| `SqlNamespace`（3-3b） | 残り 8 クラスを追加し、`Designer: typeof Designer` / `designer: Designer` に | `SQL.Window` は `lib.dom` の `Window` と同名なので、import 側で `import type { Window as SqlWindow }` と改名して受ける |

## 6. 特性化テストの構成（HANDOVER §7・実装済み）

走らせ方・golden の更新手順・fixture の追加手順は [`TESTING.md`](TESTING.md) に集約した。ここでは現行構成との対応だけ示す。

| 何を固定するか | どこで採るか | 出力 |
|---|---|---|
| DDL（`db/<db>/output.xsl` の適用結果） | 実ブラウザ（Chromium の `XSLTProcessor`）。§5.2 の `finish()` と同一経路 | `tests/golden/ddl/<db>/<fixture>.sql`（7 fixture × 9 DB = 63 本） |
| `SQL.Designer.toXML()` の出力 | 同上 | `tests/golden/xml/<fixture>.xml`（7 本） |
| round-trip / 決定論 | 同上 | アサートのみ（golden なし） |
| 高速回帰 | Node（jsdom ＋ `xslt-processor`）。同じ fixture・**同じ golden**を読むだけ | — |
| 既知の不具合 | 実ブラウザ。golden を持たず「現在こう壊れている」を直接アサート | `tests/known-issues/` |
| 配布物（§3 で追加） | 実ブラウザ。`vite build` → `vite preview` に対するスモーク | `tests/dist/`（golden は読むだけ） |

- **golden は実ブラウザ採取のものが唯一の正**。Node 側は書き込まない。
- 現行コードは抽出せずそのまま動かす。モデル層が描画 DOM と密結合（§5）なうえ、先に抽出すると「抽出後のコード」を特性化することになり安全網の意味が消えるため。抽出は HANDOVER §4 の仕事。
- `xslt-processor` が XSLT 1.0 を満たしていない 3 DB（`oracle` / `sqlalchemy` / `vfp9`）は Node 側の DDL 回帰から外れ、ブラウザ側だけがカバーする。原因は [`../tests/node/parity-exceptions.ts`](../tests/node/parity-exceptions.ts) に実測付きで記録。
