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
  io/palette.ts            ★ §4 段階4-0b で追加。型パレット層（旧 window.DATATYPES）
  io/model.ts              ★ §4 段階4-1a で追加。直列化の中間モデル（型のみ・emit 0）
  io/extract.ts            ★ §4 段階4-1a で追加。ライブツリー → DesignModel
  io/ddl/                  ★ §6 段階6-5a で追加。db/<db>/output.xsl（XSLT 1.0・5 本）の置き換え
    generate.ts              入口。DesignModel + TypePalette → DDL 文字列
    shared.ts                型解決と既定値の引用（XSLT が見ていた入力に相当する構造体を組む）
    ansi.ts                  CREATE TABLE ＋ ALTER TABLE 系の共通骨格（postgresql / sql-standard / h2）
    postgresql.ts            8 プロファイル。mysql 系 / mssql / oracle / sqlite は骨格が違うので独立
  io/xml-parser.ts         ★ §4 段階4-1b で追加。XML → DesignModel（形式側・ライブツリーに触らない）
  io/apply.ts              ★ §4 段階4-1b で追加。DesignModel → ライブツリー（形式を知らない）
  config.ts                アプリ設定（CONFIG.*。旧 config.xml ではなく JS リテラル）
styles/                    スタイル（保持）
locale/                    多言語（日本語ロケール微調整の対象）
db/<db>/                   DB プロファイル。型パレット差分の対象
  datatypes.xml            型パレット定義（**段階6-5a 以降、db/ にはこれしか無い**）
~~backend/~~               **段階5-2 で撤去**（PHP 15 本 ＋ submodule `php-s3/amazon-s3-php`）。
                          ★ 旧実装は commit 7b3bb3d に残っている:
                              git show 7b3bb3d:backend/php-file/index.php
                              git show 7b3bb3d:backend/php-postgresql/index.php
                          実測の結果は §4 に、introspection の実出力は
                          samples/introspection-postgresql.xml にバイト列で固定してある。
server/                   ★ §5 段階5-1b で追加。Kotlin / Spring Boot 4（下記）
  src/main/kotlin/dev/grabado/
    api/                    URL 形状・status・ヘッダ（契約を持つ唯一の層）
    design/                 keyword の検証（純粋）と正本ディレクトリへの I/O
    config/                 設定（@ConfigurationProperties）とセキュリティヘッダ
  gradle/libs.versions.toml 版はここ 1 か所（Dependabot が読む）
  gradle.lockfile           依存ロック（org security-baseline §3.12）
license.txt               BSD License（保持必須）
Dockerfile                upstream の Dockerfile（busybox httpd。house 版で置換予定）
```

## 2. 移行対応図（現行 → house）

| 層 | 現行 | house 到達点（HANDOVER） | Tier |
|---|---|---|---|
| frontend | 素の JS（`js/`）＋グローバル `SQL.*`。**§3 段階1 で Vite バンドル化・段階2 で ES クラス化・段階3-1〜3-3b で 18 本すべてを `.ts` 化・段階3-4 で `SQL.*` と `window` 登録を撤去** | 完全 TS 化（Vite/strict）。描画エンジンは温存 | Tier 2 |
| **DDL 生成** | ~~`db/<db>/output.xsl`（XSLT 1.0 をブラウザの `XSLTProcessor` で実行）~~ → **段階6-5a で [`../js/io/ddl/`](../js/io/ddl/) へ逐語移植（XSLT は撤去）** | TS 実装（**§6.3 の規約は 6-5b**） | — |
| IO | XML 永続化（読み書き） | JSON 統一・決定論出力。XML は読込専用に | — |
| backend | ~~PHP（`backend/php-*`）~~ **段階5-2 で撤去** | Kotlin/Spring Boot（file I/O ＋ introspection＋AI proxy）。**段階5-1b で `server/` に実体が入り、list/load/save は実測契約を満たしている**（§7）。introspection は 5-7、AI proxy は §11 | — |
| 永続化 | 共有 PG / ファイル 各種 | git 管理 JSON ファイル正本（DB レス既定） | — |
| 型パレット | `db/*/datatypes.xml` | PostgreSQL 18 型パレット（§6.1）。**`postgresql` は段階6-3 で差し替え済み**（24 型・`strict="1"`）。残る 4 本は 6-8 | — |
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

## 4. backend 契約（実測・旧 PHP。**段階5-2 で撤去済み**）

**この章は upstream の PHP backend を実際に起動して測った記録**で、`backend/` は段階5-2 で
リポジトリから消えた。**旧実装は commit `7b3bb3d` に残っている**:

```bash
git show 7b3bb3d:backend/php-file/index.php         # save / load / list の形
git show 7b3bb3d:backend/php-postgresql/index.php   # introspection の SQL（§4.6 の 2 不具合込み）
```

凍結コピーを `docs/` に置くことはしない（それ自体が二重管理になる）。introspection の実出力は
[`samples/introspection-postgresql.xml`](samples/introspection-postgresql.xml) にバイト列で固定してあり、
5-7 で必要になるのは「どのカタログを読むかの意味」と「出力構造」の 2 つだけ。**PG18 の 2 不具合は
「再現しない」と決めてあるので、そもそも逐語移植ではない。**

**Kotlin 実装が満たすべき契約は §7。** 移植は §4 の実測に一致させるところから始め（段階5-1b は
URL も status も 1 文字も変えない）、そこから段階ごとに変えていく。**変更点は §7 の表に集約する。**

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

[`../js/io.ts`](../js/io.ts) が発行する URL は次の形。

```
<xhrpath>backend/<backend名>/?action=<action>[&keyword=<name>|&database=<name>]
```

- `<xhrpath>` = `CONFIG.XHR_PATH || ""`（[`../js/config.ts`](../js/config.ts) の実値は **空文字**）。cookie `wwwsqldesigner` で上書き可。
- `<backend名>` は画面の backend セレクタの値（`CONFIG.AVAILABLE_BACKENDS`、既定 `php-mysql`）。URL クエリ `?backend=<name>` でも選択できる。
  → **段階5-5 でセレクタごと撤去し、フロントは `backend/file/` に固定した**（§7.1）。サーバは
  このセグメントを読まないままなので、`?backend=` 付きの古い URL も動く。
- `keyword` は `encodeURIComponent` 済み。**段階4-3b から `.json` が付く**（`save` / `load` の
  両方。`jsonKeyword()` が二重付与を防ぐ）。backend は body を解釈せず `basename($keyword)` で
  ファイル名を作るだけなので、フロントが付けるだけで `data/<name>.json` ができる。
  拡張子の**強制**（`.json` 以外の save を拒む・`list` が `*.json` だけを返す）は正本ディレクトリの
  責務なので Kotlin 実装（§5.1）に送ってある。`setTitle` に渡す設計の名前は素のまま。
- **XHR 追加ヘッダは既定で無し**（`SQL.Designer` の `xhrheaders` 初期値は `{}`）。`setXhrHeaders()` は `index.html` にコメントアウトされた例（`Authorization` / `X-CSRF-TOKEN`）があるだけの拡張ポイントで、**現行に CSRF トークンの仕組みは存在しない**。

### 4.3 action 一覧（実測）

`remove` / `connect` は**存在しない**。実装されているのは以下 4 つのみで、未知の action はすべて 501 を返す。

| action | method | 追加パラメータ | リクエスト Content-Type / body | 成功時ステータス | レスポンス Content-Type | レスポンス body |
|---|---|---|---|---|---|---|
| `list` | GET | — | — | 200 | `text/html; charset=UTF-8`（**未指定＝PHP 既定**） | 名前を `\n` 区切り（末尾にも改行） |
| `save` | POST | `keyword` | `application/json` / 設計 JSON（段階4-3b まで `application/xml` / 設計 XML） | **201 Created** | `text/html; charset=UTF-8` | 空 |
| `load` | GET | `keyword` | — | 200 | `text/xml;charset=UTF-8`（PHP は常にこれを返すが、フロントは段階4-3b から**テキストで受けて中身で判別**する） | 保存したバイト列（**バイト単位で同一**） |
| `import` | GET | `database`（php-postgresql では**未使用**） | — | 200 | `text/xml;charset=UTF-8` | introspection XML（§4.5） |
| 上記以外 / 指定なし | — | — | — | **501 Not Implemented** | — | 空 |

その他の実測値（`backend/php-file`）:

- `load` で対象が無い場合 **404 Not Found**。
- `save` は body をそのままファイルに書く。**backend は内容を一切解釈しない**（round-trip はバイト一致を確認済み）。
- `keyword` は `basename()` を通るのでパストラバーサルは封じられる（`../../../traversal-probe` → `data/traversal-probe`）。
- 日本語 `keyword` は URL エンコードで往復し、ファイル名も UTF-8 でそのまま作られる。
- **`keyword` 省略時は 200 + PHP の Fatal error 本文**を返す（`fopen("data/")` が失敗 → `fwrite(false, ...)` で TypeError）。移植先では 400 を返すべき。

`IO.check()`（[`../js/io.ts`](../js/io.ts)）は 201 / 404 / 500 / 501 / 503 を「表示すべき応答」として扱い、textarea にロケール文言を出す。**201 も含まれる**ため、save 成功時もメッセージが出る。

**段階4-6 から、server への保存は `load` → `save` の 2 往復になる。** フロントは save の直前に同じ
`keyword` で `load` を投げ、返ったバイト列を「自分が最後に観測した版」と比べてから本番の save を出す
（read-before-write。理由と限界は [`../js/io/conflict.ts`](../js/io/conflict.ts) の冒頭）。**backend は 1 行も変わっていない** ——
現行 PHP に条件付き更新の手がかり（ETag / Last-Modified）が無いための、フロント側だけの実装。

- プリフライトの **404 は正常系**（＝新規保存）なので `check()` に通さない。textarea を汚さない
- **500 / 501 / 503 は中止**。読めなかったものを上書きしない
- 一致すればそのまま save、違えば `confirm` で止める（既定は中止）
- **200 で本文を返す壊れた backend**（例: MySQL に繋がらない `php-mysql`）は「実体あり」に倒れ、
  上書き前に confirm が出る。実測で確認済み
- **移植時（§5.1）はここを畳む**。`load` の応答に ETag（内容ハッシュ）を付け、`save` は `If-Match` を
  要求して不一致なら **412** を返す。プリフライトが不要になり、read-before-write に残る
  TOCTOU の窓（load と save の間に他者が書くと勝つ）も閉じる

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
io/palette.ts  →  oz.ts  →  config.ts  →  globals.ts
      →  io/extract.ts  →  io/xml-parser.ts  →  io/apply.ts  →  io/ddl/generate.ts
      →  visual.ts  →  row.ts  →  table.ts  →  relation.ts
      →  key.ts  →  rubberband.ts  →  map.ts  →  toggle.ts  →  io.ts
      →  tablemanager.ts  →  rowmanager.ts  →  keymanager.ts  →  window.ts  →  options.ts
      →  wwwsqldesigner.ts
```

`io/palette.ts` が先頭なのは `js/` のどこにも依存しないため（段階4-0b）。段階6-5a まで
`io/` が `globals.ts` の直後だったのは `io/ddl-xml.ts` が `_` に値依存したためで、**その 1 本が
消えたのでいま `io/` に順序の制約は無い**（残りは `import type` だけ）。並びは io/ を
ひと固まりに保つためのもの。型だけの `io/model.ts` は emit が空なので `src/app.ts` には
載せない。**入出力は 2x2 の格子**で、ライブ側（`extract` / `apply`）は形式非依存、
形式側（`xml-parser` / `json-*` / `ddl/` / `orm/`）だけが形式ごとに増える。

**この順序がそのまま `.ts` 化の順序**でもある（§5.5）。段階3-1 で先頭 3 本、段階3-2 で
続く描画中核 7 本、段階3-3b で末尾 8 本が `.ts` になり、**`js/` に `.js` は 1 本も残っていない**。

- `oz.ts` は upstream 独自の DOM / イベント / XHR ライブラリ（`OZ.*`）。`OZ.Request` が全通信の入口。
  **§3 段階2 で `OZ.Class` 系（参照 0）と ES5 polyfill 群を撤去**し、
  **段階3-1 で `.ts` 化とともに IE 専用分岐・参照 0 の API（`select` / `gecko` / `webkit` / `khtml`）を撤去**した。
- `globals.ts` はロケール関数 `_()` と `SQL` 名前空間（`publish` / `subscribe` / `escape`）。
  **`SQL` 名前空間は段階4-0a で、`escape` は段階4-1a で出た**（現在はロケールと pub/sub だけ）。
  polyfill は段階2 で撤去。`SqlNamespace` 型もここにある（段階3-1）。段階3-2 で
  `SqlDesigner`（`Designer` インスタンスの面）が `types/globals.d.ts`（段階3-3b で削除済み）
  から移設されたが、**段階4-1c で撤去し、`this.owner` を持つ 10 本は
  [`../js/wwwsqldesigner.ts`](../js/wwwsqldesigner.ts) の `Designer` を直接 `import type` する**
  （本ファイルは js/ のどこにも依存しなくなった）。
- `visual.ts` → `row.ts` / `table.ts` / `relation.ts` / `key.ts` が描画中核（Tier 2 で温存）。
  **段階2 で ES クラス階層になり、段階3-2 で `.ts` 化した**（§5.4）。
- `wwwsqldesigner.js` の `SQL.Designer` が全体のオーナー（オプション・cookie・XHR ヘッダ・`toXML()`）。
  **段階2 でクラス（`SQL.Designer`）と唯一のインスタンス（`SQL.designer`）に分離**した。
- **`.ts` 化はこの読み込み順の先頭から進める**（§5.5）。葉から進めると未 `.ts` のグローバルに対する
  ambient 宣言が要り、それ自体が後で捨てる作業になるため。

**相互参照はすべて import に置き換わり、定義側の `window` 登録も段階3-4c で撤去した。**
`OZ` / `CONFIG` / `_` / `LOCALE` / `SQL` は素の ES モジュールになっている。**出荷コードが持つ
`window` 面は段階4-0b で 1 つになった**。

| 残る面 | 置き場所 | なぜ残るか |
|---|---|---|
| `window.d` | [`../src/main.ts`](../src/main.ts) | upstream 由来のデバッグハンドル。段階3-4b から page 側テストの入口も兼ねる（`page.evaluate` はバンドル外なので window ハンドルが要る） |

`window.DATATYPES` は**段階4-0b で撤去**し、[`../js/io/palette.ts`](../js/io/palette.ts) の
`TypePalette` を `Designer.palette` として持つ形にした（読み手は owner 鎖で到達。差し替え口は
node が `designer.palette`、page が `window.d.palette`）。
`LOCALE` は「テストが触らない」点だけが `DATATYPES` と違い、段階3-4c でモジュール変数にできた。
Node ハーネスがバンドルの内側に手を届かせる経路は
[`../tests/node/app-entry.ts`](../tests/node/app-entry.ts) の `window.__grabado`（テスト所有）。
**クラスの `SQL` 名前空間登録（`SQL.Row = Row;` 等）は段階3-4a で全廃した。** ファイル跨ぎの
クラス参照は値 import になり、`SqlNamespace` は `{ Designer, designer }` の 2 つまで縮んだ
（`Designer` は 3-4c で消える。`designer` は §4 の DI 化で消える）。pub/sub は
[`../js/globals.ts`](../js/globals.ts) の named export で、`escape` は段階4-1a で
`js/io/ddl-xml.ts` の `escapeXML` になった
（呼び手 3 か所がすべて `toXML` 経路だったので、書き出しの移設と同時に出た）。
**そのモジュールは段階6-5a で消えた** —— XML の書き出しごと無くなったので、
grabado に XML エスケープを持つ場所はもう無い。

### 5.1.1 ビルドと配信

| | 何が配る | 用途 |
|---|---|---|
| `npm run dev` | Vite dev server（127.0.0.1:4173、root＝リポジトリルート） | 開発。`npm run test:browser` の webServer もこれ |
| `npm run build` | `dist/`（index.html ＋ bundle ＋ CSS、`db/` `locale/` `images/` は static-copy） | 配布物。`npm run test:dist` がスモークを張る |
| `npm test` | vite の build API が `src/app.ts` を単一 IIFE に束ねる（`write: false` なのでディスクには出さない） | Node ハーネスが jsdom に流す（§5.4・[`TESTING.md`](TESTING.md)） |

`db/` `locale/` は `OZ.Request` が相対 URL で取りに行き、`images/` はバンドル後の CSS が
`url(../images/…)` のまま参照するので、いずれも Rollup の依存グラフに乗らない。
[`../vite.config.ts`](../vite.config.ts) の `viteStaticCopy` がこの 3 つを dist へコピーしている。

### 5.2 DDL 生成（段階6-5a で XSLT から TS へ）

SQL 出力は [`../js/io/ddl/generate.ts`](../js/io/ddl/generate.ts) が組み立てる。入口は
`generateDdl(model: DesignModel, palette: TypePalette): string` で、`palette.db()` で
プロファイルを選び、`.trim()` した文字列を [`../js/io.ts`](../js/io.ts) の `clientsql()` が
`#textarea` に入れる。**呼び手は `clientsql()` の 1 か所だけ**（保存/読込は段階4-3b で JSON に移った）。

> 旧版の本書はこのメソッドを `sql()` と書いていたが、実装名は **`clientsql()`**。

**段階6-5a まで、ここは `db/<db>/output.xsl`（XSLT 1.0・5 本・計 952 行）をブラウザの
`XSLTProcessor` で適用していた。** `Designer.toXML()` が中間 XML を作り、`clientsql()` が
XHR で XSL を取り、`finish()` が変換する 3 段の経路で、DDL 生成だけが他の形式より 2 段深かった。
この構造は特性化テストの形も決めていた —— Node/Vitest に `XSLTProcessor` が無いため、
golden は実ブラウザ（Playwright/Chromium）で採り、日常回帰は jsdom + `xslt-processor` で回す
ハイブリッドにし、それでも動かない `oracle` は Node 側から外していた（parity 例外）。

**6-5a はその 3 つ（中間 XML・XSLT・parity 例外）をまとめて落とした。** ブラウザと Node で
同じ TS が動くのでエンジン差が無く、oracle も Node 回帰に戻っている。golden を採るのが
実ブラウザだけという分担は変わらない（描画 DOM を通す `state/` と揃えるため）。詳細は
[`TESTING.md`](TESTING.md)。**HANDOVER §6.3 の SQL エクスポート規約は段階6-5b でこの層に入る。**

### 5.3 外部依存

**外部依存は無い。** 段階4-3a まで `index.html` は Dropbox 連携のため CDN から
`dropbox.js` を読んでいた（`//cdnjs.cloudflare.com/…`）が、Docker でローカル完結させる
方針（HANDOVER §2）と噛み合わず、「正本は git 管理ファイル・共有は PR」とも役割が
重複するため Dropbox 機能ごと撤去した。

特性化テストはかつてこの読み込みを `page.route` で遮断してオフラインを保っていたが、
遮断すべきものが無くなったので [`../tests/browser/harness.ts`](../tests/browser/harness.ts)
は**「アプリのオリジン外へリクエストが 1 本でも出たら失敗する」検査**に置き換えた
（撤去が戻ってきたら赤くなる）。

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
- クラス名 `Minimap` は ES 標準の `Map` との衝突を避けるため。段階3-4a で `SQL` 名前空間が消えて
  公開名 `SQL.Map` も無くなったので、識別子は `Minimap` の 1 本になった（`Window` は
  `lib.dom` の型と同名のままなので、参照側が `import { Window as SqlWindow }` で受ける）。

**2 つの実行系の差は §3 段階3-0 でほとんど消えた。** Node ハーネスも
[`../src/app.ts`](../src/app.ts) を vite で束ねた単一 IIFE を評価する形になり、
スコープの性質と strict がブラウザ側と揃った（[`TESTING.md`](TESTING.md)）。

| | ESM（`npm run dev` / `build` / `test:browser` / `test:dist`） | Node ハーネス（`npm test`） |
|---|---|---|
| 評価の単位 | モジュール | **同じ `src/app.ts` を束ねた単一 IIFE** |
| スコープ | モジュールスコープ | IIFE スコープ（同じく閉じている） |
| strict | **常に strict** | **`"use strict";` を前置**。ただし暗黙グローバル代入だけは jsdom の Window（vm の contextified global＝Proxy）で素通りする |
| DOM | 本物 | jsdom。レイアウトしないので `offsetWidth` / `offsetHeight` は常に 0 |

- **「`class X { … }` を書いたら同一ファイル内で必ず `SQL.X = X;`」という規約は段階3-4a で撤回した。**
  段階2 の時点では「`window.eval` では lexical 宣言がグローバルに残らない」ことが直接の理由で、
  段階3-0 でバンドル経由になった後は「ファイル跨ぎの参照が `SQL.` 経由だから」に一本化されていた。
  3-4a でその参照が全部 import になったので、根拠ごと消えている。
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
| 3-4a | `SQL.X = X` 15 本の撤去と `new SQL.X()` 13 箇所の値 import 化、pub/sub と `escape` の named export 化（`js/` のみ） | 済（2026-08-14） |
| 3-4b | テスト面の付け替え（node ハーネスを `window.OZ` 依存から外す、page 側を `window.d` に寄せる。`tests/` のみ） | 済（2026-08-14） |
| 3-4c | `window` 登録と `declare global` の撤去、`LOCALE` のモジュール化、`strict` の最終確認 | 済（2026-08-14） |

**これで段階3（フロント TS 化）は完了。** `strict` / `noUncheckedIndexedAccess` は段階3-1 から
一貫して有効で、`js/` `src/` `tests/` のすべてが `.ts`、`npm run typecheck` は 0 error。

段階3-4 のスコープは「**外部から触れる面（`window`）の撤去**」まで。**内部の可変シングルトン
`SQL.designer`（読み 6 / 書き 1）と `window.DATATYPES` は §4 に繰り越した** — 前者は参照経路の
付け替えではなく「Designer は生涯 1 個」というプログラム不変条件への依存、後者は読み書き 14 箇所の
実行コード変更＋テストが `page.evaluate` 越しに差し替える経路の再設計が要るため。判断の根拠は
[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログ。**どちらも §4 の先頭で解消済み**
（`SQL.designer` は段階4-0a で owner 鎖に、`window.DATATYPES` は段階4-0b で `Designer.palette` に）。

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
   `Table` がグローバル型空間に出て `lib.dom` と衝突する。移行中は未 `.ts` の参照側のために
   `window.X = X` と `declare global` を残していたが、**段階3-4c で撤去済み**（残る 2 面は §5.1）。
2. **読み込み順の先頭から。** 移行用の ambient 宣言ファイルは作らない。例外だった実行時インスタンス
   （`SQL.designer`。import にすると循環するため名前空間オブジェクト経由にしていた）は
   段階4-0a で owner 鎖に置き換わり、`SQL` 名前空間そのものが消えた。
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
| `SqlDesigner`（4-1c で撤去） | — （参照 13 本を `import type { Designer } from "./wwwsqldesigner.ts"` に置換） | 3-3b 以降は名前が 2 つあるだけの状態だった。§4 でモデル層の型が増える前に実体 1 本へ寄せた。**必ずトップレベル `import type`**（インライン形は `verbatimModuleSyntax` で import 文が emit に残り、副作用 import として読み込み順を壊す）。書き方の正本は [`../js/table.ts`](../js/table.ts) の冒頭 |
| `dom` 形態 (ii)（3-3b） | 完成形を `IoDom` / `TableManagerDom` / `RowManagerDom` / `KeyManagerDom` で宣言 | 初期化に `as unknown as XxxDom` 1 個、ループ代入に `(this.dom as unknown as Record<string, HTMLInputElement>)[id]` 1 個。4 本で計 8 個のキャストと引き換えに読み出しが全部注釈ゼロで通る |
| `SqlNamespace`（3-3b） | 残り 8 クラスを追加し、`Designer: typeof Designer` / `designer: Designer` に | `SQL.Window` は `lib.dom` の `Window` と同名なので、import 側で `import type { Window as SqlWindow }` と改名して受ける |

### 5.6 `js/io/` の構成（§4）

§4（IO）は入出力を `js/io/` に集め、描画クラスから `toXML()` / `fromXML()` を
1 行も残さず抜いた。組み方は **2×2 の格子**で、これが分割の原理そのもの
（[`../js/io/model.ts`](../js/io/model.ts) のヘッダが正本）。

```
             ライブ側（描画エンジンを触る）   形式側（バイト列を知る）
   出        extract.ts                     json-serializer.ts / ddl/ / orm/
   入        apply.ts                       json-parser.ts / xml-parser.ts
```

**ライブ側は形式非依存なので一度だけ書く。形式が増えると形式側だけが増える。**
JSON を足したとき（4-2）にライブ側 2 本へ 1 行も触らずに済んだのが、この形の実利。
**段階6-9d で ORM 出力（`orm/`）が 3 本目として入ったときも同じ** —— ライブ側にも
設計 JSON の形式にも 1 行も触っていない。ORM は db プロファイルではなく**出力の別の軸**で、
下敷きのプロファイルの上に乗る（同じ設計から DDL と ORM の両方が出せる）。
型は正規型（`<type kind="...">`。段階6-9c）を介して写す。

| ファイル | 位置 | 役割 |
|---|---|---|
| [`detect.ts`](../js/io/detect.ts) | 入・前段 | 中身の先頭 1 文字で JSON / XML / 空 / 不明を決める。フォールバックは作らない |
| [`json-parser.ts`](../js/io/json-parser.ts) | 入・形式 | 設計 JSON → `DesignModel`。壊れた入力は `tables[0].columns[2].name` の位置つきで throw |
| [`xml-parser.ts`](../js/io/xml-parser.ts) | 入・形式 | 設計 XML → `DesignModel`。**逐語移設**なので現行の受け流す癖（未知の型は添字 0・最後の一致が勝つ）ごと保つ |
| [`apply.ts`](../js/io/apply.ts) | 入・ライブ | `DesignModel` → ライブツリー。**純関数ではない** —— `moveTo()` の snap・`update()` の FK 連鎖・ff hack の**順序**が挙動 |
| [`extract.ts`](../js/io/extract.ts) | 出・ライブ | ライブツリー → `DesignModel`。描画エンジンを知っている唯一の出力側 |
| [`json-serializer.ts`](../js/io/json-serializer.ts) | 出・形式 | `DesignModel` → 設計 JSON（決定論。書けない設計は 1 バイトも書かずに throw） |
| [`ddl/`](../js/io/ddl/) | 出・形式 | `DesignModel` → **DDL**（段階6-5a）。`generate.ts` が入口、`shared.ts` が型解決と既定値の引用、残る 5 本がプロファイルごとの逐語移植 |
| [`json-format.ts`](../js/io/json-format.ts) | 形式の定義 | 設計 JSON の形とキー順の契約（型だけ・emit 空）。散文は [`FORMAT.md`](FORMAT.md) |
| [`model.ts`](../js/io/model.ts) | モデルの定義 | `DesignModel` の型（型だけ・emit 空）。上の格子の説明もここ |
| [`palette.ts`](../js/io/palette.ts) | 参照 | 型パレット層（`db/<db>/datatypes.xml` の包み）。`window.DATATYPES` の後継で `Designer.palette` |
| [`conflict.ts`](../js/io/conflict.ts) | 保存境界 | 保存前の外部変更検知の判定（純関数。`absent` / `clean` / `exists` / `conflict`） |
| [`template.ts`](../js/io/template.ts) | 参照 | §6.2 初期テーブルテンプレート（§6 段階6-4 で追加）。`<template>` を読み、新規テーブルの初期列と PRIMARY を作る。`Add row` の既定型（`newrowtype`）も同じ層 |
| [`convert.ts`](../js/io/convert.ts) | 出・前段 | プロファイル変換（§6 段階6-10a）。`DesignModel` → **別プロファイルの** `DesignModel` ＋ 落ちたものの一覧。純関数で、型は正規型（`kind`）1 段だけを介して写す |
| [`ai/`](../js/io/ai/) | 格子の外 | AI との往復（§11）。`suggestion.ts` が提案と patch の型（型だけ・emit 空）、`apply-patch.ts` が `DesignModel` → `DesignModel` の純関数（11-1）、`request.ts` が `DesignModel` → 送信 JSON（11-3）、`notice.ts` が提案 → 人が読む 1 枚（11-3）。**4 本とも LLM も HTTP も 1 バイトも知らない** |

**12 本目の [`template.ts`](../js/io/template.ts) は §6 段階6-4 で足した**（§4 の 11 本ではない）。
**13 本目の [`convert.ts`](../js/io/convert.ts) は §6 段階6-10a。** 格子の「出・形式側」の
**手前**に立つ層で、形式を 1 つも知らない（バイト列に触れない）かわりに**型パレットを 2 つ**見る ——
設計側と出力側で、その間を正規型で結ぶ。`db` の 1 文字列が決めていた 4 つのうち
「DDL 生成器」と「型パレット」を分けたのがこの段階で、**設計 JSON の型キーの名前空間は
分けていない**（読み込み時変換をやらない判断。`js/io/json-parser.ts` の db 照合はそのまま）。
格子の外にあるのは、入出力ではなく**プロファイルの既定値**を読む層だから —— 位置づけは
`palette.ts` と同じで、実行時の依存は 0 本（import は型だけ）。

**[`ai/`](../js/io/ai/) は §11 段階11-1。格子の第 3 の軸**で、`extract` / `apply` / `parser` /
`serializer` のどれにも同居しない —— 入力も出力も `DesignModel` で、バイト列にも
ライブツリーにも触らないため。いちばん近いのは `convert.ts`（モデル → モデルの純関数）だが、
あちらが**型パレットを 2 つ**見るのに対しこちらは 1 つで、写すのは型ではなく**構造**
（名前・キー・参照・コメント）。**LLM も HTTP も 1 バイトも知らない** —— 提案がどこから
来たかを知らないので、テストは固定の JSON を読むだけで済む（§8.3）。

守る規約は 4 つ。

1. **依存は描画 → io の一方向。** io 側が描画クラスから受け取るのは `import type` だけで
   （`verbatimModuleSyntax` で emit から消える）、値の辺は 1 本も生えない。描画クラスに
   `toModel()` / `fromModel()` を生やさないのはこのため（§4 段階4-1a / 4-1b）。
2. **型パレット依存の解決は引数で渡す。** モデルが持つ型は**パレットの添字**のままで、
   sql 名にも id にも解決しない。解決するのは形式側 2 本が受け取る `palette` 引数（4-1a）。
3. **`js/io/` は locale を通さない。** 例外 message は開発者向けで、価値の本体が位置情報。
   ユーザーへの見せ方（見出しだけ locale・詳細は素通し）は呼び手の [`../js/io.ts`](../js/io.ts) が決める（4-3b）。
4. **UI と通信は `js/io.ts` に残す。** ダイアログの組み立て・`alert` / `confirm` / `prompt`・
   `OZ.Request`・localStorage・ダウンロードはすべてこちら側で、`js/io/` は形式とモデルしか知らない。

**段階6-5a で `ddl-xml.ts`（`DesignModel` → DDL 入力 XML）が消え、`ddl/` が入った。**
XSLT が TS になって中間 XML が要らなくなったので、書き出し側は「モデル → バイト列」の
1 段に揃っている。**grabado から XML の書き出しはこれで 1 つ残らず無くなった**（読み込みは互換で残る）。

型解決は **§6 段階6-2 で `palette.ts` に集約した**。それまで `Designer.getTypeIndex` /
`getFKTypeFor`（label 照合＋差し替えで捨てられないキャッシュ）と `xml-parser.ts` の照合ループに
分かれていたものが `TypePalette.indexOfTypeName` / `fkIndexFor` の 2 本になっている。
`fk` は id 参照になり、キャッシュは廃止。

**§6 段階6-3 で規則がプロファイル別の 2 通りになり、6-8d で 1 つに戻った。** 6-3 は
`<datatypes strict="1">` を持つ「現代化済み」のプロファイルだけを `sql` / `aka` の
**大小無視の完全一致**にし、未現代化側は 6-2 のまま（`re` の後勝ち ＝ known-issue #10・
一致無しは先頭型 ＝ #4）に据え置いていた。**6-8a 〜 6-8d で 8 本すべてが現代化され、
`indexOfTypeNameLegacy` と `xml-parser.ts` の先頭型フォールバックが分岐ごと消えた。**

現在の規則は 1 つだけ ——「`sql` を全走査 → `aka` を全走査、どちらも大小無視の完全一致で
先勝ち。一致が無ければ `xml-parser.ts` が例外」。`length="0"` の型に寄ったときは `size` も
捨てる（`CHAR(10)` → `TEXT` が `TEXT(10)` にならないように）。**strict 属性を持たない
旧パレット（設計 XML 同梱の `<datatypes>`）にも同じ規則が当たる** —— 完全一致は旧規則の
上位互換なので届く範囲は狭まらず、黙って別の型で開くより落ちて気づく側に倒してある。
`strict="1"` 属性そのものはファイル規則として 8 本に残り、検査は
[`../tests/node/palette-id.test.ts`](../tests/node/palette-id.test.ts) が持つ。

これに伴い `Designer.fromXML()` は**同梱パレットを持たない XML について parse を
`clearTables()` より先に置く**（6-3）。6-3 から parse が例外を投げうるので、読めない
ファイルを開いただけで今の設計が消えるのを防ぐため。同梱パレットがある経路は
「clear は旧パレット・parse は新パレット」という 4-1b の順序制約が生きているので従来のまま。

## 6. 特性化テストの構成（HANDOVER §7・実装済み）

走らせ方・golden の更新手順・fixture の追加手順は [`TESTING.md`](TESTING.md) に集約した。ここでは現行構成との対応だけ示す。

| 何を固定するか | どこで採るか | 出力 |
|---|---|---|
| DDL（`Designer.toDdl()` の出力） | 実ブラウザ（Chromium）。§5.2 の `clientsql()` と同一経路 | `tests/golden/ddl/<db>/<fixture>.sql`（7 fixture × 8 DB = 56 本。§6 段階6-7c） |
| round-trip / 決定論 | 同上 | アサートのみ（golden なし） |
| 高速回帰 | Node（jsdom）。同じ fixture・**同じ golden**を読むだけ | — |
| 既知の不具合 | 実ブラウザ。golden を持たず「現在こう壊れている」を直接アサート | `tests/known-issues/` |
| 配布物（§3 で追加） | 実ブラウザ。`vite build` → `vite preview` に対するスモーク | `tests/dist/`（golden は読むだけ） |

- **golden は実ブラウザ採取のものが唯一の正**。Node 側は書き込まない。
- 現行コードは抽出せずそのまま動かす。モデル層が描画 DOM と密結合（§5）なうえ、先に抽出すると「抽出後のコード」を特性化することになり安全網の意味が消えるため。抽出は HANDOVER §4 の仕事。
- ~~`xslt-processor` が XSLT 1.0 を満たしていない `oracle` は Node 側の DDL 回帰から外れる~~
  **段階6-5a で parity 例外ごと消えた**（`tests/node/parity-exceptions.ts` を撤去）。
  DDL 生成が TS になり、ブラウザと Node で同じコードが動くのでエンジン差が無い。
  **oracle の 7 件が Node 回帰に復帰**し、`npm test` の skipped は 0 になった。

## 7. Kotlin backend の契約（到達点）

**決定とその根拠は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の段階5-0 にある。**

**実装は [`../server/`](../server/)（Kotlin / Spring Boot 4・Gradle・JVM 21）。段階5-1b までの行は
実装済みで、テストが毎回確かめている**（下の §7.4）。それ以降の段階の行は**予定**で、実装が
入った時点で実測どおりに書き換える。

**機械可読な契約表は [`../tests/contract/backend-cases.json`](../tests/contract/backend-cases.json)。**
この章は散文の正で、表はそれを 1 ケース 1 行にしたもの。Kotlin の
`BackendContractTest` が全ケースを実 HTTP に流し、段階5-1c で `tests/node/` の
仮想 backend も同じ表を読む —— **契約を 2 言語で二重に書かないため**。

### 7.1 §4（旧 PHP）からの差分

| 項目 | 旧 PHP（§4） | Kotlin | 入る段階 |
|---|---|---|---|
| URL | `backend/<name>/?action=` | **`backend/file/?action=`** に固定（フロントの `BACKEND_PATH`）。サーバは `<name>` を**読まないままにしてある**ので、`?backend=` 付きの古い URL もそのまま動く | 5-1b / **5-5（実装済み）** |
| 能力の問い合わせ | 無し | **`?action=capabilities`** → `{"readonly":…,"introspection":…,"ai":…}`。フロントは起動時に 1 回引き、READONLY なら保存ボタンを `disabled` にする。**引けなければ「全部できる」に倒す** | **5-5（実装済み）** |
| `list` | `data/*` 全件・fs 順 | **`*.json` のみ・昇順固定**・空なら 0 バイト。`\n` 区切りは維持 | 5-2 |
| `save` | 201・body 空・内容を解釈しない | 201 と無解釈を維持（body は `inputStream` 直読み）。`.json` 以外（大小無視）と `keyword` 省略は **400**。`If-Match` / `If-None-Match` が満たされなければ **412**、応答には新しい **ETag** が付く | 5-2 / **5-4a（実装済み）** |
| `load` | 200 / 404・`text/xml` | 200 / 404 は維持。**`application/octet-stream` ＋ `nosniff` ＋ `attachment`**、**ETag（内容の SHA-256 先頭 16 バイト）** | 5-2 / **5-4a（実装済み）** |
| `import` | XML（`db/<db>/datatypes.xml` 全文を連結） | **中立な introspection JSON**（§7.2）。パレットは連結せず、実行中パレットも差し替えない。接続先は **env に列挙した名前だけ**（表に無ければ 404、READONLY は 403、接続失敗は 503）。**§4.6 の 2 不具合は再現しない** | **5-7a / 5-7b（実装済み）** |
| 未知 action / 指定なし | 501 | 501 を維持 | 5-1b |
| `remove` | 501（実装が無い） | **作らない**（501 のまま） | — |
| HTTP メソッド | 見ていない | **固定**（list / load / import は GET、save は POST）。ミスマッチは 405 | 5-1b |
| 不正な `keyword` | `basename()` で黙って書き換え | **400 で拒む**（トラバーサル・制御文字・Windows 予約名・255 バイト超）。書き換えると `js/io/conflict.ts` の `Baseline.name` が別ファイルを見張る | 5-2 |
| 副作用の停止 | 無し | `READONLY` で save を **403**（`list` / `load` は残す）。実現は `DesignStore` の Bean 差し替え —— **禁止を「禁止したいもの」の直上に置く**ので、将来 action が増えても自動的に守られる。introspection が 403 になるのは 5-7（いまは実装が無く 501） | **5-3（実装済み）** |
| save の往復数 | 2（プリフライト `load` → `save`） | **1**（`If-Match` / `If-None-Match: *`）。衝突したときだけ 412 → confirm → `If-Match: *` で 2 往復。**プリフライトの `load` は無くなった** | **5-4a / 5-4b（実装済み）** |

**`js/io.ts` の `check()` は「表示すべき応答」を列挙しており、知らない status は
`default: return true` に落ちて「成功」に倒れる。** 400 / 403 / 405 は足した（5-1c / 5-3）。

**★ 412 だけは意図的に通さない。** 「衝突したので上書きするか？」は**エラー表示ではなく分岐**で、
フロントが握って `confirm` に流す（プリフライトの 404 を通さないのと同じ理屈）。
この「通さないことも契約」は `tests/node/backend-contract.test.ts` が両方向で固定している ——
**表に出てくる異常系は `check()` が知っていること**と、**412 は拾わないこと**の 2 本。

### 7.2 introspection JSON

**形の正は [`../server/src/main/kotlin/dev/grabado/introspect/IntrospectionModel.kt`](../server/src/main/kotlin/dev/grabado/introspect/IntrospectionModel.kt)**
（TypeScript 側の受け皿は [`../js/io/introspect-model.ts`](../js/io/introspect-model.ts)）。
「設計 JSON v2 を返さない」理由は [`FORMAT.md`](FORMAT.md) の最終節 —— 要点は **backend は生の
SQL 型情報を返し、型 id への解決はフロントの `TypePalette` が持つ**こと（`x` / `y` は
`importresponse` の `alignTables()` が埋める）。

**§4.6 の 2 不具合は再現しない**（段階5-7a で実 PG18 に対して確かめた）:

| | 現行 PHP | Kotlin |
|---|---|---|
| NOT NULL の CHECK | `_not_null` の **denylist** で除外しようとして `</key>` が余る | `constraint_type IN ('PRIMARY KEY','UNIQUE')` の **allowlist**。実測で PG18 は CHECK を **16 件**出すが 1 件も読まない |
| index | `break` で**1 件も出ない** | `NOT EXISTS (pg_constraint.conindid)` で制約の index だけ除外し、**全件出す** |
| `numeric(12,2)` | 精度・スケール落ち | `numeric_precision` / `numeric_scale` を保つ |
| `text[]` | 要素型落ち | `information_schema.element_types` から要素型を引く |

複合 FK は `pg_constraint` の `conkey` / `confkey` を `unnest ... WITH ORDINALITY` で引く
（`constraint_column_usage` は対応順を保証しない）。

### 7.3 設定（env）

| env | 既定 | 用途 |
|---|---|---|
| `GRABADO_SCHEMA_DIR`（`SCHEMA_DIR` も読む） | `/data/schema` | 正本ディレクトリ。**起動時に存在・種別・読み書きを検証し、駄目なら起動失敗**（mount 忘れでコンテナ内 fs に書く事故を塞ぐ） |
| `GRABADO_READONLY`（`READONLY` も読む） | `false` | save を **403** にする（段階5-3 で実装）。introspection は 5-7、AI は §11 で同じ扱いになる。**公開デモは `true` 一択** —— AI は API 費用が自社負担、introspection は SSRF の踏み台になるため。READONLY のときは正本ディレクトリの**書き込み可能性を要求しない**（読み取り専用マウントでも起動する） |
| introspection の接続先 | 空（＝ introspection 無効） | **名前付きの表で列挙**する。`?action=import&database=<name>` が選ぶのは表のキーだけで、**JDBC URL をリクエストで受けない**（SSRF を不可能にする）。**入るのは 5-7** |

### 7.4 走らせ方

```bash
cd server && ./gradlew test          # 契約テスト＋振る舞い＋純粋な核（90 本）
cd server && ./gradlew bootRun       # 8080 で起動（要 GRABADO_SCHEMA_DIR、既定は /data/schema）

# 公開デモと同じ条件（保存が 403 になる）
cd server && GRABADO_READONLY=true ./gradlew bootRun
```

フロントと繋いで実物を触るときは 2 プロセス:

```bash
cd server && GRABADO_SCHEMA_DIR=../tests/tmp-schema ./gradlew bootRun   # 8080
npm run dev                                                            # 4173（/backend を 8080 へ proxy）
```

`vite.config.ts` の dev proxy が `/backend` を backend へ回す（**同一オリジンのまま**なので
`tests/browser/harness.ts` の「オリジン外へのリクエストが出たら失敗」検査に触れない）。
backend を起こしていなければ ECONNREFUSED になるだけで、5-1b 以前と同じ体験。

テストの層は [`TESTING.md`](TESTING.md) に集約してある。

## 8. AI proxy の契約（到達点）

**決定とその根拠は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の段階11-0 にある。**

**本章はすべて実装済み**（11-1 で適用側、11-2a で proxy の契約、**11-2b で上流を叩く実装**）。
入口は [`../js/io/ai/`](../js/io/ai/) と
[`../server/src/main/kotlin/dev/grabado/ai/`](../server/src/main/kotlin/dev/grabado/ai/)。
**残るのはフロントの配線だけ**（11-3 以降。`js/` はまだ 1 行も AI を知らない）。

**HANDOVER §11 との差分は 3 つ**（URL 名・構造化出力の手段・プライバシー既定）。
**HANDOVER = 入口 / CUSTOMIZATIONS = 正**という役割分担は 5-0 の決定どおり。

### 8.1 エンドポイント

| | |
|---|---|
| URL | **`POST /api/ai/review`**（`/backend/<name>/?action=` は使わない。`/api/` は §11 が始める） |
| 入力 | **`aiRequestVersion: 1`**（§8.2）。**設計 JSON v2 ではない** —— 座標を持たず、型は SQL 名 |
| 出力 | 提案の配列。**structured outputs（`output_config.format` の `json_schema`）でスキーマを強制**し、自由テキストをパースしない |
| 403 | READONLY / `ANTHROPIC_API_KEY` 未設定 / `GRABADO_AI_MODEL` 未設定 |
| 400 | 入力が壊れている・大きすぎる |
| 429 | 自分のレート制限、または上流の 429 |
| 503 | 上流の失敗・タイムアウト |

`js/io.ts` の `check()` に **`case 429`** と `locale` の `http429` を足す（11-3）。
**`check()` が知らない status は「成功」に倒れる**ので、status を足す段で必ず対にする
（5-1c / 5-3 / 5-4a で 3 回効いた規律）。

**11-2a はこの規律を意図的に外して 429 を先に足した** —— フロントがこの URL を 1 度も
呼ばないので、**429 が `check()` に届く経路が存在しない**（5-1b で 400 を足したときと同じ形）。
到達しない status は無言で成功扱いにならない。配線と同時に広げるのが 11-3。

status の写像は [`ApiExceptionHandler`](../server/src/main/kotlin/dev/grabado/api/ApiExceptionHandler.kt)
の 1 つの表にある（例外 → status を 2 か所に書かない）。**403 は理由を区別しない** ——
READONLY / キー未設定 / モデル名未設定 / 実装が無い のどれも「このデプロイでは禁止されている」。

### 8.2 リクエスト形式（`aiRequestVersion: 1`）

**設計ファイルでもなく introspection JSON でもない、3 つ目の形式。** 送るのは判定に要るものだけ:

- `dialect` —— ルーブリックの選択に使う（`postgresql` は house 規約でフル判定、
  他 7 本は DB 非依存の指摘に絞る）
- `tables[].name` / `.comment` / `.columns[]` / `.keys[]`
- `columns[]` は `name` / `sqlType`（**型 id ではなく解決済みの SQL 名**）/ `size` / `nullable` /
  `default` / `comment` / `references[]`

**`size` は段階11-3 で足した。** 11-2b の実測で `VARCHAR(50)` に対する指摘（「業務上の長さ制約が
読み取れない」）が返り、**サイズが判定に効く**ことが分かったため。モデルが `size` を別に持つので
写像も素直（型名に括弧を含めない）。**空なら送らない** —— コメント・既定値・参照も同じで、
費用が自社負担なので意味を持たないバイトを毎回運ばない。`nullable` だけは false も情報なので常に送る。

**送らないもの**: `x` / `y`（判定に無関係でトークンだけ食う）、`formatVersion`、`db`。

組み立てるのは [`../js/io/ai/request.ts`](../js/io/ai/request.ts) の純関数（段階11-3）。
**同じモデルからは同じバイト列**が出る —— §8.5 の結果キャッシュの鍵がこのバイト列の SHA-256 なので、
揺れると当たらなくなる。**整形して送る**のは、送信前プレビューに出すのがこの文字列そのもので、
**見せているものと送るものを 1 バイトも違わせない**ため（決めたこと 3 の担保）。

**送信前に、このバイト列をそのままユーザーに見せる**（プレビュー）。匿名化は既定にしない ——
判定基準の中心が名前そのものなので、仮名化すると §6.3 由来の指摘がまるごと死ぬ。

### 8.3 提案と patch

提案 1 件は `category` / `severity` / `target` / `rationale`（人間向け）/ `patch`（機械可読・optional）。

`patch.op` は**閉じた集合**で、`enum` としてスキーマに書く —— **モデルは列挙の外を書けない**:

```
rename-table / rename-column / change-type / add-column / add-key
set-nullable / set-default / add-comment
```

**`drop-table` / `drop-column` は存在しない。** 承認 UI の誤操作 1 回で設計が消える形を作らない。
消したい列の指摘は `patch` を持たない提案（`rationale` だけ）として出す。

適用は [`../js/io/ai/apply-patch.ts`](../js/io/ai/apply-patch.ts) の**純関数**
（`DesignModel` → `DesignModel`）。ライブツリーを触るのは既存の `applyDesignModel()`（§4-1b の経路）。
**LLM の非決定性は「生成」だけに閉じ込め、「適用」はテスト済みロジックに合流する**（CLAUDE.md 制約7）。

**段階11-1 で入った**（型は [`suggestion.ts`](../js/io/ai/suggestion.ts)、テストは
[`../tests/node/apply-patch.test.ts`](../tests/node/apply-patch.test.ts) の 57 本）。
op が何を書き換えるかは次のとおりで、**書き込み先はモデルの形がそのまま決めている**:

| op | 書き換え先 |
|---|---|
| `rename-table` | `TableModel.title` ＋ **その名前を指す全テーブルの `relations[].table`** |
| `rename-column` | `RowModel.title` ＋ 同テーブルの `keys[].parts` ＋ **この列を親とする全テーブルの `relations[].row`** |
| `change-type` | `RowModel.type`（**SQL 名 → パレットの添字**）。寄せ先が `length="0"` なら `size` を捨てる |
| `add-column` | `TableModel.rows` の**末尾**。`autoincrement` は patch から受けない |
| `add-key` | 非 FK は `TableModel.keys` の末尾（**`name` は必ず空**）、**`FOREIGN` は `RowModel.relations`** |
| `set-nullable` / `set-default` / `add-comment` | `nll` / `def` / `comment` の 1 つだけ |

3 つの決めごと。

- **例外を投げず Result 型で返す。** 提案が返ってから承認までの間に人が設計を編集しうるので
  「対象がもう無い」は異常ではなく通常の帰結。理由（`PatchRejection.kind`）は
  **そのまま locale のキー**で、`identifierIssue()`（§6 段階6-9b）と同じ形
- **キーと FK の名前を焼き込まない。** `name` を空で入れ、`<table>_pkey` / `idx_<table>_<cols>` /
  `fk_<table>_<column>` は DDL 生成が §6.3 の規約で組む（[`FORMAT.md`](FORMAT.md) の契約）
- **触っていない枝は同一参照で返す。** 適用できなければモデルは入力そのもの（部分適用を作らない）

**承認 UI は段階11-4**（`js/io.ts` の `aiapply()`）。一覧に 1 始まりの番号を振り、`prompt` で
`all` か `1,3,5` を受ける —— **textarea 経路のまま**で、新しい UI 語彙を増やしていない。
**当てる順は一覧の順**（severity の重い順）で、打った順ではない ——
`applyPatches` は配列順の畳み込みで**後の patch は前の結果を見る**ため。

★ **適用は保存ではない。** 正本は git 管理のファイルで `save` するまで 1 バイトも変わらない。
grabado に undo は無いが、**気に入らなければ保存せず読み直せば戻る** —— それを結果の
1 枚が毎回書く（`js/io/ai/notice.ts` の `applyNotice`）。

★ **`rationale` を HTML として描画しない。** モデルが書いた自由文で、org security-baseline
§5.2 が「崩れる変更」に名指ししている（11-2b の実測でも他言語の語が混じった例がある）。

### 8.4 設定（env）

| env | 既定 | 用途 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 空（＝ AI 無効） | 各自のコンテナ env（実質 BYOK）。**localStorage には置かない** |
| `GRABADO_AI_MODEL` | **無し（必須）** | 未設定なら AI 無効。**既定を焼き込まない** —— 書いた瞬間に古くなる。選び方は[モデル一覧](https://platform.claude.com/docs/en/about-claude/models/overview)から引く |
| `GRABADO_READONLY` | `false` | AI サービスの Bean を**そもそも登録しない**（5-3 と同じ形） |
| `GRABADO_AI_MAX_TABLES` | `100` | 1 リクエストのテーブル数。超えたら **400** |
| `GRABADO_AI_MAX_REQUEST_BYTES` | `262144`（256 KiB） | body の大きさ。超えたら **400**（**パースの前に見る**） |
| `GRABADO_AI_RATE_PER_MINUTE` | `10` | 1 分あたりの受付数。超えたら **429** |
| `GRABADO_AI_MAX_CONCURRENT` | `2` | 同時に上流へ流す数。超えたら **429**（**待たせない**） |
| `GRABADO_AI_CACHE_ENTRIES` / `GRABADO_AI_CACHE_TTL` | `64` / `1h` | 結果キャッシュ（§8.5） |
| `GRABADO_AI_TIMEOUT` | `120s` | 上流 1 回あたり。**SDK 既定の 10 分は長すぎる**。実測は 18〜35 秒（§8.5） |
| `GRABADO_AI_EFFORT` | **空**（上流の既定に任せる） | `low` / `medium` / `high` / `xhigh` / `max`。**コストの主要な変数**。値が不正なら**起動時に落ちる** |

**上限の既定値は実測ではなく判断**で、根拠は
[`AiProperties`](../server/src/main/kotlin/dev/grabado/config/GrabadoProperties.kt) の KDoc にある。
**費用が自社負担**なので上限はサーバが持ち、クライアントの自己申告を上限にしない。

`?action=capabilities` の `ai` は「キー設定済み ∧ モデル設定済み ∧ `!READONLY`」**∧ 実装がある**。
**実装があっても使えないなら false**（5-7a と同じ）で、11-2a の時点では
[`SuggestionSource`](../server/src/main/kotlin/dev/grabado/ai/SuggestionSource.kt) の実装が
main に 1 つも無いので**実運用ではまだ常に false** —— 固定応答を返すスタブを本番に置かない
（置くと「AI が動いているように見えて実は固定」が載る）。

### 8.5 キャッシュ

- **prompt caching（API 側）** —— ルーブリックは固定なので system の最後のブロックに
  `cache_control` を置く。プレフィックス一致なので**ルーブリックを動的に組み立てない**。
  **11-2b の実測（2026-08-24 / `claude-opus-5`）で 4741 トークンが乗った** —— レンダリング順が
  `tools` → `system` → `messages` なので、**system だけでなく structured outputs のスキーマも
  同じ prefix に入る**。2 回目以降は `cacheRead` が立ち、**入力側の費用が 84% 減る**
  （ただし全体では 3 割減 —— **費用の 92% は出力側**）
- **結果キャッシュ（自前）** —— 送るバイト列の SHA-256 → 提案 JSON。**プロセス内メモリのみ**
  （DB レス既定）。**成立するのは serializer が決定論だから**（制約3。§4 の決定論が効く 2 つ目の場所で、
  1 つ目は 5-4 の ETag）。11-2a で入った
  （[`SuggestionCache`](../server/src/main/kotlin/dev/grabado/ai/SuggestionCache.kt)。LRU ＋ TTL）

結果キャッシュの規則が 2 つ:

- **鍵は生バイトのハッシュで、正規化しない。** 「同じ意味だがバイト列が違う入力」は当たらない
  —— 正規化規則がフロントの構築器（11-3）とずれた瞬間に**別の設計へ別の提案を返す**ことになり、
  それは外から見て AI が壊れたのと区別がつかない。**当たらない方に倒す**
- **キャッシュに当たった呼び出しはレート制限を消費しない。** 費用が発生しない呼び出しを
  費用の上限で止める理由が無い

## 9. 配布とイメージ（到達点）

**決定とその根拠は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の段階2-0 / 2-1 / 2-2 / 2-3 / 2-4 / 2-5 にある。**
**段階2-1 でイメージが動くようになり**（3 ステージ・digest ピン・非 root。実測は §9.1）、
**段階2-2 で CSP が付き**（§9.4）、**段階2-3 で compose と env が入り**（§9.3 / §9.5）、
**段階2-4 で機械が見るようになり**（[`../tests/image/`](../tests/image/)。§9.5）、
**段階2-5 で CI に載った**（§9.6）。**残っているのは 2-6** —— `frontend/` 集約。

**HANDOVER §2 との差分は 1 つ**（配置。§2.2 の骨格は `frontend/` / `backend/` を前提にしているが、
実在は**リポジトリルート**と **`server/`**）。**HANDOVER が触れていない論点が 1 つ** ——
**イメージをレジストリで配るかどうか**で、これは §9.1 の最後に書いた。
**HANDOVER = 入口 / CUSTOMIZATIONS = 正**という役割分担は 5-0 の決定どおり。

### 9.1 イメージの構成（3 ステージ）

| ステージ | 何をする | 入力 | 出力 |
|---|---|---|---|
| **web** | `npm ci` → `npm run build` | リポジトリルート（`index.html` / `src/` / `js/` / `styles/` / `db/` / `locale/` / `images/` と設定ファイル） | `dist/` |
| **api** | `./gradlew bootJar` | `server/` ＋ web の `dist/` を `src/main/resources/static/` へ COPY | `grabado.jar` |
| **runtime** | thin JRE で jar を起こす | `grabado.jar` | 8080 で待つ**単一プロセス** |

- **`frontend/` は無い。** フロントのビルド文脈は**リポジトリルート**（集約は 2-6）
- **dist を static へ入れるのは COPY で、Gradle タスクにしない** —— タスクにすると手元の
  `./gradlew bootJar` が Node のビルドを要求し、開発時の 2 プロセスと `npm run test:server` が壊れる。
  代償として**手元の jar には static が入らない**ので、**イメージの検証はイメージでやる**（2-4）
- **ベースイメージは digest でピンする**（org security-baseline §5.1）。**Dependabot の `docker`
  entry とセット**。版と digest は下の実測表と [`../Dockerfile`](../Dockerfile) にある
- **★ レジストリへは publish しない。** イメージは各自が build する。publish した日に
  **分類 P（実行物を配る）**へ載り §5.3.2 の責務を引き受けることになるので、**したくなった
  時点で別 issue**（段階2-0 の決めたこと 5）

**実測（2026-08-25、段階2-1）。** ベースは 3 本とも digest でピンしてある
（[`../Dockerfile`](../Dockerfile)。**版のコメントは Dependabot が digest と一緒に書き換える**）。

| ステージ | ベース | 実際に入ったもの |
|---|---|---|
| **web** | `node:24-alpine` | Node 24.19.0 / npm 11.17.0 / Alpine 3.24.1 |
| **api** | `eclipse-temurin:25-jdk-alpine` | Temurin 25（JDK） |
| **runtime** | `eclipse-temurin:25-jre-alpine` | Temurin 25.0.4+7 / Alpine 3.24.1 |

- **イメージは 284MB / 8 層。** runtime に入るのは `grabado.jar` 1 本だけで、Node も Gradle も
  JDK も残らない
- **`COPY . .` が運ぶのは 1.6MB**（`docker history`）—— `npm ci` が作る `node_modules`（175MB）
  も手元の `.env` も入らない。**`.dockerignore` の許可リストが効いている**
- **ランタイムは Java 25 LTS**（起動ログ `using Java 25.0.4`）。`jvmToolchain` /
  `ci-server.yml` の `setup-java` / イメージの 3 つを同じ版に揃えてある
- **非 root**（`uid=100(grabado)`）で走り、bind mount した `/data/schema` に **save が
  実ファイルを書けた**（Docker Desktop for Windows で実測。**Linux ホストでの uid の
  合わせ方は 2-3**）—— **★ 訂正（2026-08-26 / 段階2-3）: 2-3 でも実測していない。**
  手元が Docker Desktop for Windows のままなので、README には**条件つきの予約**として置いた
- **単一プロセスが両方を配る**ことの確認 —— 起動ログに
  `Adding welcome page: class path resource [static/index.html]`、`/db/postgresql/datatypes.xml`
  が 200、`?action=list` が JSON、`?action=capabilities` が
  `{"readonly":false,"introspection":false,"ai":false}`。`READONLY=true` では
  `save` / `import` が 403 で `list` は生きている

### 9.2 配信の分担

| | 誰が配るか | 静的資産 | `/backend/*` `/api/*` |
|---|---|---|---|
| **コンテナ**（配布物） | **単一プロセス**（Spring Boot） | classpath の `static/` | 同じプロセス |
| **開発**（2 プロセス） | Vite dev server ＋ `bootRun` | Vite（root＝リポジトリルート） | dev proxy が 8080 へ回す |

**この差を吸うのが `vite.config.ts` の proxy**（走らせ方は §7.4）。**URL 空間はどちらでも同じ**
なので、**フロントは自分がどちらで配られているかを知らない**。

### 9.3 env

**外向きの名前は HANDOVER §2.4 のもの。表は §7.3（backend）と §8.4（AI）が持つ**
（ここに写さない）。配布の観点で足すのは 3 つ。

**渡す口は [`../compose.yaml`](../compose.yaml) の `environment:`。** `.env` は
**compose の変数展開にだけ**使われ、**コンテナには入らない**（`env_file:` を使っていない）
—— 手元の `.env` が grabado 専用とは限らないため（**2026-08-26 実測**で、このリポジトリの
`.env` は 3 本のうち 2 本が無関係な秘密だった）。列挙は [`../.env.example`](../.env.example) と
**1 本ずつ対応**し、ずれると
[`../tests/node/env-contract.test.ts`](../tests/node/env-contract.test.ts) が赤くなる。
案内するのは `GRABADO_` 前綴りと `ANTHROPIC_API_KEY` の **12 本**で、
**裸の互換名（`SCHEMA_DIR` / `READONLY`）は外向きの一覧に出さない**（互換で読むことは変えない）。

**★ 空文字は既定に倒れない。** `${VAR:-}` 形式で未設定の env を渡すと空文字が入り、
**起動が落ちる**（**2026-08-26 実測**: `GRABADO_READONLY=` で
`Failed to bind properties under 'grabado.readonly' to boolean`）。だから compose は
**キーだけのリスト形式**で書く —— 未設定なら**そもそも渡らない**ので application.yaml の
既定がそのまま効き、**既定値を compose へ写さずに済む**。同じ理由で、`.env` にも
**「`=` の右が空の行」を残さない**。

**mount は `./schema:/data/schema`。** 左（ホスト側）が設計 JSON の正本で、git で管理する
（CLAUDE.md 制約2）。`schema/` は**リポジトリに実在させてある**（`.gitkeep`）—— 無いと
compose が root 所有で作り、**非 root（uid=100）のコンテナが書けない**。
`GRABADO_SCHEMA_DIR` は**コンテナ内のパス**なので、これだけ変えても mount 先は動かない
（ずれれば起動時の検証で落ちる —— 黙って別の場所へ書くことはない）。

**introspection の接続先は、env の名前そのものが表のキーを持つ** ——
`GRABADO_INTROSPECT_SOURCES_<名前>_URL` / `_USER` / `_PASSWORD` / `_SCHEMA`（Spring の
relaxed binding。**2026-08-26 実測**で `…_SHOP_URL` などを渡すと `?action=capabilities` の
`introspection` が `true` になった）。**キーが設計ごとに違う**ので `.env.example` には
載せられない —— 使うなら `compose.yaml` の `environment:` に同じ名前を足す。

### 9.4 CSP と配信ヘッダ

**全応答に 5 本付く**（段階2-2）。**単一プロセスが static も API も配る**ので、
[`SecurityHeadersFilter`](../server/src/main/kotlin/dev/grabado/config/SecurityHeadersFilter.kt)
1 本で両方に掛かる。**値と、その値である理由の正本はそこ**（ここに写さない）。

出るのは `X-Content-Type-Options` / `Referrer-Policy` / `X-Frame-Options` /
**`Content-Security-Policy`** / **`Permissions-Policy`**。CSP は **`script-src` を
1 つも緩めていない**（`'unsafe-inline'` も `'unsafe-eval'` も無い）。

**実測（2026-08-25、イメージに `curl -sSI`）—— 4 経路とも 5 本そろっていた。**

| 経路 | 応答 |
|---|---|
| `/` | 200 `text/html`（classpath の `static/index.html`） |
| 存在しないパス | **404** `application/json`。本文は `timestamp` / `status` / `error` / `path` だけで、**stacktrace も message も無い**（Spring Boot の既定。org security-baseline §4.1） |
| `/backend/file/?action=list` | 200 |
| `/assets/index-*.js` | 200 |

**CSP を成立させるために動かしたもの**（フロント側。詳細は CUSTOMIZATIONS の段階2-2）:

- **cookie の読み取りから eval を撤去**（[`../js/wwwsqldesigner.ts`](../js/wwwsqldesigner.ts)）
  —— これが無いと `script-src 'unsafe-eval'` が要る
- **`assetsInlineLimit: 0`**（[`../vite.config.ts`](../vite.config.ts)）—— `styles/print.css` が
  `data:text/css` の `<link>` へ inline 化されるのを止め、`style-src` を `'self'` のまま保つ
- **`style` 属性 2 か所を CSS へ**（`#io` の列幅。**両テーマに書いた**）

**残した `data:` は `img-src` だけ** —— throbber（`index.html` にベタ書き）と
material-inspired の svg（CSS ソースに元からある）。

**手元で確かめる口は `vite preview`** —— [`../vite.config.ts`](../vite.config.ts) の
`preview.headers` が**同じ値の写し**を出し、[`../tests/node/csp.test.ts`](../tests/node/csp.test.ts)
がずれを赤くする。**dev server には出さない**（HMR が inline script を使う）。

**HSTS はここに入れない** —— 公開デモの外側（[issue #84](https://github.com/propagandist/grabado/issues/84)）。
**ローカルは `http://localhost:8080`** で動くので、壊してはいけない。

**`Cache-Control` だけは経路で値が変わる**（段階2-4）。だから上の 5 本とは別に持ち、
**`vite preview` には写していない** —— 静的サーバの固定ヘッダでは経路別を表せないので、
**写しを増やさない側**を選んだ。

| 経路 | 値 | なぜ |
|---|---|---|
| `/assets/**` | `public, max-age=31536000, immutable` | Vite がハッシュを名前に織り込む。**中身が変われば URL が変わる** |
| `/backend/**` `/api/**` | `no-store` | 設計データと AI の応答。**正本は git 管理のファイル**で、これは写し |
| それ以外 | `no-cache` | ハッシュを持たない（`index.html` / `db/` / `locale/` / `images/` / `styles/`）。毎回検証させる |

規則の正本は [`SecurityHeadersFilter`](../server/src/main/kotlin/dev/grabado/config/SecurityHeadersFilter.kt)
の `cacheControlFor`。表を掃くのは `CacheControlTest`、**実物が出ていることを見るのは
[`tests/image/`](../tests/image/)**（静的資産の側は**手元の jar に入らない**ので、そこでしか出ない）。

- ★ **段階2-3 まで 1 本も出していなかった**（2026-08-26 実測）。Spring Boot は
  `spring.web.resources.cache` を設定しない限り、静的資源にも何も付けない
- ★ **`no-cache` は実際には 304 で返る** —— 静的資産は `Last-Modified` を持つ（`ETag` は
  出ていない。同日実測。値は jar のタイムスタンプなので、**イメージを作り直せば変わる**）
- ★ **知らない経路は `no-cache` へ倒れる。** 前綴りに一致しないものが黙って `immutable` に
  なると、**1 年間ブラウザに焼き付く**

**★ 実測で 1 つ直した（2026-08-26 / 段階2-4）** —— **保存のたびに CSP 違反が 2 件出ていた。**
[`js/io.ts`](../js/io.ts) の `sendSave` が応答を `xml: true` で受けており、`responseXML` を読むと
Chrome が**空の応答に HTML パーサを当てて** `style-src-attr` 違反を出す。save が返すのは
**201 ＋ 空 body で Content-Type も付かない**ので `responseXML` は null にしかならず、
`saveresponse()` はその値を使ってもいなかった。**`xml: true` を外して解消。**
**イメージ E2E が捕まえた** —— `vite preview` には backend が無く、`curl` では CSP が見えない。

### 9.5 走らせ方

**配布物（コンテナ）。** 開発時の 2 プロセスは §7.4。

```bash
cp .env.example .env                     # 要る行だけコメントを外す（何も外さなくても起動する）
docker compose up --build                # 8080。設計 JSON はホストの ./schema へ
GRABADO_READONLY=true docker compose up  # 公開デモと同じ条件（save / import が 403）
```

compose を使わないなら `docker build -t grabado .` ＋
`docker run --rm -p 8080:8080 -v "$PWD/schema:/data/schema" grabado`。
**レジストリからは取れない**（§9.1）。

**起動の判定は compose の `healthcheck`** —— `?action=capabilities` を busybox の `wget` で
叩く。**イメージに `curl` は無く、actuator も入れていない**（ともに 2026-08-26 実測）。
`start_period` を 60s にしたのは**起動に 18 秒かかった**から（同日実測・Docker Desktop for
Windows）。**Dockerfile の `HEALTHCHECK` は置いていない** —— E2E の待ち合わせに要る 2-4 が決める。

**実測（2026-08-26、段階2-3。`docker compose up -d --build`）**

| 確かめたこと | 結果 |
|---|---|
| `healthcheck` | 51 秒で `healthy` |
| `/` | 200 ＋ **ヘッダ 5 本**（2-2 の回帰） |
| `?action=list` / `?action=capabilities` | 200 ／ `{"readonly":false,"introspection":false,"ai":false}` |
| `?action=save` | **201。ホストの `schema/` に実ファイルが出た**（Docker Desktop for Windows） |
| `GRABADO_READONLY=true` | `save` / `import` が **403**、`list` / `load` は 200 |
| コンテナに渡った env | **`.env` が持つ 1 本だけ**（未設定の 11 本は渡らない） |

★ **`save` を `curl` で叩くときは `Content-Type: application/json` が要る。** 付けないと
curl が `application/x-www-form-urlencoded` を送り、**Tomcat がパラメータ解析で body を
読み尽くす** —— **201 が返るのに 0 バイトのファイルが書かれる**（2026-08-26 実測）。
フロントは [`../js/io.ts`](../js/io.ts) が明示しているので実運用では起きない。
**2-4 の E2E は `window.d.io` を通すので、この罠を踏まない。**

**イメージの検証は機械がやる**（段階2-4）。走らせ方と見ているものは
[`TESTING.md`](TESTING.md)、決定と実測は `CUSTOMIZATIONS.md` の段階2-4。

```bash
npm run test:image   # compose で build → 通常モードで一巡 → READONLY で起こし直して一巡 → down
```

**実測（2026-08-26、段階2-4。Docker 29.5.3 / Docker Compose v5.1.4）**

| 確かめたこと | 結果 |
|---|---|
| 通し | **13 本が緑**（通常 8 ＋ READONLY 5） |
| 所要 | **3.0 分**（フロントか backend を変えた場合）／ **35 秒**（変えていない場合。ビルドがキャッシュに当たる） |
| READONLY への入れ替え | `docker compose up -d --wait` の再実行で **12.2 秒**（`Recreated` → `Healthy`） |
| 後片付け | `down` でコンテナもネットワークも残らない |

★ **`--wait` は healthy まで待つ**（同日実測）。だから **Dockerfile に `HEALTHCHECK` を
置かない** —— 判定間隔と猶予の正本を `compose.yaml` の 1 か所に保つ（2-3 が 2-4 に預けた判断）。

### 9.6 CI（段階2-5）

**判断規約は org の `ci-strategy.md`、層の割り当ては同 `security-verification.md` §0**
（**中身をここへ写さない**。導線は [`../CLAUDE.md`](../CLAUDE.md)）。

**`paths` は `on:` にしか書けず、ジョブ単位では絞れない** —— **絞りたい単位が、そのまま
ワークフローの単位になる**。ワークフローが 3 本ある理由はそれだけで、種類が 3 つあるからではない。

| ワークフロー | いつ | 何を見る | 所要 |
|---|---|---|---:|
| [`ci-frontend.yml`](../.github/workflows/ci-frontend.yml) | PR（paths） | typecheck / vitest / 実ブラウザ golden / known-issues / dist | **85 秒** |
| [`ci-server.yml`](../.github/workflows/ci-server.yml) | PR（paths） | `./gradlew build`（compile ＋ test ＋ bootJar）＋ ロックの整合 | **107 秒** |
| [`ci-image.yml`](../.github/workflows/ci-image.yml) | PR（paths） | **配布イメージの E2E 13 本**（通常 8 ＋ READONLY 5） | **131 秒** |
| [`deps-submit.yml`](../.github/workflows/deps-submit.yml) | `develop` への push（paths） | **検査ではない** —— `server/` の解決済み依存グラフを渡す | — |

**実測（2026-08-26、段階2-5。ubuntu-latest）**

| 内訳 | 秒 |
|---|---:|
| `ci-image` の **イメージ build** | **78**（**まっさらな runner ＝ `--no-cache` 相当**。2-4 の申し送りはここで返した） |
| 同 起動（`--wait` が healthy を見るまで） | **6**（手元の Docker Desktop for Windows は 18。`start_period: 60s` は遅いほうに合わせてある） |
| 同 13 本 | **11** |
| 同 Chromium の取得 | 24 |
| `ci-frontend` の Chromium の取得 | **39（ジョブの 46%）** |
| `ci-server` の `./gradlew build` | 93 |

**3 本は並列に走る**ので、**PR の待ち時間は最長の 131 秒**（合計の 323 秒ではない）。

**★ `pull_request` のみ。** `main` / `develop` への直接 push は `.githooks/pre-push` が禁じており、
`develop` が動くのは PR の squash merge だけ。**`pull_request` はマージ結果に対して走る**ので、
push 側を足すと同じ検査を 2 度払うことになる。

**★ このリポジトリは public なので、org の枠（2,000 分/月）を消費しない**（2026-08-26 実測）。
**それでも `paths` で絞る** —— 根拠が枠から「**入力が変わらなければ出力も変わらない**」と
待ち時間へ置き換わっただけで、結論は動かない。**`ci-image.yml` の paths の正本は
[`.dockerignore`](../.dockerignore) の許可リスト**（＝ イメージに入るもの）＋ E2E 側の入力。

#### 検査の 3 層

| 層 | grabado では |
|---|---|
| **① 手元**（0 分） | 導入時に 1 回。**gitleaks は 2026-08-26 に実走**（331 コミット / 0 件）、**actionlint も同日**（1.7.12 / 0 件。**壊して拾うことも確かめた**） |
| **② 自動テスト**（増分 0 分） | 上の 3 本に相乗り —— CSP とヘッダ（`csp.test.ts` ＋ イメージ E2E）・env の写し（`env-contract.test.ts`）・READONLY・契約表 |
| **③ 週次 cron** | **置かない** |

**★ ③ を置かない。** 分類 B に持ち込まないという org §0 の判断で、grabado は
**レジストリで配らない**ので分類 B のまま（§9.1）。**public 化で「枠」の根拠は消えたが**、
**cron でスキャンしても Dependabot 以上のことができない**（同 §3★★）。
**代わりに GitHub 側の 0 分の層が 3 本**（いずれも Actions を 1 分も使わない）:

| 時間で変わる層 | 何が見るか |
|---|---|
| ベースイメージ | **Dependabot `docker` entry**（weekly。digest を書き換える。§9.1） |
| 依存の CVE | version updates 4 entry ＋ **security updates** —— **`server/` は `deps-submit.yml` が渡すグラフで初めて効く**（GitHub は `gradle.lockfile` を読めない） |
| 秘密の混入 | **secret scanning ＋ push protection** —— **どの変更でも起こりうるので paths で絞れない**（org §3）。**入る前に止める**のは push protection だけ |

**CodeQL は「決めて外した」** —— public なので技術的には入る（2026-08-26 実測: `not-configured` /
standard runner / 言語 5 種）。**分類 B に置く層は ① ＋ ② まで**で、これは枠の話ではない。
根拠と再考の条件は `CUSTOMIZATIONS.md` の段階2-5。
