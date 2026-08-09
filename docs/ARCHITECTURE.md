# ARCHITECTURE.md — grabado 現行構成と移行対応

`ondras/wwwsqldesigner` 由来の現行構成の把握と、house 新アーキテクチャ（[`HANDOVER.md`](HANDOVER.md)）への対応図。

> ステータス: **§0「現物確認」実施済み（2026-08-09）／§7「特性化テスト」緑化済み（2026-08-09）**。
> §4 は実測値。実測環境・手順も §4.1 に記載。テストの構成と走らせ方は [`TESTING.md`](TESTING.md)。

---

## 1. 現行（wwwsqldesigner）ディレクトリ構成（取り込み時点）

```
index.html                アプリ本体（SPA エントリ。末尾で new SQL.Designer()）
js/                        描画エンジン・UI・IO（保持＝Tier 2 で TS 化）
  config.js                アプリ設定（CONFIG.*。旧 config.xml ではなく JS リテラル）
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
| frontend | 素の JS（`js/`）＋グローバル `SQL.*` | 完全 TS 化（Vite/strict）。描画エンジンは温存 | Tier 2 |
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
- [ ] ブラウザ UI からの end-to-end 操作確認（HTTP レベルの契約は §4 で確定済み。UI 操作の目視確認は未実施）

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

`index.html` の `<script>` 順:

```
oz.js  →  config.js  →  globals.js  →  visual.js  →  row.js  →  table.js  →  relation.js
      →  key.js  →  rubberband.js  →  map.js  →  toggle.js  →  io.js
      →  tablemanager.js  →  rowmanager.js  →  keymanager.js  →  window.js  →  options.js
      →  wwwsqldesigner.js
```

- `oz.js` は upstream 独自の DOM / イベント / XHR ライブラリ（`OZ.*`）。`OZ.Request` が全通信の入口。
- `globals.js` はロケール関数 `_()` と ES5 polyfill 群。
- `visual.js` → `row.js` / `table.js` / `relation.js` / `key.js` が描画中核（Tier 2 で温存）。
- `wwwsqldesigner.js` の `SQL.Designer` が全体のオーナー（オプション・cookie・XHR ヘッダ・`toXML()`）。
- TS 化は「`globals`/`config` → `io` → manager 群 → 描画中核」の順が依存的に無理がない。

### 5.2 DDL 生成が XSLT である点（特性化テストへの影響）

SQL 出力は JS ではなく **`db/<db>/output.xsl`（XSLT 1.0）をブラウザの `XSLTProcessor` で適用**して得ている（[`../js/io.js`](../js/io.js) の `clientsql()`（:527）と `finish()`（:535-559））。`<xsl:output method="text"/>` で `CREATE TABLE …` を直接組み立て、`.trim()` して `#textarea` に入れる。

> 旧版の本書はこのメソッドを `sql()` と書いていたが、実装名は **`clientsql()`**。

このため HANDOVER §7 の **DDL golden テストは XSLT の出力に対して組む**必要がある。Node/Vitest には `XSLTProcessor` が無い。**この分岐点は 2026-08-09 に決着済み**（[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログ）— golden は実ブラウザ（Playwright/Chromium）で採り、日常回帰は jsdom + `xslt-processor` で回すハイブリッド構成。詳細は [`TESTING.md`](TESTING.md)。HANDOVER §6.3 の SQL エクスポート規約も最終的にこの層の置き換えになる。

### 5.3 外部依存

`index.html` は Dropbox 連携のため **CDN から `dropbox.js` を読み込む**（`//cdnjs.cloudflare.com/…`）。Docker でローカル完結させる方針（HANDOVER §2）と噛み合わないため、Dropbox 機能の存廃とあわせて扱いを決める必要がある。特性化テストは常にこの読み込みを遮断してオフラインで走らせている（[`../tests/browser/harness.ts`](../tests/browser/harness.ts)）。

## 6. 特性化テストの構成（HANDOVER §7・実装済み）

走らせ方・golden の更新手順・fixture の追加手順は [`TESTING.md`](TESTING.md) に集約した。ここでは現行構成との対応だけ示す。

| 何を固定するか | どこで採るか | 出力 |
|---|---|---|
| DDL（`db/<db>/output.xsl` の適用結果） | 実ブラウザ（Chromium の `XSLTProcessor`）。§5.2 の `finish()` と同一経路 | `tests/golden/ddl/<db>/<fixture>.sql`（7 fixture × 9 DB = 63 本） |
| `SQL.Designer.toXML()` の出力 | 同上 | `tests/golden/xml/<fixture>.xml`（7 本） |
| round-trip / 決定論 | 同上 | アサートのみ（golden なし） |
| 高速回帰 | Node（jsdom ＋ `xslt-processor`）。同じ fixture・**同じ golden**を読むだけ | — |
| 既知の不具合 | 実ブラウザ。golden を持たず「現在こう壊れている」を直接アサート | `tests/known-issues/` |

- **golden は実ブラウザ採取のものが唯一の正**。Node 側は書き込まない。
- 現行コードは抽出せずそのまま動かす。モデル層が描画 DOM と密結合（§5）なうえ、先に抽出すると「抽出後のコード」を特性化することになり安全網の意味が消えるため。抽出は HANDOVER §4 の仕事。
- `xslt-processor` が XSLT 1.0 を満たしていない 3 DB（`oracle` / `sqlalchemy` / `vfp9`）は Node 側の DDL 回帰から外れ、ブラウザ側だけがカバーする。原因は [`../tests/node/parity-exceptions.ts`](../tests/node/parity-exceptions.ts) に実測付きで記録。
