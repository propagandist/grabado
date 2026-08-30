# CUSTOMIZATIONS.md — grabado 自社差分・決定台帳

`ondras/wwwsqldesigner`（BSD License）由来。自社差分と設計判断をここに記録する。
根拠は [`docs/HANDOVER.md`](docs/HANDOVER.md)、運用ルールは [`CLAUDE.md`](CLAUDE.md)。

> 台帳ルール: HANDOVER の既定や Hard Constraints を覆す判断、非自明な運用決定はここに日付つきで記録する。

---

## 決定ログ

### 2026-08-09 リポジトリ運用（GitFlow 採用）

- **ブランチ運用に GitFlow を採用**（アプリ本体 `grabado` リポに対して）。
  - `main` = リリース済み・本番。`develop` = 開発統合。`feature/*` `release/*` `hotfix/*`。
  - 詳細な命名規約と運用は [`docs/BRANCHING.md`](docs/BRANCHING.md)。
- **運用手段は「素の git ＋ 命名規約 ＋ PR」**。git-flow 拡張ツールは使わない（全員へのインストールを強制しないため。将来必要なら再検討）。
- **設計データ（schema JSON 正本）は GitFlow の対象外**。
  - 理由: GitFlow は `main`（リリース済み）と `develop`（開発中）を恒常的に並走させるため、設計正本を両ブランチに載せると「main の設計」と「develop の設計」が割れ、HANDOVER が禁じる split-brain を招く。
  - 方針: 設計データは **トランクベース**（`main` のみを唯一の正とし、短命ブランチ→PR で直接取り込む）で扱う。
  - 置き場所: 専用の集約リポは作らず、**grabado を使う各プロダクトのリポジトリ内 `schema/*.json`** に分散配置する（HANDOVER §2.1「ホストのリポジトリ `schema/` を mount」に一致）。各プロダクトのブランチ戦略はそのプロダクトの流儀に従う。grabado 側は「決定論出力・PR レビュー」の規約のみ提供する。

### 2026-08-09 リポジトリの起点と公開範囲

- **起点**: `ondras/wwwsqldesigner`（default branch `master`、BSD License）の git 履歴を引き継ぐ。
- **方式**: GitHub の「素の fork」ではなく、履歴を引き継いだ **private 独立リポジトリ化**。
  - 理由1: upstream は PUBLIC リポのため、素の fork では private 化できない（社内ツールとして private が必要）。
  - 理由2: GitHub 上の "forked from" 関係を持たない独立リポにすることが、CLAUDE.md §9「**upstream 非追従**」方針に合致する。
- **作成先**: `propagandist`（会社 org）→ `propagandist/grabado`（private）。
- **default branch**: `master` から `main` に変更。
- 取り込み後、`upstream` remote は削除（非追従。将来 upstream の変更を取り込む場合は都度手動）。

### 2026-08-09 ライセンス

- upstream は **BSD License**（`license.txt`, Copyright (c) 2005-2012 Ondrej Zara）。
- 改変・private 化・社内配布いずれも可。条件は著作権表示とライセンス文の保持。
- 対応: `license.txt` を保持する。自社改変部分の権利表記は今後の配布形態確定時に追記。

### 2026-08-09 ブランチ保護はローカル pre-push hook で行う

- GitHub 側のブランチ保護が現行プラン（private）で使えないため、**`.githooks/pre-push` で `main` / `develop` への直 push を禁止**する。`feature/*` は許可、緊急時は `PUSH_ALLOW_PROTECTED=1` で一時解除。
- 有効化は各自 1 回 `scripts/setup-hooks.{sh,ps1}`（＝ `git config core.hooksPath .githooks`）。**clone しただけでは効かない**のが弱点。プランを上げてサーバ側保護が使えるようになったら、この hook は補助に格下げする。
- `.gitattributes` で `.githooks/**` と `scripts/*.sh` を LF 固定（Windows で shebang を壊さないため）、`scripts/*.ps1` は CRLF。

### 2026-08-09 HANDOVER §0「現物確認」実施 — backend 契約の実測と HANDOVER の訂正

実測結果の全文は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §4。HANDOVER の記述と食い違った点、および非自明な判断を以下に記録する。

- **HANDOVER §0 の action 名は誤り**。実装されているのは `list` / `save` / `load` / `import` の **4 つのみ**で、未知の action は一律 501。
  - **`remove` は実在しない**（フロントにも削除 UI が無い）。501 を返すことを実測で確認済み。
  - **introspection の action 名は `connect` ではなく `import`**。
  - 対応: 以後 HANDOVER の記述ではなく ARCHITECTURE §4 を契約の正とする。Kotlin 移植でも `remove` は作らない（必要になったら新規機能として設計する）。
- **実測環境は Docker の php イメージ**。ローカルに `php` が無いため HANDOVER §0 の `php -S localhost:8000` をそのままは実行できない。PHP built-in server はリクエスト時にスクリプトのディレクトリへ chdir するため、`php-file` の相対パス `data/*` は Apache 実行時と同じに解決される（実測確認済み）。
- **save/load/list の実測は `backend/php-file` で行った**。`backend/php-postgresql` の `save` は `get_magic_quotes_gpc()`（PHP 8.0 で削除）を呼ぶため **PHP 8 では動作しない**ため。php-file は正本＝ファイル I/O という house 到達点にも最も近い。
- **現行に CSRF トークンの仕組みは無い**（HANDOVER §5.1 の確認事項への回答）。XHR 追加ヘッダの既定は `{}` で、`setXhrHeaders()` は `index.html` にコメントアウト例があるだけの拡張ポイント。Spring Boot 移植時に CSRF 除外設定を「既存挙動の再現」として持ち込む必要はない。
- **`save` は body をバイト列としてそのまま保存する**（round-trip のバイト一致を確認）。backend は内容を解釈しないので、JSON 化（HANDOVER §4）は backend 側の変更を伴わずフロント主導で進められる。
- **`keyword` 省略時に現行は 200 + PHP Fatal error 本文を返す**。移植先では 400 とする（現行挙動の再現対象にしない）。

### 2026-08-09 現行 introspection は PG18 に対して壊れている（要判断事項）

`backend/php-postgresql` の `import` を PostgreSQL 18.4 に対して実測した結果、**出力 XML が well-formed でない**ことが判明した。実出力は [`docs/samples/introspection-postgresql.xml`](docs/samples/introspection-postgresql.xml)、投入したスキーマは [`docs/samples/introspection-sample-schema.sql`](docs/samples/introspection-sample-schema.sql) として固定した。

1. **`</key>` が余分に出力され XML パースが失敗する。** PG18 は NOT NULL 制約を `information_schema.table_constraints` に `CHECK` として出す（実測: 22 制約中 15 件）。現行コードはこれを読み飛ばす際に直前で `</key>` だけ出してしまう。ブラウザの `DOMParser` でも同じく失敗するため、**PG18 相手では import 機能自体が使えない**。
2. **index が一切出力されない。** index 収集ループが PK/UNIQUE の index に当たると `continue` ではなく `break` してループごと抜ける。

- **この 2 点は「挙動不変で移植する」対象にしない。** CLAUDE.md の Hard Constraint 1 は挙動不変を求めるが、well-formed でない XML と欠落した index を再現することに意味はないため、Kotlin 実装では**修正した仕様**（NOT NULL を制約として扱わない／index を全件出す）を正とする。
- 固定したサンプル XML は「現行の実出力（不具合込み）」であり、**そのまま golden にはしない**。移植後の期待値は別途 house 仕様として定義する。
- 型マッピングの実測（`numeric(12,2)` → `NUMERIC` で精度が落ちる、`text[]` → `ARRAY` で要素型が落ちる 等）は ARCHITECTURE §4.5 に記載。Kotlin 実装では `udt_name` / `numeric_precision` / `numeric_scale` を見て情報を落とさないようにする。

### 2026-08-09 DDL 生成の実体は XSLT（特性化テストの設計に影響）

- SQL 出力は JavaScript ではなく **`db/<db>/output.xsl`（XSLT 1.0）をブラウザの `XSLTProcessor` で適用**して生成している。
- そのため HANDOVER §7 の **DDL golden テストは XSLT の出力に対して組む**ことになる。Node/Vitest に `XSLTProcessor` は無いので、着手時に「XSLT を Node で実行するライブラリを噛ませて現行出力を golden 化する」か「golden を人手で固定してから TS 実装に置き換える」かを選ぶ必要がある。**次タスク（§7）の最初の分岐点**として記録する。
- HANDOVER §6.3「SQL エクスポート規約」の実装先も最終的にこの層。

### 2026-08-09 HANDOVER §7「特性化テスト」実施 — 分岐点の決着と構成

走らせ方・golden の更新手順は [`docs/TESTING.md`](docs/TESTING.md)。ここには判断だけ残す。

- **上記「DDL 生成の実体は XSLT」で保留していた分岐点を決着させた。** 「Node の XSLT ライブラリで golden 化」か「人手で固定」かの二択ではなく、**ハイブリッド**を採る。
  - **golden の生成・確定は実ブラウザ（Playwright + Chromium）のみ**。本物の `XSLTProcessor` / `DOMParser` / 描画 DOM で採るので、現行挙動との乖離がゼロ。`tests/golden/` は実ブラウザ採取のものが唯一の正で、Node 側は**書き込まない**（`UPDATE_GOLDEN=1` を立てるのはブラウザ用 npm script だけ）。
  - **日常回帰は Node（vitest + jsdom + `xslt-processor`）**が同じ fixture・同じ golden を高速に検証する。
  - 理由: フロント TS 化（§3）の間、ロジックはまだブラウザでしか動かない。忠実さは実ブラウザでしか担保できず、一方で移植中は何度も回すので速い系統も要る。
- **現行コードは抽出せずそのまま動かす。** 先にロジックを抜き出すと「抜き出した後のコード」を特性化することになり安全網の意味が消える。抽出は §4 の仕事。
- **golden の対象は全 9 DB プロファイル**（7 fixture × 9 DB = 63 本）。house 到達点は PostgreSQL のみだが、ハーネスができれば追加コストがほぼゼロで、他プロファイルの撤去判断を後回しにできるため。
- **fixture は手書きの XML**。`toXML()` は `location.href` を埋め込んで非決定的なので、fixture の生成に現行コードを使わない。`<datatypes>` は fixture に持たせず、DB は `window.DATATYPES` の差し替えで与える（`dbResponse()` と同じ操作）。
- **`xslt-processor` 5.1.0 は XSLT 1.0 を完全には満たしていない。** 実測で 3 DB が不一致になった。ブラウザ側は全 9 DB を通るので golden は動かさず、Node 側だけを外して [`tests/node/parity-exceptions.ts`](tests/node/parity-exceptions.ts) に原因つきで記録した。**この 3 DB の DDL 回帰は `npm run test:browser` だけが張っている。**
  - `oracle`: トップレベル `xsl:variable` を解決できず `XPST0008` で失敗。
  - `sqlalchemy`: `apply-templates` 経由で `position()` / `last()` を誤り、カラム区切りのカンマが落ちる。
  - `vfp9`: `substring($s, 2, -1)` が空文字を返さず、1 文字の default が残る。
  - なお「XML 1.0 の line-end normalization をしない」「`method="text"` でも `& < >` をエスケープする」の 2 点は準拠実装の振る舞いを取り戻す**可逆な**前後処理として adapter 側で補正した（golden は歪めていない）。
- **`.gitattributes`: `db/**` と `locale/**` は `-text`（改行変換なし）**。当初 `eol=lf` にしようとしたが、**`db/vfp9/output.xsl` は upstream 本体が CRLF**（db/ 配下で唯一）で、`eol=lf` にすると upstream ファイルを書き換えてしまう。「コミットされたバイトのままチェックアウトさせる」ほうが golden の環境間安定という目的に対して十分かつ副作用が無い。`tests/fixtures/**` と `tests/golden/**`（自社ファイル）は `eol=lf` 固定。

### 2026-08-09 既知の不具合は golden に焼かず別枠でマークする

`tests/golden/` は「移植で変わってはいけない挙動」の記録なので、不具合をそこに焼くと*期待される正しい出力*に見えてしまう。そこで現行コードの不具合は [`tests/known-issues/`](tests/known-issues/) に隔離し、**golden ファイルを持たせず**「現在こう壊れている」ことをテストコード内のリテラルで直接アサートする（`npm run known-issues`。`npm test` には含めない）。移植で直すとこのテストが赤くなり、棚卸しを促す。

収録した 9 件と原因・直る予定は [`tests/known-issues/README.md`](tests/known-issues/README.md)。うち移植方針に関わるものだけ再掲する。

- **識別子に `&` を含めると `toXML()` が well-formed でない XML を吐く**（属性値のエスケープが `"` → `&quot;` だけ）。保存したファイルを二度と開けない。§4 で解消。
- **nullable かつ default 未指定の行が、保存すると `<default>NULL</default>` を獲得する**（情報が増える）。§4 の round-trip 要件で解消。
- **`BIGINT` が Big Integer ではなく Real に解決される**。`db/postgresql/datatypes.xml` が `sql="BIGINT"` を 2 か所に持ち、照合ループが `break` しないため後勝ち。§6.1 の型パレット差し替えで解消。
- **型パレットに無い型は黙って先頭の型になる**。現行 PG パレットに **uuid が無い**ため、house 既定の `uuid` PK が `INTEGER` に落ちる。§6.1 で解消。**golden にもそのまま写っている**ので、パレット差し替え時に差分として現れる。
- **key が複数あると制約名が `<table>_pkey` で衝突する**（`key/@name` を無視）。§6.3 の命名規約（`fk_<table>_<ref>` / `idx_<table>_<cols>`）で扱う。

**判断**: 正常系の入力であっても現行実装の欠陥は出力に出る（上記の `UUID` → `INTEGER`、`users_pkey` の重複など）。これらを避けるために fixture を非現実的な形に歪めるのは本末転倒なので、**fixture は house 既定に忠実なまま**とし、golden に写り込む癖は [`tests/golden/README.md`](tests/golden/README.md) に一覧で明示したうえで、各欠陥を known-issues 側から名指しで押さえる形にした。

### 2026-08-09 `js/config.js` の軽微な既存バグ（記録のみ・今回直さない）

- `CONFIG.AVAILABLE_DBS` に `"web2py"` が**2 回**入っている（[`frontend/js/config.js`](frontend/js/config.js) 2-14 行）。DB セレクタに重複した選択肢が出る。
- `CONFIG.DEFAULT_BACKEND` が文字列ではなく**配列** `["php-mysql"]`（同 55 行）。
- いずれも DDL / serializer の出力に影響しないため特性化テストの対象外。テストは `CONFIG.AVAILABLE_DBS` ではなく **`db/` のディレクトリ実体**を DB 一覧の正としている。

### 2026-08-09 HANDOVER §3「フロント TS 化」段階1 — Vite で既存 JS を束ねる

HANDOVER §3 は「Vite で束ねる → `checkJs`+JSDoc → 依存の薄い順に `.ts` 化 → `strict`」の 4 段。
**今回は段階1のみ**を入れた。走らせ方は [`docs/TESTING.md`](docs/TESTING.md)、構成は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5.1。

- **段階を分けたのは安全網を機能させるため。** 18 ファイル・約 4,200 行を一括で `.ts` 化すると、特性化テストが
  赤くなったときに「ビルド経路の変化」と「型付けによる書き換え」のどちらが原因か切り分けられない。
  段階1の成功判定は **`git diff tests/golden/` が空**であること（実際に 63＋7 本すべて無差分で通した）。
- **配置はルート維持**（`index.html` / `js/` / `db/` / `locale/` / `styles/` を動かさない）。URL 空間が現行と
  同一なら、特性化テスト 2 系統をほぼ無改修で通せる。`frontend/` への集約（HANDOVER §2.2 の Dockerfile 骨格）は
  §2 Docker 着手時に行う。
- **段階1では `js/` に import/export を入れない。** 相互参照は現行どおりグローバルのままにし、**定義側の 6 箇所だけ**を
  `window.` に付け替えた（`js/oz.js` の `OZ`、`js/config.js` の `CONFIG`、`js/globals.js` の `_` / `DATATYPES` /
  `LOCALE` / `SQL`）。ESM ではトップレベル `var` がモジュールスコープに閉じるため、これをしないと参照が切れる。
  逆にこれさえすれば **`tests/node/harness.ts` が `js/*.js` を 1 本ずつ eval する経路が無改修で通る**。
  依存グラフ化は `.ts` 化と同じ後続 PR で行う。
- **静的資産は `vite-plugin-static-copy` で dist へコピー**（`db/` `locale/` `images/`）。`public/` へ移動する案は
  backend（`php-postgresql`、将来の Kotlin introspection）が参照する `db/*/datatypes.xml` の位置を動かすので採らない。
  - `images/` が必要なのは実測による: **バンドル後の CSS が `url(../images/…)` を解決せずそのまま出す**ため、
    `dist/assets/*.css` から見た `dist/images/` が実在しないと背景が欠ける。
- **`tests/support/static-server.mjs` は撤去**した。Vite dev server が同じ URL 空間を配るので役割が重複する。
- **Vite の `server.host` は `127.0.0.1` に固定**する。既定の `"localhost"` では Node が `::1` を優先して
  IPv6 だけで listen し、Playwright が待つ `http://127.0.0.1:<port>` に応答しない（実測でハングした）。
- **`npm run test:dist` を追加**（[`playwright.dist.config.ts`](playwright.dist.config.ts)）。dev server が緑でも
  配布物が壊れていては意味がないので、`vite build` → `vite preview` に対して初期化・資産の実在・DDL の golden 一致を
  1 本だけ張る。golden は読むだけで採り直さない。
- **UI の end-to-end 操作確認（ARCHITECTURE §3 の未実施項目）をここで実施した。** テーブル追加・カラム追加・
  SQL 出力（`clientsql`）・スタイル切替・ロケール切替・cookie 保存が Vite 化後も動くことを確認済み。
  スタイル切替は `<link>` の **`title` 属性**での照合（[`frontend/js/wwwsqldesigner.js:118-133`](frontend/js/wwwsqldesigner.js#L118-L133)）
  なので、build でファイル名がハッシュ化されても機能する。

**upstream の `Dockerfile`（busybox httpd でリポジトリを丸ごと配る）はこの変更で動かなくなる。**
`index.html` が `/src/main.ts` を読むため、素の静的配信では起動しない。README にその旨を明記し、
マルチステージ化は HANDOVER §2 の仕事として据え置いた（§9 の実装順序どおり Docker は後段）。

build 出力について記録しておく点（いずれも実害なしと判断）:

- `styles/print.css` は data URI にインライン化される（`media="print"` のまま機能する）。
- IE6/7 用の条件付きコメントが参照する `styles/ie6.css` / `ie7.css` は dist にコピーされない。条件付きコメントは
  IE 以外では単なる HTML コメントで評価されないため無害。撤去は将来の掃除で扱う。
- `js/wwwsqldesigner.js:215` の直接 `eval`（cookie のオブジェクトリテラル評価）に rolldown が警告を出す。
  外部変数を参照しないので minify 後も壊れない。§4 の IO 移植で自然に消える。

### 2026-08-09 `index.html` の CDN 依存（未処理）

- `index.html` は Dropbox 連携のため `//cdnjs.cloudflare.com/…/dropbox.min.js` を読み込む。**Docker でローカル完結**という HANDOVER §2 の方針と噛み合わない。
- Dropbox 機能の存廃とあわせて扱いを決める（現時点では未決）。

### 2026-08-10 HANDOVER §3「フロント TS 化」段階2 — `checkJs`+JSDoc をやめ、JS のまま構造を正す

HANDOVER §3 は段階2 を「`checkJs` + JSDoc」と定めていたが、**この段階はそのままでは成立しない**。
段階2 を「**JS のまま、TS が読める構造に正す**」へ組み替えた。走らせ方は [`docs/TESTING.md`](docs/TESTING.md)、
クラス階層の実情は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5.4。ここには判断だけ残す。

**組み替えの根拠（実測）**。`tsc --allowJs --checkJs --noEmit --strict --target ES2022
--lib ES2022,DOM,DOM.Iterable js/*.js` で **1,275 件**（TS2339 573 / TS2304 375 / TS7006 253 ほか）。
TS2339 のうち 247 件以上が `'Row'` / `'Map'` / `'Table'` / `'Rubberband'` に対する
「そのクラス自体を知らない」エラーで、原因は 2 つとも JSDoc では解決できない。

- `SQL.Visual.apply(this)` で親コンストラクタを呼び、`this.dom` / `this.data` は `_init()` の中で
  代入していた。TS が拾うのは**コンストラクタ本体内**の `this.x =` だけ。
- `SQL.Row.prototype = Object.create(SQL.Visual.prototype)` を TS は継承と認識しない。
  `@extends` は `class` 宣言か `@constructor` 付き関数にしか効かない。

4,200 行に JSDoc を撒く前に構造を正すほうが安く、段階3 の `.ts` 化がそのまま接続する。

**class 化の設計判断**。

- **`_init()` / `_build()` の呼び出しを基底コンストラクタから外し**、各サブクラスが従来
  `SQL.Visual.apply(this)` を書いていた位置で呼ぶ形にした（Step4 で先に分離してから class 化）。
  [`frontend/js/table.js`](frontend/js/table.js) の `_build()` が `this.owner.map.dom.container` を読むため、
  「基底コンストラクタが `_build()` を呼ぶ」形は **ES クラスの「`super()` 前に `this` を触れない」制約と
  原理的に両立しない**。呼び出し順は現行と 1 行もずれていない。
- **クラスフィールド初期化子は使わない**。派生クラスの初期化子は `super()` 直後に走るため、現行の
  「自前フィールド代入 → `_init()`」の順序と食い違う。代入はすべてコンストラクタ本体に置いた。
  例外は `static`（`Relation._counter`）のみ。
- **`class X { … }` + `SQL.X = X;` の 2 行形を必須とした**。実測で `window.eval("class Foo {}")` は
  `Foo` をグローバルに残さない（lexical 宣言は使い捨ての環境レコードに入る仕様。`var` は残る）。
  ファイル跨ぎの参照が `SQL.` 経由になるのは現行と同じなので、**`js/` に import/export を入れない
  という段階1 の前提は崩れず、`tests/node/harness.ts` の eval 経路は無改修で通った**。
- `SQL.Table` の静的 `active` / `x` / `y` は**初期化子なしの `static` 宣言**にした。`= false` にすると
  初回ドラッグ前の値が `undefined` から `false` に変わるため（読むのは `move()` と `up()` だけで観測は
  できないが、証明できる同値を採る）。`npm run test:dist` でバンドル後も `static active;` がそのまま
  出力されることを確認済み。
- `SQL.Relation` は **`this.dom` を配列で上書きする箇所（基底の `{container,title}` を置き換える）を
  触っていない**。基底で `dom` の型を決められない原因そのものだが、直すと `redrawNormal` / `redrawSide` /
  `show` / `hide` / `destroy` を全部書き換えることになるうえ、`checkJs` を立てない段階2 では型上の利益が
  ゼロ。段階3 の判断事項として残す。
- **基底を呼ばない `destroy` / `setTitle` に `super.` を足していない**。`SQL.Key`（dom を持たない）、
  `SQL.Relation`（dom が配列なので基底では落ちる）、`SQL.Designer.setTitle`（`document.title` を
  更新するだけ）の 3 つ。いずれもコメントで明示した。
- **minimap のクラス名は `Map` ではなく `Minimap`**。ES 標準の `Map` と同名で `TS2300 Duplicate
  identifier` が出る。現状の実害はゼロだが、段階3 でモジュール化すると `export class Map` が
  import 側で標準 `Map` を隠す。公開名 `SQL.Map` は現行のまま。

**`SQL.Designer` のクラス/インスタンス分離**。現行は `SQL.Designer = function () { SQL.Designer = this; … }`
で、生成した瞬間にクラスが唯一のインスタンスに置き換わっていた。参照側（`table` / `row` / `relation` /
`rowmanager` の 6 箇所）はすべて実体を期待しているので、**クラス = `SQL.Designer` / インスタンス =
`SQL.designer`** に分けた。自己登録をコンストラクタに残したのは、起動経路が 3 つあり
（[`frontend/src/main.ts`](frontend/src/main.ts) / `tests/node/harness.ts` の `window.eval` / ブラウザ）、いずれも戻り値を
`SQL` に載せないため。DI 化は §4 の IO 分離と同時に行う。
**副作用**: `new SQL.Designer()` を 2 回呼べるようになった（現在は 2 回目が「クラスではない」で落ちる）。
呼ぶ箇所は無い。

**削除したもの**。

- `OZ.Class` / `implement` / `extend` / `dispatch`（参照 0・`arguments.callee` 依存）。
- ES5 polyfill 群（`js/oz.js` の `Function.prototype.bind` と `Array.prototype.*`、
  [`frontend/js/globals.js`](frontend/js/globals.js) の `endsWith` / `trim` / `Object.create`）。**すべて `if (!X)` ガード付きで、
  ネイティブがある実行系では本体が一度も評価されない**＝「微妙に違う実装で上書きしていた」ことは
  原理的に起こり得ない。jsdom と Chromium 151 の両方でネイティブ実在を実測した。
- 非標準の静的版（`Array.indexOf` ほか 7 本、`String.trim`）は**ネイティブに無いので実際に
  インストールされていた**が、リポジトリ全体で参照 0 件を確認して削除。
- `js/oz.js` 468 → 295 行、`js/globals.js` 88 → 63 行。

**挙動不変の例外として直した 2 件**（暗黙グローバル）。

- [`frontend/js/io.js`](frontend/js/io.js) の `req = r[1]`（`var` 抜け）、[`frontend/js/oz.js`](frontend/js/oz.js) の `var x = (y = 0)`（`y` が暗黙グローバル）。
- 根拠は **ESM が常に strict** であること。Vite の dev / build 経路では既に `ReferenceError` で落ちており、
  sloppy な `window.eval` で動く Node ハーネスとの間で「現行挙動」が割れている。再現すべき単一の挙動が
  存在しないので修正側を採った。**PG18 introspection の判断（well-formed でない XML を再現しない）と同じ論法**。
- 実測（Vite dev + Chromium、`?backend=php-file`）: 修正前は `pageerror: req is not defined` ×2 で
  `SQL.designer.io` が生えない＝**アプリが起動しない**。修正後は pageerror 0 件。
  `oz.js` 側の到達経路はミニマップの mousedown（`OZ.DOM.pos` の唯一の呼び出し元は [`frontend/js/map.js`](frontend/js/map.js)）で、
  同じく修正前は `ReferenceError: y is not defined` を実測した。
- どちらも golden の経路は通らないので `git diff tests/golden/` は空のまま。

**今回やらなかったこと（理由つき）**。

- **`DATATYPES = false` → `null` の是正を見送った**。`== false` / `!DATATYPES` は全 12 箇所中 0 件で、
  唯一の真偽評価が [`frontend/js/wwwsqldesigner.js:353`](frontend/js/wwwsqldesigner.js#L353) の `window.DATATYPES.xml`。
  `false` なら `undefined`（例外にならない）、`null` なら **TypeError**。`checkJs` を立てない段階2 では
  診断が 1 件も変わらず利益ゼロで、この分岐は §4 の XML 書き出し撤去で丸ごと消える。
  `typeIndex` / `fkTypeFor` も同じ扱いにした。
- **[`frontend/js/wwwsqldesigner.js:356`](frontend/js/wwwsqldesigner.js#L356) の未定義 `e` を触っていない**。代入ではなく読み取りなので
  strict / sloppy で挙動が割れておらず、到達不能（`XMLSerializer` が無い環境のみ）。直すには
  「何を表示すべきか」を発明することになる。段階3 の計測で `TS2304` が 1 件だけ残り、本物のバグを指す
  マーカーになる。
- **[`frontend/js/wwwsqldesigner.js:215`](frontend/js/wwwsqldesigner.js#L215) の `eval`（cookie）も据え置き**。形式が `{k:'v'}` で JSON ではなく
  `JSON.parse` に単純置換できない。§4 の IO 移植で消える。
- **`SQL.Visual` を継承していない 7 クラス**（`IO` / `Toggle` / `TableManager` / `RowManager` /
  `KeyManager` / `Window` / `Options`）は class 化していない。継承が無いので「クラスを知らない」問題も
  起きず、承認済みスコープを広げないため。入れれば TS2339 がさらに 200 件前後改善する見込み。
- **`checkJs` は立てていない**。段階3 で `.ts` 化と同時。

**段階3 readiness（同条件での実測）**。総数は 1,275 → **1,274** でほぼ横ばいだが、**診断の性質が
変わった**ことがこの段階の成果。

| | before | after |
|---|---|---|
| TS2339 のうち `'Row'` / `'Map'` / `'Table'` / `'Rubberband'` 等（クラス自体が見えない） | 247+ | **0** |
| TS2339 のうち `'{ container: null; title: null; }'` / `'{ title: string; }'`（基底の dom/data の実型が見えた上での指摘） | 0 | 113 |
| TS2532（Object is possibly 'undefined'） | 0 | 210 |
| TS2304 の `y`（`oz.js`）と `req`（`io.js`） | 10 | **0** |
| TS2304 の `e`（本物のバグ） | 1 | 1 |

つまり「構造が読めない」から「読めた上での指摘」に変質した。段階3 で解くべき本丸は
**`dom` バッグが異種であること**（3 形態: 固定キー＋後付け／文字列キーの動的代入／`Relation` の配列）
だと数値で確定した。

**`types/globals.d.ts` を入れた目的**は js/ の ambient 化ではない（`checkJs: false` なので js/ の診断は
1 件も変わらない）。`SQL.Designer` → `SQL.designer` の改名を `npm run typecheck` が検出できるようにする
こと。集約前は型が 3 ファイルに散り、うち `tests/node/harness.ts` は `as unknown as {…}` で受けていたため
直し忘れてもコンパイルが通っていた。実証として、`sql.designer.toXML()` をわざと `sql.Designer.toXML()` に
戻すと `TS2339: Property 'toXML' does not exist on type 'new () => SqlDesigner'` で落ちることを確認した。
index signature と js/ 用の裸グローバル（`OZ` / `_` / `CONFIG` / `Dropbox` / `ActiveXObject`）は意図的に
書いていない。段階3 で js/ が `.ts` になったら本ファイルは消す。

**検証**。成功判定は段階1 と同じく **`git diff tests/golden/` が空**であること（63 + 7 本すべて無差分）。
`npm run golden:update` はこの PR で一度も打っていない。known-issues は 9 件のままアサート値を 1 文字も
変えていない。加えて golden が張っていない対話パスを Playwright で 31 項目一巡し、
**`npm run dev`（4173）と `npm run preview`（4174）の両方で 31/31**（テーブル追加・カラム追加と展開・
ドラッグ・shift 複数選択・ラバーバンド・ミニマップ・リサイズ追随・FK と関係線の色・ハイライト・
key ダイアログ・SQL 出力・カラム/テーブル削除・スタイル切替と cookie・`?backend=` / `?toolbar=hidden`）。

> 副産物の記録: 複数選択は **shift + mousedown** でしか効かない（`Table.click` は `shiftKey` を見ず、
> `Table.down` だけが見る）。段階2 の回帰ではないことを `develop` 上で同じ操作を流して確認済み。
> スタイル切替も `Options.save` が cookie に書くだけで `applyStyle` を呼ばない（`index.html` の
> 「* は再読み込みが必要」の注記どおり）。どちらも現行仕様。

### 2026-08-11 vitest の Windows 小文字ドライブレター問題に cwd 正規化ラッパーを入れた

段階2 の作業中、`npm test` が**テストを 1 件も走らせずに落ちる**事象を観測した。走らせ方は
[`docs/TESTING.md`](docs/TESTING.md)。ここには判断だけ残す。

```
 ❯ tests/node/serialize.test.ts (0 test)
TypeError: Cannot read properties of undefined (reading 'config')
 ❯ tests/node/serialize.test.ts:8:1      ← トップレベルの describe(...) 行
 Test Files  2 failed (2)
      Tests  no tests
```

**当初「初回だけ落ちる」と見えたが、実際は「cwd のドライブレターが小文字の間ずっと落ちる」だった。**
2 回目が通ったのはシェルの cwd が途中で大文字に変わったためで、キャッシュとは無関係。
小文字 cwd を強制すると **5/5 で失敗**、対策後は **5/5 で成功**する（実測）。

**原因**（vitest 4.1.10 / vite 8.2.1 時点。版が上がれば行番号はずれる）:

- vitest の `distDir` は `import.meta.url` 由来なので **cwd の大小をそのまま引き継ぐ**。
- 一方 vite にバンドルされた pathe（`normalizeWindowsPath`）は**必ず**ドライブレターを大文字化する。
- Node の ESM レジストリは URL 文字列でキーされるので、両者がずれると
  **vitest ランタイムが 2 インスタンス読み込まれる**。テストファイルが掴んだ側は
  `clearCollectorContext` を通らず `runner` が `undefined` のままで、`describe()` 内の
  `validateTags(runner.config, …)` が TypeError になる。
- 確率的に見えたのは、vite の `safeRealpathSync` が `net use` の非同期判定を境に
  `realpathSync`（大小を保存）と `realpathSync.native`（正規化する）を**同一プロセス内で切り替える**ため。
  設定で消せる類のレースではない。

upstream: [vitest#10692](https://github.com/vitest-dev/vitest/issues/10692) /
[#10812](https://github.com/vitest-dev/vitest/issues/10812) /
[PR#10843](https://github.com/vitest-dev/vitest/pull/10843)（**いずれも未修正**。4.1.10 が最新で、
v5.0.0-beta.7 でも同じエラーが報告されている ——**2026-08-11 時点の状態**。
**最新版がどれかは腐る**ので、以後の観測は下の 4.1.11 の節が持つ）。

**採った対策**: [`scripts/vitest.mjs`](scripts/vitest.mjs) が cwd を `fs.realpathSync.native` と
一致する形に正規化してから vitest CLI を起動する。判定は [`scripts/canonical-cwd.mjs`](scripts/canonical-cwd.mjs)
に集約し、[`vitest.config.ts`](vitest.config.ts) からも呼んで**ラッパーを通らない起動**
（`npx vitest` / IDE 拡張）を原因の分かるエラーで止める。`package.json` の `test` は 1 行変更。

- **単なる大文字化ではなく `realpathSync.native` に揃える**のが要点。vite の `safeRealpathSync` が
  どちらの実装に切り替わっても同じ文字列を返す状態になり、レース自体が無害化する。
- **再 spawn しない**（`chdir` + 正規化済み絶対 URL からの `import()`）。プロセスが 1 個で済むので
  終了コード・TTY・引数が素のまま通る。実測で `npm test -- -t "決定論"` などの透過と、
  失敗時に exit 1 が返ることを確認済み。
- **`process.chdir()` だけでは cwd の case が変わらないことがある**。Windows の
  `SetCurrentDirectory` が「同じディレクトリ」と判断して内部の文字列を更新しないため。
  更新されなかった場合だけ親を経由して切り替える。
- `platform !== "win32"` なら完全に no-op。symlink 解決や UNC 展開で**大小以外が変わる場合は触らない**
  （cwd を動かすと別の事故になる）。`realpathSync.native` が例外を投げる環境では素の cwd にフォールバックする。

**却下した対策**:

- **`root` の指定（config でも `--root` でも）は効かない。** issue #10692 は「`--root` を明示すれば
  回避できる」と書いているが、本環境で実測したところ **`root` を大文字/小文字どちらで渡しても
  `distDir` は変わらなかった**（`distDir` は `import.meta.url` 由来で `root` と無関係）。
  むしろ vite は渡した root を pathe で大文字化するので、`distDir` が小文字のままだと
  不一致を固定しかねない。
- `pool` / `poolOptions` / `maxWorkers` / `isolate: false` / `deps.optimizer` — 本件はワーカー初期化の
  タイミング問題ではなくモジュール解決の同一性問題なので原理的に無関係。issue でも「効かない」と報告されている。
- **ドキュメントに「PowerShell で実行」と書くだけ** — cwd の case は親プロセスから継承されるので、
  シェルの種類は原因ではなく相関にすぎない（同じ Git Bash で大文字・小文字の両方を実測した）。
  Hard Constraint 1 の安全網を人間の運用に依存させるのは弱い。
- `experimental.viteModuleRunner: false` — native import 経路も pathe を通るので同じ問題を踏む。
- `patch-package` で PR#10843 を当てる — 未マージ PR は内容が変わりうる。依存も増える。

**撤去条件**。次の 3 つが揃ったら `scripts/vitest.mjs` / `scripts/canonical-cwd.mjs` /
`package.json` の `test` / `vitest.config.ts` のガード / `tests/node/workarounds.test.ts` を
**同時に**元へ戻す（1 コミットにまとめる）。

1. PR#10843 がマージされた版へ vitest を上げた
2. 小文字 cwd を強制してラッパー無しで 20 回走らせ、20/20 緑
3. `distDir` とその pathe 正規化後が一致する（[`docs/TESTING.md`](docs/TESTING.md) の再現コマンド）

撤去忘れを防ぐため [`tests/node/workarounds.test.ts`](tests/node/workarounds.test.ts) が
vitest のバージョンを固定していて、**上げると必ず 1 回赤くなる**。
[`tests/node/parity-exceptions.ts`](tests/node/parity-exceptions.ts)（xslt-processor の例外が
まだ実在すること自体をテストにする）と同じイディオム。

**Linux では起きない**（`process.cwd()` が常に解決済みの物理パスを返すため）。HANDOVER §2 で
主経路が Docker に移れば本件は消えるが、Windows でのローカル開発が続く限りラッパーは残す。

#### ★ 4.1.11 で撤去条件 2 を実際に回した（2026-08-27）—— **まだ直っていない**

Dependabot の [#100](https://github.com/propagandist/grabado/pull/100) が vitest を
**4.1.10 → 4.1.11** に上げようとし、**`workarounds.test.ts` が設計どおり赤くなった**
（`expected '4.1.11' to be '4.1.10'`）。**仕掛けが働いた形**なので、指示どおり棚卸しをした。

`vitest.config.ts` のガードを外し、**小文字 cwd で `node_modules/vitest/vitest.mjs` を直に起動**:

```
 Test Files  24 failed (24)
      Tests  no tests
TypeError: Cannot read properties of undefined (reading 'config')
```

**症状がそのまま再現した。1 回目で落ちたので「20/20 緑」は満たさない**（20 回は回していない ——
**1 回でも落ちれば条件は崩れる**）。よって**回避策は残し、`KNOWN_BROKEN_VITEST` を 4.1.11 へ**更新した。

**★★ ガードを外さないと検証にならない。** 外さずに走らせると、**こちらの `assertCanonicalCwd` が
先に止める** —— 落ちた理由が「vitest のバグ」なのか「自分のガード」なのか区別できず、
**「まだ壊れている」と読み違える**。**実際、最初の 1 回はそれで誤読しかけた。**
**次に版が上がったときも、まずガードを外すこと。**

### 2026-08-11 HANDOVER §3「フロント TS 化」段階3-0 — Node ハーネスを IIFE バンドルに載せ替えた

段階3 は「依存の薄い順に `.ts` 化」。その**着手前に潰す障害が 1 つ**あり、これを独立した PR にした。
[`tests/node/harness.ts`](tests/node/harness.ts) は `js/*.js` を 1 本ずつ `window.eval` していて、
`js/` の 1 本目を `.ts` にした瞬間にこの経路が死ぬ（[`docs/TESTING.md`](docs/TESTING.md) が
「段階3 の分岐点」として予告していた箇所）。**Hard Constraint 1 の安全網が、まさに移植を始める
瞬間に片肺になる**。走らせ方は [`docs/TESTING.md`](docs/TESTING.md)、構成は
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5.1・§5.4。ここには判断だけ残す。

- **`js/` を 1 行も触らずにハーネスだけを載せ替えた。** 段階1 の「一括でやると *ビルド経路の変化* と
  *型付けによる書き換え* のどちらが原因か切り分けられない」という論法を、ハーネス自体に適用した形。
  既知良好な現行 `js/` に対して緑を確認してから型付けに入る。
- **採ったのは vite の `build()`（`write: false`）で `src/app.ts` を単一 IIFE に束ね、jsdom の
  `window.eval` に 1 回渡す形。** 決め手は「`js/` が `.js` でも `.ts` でも、参照がグローバルでも
  ESM でも**同じハーネスコードで動く**」こと。移行が 1 回で済み、段階3 の後続（`.ts` 化・import 導入）と
  完全に独立になる。実測: 89,263 bytes / バンドル 1 回あたり約 0.3 秒。`npm test` 全体は
  **61 passed + 21 skipped（3 files）で件数不変**、所要も悪化しない（実測 5〜13 秒。キャッシュ状態で振れる）。
- **エントリを `src/app.ts`（定義）と `src/main.ts`（起動）に分けた。** ハーネスは「js/ を全部評価 →
  `OZ.Request` を fs 読みに差し替え → `new SQL.Designer()`」の順序を要求するので、起動を含む
  エントリは束ねられない。分けたことで**読み込み順の定義が `src/app.ts` の 1 か所に集約**され、
  ハーネス側の `SCRIPT_ORDER`（18 行の二重管理）が消えた。`index.html` は無改修。
- **`configFile: false` と `root: REPO_ROOT` は必須。** 前者は [`vite.config.ts`](vite.config.ts) の
  `viteStaticCopy` を走らせないため（走ると `dist/` に書き込む＝テストが副作用を持つ）。後者は
  `process.cwd()` を読ませないため（上記の Windows ワークアラウンドと非干渉にする）。実測で、
  cwd のドライブレターを小文字に強制した実行でも 61 passed。`vitest.config.ts` と
  `scripts/vitest.mjs` は 1 行も触っていない。
- **`rollupOptions.treeshake: false`。** 副作用 import だけで構成されるエントリなので、
  安全網をツリーシェイクの判断に依存させない。配布物の妥当性は `npm run test:dist` が別途張る。

**却下した 2 案**（いずれも実測）。

- **`ts.transpileModule` で 1 ファイルずつ型を剥がして今までどおり eval する。** 新規依存ゼロで
  変更も小さいが、**`import type` が 1 つでもあると素の eval が壊れる**。実測（typescript 5.9.3、
  `import type { Row } from "./row.ts"` を含む入力）: `module: ESNext` は末尾に **`export {};`** を
  付けて `SyntaxError`、`module: None` は先頭に **`Object.defineProperty(exports, …)`** を付けて
  `ReferenceError`。型だけの import ですらこうなるので、段階3 で import を入れた時点で**もう一度
  移行する**ことになる。ただし本方式が行き詰まったときの退避策としては有効なので記録に残す。
- **vitest の `environment` を `jsdom` にして `import()` する。** ハーネスは自前 JSDOM を毎回構築し
  `NodeHarness.dom` として返しているが、vitest の jsdom 環境は**ワーカーに 1 個**しか無く HTML も
  config 固定なので、`createHarness()` を複数回呼べる現在の形が成立しない（インターフェースが壊れる）。
  加えて ES モジュールはインスタンス化が 1 回だけキャッシュされるため、`window.OZ = {… ie: !!document.attachEvent …}`
  のような**評価時に ambient global へ束縛される**コードを 2 つ目の window に対して起こし直せない。
  Windows ワークアラウンドが張り付いた `vitest.config.ts` を触ることにもなる。

**`"use strict";` を前置した — ただし想定した効果の一部は得られない（実測）。**

ESM で配る側（`dev` / `build` / `test:browser` / `test:dist`）は常に strict なのに `window.eval` 側は
sloppy、という乖離を縮めるために前置した。rolldown の IIFE 出力自体には `"use strict"` が付かない。
安全性は事前に実測済み（`js/` に `with` / `arguments.callee` / 8 進リテラルは 0 件。`eval` は
[`frontend/js/wwwsqldesigner.js:215`](frontend/js/wwwsqldesigner.js#L215) の 1 件だけで、外側で `var` 宣言済みの `obj` に
代入する**式評価**なので strict でも挙動が変わらない）。実際に `npm test` は緑のまま。

**しかし暗黙グローバルは、これを入れても `npm test` では捕まらない。** jsdom の `Window` は vm の
contextified global（Proxy）で、strict でも未宣言の名前への代入が成立してしまう。

| 判別子（`"use strict";` 前置あり） | 実測 |
|---|---|
| 関数呼び出しの `this` | `undefined`（＝strict） |
| frozen オブジェクトへの代入 | `TypeError`（＝strict） |
| `delete` 変数 | `SyntaxError`（＝strict） |
| **暗黙グローバル代入** | **素通りして `window` に載る** |

Node の素の indirect eval と `vm.runInContext` では同じコードが `ReferenceError` になるので、
これは jsdom 固有の制約。**したがって「暗黙グローバルはブラウザ側でしか赤くならない」という
注意書きは撤去せず、理由を精密化して残した**（当初は前置で不要になる想定だった）。
段階2 で直した 2 件（`js/io.js` の `req` / `js/oz.js` の `y`）と同種の問題は、引き続き
`npm run test:browser` だけが張っている。

**検証**。成功判定は段階1・2 と同じく **`git diff tests/golden/` が空**であること（63 + 7 本すべて
無差分。untracked も無し＝`npm run golden:update` をこの PR で一度も打っていない）。
`npm test` 61 passed / 21 skipped（件数不変）、`npm run test:browser` 80 passed、
`npm run test:dist` 3 passed、`npm run known-issues` 9 passed（アサート値は 1 文字も変えていない）、
`npm run typecheck` 0 error。

### 2026-08-12 HANDOVER §3「フロント TS 化」段階3-1 — 先頭 3 本を `.ts` 化し、移行イディオムを決めた

段階3 の本体（`js/` 18 本・4,183 行の `.ts` 化）に着手した。**一度に全部やらない**。
`tsc --allowJs --checkJs --noEmit --strict --noUncheckedIndexedAccess` での実測は **1,281 件**あり、
1 PR で潰すと golden に差分が出たときに原因ファイルを切り分けられない（段階1 と同じ論法）。
本 PR は読み込み順の先頭 3 本 — [`frontend/js/oz.ts`](frontend/js/oz.ts) / [`frontend/js/config.ts`](frontend/js/config.ts) /
[`frontend/js/globals.ts`](frontend/js/globals.ts)（462 行・101 診断）— に絞り、**残り 15 本が従うイディオムを確定する**
ことを目的にした。構成は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5.1・§5.5、走らせ方は
[`docs/TESTING.md`](docs/TESTING.md)。ここには判断だけ残す。

**着手前の実測（診断 1,281 件の内訳）**。総数より性質が重要だった。

| | 件数 | 段階3 での意味 |
|---|---|---|
| TS2304（`OZ` 266 / `_` 57 / `CONFIG` 24 / `Dropbox` 10 / `DATATYPES` 3 / `ActiveXObject` 3 / `e` 1） | 364 | **型作業ではない**。裸グローバルが宣言されていないだけで、import 化すれば消える |
| TS2339 | 381 | `dom` バッグの 3 形態（§5.4）が本丸。段階3-2 |
| TS2532 + TS2531 | 251 | `noUncheckedIndexedAccess` 由来が大半 |
| TS7006 | 210 | 引数の implicit any |

ファイル別は `row` 275 / `io` 179 / `table` 132 / `keymanager` 125 が重く、`config` 1 / `toggle` 8 /
`visual` 9 / `key` 9 が軽い。**段階3-2 は描画中核（visual/row/table/relation/key/rubberband/map）、
3-3 は IO・manager 群、3-4 は `window` 登録と `types/globals.d.ts` の撤去**に割る。

**イディオム A: `.ts` 化 ＝ モジュール化。ただし `window` 登録は残す。**
`.ts` にして非モジュールのまま置くと、`class Window` / `Options` / `Key` / `Table` が
グローバル型空間に出て `lib.dom` と衝突する。**`.ts` 化とモジュール化は分離できない**。
一方まだ `.js` の 15 本は裸のグローバルを読むので、`export` と併せて `window.X = X` を残し、
各ファイルが自分の面を `declare global` で宣言する。段階3-4 で宣言ごと消える。
[`types/globals.d.ts`](types/globals.d.ts) に集約し続けるより後始末が確実で、実際この PR で
同ファイルは `SqlDesigner` とデバッグ用ハンドルだけに縮んだ。

**イディオム B: 読み込み順の先頭から進める。**
[`frontend/src/app.ts`](frontend/src/app.ts) の順に前から `.ts` 化すれば、`.ts` 側が参照するシンボルは常に
**既に `.ts` 化済み**で import に置き換えられる。葉から進めると未 `.ts` のグローバルに対する
ambient 宣言が要り、その宣言自体が後で捨てる作業になる。**移行用の ambient 宣言ファイルは作らない**。
例外は実行時インスタンス（`SQL.designer` を `table` / `row` / `relation` / `rowmanager` が見る 6 箇所）で、
import にすると循環するため `SQL` 名前空間オブジェクト経由のまま据え置く（DI 化は §4 の IO 分離と同時）。

**イディオム C: 実行コードは変えない。** 型は注釈・`as`・オーバーロードで通し、`if (!x) return;` の
ような実行時ガードは足さない（挙動が変わるため）。`any` で埋めない。例外は下の D の死にコード撤去だけ。

**イディオム D: 撤去は「対象実行系で一度も評価されない」を実測してから。**
段階2 の polyfill 撤去と同じ論法。Chromium 151.0.7922.34 と jsdom 29.1.1 の**両方**で計測し、
15 項目すべてが一致した（撤去する側は 6 件とも false、残す側は 6 件とも true）。

| 判別子 | Chromium | jsdom | 扱い |
|---|---|---|---|
| `"attachEvent" in document` / element、`"detachEvent" in element` | false | false | 撤去 |
| `window.opera`、`document.getAnonymousElementByAttribute` | false | false | 撤去 |
| `"ActiveXObject" in window`、`"currentStyle" in element` | false | false | 撤去 |
| `window.XMLHttpRequest`、`defaultView.getComputedStyle` | true | true | 残す |
| `Event.prototype` の `stopPropagation` / `preventDefault` / `target` | true | true | 残す |

`srcElement` / `cancelBubble` / `returnValue` は**プロパティ自体は両実行系に存在する**が、
`e.target || e.srcElement` のような三項の第 1 項（`target` / `stopPropagation` / `preventDefault`）が
必ず真になるので else 側には落ちない。実測を見て初めて「存在するが到達しない」と分かる部類で、
`in` の結果だけを見て撤去していたら判断を誤っていた。

これで [`frontend/js/oz.ts`](frontend/js/oz.ts) から消したもの: 参照 0 の `select` / `gecko` / `webkit` / `khtml`、
`Event.add` / `remove` の `attachEvent` / `detachEvent` 分岐、`Event.stop` / `prevent` / `target` の
IE フォールバック、`Style.get` の `currentStyle`、`Style.set` の opacity→filter と float→styleFloat、
`DOM.pos` の opera 分岐、`Request` の `ActiveXObject` 分岐。299 → 354 行（消したぶんより型注釈と根拠コメントのほうが多い）。

**`OZ.ie` / `OZ.opera` はプロパティだけ残した。** [`frontend/js/tablemanager.js:217`](frontend/js/tablemanager.js#L217)（IE6 で
`select()` が throw する回避）と [`frontend/js/io.js:689`](frontend/js/io.js#L689)（F2 の preventDefault）がまだ `.js` で読む。
元式は上表のとおり両実行系で false なので値は `false` 固定にし、参照側を `.ts` 化する段階3-3 で
分岐ごと畳んで消す。

**「XMLHttpRequest / getComputedStyle があるか」の判定も一緒に撤去した**（当初の計画外）。
どちらも撤去対象フォールバックの**相方**で、`else` 側が消えると条件だけが残る。特に `Request` は
`var xhr = false;` に XHR を代入する形なので、TS では `xhr` が `XMLHttpRequest | false` になり、
`onreadystatechange` のクロージャ内では narrowing が効かず `xhr.readyState` が全部エラーになる。
実行コードを変えずに通すと `(xhr as XMLHttpRequest)` を 5 箇所に撒くことになり、型注釈が
「実在しない可能性」を主張し続ける。実測で到達不能と分かっている分岐なので、撤去して
`var xhr = new XMLHttpRequest();` にした。戻り型の `XMLHttpRequest | false` は残してある
（[`tests/node/harness.ts`](tests/node/harness.ts) が `Request` を fs 読みに差し替えて `false` を返すため）。

**`while (1)` を `while (true)` にした 1 件だけは、型のためのコード変更。**
TS の制御フロー解析が無限ループと認識するのは `while (true)` だけで、`1` のままだと
`OZ.DOM.pos` が「`undefined` を返しうる」と判定される。定数の真偽値としては完全に同値。

**型の設計で後続に効く判断**。

- **`OZ.$` の戻りは non-null。** `<T extends EventTarget = HTMLElement>(x: string | T): T` にした。
  `getElementById` の `null` を戻り型に出すと呼び出し 60 箇所すべてがガード追加を要求され、
  イディオム C と正面衝突する（存在しない id を渡せば現行も同じ場所で落ちる）。制約が `Element` では
  なく `EventTarget` なのは、`OZ.Event.add` に `document` / `window` を渡す呼び出しが 11 件あるため。
- **`OZ.DOM.elm` は `HTMLElementTagNameMap` でタグ名から要素型を返す。** 呼び出し 38 箇所の
  タグ名がすべて文字列リテラルであることを確認済みなので、`elm("td", …)` が `HTMLTableCellElement` を
  返す。段階3-2 で `dom` バッグの型を決めるときの材料になる。
- **`OZ.Event.target` の戻りも non-null の `HTMLElement`。** 呼び出し 5 箇所が `nodeName` を読むか
  `dom.title` と比較するだけで、`EventTarget | null` を返すと全箇所がキャストだらけになる。
- **`OZ.DOM.append` は rest 引数のシグネチャだけ与え、本体は `arguments` のまま。** rest 変数を
  読む形に書き換えると実行コードが変わる。

**`window.SQL` への代入だけキャストが要る。** まだ `.js` の 15 本が `SQL.Visual = Visual;` と
トップレベルで生やしており、TS は `allowJs` のもとで**その代入から `SQL` のグローバル型を合成する**。
結果 `window.SQL` の型は「[`frontend/js/globals.ts`](frontend/js/globals.ts) の `SqlNamespace` ∩ 合成型」になり、
まだ生えていないクラス 14 個を要求してくる。`as unknown as typeof window.SQL` で受けた。
段階3-3 で `.js` が尽きれば合成が止まり、素の代入に戻せる。

**`SqlNamespace` に `Designer` / `designer` を宣言し続けた**のは、段階2 で入れた
「`SQL.Designer` → `SQL.designer` の改名を `npm run typecheck` が検出する」安全網を維持するため。
実証もやり直した: [`tests/node/harness.ts`](tests/node/harness.ts) の `sql.designer.toXML()` を
`sql.Designer.toXML()` に戻すと、合成型と交差した後でも
`TS2339: Property 'toXML' does not exist on type 'new () => SqlDesigner'` で落ちる。

**`DATATYPES` と `LOCALE` はモジュールローカル変数にしなかった。**
[`frontend/js/wwwsqldesigner.js:110,370`](frontend/js/wwwsqldesigner.js#L110) と両ハーネスが `window.DATATYPES = …` で
差し替え、`window.LOCALE[n] = v` で書き込む。参照経路を現行と 1 バイトも変えないため、
`js/globals.ts` 側も `window.` 越しに読む形を保った。

**検証**。成功判定は段階1・2・3-0 と同じく **`git diff tests/golden/` が空**であること（63 + 7 本すべて
無差分。untracked も無し＝`npm run golden:update` をこの PR で一度も打っていない）。
`npm test` 61 passed / 21 skipped（件数不変）、`npm run test:browser` 80 passed、
`npm run test:dist` 3 passed、`npm run known-issues` 9 passed（アサート値は 1 文字も変えていない）、
`npm run typecheck` 0 error。

**加えて、golden が張らない対話パスのうち撤去した分岐に触る 8 項目**を
`npm run dev`（4173）と `npm run preview`（4174）の両方で一巡し、**8/8・pageerror 0 件**を確認した
（起動時の `OZ.Request`／追加モードの `DOM.addClass`／テーブルドラッグの `Style.set`／
ミニマップ mousedown の `DOM.pos`／Delete キーの `Event.target`・`prevent`／リサイズの `DOM.win`／
ダイアログ開閉の `DOM.win`+`scroll`／POST での `Request`）。

> 副産物の記録（いずれも `develop` 上で同じ操作を流し、**現行仕様であって段階3-1 の回帰ではない**
> ことを確認済み）: **テーブルは Delete キーで消えない。** [`frontend/js/table.js`](frontend/js/table.js) の `click` が
> `#area` へのバブリングを止めるため [`frontend/js/tablemanager.js:158`](frontend/js/tablemanager.js#L158) の
> `rowManager.select(false)` が走らず、`TableManager.press` が「row 選択中」で早期 return する
> （同 :242）。`#removetable` ボタンなら消える。また **`#addtable` は追加モードに入るだけ**で、
> 実際の生成は `#area` のクリック（同 :142-161）、その直後に編集ダイアログが開いて `#background` が
> 全面を覆う。

### 2026-08-12 HANDOVER §3「フロント TS 化」段階3-2 — 描画中核 7 本を `.ts` 化し、`dom` バッグの型を決めた

段階3-1 で名指ししていた本丸（`dom` バッグの 3 形態）に着手した。対象は
[`frontend/js/visual.ts`](frontend/js/visual.ts) / [`row.ts`](frontend/js/row.ts) / [`table.ts`](frontend/js/table.ts) /
[`relation.ts`](frontend/js/relation.ts) / [`key.ts`](frontend/js/key.ts) / [`rubberband.ts`](frontend/js/rubberband.ts) /
[`map.ts`](frontend/js/map.ts) の 1,589 行で、`tsc --allowJs --checkJs --strict --noUncheckedIndexedAccess`
実測は **550 件**（TS2532 200 / TS2339 125 / TS2304 114 / TS7006 66 / TS2531 29 / TS7008 9 /
TS18048 3 / TS2403 2 / TS7053 1 / TS2415 1）。構成は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
§5.1・§5.4・§5.5。ここには判断だけ残す。

**7 本を 1 PR にした。** 段階3-1 は 3 本 462 行を 1 PR にしたが、3-2 は分割していない。
7 本が型的に強連結だからで、`row` ↔ `table` ↔ `relation` ↔ `key` が相互に型参照し、
基底 `Visual` の型引数は 6 サブクラス全部を見ないと決まらない。分割すると中間状態で
`SqlNamespace` と `Visual<D>` を 2 度書くことになる。切り分けはコミットを 4 つに割って担保した
（oz 地ならし / visual+rubberband+map / row+table+relation+key / 台帳）。

**原理: 型は「構築完了後の状態」を記述し、嘘は初期化の 1 行に閉じ込める。**
`Visual._init()` の `container: null`、`Row` の後付け 8 キー、`Relation.dom = []` は
「型と食い違う瞬間があるが、その間に誰も読めない」という同じ構造をしている。optional / union /
ガードで毎回の読み出しに不確実性を撒くのではなく、型は完成形を宣言し `as unknown as` を初期化の
1 行にだけ置く。イディオム C（呼び出し側にガードを足させない）と、段階3-1 の `OZ.$` non-null の
前例と同型。

**イディオム E（新規・機械的規則）: インスタンスプロパティは必ず `declare` で宣言する。**
[`tsconfig.json`](tsconfig.json) の `target` が ES2022 ＝ **`useDefineForClassFields` が既定 true**
なので、`.ts` でプロパティ宣言を書くと `dom;` がクラス本体に emit され、構築時に own property が
生えて挙動が変わる。`!`（definite assignment assertion）でも emit されるので `declare` でなければ
ならない。Vite/esbuild も同じフラグを見るため dist にも出る。逆に [`frontend/js/table.ts`](frontend/js/table.ts) の
`static active` / `x` / `y` には**付けない**（現行が既に `static active;` を emit している）。
段階3-3 / 3-4 でも効き続ける規則なので `docs/ARCHITECTURE.md` §5.5 の規約に足した。

**基底 `Visual` は `dom` だけ型引数にした**（`class Visual<D = VisualDom>`）。却下した案:

| 案 | 却下理由 |
|---|---|
| 基底 `dom: VisualDom` 固定 ＋ サブクラスで `declare dom: RowDom` 再宣言 | `Relation` が **TS2415** で成立しない（`any[]` に container / title が無い）。交差型で誤魔化すと「配列が container を持つ」と型が嘘をつく。`Relation` が `extends` をやめるのはプロトタイプ鎖が変わる実行コード変更 |
| `D extends VisualDom` と制約を付ける | 基底のキャストは消えるが配列が制約を満たさず `Relation` が排除される。`Partial<VisualDom>` も weak type 判定で弾かれる |
| 基底 `dom: unknown` ＋ 基底メソッド内でキャスト | キャスト数は採用案と同じで、`Visual` 型で受ける変数が将来出たとき `unknown` が伝播する |

`data` は型引数にしていない。基底 `setTitle()` が `this.data.title` を書くので、型引数にすると
そこにもキャストが要る。`Row` / `Table` が `declare data: RowData`（`extends VisualData` なので
共変で合法）で狭めれば、基底のキャストは `dom` 由来の 4 個（`_init` 1 / `destroy` 2 / `setTitle` 1）に
収まり、[`frontend/js/visual.ts`](frontend/js/visual.ts) 56 行の中に閉じる。見返りに `this.dom.*` の読み出し
**172 箇所**（row 74 / table 36 / relation 35 / map 16 / rubberband 7 / visual 4）が注釈ゼロで通る。

**形態 (ii)（`this.dom[id] = elm`）は段階3-3 に持ち越せる。** `io` / `keymanager` / `rowmanager` /
`tablemanager` は `function` ＋ prototype 方式で `extends` を 1 つも持たないので、`Visual.dom` の型が
到達しない。3-3 で唯一 `Visual` を継ぐ `Designer` は形態 (i) なので `Visual<DesignerDom>` にそのまま乗る。

**`Row` の後付け 8 キーは non-optional にした。** `buildEdit()` が作る編集フォームで、
不変条件は「8 つが存在する ⇔ `expanded === true`」。optional にすると `collapse()` / `load()` /
`changeComment()` / `buildEdit()` の自己参照で 20 箇所超が `TS2532` になり、イディオム C により
ガードを足せないので全部 `!` になる。**同じ不変条件を 20 回書く代わりに `RowEditDom` の
JSDoc に 1 回書く**ほうが読み手に伝わる。各キーの要素型（`HTMLInputElement` / `HTMLSelectElement` /
`HTMLSpanElement`）は `OZ.DOM.elm` の `HTMLElementTagNameMap` シグネチャから機械的に決まり、
段階3-1 の投資がここで効いた。

**`Relation` の `dom` は要素ユニオン ＋ 先頭 1 個のタプル**（`[RelationNode, ...RelationNode[]]`、
`RelationNode = SVGPathElement | HTMLDivElement`）。要素ユニオンにする根拠は、`setAttribute`
（`Element` 由来）と `.style`（`SVGElement` も `ElementCSSInlineStyle` を実装）が**ユニオンの両側に
存在する**こと。読み出し 28 箇所がキャストなしで通る。配列側のユニオン
（`SVGPathElement[] | HTMLDivElement[]`）は `this.owner.vector` が `this.dom` を narrowing しないので
28 箇所すべてにキャストが要り、`redrawNormal` は 1 メソッド内で両分岐を跨ぐため却下。
タプルにすると `noUncheckedIndexedAccess` 下でも `this.dom[0]` の 12 箇所が `!` 不要になり、
代償は初期化の `as unknown as` 1 個だけ。

**`this.owner`（Designer）の型は [`frontend/js/globals.ts`](frontend/js/globals.ts) の `SqlDesigner` に集約した。**
イディオム B が禁じているのは「移行用の ambient 宣言**ファイル**を作る」ことで、`js/globals.ts` は
実体のあるモジュールかつ既に `SQL.designer` の宣言責任を持つ。7 本にローカルの構造的 interface を
書く案は、同じ Designer の別々の面を 7 回書くことになり、**面がずれても誰も気づかない**
（`getOption` の戻りを table が `string`、relation が `unknown` と書く類）。3-3 で本物の `Designer` が
来たときどちらか一方だけが満たされない。削除コストも 7 倍。集約したので
[`types/globals.d.ts`](types/globals.d.ts) は拡張ではなく**縮んだ**（`SqlDesigner` の定義が消え、
`d?: import("../js/globals.ts").SqlDesigner` の 1 行になった）。3-3 で消える予定は変わらない。

**循環しない。** 実行時の辺は 7 本 → `globals.ts` の一方向だけで、`globals.ts` → 7 本は
`import type` のみ。`verbatimModuleSyntax` が `type` キーワードの明示を強制するので emit から完全に
消え、Rollup の依存グラフに辺が生えない。読み込み順は 1 バイトも動かない。誤って値 import に戻すと
`globals.ts` が 7 本を先に評価しにいって順序が壊れるので、import 群にその旨のコメントを置いた。

**`SqlNamespace` に 7 クラスを足した。** `.ts` 側は import した `SQL` に `SQL.Row = Row;` と代入する
ので、宣言が無いと**代入自体が TS2339** になる（`.js` のときのようなグローバル型の合成は起きない）。
同時にこれは **`new SQL.Row(...)` / `new SQL.Key(...)` を import に書き換えなくてよい**根拠でもある。
書き換えると (a) 実行コードが変わり、(b) `key.ts` は `table.ts` より後に読む決まりなのに `table.ts` が
`key.ts` を値 import すると評価順が逆転する。**値 import を使うのは `extends Visual` だけ**
（型引数を渡すため必須で、`visual.ts` は 7 本の先頭なので順序も安全）。イディオム B の例外
（`SQL.designer` を名前空間経由で据え置く）と同じ論理が、クラス参照にも一貫して適用できた。

[`frontend/js/globals.ts`](frontend/js/globals.ts) の `as unknown as typeof window.SQL` は**残る**。合成に寄与する
`.js` が 15 本 → 8 本に減っただけで、素の代入に戻せるのは 3-3 完了時（コメントの数字を更新した）。

**`js/oz.ts` に 2 件の型変更を入れた**（実行コードは無変更）。どちらも「`.ts` から初めて呼んで
露見した」もので、`.js` のうちは `checkJs: false` により見えなかった。

- **`OZ.Event.add` のジェネリック化。** `EventListener` は呼び出しシグネチャなので
  `strictFunctionTypes` が効き、`click(e: MouseEvent)` を `.bind(this)` して渡すと引数が反変で
  TS2345 になる。登録は 3-2 の 7 本で 21 箇所（row 4 / table 7 / rubberband 3 / map 7）、
  3-3 の io / tablemanager / keymanager / window でさらに 40 箇所超。受け側を 1 度広げるほうが安い。
- **`OZ.$` にオーバーロードを被せた。** 単一シグネチャ
  `<T extends EventTarget = HTMLElement>(x: string | T): T` だと、文字列を渡したとき `T` の推論候補に
  `string` が入り、制約違反で `EventTarget` にフォールバックする（**既定の `HTMLElement` は推論候補が
  1 つも無いときしか使われない**）。`OZ.$("rubberband")` が `EventTarget` になって代入先と合わなかった。
  3 本目のシグネチャは引数が union の呼び出し（`oz.ts` 内部の `OZ.$(elm)` / `OZ.$(arr[0])`）用。

**型のためのコード変更 4 件**（段階3-1 の `while (1)` → `while (true)` に続く 2〜5 件目）。
いずれも挙動同値で、**旧束縛が改名点から先で読まれない**ことを確認している。

| 箇所 | 症状 | 変更 |
|---|---|---|
| [`frontend/js/relation.ts`](frontend/js/relation.ts) `redraw()` | `var t1` / `t2` が `HTMLElement` → `number` の再宣言で TS2403。`t1++` が lvalue なので `as` では回避不能 | 要素側を `e1` / `e2` に改名（宣言 2 ＋ 読み出し 6 ＝ 8 行）。`:201` 以降の t1 / t2 の読み出し 10 箇所は無変更 |
| [`frontend/js/table.ts`](frontend/js/table.ts) `down()` | `var t = OZ.Event.target(e)` と `var t = Table` が TS2403 | 前者を `el` に改名（2 行。読み出しは直後の 1 行のみ） |
| [`frontend/js/row.ts`](frontend/js/row.ts) `fromXML()` | `var re` が `string \| null` → `RegExp` の再宣言で TS2403 | 後者を `quoteRe` に改名（2 行） |
| [`frontend/js/table.ts`](frontend/js/table.ts) `addKey` | 仮引数名 `name` だが実引数は `Key` の第 2 引数＝`type` に渡っている | `addKey(type?: string)` に改名（1 語。`arguments` 不使用なので emit 上の意味は変わらない） |

**`var event` の TS2403（table 2 箇所 / map 2 箇所）はコード変更なしで消えた。** TS2403 は
**宣言型の一致**を見るので、両分岐に同じ注釈 `MouseEvent | Touch` を書けばよい（読むのは
`clientX` / `clientY` だけで、`Touch` にも `MouseEvent` にもある）。同様に `js/table.ts` の
`var x` / `var y` の再宣言は `this.x` / `this.y` を `number` と宣言した時点で自動的に消えた
（`checkJs` 下で 1 個目が `any` 推論されていたのが原因）。

**その他の型判断。**

- **裸の `DATATYPES` は `window.DATATYPES` にした。** モジュール化すると裸の識別子は解決できず
  （`declare global` の `interface Window` は裸の識別子を作らない）、`js/globals.ts` も `window` にだけ
  載せて値 export していない。同一物への参照で、現行コード自身が `js/row.js:472` で既に
  `window` 越しに書いていた。`getDataType()` の戻りは non-null の `Element` で確定させ、
  呼び出し 4 箇所を無改修で通した（`OZ.$` と同じ論法）。
- **`Table.findNamedRow` は `Row | false` を正直に出した。** 段階3-1 の「null / false を戻り型に
  出さない」前例は**その false を誰も消費していない**から成立していたが、ここは
  `js/wwwsqldesigner.js:395,406` が `if (!r1) { continue; }` で実際に消費している。`Row` と偽ると
  3-3 でその分岐が「型上ありえない」ことになり、型が実在する制御フローを隠す。唯一ガードなしで
  受ける [`frontend/js/key.ts`](frontend/js/key.ts) を `as Row` 1 キャストで通した。
- **`Table` の static は「読める形」だけ型に出した**（`static active: Table[]`）。`Table[] | false` に
  すると `move()` と `up()` の `t.active.length` が 2 箇所エラーになり、イディオム C でガードを足せない。
  `false` は「ドラッグ終了」の印で、`up()` がリスナーを外しているので次の `down()` が代入するまで
  読まれない。`t.active = false` の 1 行にだけキャストを置いた。
- **数値→文字列の暗黙変換に依存している代入は 4 箇所**（`relation` の `setAttribute("stroke-width", …)`
  3 件と `table` の `style.zIndex`）。`String()` を挟むのは実行コード変更なので値側に
  `as unknown as string` を置き、書き方を揃えた。`CONFIG.RELATION_THICKNESS` を `string` にする案は
  同じ定数が数値演算にも使われるため不可。

**検証**。成功判定は段階1・2・3-0・3-1 と同じく **`git diff tests/golden/` が空**であること（63 + 7 本
すべて無差分。untracked も無し＝`npm run golden:update` をこの PR で一度も打っていない）。
`npm test` 61 passed / 21 skipped（件数不変）、`npm run test:browser` 80 passed、
`npm run test:dist` 3 passed、`npm run known-issues` 9 passed（アサート値は 1 文字も変えていない）、
`npm run typecheck` 0 error。

**加えて、バンドル出力の diff を副次判定に使った**（イディオム E の検算）。`develop` と本ブランチで
`vite build --minify false` を走らせ、Rollup が付けるモジュールスコープの接尾辞（`OZ$1` → `OZ` 等）と
コメントを正規化して比較したところ、実質差分は次に**収束した**。

- `extends SQL.Visual` → `extends Visual`（値 import。6 クラス）
- `DATATYPES` → `window.DATATYPES`（3 箇所）
- 上表のコード変更 4 件
- `var el = OZ.Event.target(e); if (el != …)` → `if (OZ.Event.target(e) != …)`（Rollup が
  1 回しか使われない変数をインライン化した副産物。評価回数も順序も同じ）

**インスタンスフィールドの emit は 1 つも増えていない**（`var Visual=class{_init(){…` のまま）。
`declare` の付け忘れがあればここに現れるので、この比較がそのまま規則の検算になっている。

**対話パスの一巡**（golden が張らないマウス／キーボード操作）。`npm run dev`（4173）と
`npm run preview`（4174）の両方で 11 項目を流し、**pageerror 0 件**。項目はテーブル追加 ×2 /
テーブルドラッグ / row 追加→dblclick 展開→Enter 折りたたみ / リレーション作成と再描画 /
row 選択と解除 / PK 追加 / ミニマップのドラッグ / ラバーバンド選択 / リサイズとスクロール /
`toXML` → `fromXML` 往復 / テーブル削除。

> 副産物の記録（`develop` 上で同じ操作を流し、**現行仕様であって段階3-2 の回帰ではない**ことを
> 確認済み。差分の中身まで完全に一致した）: **同名のテーブルが 2 つあると `fromXML` でリレーションが
> 復元されない。** 既定名（`new table`）のまま 2 つ作って FK を張り、`toXML` → `fromXML` → `toXML` を
> 往復すると `<relation table="new table" row="id" />` が消える。
> [`frontend/js/wwwsqldesigner.js`](frontend/js/wwwsqldesigner.js) の `fromXML` が `findNamedTable(tname)` で
> 名前解決しており、参照元と参照先が同名だと両端が同じテーブルに解決されるため。
> §4 の IO 作り替えで名前ではなく id で参照する形にすれば解消する（`formatVersion` 側の設計に含める）。

### 2026-08-12 HANDOVER §3「フロント TS 化」段階3-3a — prototype 方式 7 本を class 化した

段階3-3 の対象は残り 8 本（`toggle` / `io` / `tablemanager` / `rowmanager` / `keymanager` / `window` /
`options` / `wwwsqldesigner`、2,132 行）。着手前の実測
（`tsc --allowJs --checkJs --noEmit --strict --noUncheckedIndexedAccess src/app.ts`）は **619 件**で、
内訳は TS2339 239 / TS2304 223（`OZ` 145 / `_` 54 / `CONFIG` 11 / `Dropbox` 10 / `ActiveXObject` 2 /
`e` 1）/ TS7006 105 / その他 52。ファイル別は `io` 179 / `keymanager` 125 / `wwwsqldesigner` 79 /
`tablemanager` 76 / `rowmanager` 62 / `options` 59 / `window` 31 / `toggle` 8。

**TS2339 239 件の本丸は `SQL.X = function(){}` ＋ prototype 方式そのもの**なので、`.ts` 化の前に
構造を正す PR を分けた。**段階2 が明示的に見送った判断を覆している**（当時の理由は「`SQL.Visual` を
継承しない 7 クラスは『クラスを知らない』問題を起こさないので、承認済みスコープを広げない」で、
同じ箇所に「入れれば TS2339 がさらに 200 件前後改善する見込み」と書いてあった）。覆した根拠は
2 つ。**(a)** prototype のまま型を付けるには 88 本のメソッド全部に `this: X` 注釈が要る
（TS は prototype 代入の `this` を推論しない）。**(b)** その注釈は将来 class 化した時点で全部捨てる
作業になる。段階3-3 の `.ts` 化と同じ PR に混ぜなかったのは、golden に差分が出たとき
「構造変更が原因か型付けが原因か」を PR 境界で切り分けるため（段階1 以来の論法）。

**変換規則は段階2 の `SQL.Visual` 階層と同一。** `SQL.X = function (owner) {…}` → `class X { constructor(owner) {…} }`、
prototype メソッド → クラス本体のメソッド、末尾に `SQL.X = X;`。**クラスフィールド初期化子は使わない**
（`super()` を持たないクラスでも、代入の順序を現行と 1 行もずらさないため）。import/export は入れない
（この PR では `js/` に 1 つも `.ts` が増えない）。

**着手前の実測 3 項目**（規約4「構造変更は実測してから」）。いずれも**該当 0 件**で、class 化で
観測できる差が生じないことを確認した。

| 項目 | 実測 | class 化で起きうる差 |
|---|---|---|
| インスタンスに対する `for...in` | 0 件（`for (var p in …)` は cookie の obj / `OZ` の opts・options・headers / `Row` の data＝いずれもプレーンオブジェクト） | prototype メソッドが enumerable → non-enumerable |
| `new` なしの呼び出し | 0 件（生成は `js/wwwsqldesigner.js` の 7 箇所のみで全部 `new`） | class は `new` 必須 |
| `SQL.X.prototype` への外部代入・静的プロパティ | 0 件（`SQL.X.<name> =` は prototype メソッド定義以外に存在しない） | クラス定義外からの生やし足しが効かなくなる |

**`this.saveresponse = this.saveresponse.bind(this)` 系は温存した**（`io` 4 本 / `keymanager` の
`purge` / `window` の `sync` / `tablemanager` の `save` / `options` の `save`）。「プロトタイプの
メソッドをインスタンスの own property で上書きする」形は class でも同じ意味で動く。`OZ.Request` や
`SQL.Window.open` に**同一の関数オブジェクト**を渡すための現行の書き方なので、変えない。

**[`frontend/js/io.js`](frontend/js/io.js)（695 行・35 メソッド）は機械変換した。** 手で書き写すと差分の中に
写し間違いが紛れ込む。awk で「トップレベルの `SQL.IO.prototype.X = function (…) {` をメソッド
シグネチャに」「トップレベルの `};` を `}` に」「本文を 4 スペース字下げ」だけを行い、
**空白を無視した diff がシグネチャ 35 行と閉じ括弧 36 行、つまり変換対象そのものだけである**ことを
確認してから採用した（トップレベル `};` が 36 個＝35 メソッド＋コンストラクタで、1 行完結でない
シグネチャが 0 件であることも事前に数えている）。

**検証**。成功判定は段階1・2・3-0〜3-2 と同じく **`git diff tests/golden/` が空**であること（63 ＋ 7 本
すべて無差分。untracked も無し＝`npm run golden:update` をこの PR で一度も打っていない）。
`npm test` 61 passed / 21 skipped（件数不変）、`npm run test:browser` 80 passed、
`npm run test:dist` 3 passed、`npm run known-issues` 9 passed（アサート値は 1 文字も変えていない）、
`npm run typecheck` 0 error。

**バンドル出力の diff が「class 変換だけ」に収束することを副次判定に使った**（段階3-2 で導入した検算）。
`develop` と本ブランチで `vite build --minify false` を走らせ、空白を無視して比較した結果は
**過不足なく対応している**。

| | 削除 | 追加 |
|---|---|---|
| prototype メソッド代入 | 88 | — |
| コンストラクタ関数代入（`SQL.X = function …`） | 7 | — |
| `};` → `}` | 95 | 95 |
| メソッドシグネチャ | — | 88 |
| `var X = class {` | — | 7 |
| `SQL.X = X;` | — | 7 |

**インスタンスフィールドの emit は 1 つも現れていない**（`var IO = class { constructor(owner) {…`）。
段階3-2 のイディオム E（`.ts` ではプロパティ宣言に必ず `declare` を付ける）は `useDefineForClassFields`
由来の規則なので、`.js` のこの PR では該当しないが、同じ検算がそのまま「クラス本体に余計な
フィールドを足していない」ことの確認になっている。

**対話パスの一巡**（golden が張らないマウス／キーボード操作）を `npm run dev`（4173）と
`npm run preview`（4174）の両方で流し、**18/18・pageerror 0 件**。項目は Toggle バーの開閉 /
テーブル追加 ×2 / テーブルドラッグ / row 追加→展開→折りたたみ / row 選択・上下移動・解除 /
キー管理（追加・左右移動）/ リレーション作成 / ミニマップのドラッグ / ラバーバンド選択 /
リサイズとスクロール / 保存読込ダイアログと backend セレクト / `clientsave`→`clientload` 往復 /
`clientsql` の DDL 出力（XSLT 経路）/ Esc でダイアログを閉じる / F2 quicksave（backend 不在の応答処理）/
オプションダイアログ / テーブル削除。class 化した 7 クラスすべてに触れている。

### 2026-08-12 HANDOVER §3「フロント TS 化」段階3-3b — 残り 8 本を `.ts` 化し、`js/` から `.js` を無くした

段階3 の最後の実作業。[`frontend/js/toggle.ts`](frontend/js/toggle.ts) / [`io.ts`](frontend/js/io.ts) /
[`tablemanager.ts`](frontend/js/tablemanager.ts) / [`rowmanager.ts`](frontend/js/rowmanager.ts) /
[`keymanager.ts`](frontend/js/keymanager.ts) / [`window.ts`](frontend/js/window.ts) / [`options.ts`](frontend/js/options.ts) /
[`wwwsqldesigner.ts`](frontend/js/wwwsqldesigner.ts) の 8 本・2,132 行（診断 619 件）を `.ts` にした。
イディオムは段階3-1・3-2 で確定済みなので、ここには**この段階に固有の判断だけ**残す。
規約は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5.5。

**`dom` バッグの形態 (ii)（`this.dom[id] = elm`）が決着した。** 段階3-2 で「`io` / `keymanager` /
`rowmanager` / `tablemanager` は `Visual` を継ばないので自由に決められる」と送った 4 本。採ったのは
3-2 と同じ原理 —「型は構築完了後の状態を記述し、嘘は初期化の 1 行に閉じ込める」。完成形を
`IoDom`（23 キー）/ `TableManagerDom`（10）/ `RowManagerDom`（7）/ `KeyManagerDom`（11）として
宣言し、初期化に `as unknown as XxxDom` を 1 個、ループ代入に
`(this.dom as unknown as Record<string, HTMLInputElement>)[id] = elm` を 1 個置く。
**キャストは 4 本合計 8 個**で、見返りに `this.dom.*` の読み出しが全部注釈ゼロで通る。
要素型は id とタグの対応（`index.html` を実測）から機械的に決まり、ループが埋めるキーは直後に
`elm.value = _(id)` を書くのですべて `HTMLInputElement`。

**`SqlDesigner` は構造的 interface をやめ、実体への型エイリアスにした。**
`export type SqlDesigner = Designer;` の 1 行で、**参照している 13 本は 1 文字も変えていない**
（3-2 に「7 ファイルを回って消す作業は発生しない」と書いた形がそのまま成立した）。段階3-2 の
interface が持っていた面（`getOption` / `window` / `tableManager` …）は、実体の型と食い違って
いれば `npm run typecheck` が落ちる。実際 **`getOption` は `string | number` ではなく
`string | number | boolean` だった**（`hide` が `false`、`vector` が `true` を返す）。3-2 の
構造的宣言は「よくある呼ばれ方」から書いた近似で、実体に置き換えて初めて確定した。

**`Designer` は `Visual<DesignerDom>` に乗り、値 import は `Visual` だけ。** 他クラス
（`Table` / `Map` / `IO` …）の参照は `SQL` 名前空間経由のまま据え置いた（値 import にすると
評価順が読み込み順と逆転する。3-2 の判断がそのまま効く）。`SqlNamespace` には 8 クラスを足し、
`Designer: new () => SqlDesigner` は `typeof Designer` に、`designer` は `Designer` になった。

**`SQL.Window` は `lib.dom` の `Window` と同名。** クラス名は公開名に合わせて `Window` のまま
（`SQL.Window` を変えない）、import 側で `import type { Window as SqlWindow }` と改名して受ける。
モジュール内なので値の衝突は起きない（`OZ.Event.add(window, …)` の小文字 `window` は無関係）。

**`RowManager.selected` は `Row | false | null` を正直に出した。** ガード付きで読む経路
（`select` / `redraw` / `press`）が実在し、`Row` と偽るとその分岐が「型上ありえない」ことになる
（段階3-2 の `Table.findNamedRow` と同じ論法）。ガードなしで読む 8 箇所は、ボタンの `disabled` を
`redraw()` が管理していることが根拠なので `as Row` を置いた。

**Dropbox は局所 `declare` で据え置いた。** `js/io.ts` の冒頭に本ファイルが触る面だけ
（`Dropbox.Client` / `ApiError` の 8 定数 / `AuthDriver.Popup`、`DropboxError` / `DropboxClient`）を
宣言し、実装には触れていない。`any` では埋めていない。存廃は HANDOVER §4 の IO 作り替えと同時。

**死にコードの撤去（規約4）。** Chromium 151.0.7922.34 と jsdom 29.1.1 の**両方**で実測してから
落とした。今回は `window.XSLTProcessor` が**実行系で割れた**のが収穫で、機械的に「相方の判定も
一緒に撤去」していたら Node ハーネスの挙動を変えていた。

| 判別子 | Chromium | jsdom | 扱い |
|---|---|---|---|
| `"ActiveXObject" in window` / `!!window.ActiveXObject` | false | false | 撤去（`fromXMLText` / `finish` の 2 分岐） |
| `!!window.DOMParser` | true | true | 判定ごと撤去（`fromXMLText`。else が消えたため） |
| `!!window.XSLTProcessor` | **true** | **false** | **判定は残す**（`finish`。無い実行系は現行どおり throw に落ちる） |
| `!!window.getSelection` | true | true | 三項の判定ごと撤去（`removeSelection`） |
| `!!document.selection` | false | false | 撤去（同上の else 側） |
| `!!window.XMLSerializer` | true | true | 残す（下の「マーカー」参照） |

あわせて **`OZ.ie` / `OZ.opera` をプロパティごと撤去**した（段階3-1 で「参照側を `.ts` 化する
段階3-3 で分岐ごと畳んで消す」と予告していた分）。参照は
[`frontend/js/io.ts`](frontend/js/io.ts) の F2 `preventDefault` と [`frontend/js/tablemanager.ts`](frontend/js/tablemanager.ts) の
IE6 `select()` 回避の 2 箇所だけで、どちらも実測で false 固定。

**型のためのコード変更 3 件**（段階3-1 の 1 件、3-2 の 4 件に続く 6〜8 件目）。

| 箇所 | 症状 | 変更 |
|---|---|---|
| `io` / `tablemanager` / `keymanager` の 2 つ目の id ループ | 同名の `var elm` が「ボタン（`HTMLInputElement`）」と「ラベル」で再宣言され TS2403 | ラベル側を `labelElm` に改名（各 2 行。読み出しは直後の 1 行だけ） |
| [`frontend/js/tablemanager.ts`](frontend/js/tablemanager.ts) `click()` | `newtable.addKey("PRIMARY", "")` が 2 引数（TS2554） | 第 2 引数を落とした。`Table.addKey` は 1 引数しか読まず、[`frontend/js/table.ts`](frontend/js/table.ts) 側に「是正は段階3-3 で」と予告コメントが入っていた |
| [`frontend/js/table.ts`](frontend/js/table.ts) `findNamedRow` | 引数が `string` 固定だが、`Designer.fromXML` は属性欠落時に `null` を渡しうる | シグネチャを `string \| null` に広げた（型だけ） |

**逆に、型のために増やしかけた emit を 2 件戻した。** バンドル diff の副次判定（下記）が
説明のつかない差分として拾ったもの。(a) `removeSelection` で `var legacy = sel as …` と
ローカル変数を作っていたのを、キャストをインラインに畳んで変数ごと消した。(b) `getXhrHeaders` の
未使用仮引数 `value` を型付けのついでに落としていたのを戻した。**どちらも挙動同値だが、
「実行コードは変えない」を emit で担保するには差分ゼロのほうが強い。**

**本物のバグを型で隠さない（マーカーとして残したもの）。**

- [`frontend/js/wwwsqldesigner.ts`](frontend/js/wwwsqldesigner.ts) `toXML()` の**未定義 `e`**（段階2 が意図して
  残した TS2304 1 件）。`// @ts-expect-error` ＋ 根拠コメントで通した。`@ts-expect-error` は
  「エラーが消えたらそれ自体がエラーになる」ので、§4 の XML 書き出し撤去でこの分岐が消えたときに
  必ず気づける。到達不能（`XMLSerializer` が無い実行系のみ）なので撤去はしない。
- **`CONFIG.DEFAULT_BACKEND` が文字列ではなく配列 `["php-mysql"]`**（upstream の取り違え。
  `.js` のうちは `checkJs: false` で見えなかった）。`js/io.ts` の `bs[i] == be` が緩い比較で
  配列を文字列化するため現行は意図どおり動いており、値を直すのは実行コード変更になるので
  型で受けるだけにした（`string | string[]`）。是正は §5 の backend 移植で既定 backend の扱いごと。

**`.js` が尽きたことで回収したもの。**

- [`frontend/js/globals.ts`](frontend/js/globals.ts) の `window.SQL = SQL as unknown as typeof window.SQL` が
  **素の代入に戻った**（`.js` のトップレベル代入からグローバル型が合成される問題が消えたため。
  段階3-1 から予告していた回収）。
- `types/globals.d.ts` を**削除**。最後まで残っていた `window.d`（デバッグ用ハンドル）の宣言は
  [`frontend/src/main.ts`](frontend/src/main.ts) の `declare global` へ引き取った。
- [`tsconfig.json`](tsconfig.json) から **`checkJs` を落とした**。`allowJs` は残す —
  [`vitest.config.ts`](vitest.config.ts) が [`scripts/canonical-cwd.mjs`](scripts/canonical-cwd.mjs) を
  import しているため（`js/` のためではない）。`include` からも `types/**/*.d.ts` を外した。
- `window.X = X` と `declare global` は**残す**。撤去は段階3-4（index.html や外部から触る面の
  確認と同時にやるほうが安全）。

**検証**。成功判定は段階1・2・3-0〜3-3a と同じく **`git diff tests/golden/` が空**であること
（63 ＋ 7 本すべて無差分。untracked も無し＝`npm run golden:update` をこの PR で一度も打っていない）。
`npm test` 61 passed / 21 skipped（件数不変）、`npm run test:browser` 80 passed、
`npm run test:dist` 3 passed、`npm run known-issues` 9 passed（アサート値は 1 文字も変えていない）、
`npm run typecheck` 0 error。

**バンドル出力の diff は「意図した撤去 ＋ module 配線」に完全に収束した。** `develop` と本ブランチで
`vite build --minify false` を走らせ、コメントと Rollup のスコープ接尾辞を正規化して比較した結果、
残る差分は次の 9 種類だけ（他に 1 行も無い）。

| 差分 | 由来 |
|---|---|
| `opera: false` / `ie: false` の消滅 | `OZ` の判別子撤去 |
| `if (window.DOMParser) … else if (ActiveXObject) …` → `new DOMParser()` 1 行 | `fromXMLText` |
| `else if (ActiveXObject) …` の消滅 | `finish`（`XSLTProcessor` の判定は残っている） |
| `if (OZ.opera) e.preventDefault();` の消滅 | `IO.press` |
| `if (OZ.ie) try { select() } catch … else …` → `setSelectionRange` 1 行 | `TableManager.edit` |
| `window.getSelection ? … : document.selection` → `window.getSelection()` | `Designer.removeSelection` |
| `addKey("PRIMARY", "")` → `addKey("PRIMARY")` | 上表のコード変更 |
| `var elm` → `var labelElm`（3 箇所） | 上表のコード変更 |
| `extends SQL.Visual` → `extends Visual` | 値 import（`Designer`） |

**インスタンスフィールドの emit は 1 つも増えていない**（`var Designer = class extends Visual {
constructor() {…`）。イディオム E（`declare` 必須）の検算がここでも効いている。

**対話パスの一巡**は段階3-3a と同じ 18 項目を `npm run dev`（4173）と `npm run preview`（4174）の
両方で流し、**18/18・pageerror 0 件**。撤去した分岐に触る経路（`clientsql` の XSLT、
F2 quicksave、テーブル編集ダイアログの `setSelectionRange`、`clientload` の `DOMParser`）を含む。

### 2026-08-14 HANDOVER §3「フロント TS 化」段階3-4a — クラス面を import 化し、`SQL.X = X` を無くした

段階3-4（`window` 登録と `declare global` の撤去）を **3 本の PR に割った**。本 PR はその 1 本目で、
**`js/` しか触らない**（`tests/` は 1 行も変えていない）。分割の意図は歴代と同じ原因切り分けで、
3-4a は「最も行数が動くが安全網が完全に無傷」、3-4b は「テストしか変わらない」、3-4c は
「削除だけ・消す対象の消費者が 0 であることが grep で自明」という順にしてある。

| PR | 触る範囲 | 内容 |
|---|---|---|
| **3-4a**（本 PR） | `js/` のみ | `SQL.X = X` 15 本の撤去、`new SQL.X()` 13 箇所の値 import 化、pub/sub と `escape` の named export 化 |
| 3-4b | `tests/` のみ | node ハーネスを `window.OZ` 依存から外す、page 側を `window.d` に寄せる |
| 3-4c | `js/` `src/` ＋ docs | `window.OZ` / `CONFIG` / `_` / `SQL` の撤去、`LOCALE` のモジュール化 |

**段階3-4 のスコープを「外部から触れる面＝`window` の撤去」までに切った。** 内部の可変シングルトン
（`SQL.designer`）の撤去は §4 の DI 化に送る。**前者は参照経路の付け替えで、同一性が言語仕様により
保証される。後者は「Designer は生涯 1 個」というプログラム不変条件への依存**で、コード上どこにも
強制がない（コンストラクタは何度でも呼べ、そのたび `SQL.designer` だけが差し替わる）。規約3
「実行コードは変えない」に照らすと同列に扱えないので、[`CUSTOMIZATIONS.md`](CUSTOMIZATIONS.md):484-485 の
既決（「DI 化は §4 の IO 分離と同時」）をそのまま維持した。3-4c 完了後 `SQL` は `window` から降りるので、
`SQL.designer` を残しても**外部に露出するグローバルは 1 つも増えない**。むしろ `grep "SQL\." js/` の
残り 7 行がそのまま §4 の作業対象リストになる。

**循環は生じない（値の辺は 13 本だけ）。** `wwwsqldesigner → 11 本` は読み込み順の最後尾なので
全て既評価。`table → row` は 1 つ前で既評価。**動くのは `table → key` の 1 本だけ**で、`key` の評価が
`table` の直前に前倒しになる。逆向き（`row → table`、`key → table/row`、`globals → wwwsqldesigner`）は
すべて `import type` で、`verbatimModuleSyntax` のもと emit から消えるため Rollup のグラフに辺が生えない。
`js/key.ts` のトップレベル副作用は `class Key extends Visual` だけ、`visual` は前倒し後も先に評価済み
なので観測できる差はない。**バンドル diff で `Key` クラス本体 62 行が完全一致（位置だけが移動）**
していることを実測して裏を取った。

**`SQL.Map` / `SQL.Window` の名前ズレは「公開名」概念ごと消滅した。** `Minimap` は識別子 1 本になり
（ES 標準 `Map` との衝突は最初から存在しない）、`Window` は参照側が `import { Window as SqlWindow }` で
受ける形に統一された。[`frontend/js/map.ts`](frontend/js/map.ts) の「公開名 `SQL.Map` は現行のまま」という注釈は撤回。

**pub/sub は `this` 束縛が消えても同値。** `_subscribers` の参照は [`frontend/js/globals.ts`](frontend/js/globals.ts) 内だけ
（＝モジュールプライベートに落とせる）、`SQL` オブジェクトは 1 個しか存在しない、呼び出しは全て
メソッド呼び出しの形で関数値を取り出して渡す箇所が 0 件 — の 3 つが揃っているため。
**`escape` は `lib.dom` の非推奨グローバルと同名**だが、`js/` 全体に裸の `escape(` 呼び出しが 0 件なので
import した 2 ファイル（`row` / `table`）でシャドウして問題ない。`escapeXML` への改名は意味づけごと
§4 の serializer 抽出で決める。

**`SQL.unsubscribe` は撤去した。** `js/` `src/` `tests/` `index.html` のどこからも参照が無く、
3-4c で `window.SQL` が消えれば**名前で呼ぶ経路が物理的に無くなる**。規約4 が要求する「一度も
評価されない」の証明として、名前解決の経路が全滅していることは実行時サンプリングより強い。

**検証**。成功判定は歴代と同じく **`git diff tests/golden/` が空**であること（63 ＋ 7 本すべて無差分。
untracked も無し＝`npm run golden:update` をこの PR で一度も打っていない）。`npm test` 61 passed /
21 skipped（件数不変）、`npm run test:browser` 80 passed、`npm run test:dist` 3 passed、
`npm run known-issues` 9 passed、`npm run typecheck` 0 error。

**バンドル出力の diff は 5 種類に収束した**（`vite build --minify false` を `develop` と本ブランチで
走らせ、コメント行を除いて比較。差分 221 行の内訳がこれで全部）。

| 差分 | 由来 |
|---|---|
| `var SQL = {…}` のメソッド 4 本 → `function publish/subscribe/escape` ＋ `var SQL = {}` | named export 化 |
| `unsubscribe` 定義の消滅 | 参照 0 の撤去 |
| `SQL.X = X;` の消滅 ×14 | クラス登録の撤去（`SQL.Designer = Designer` だけ 3-4c まで残す） |
| `SQL.publish/subscribe/escape(` → `publish/subscribe/escape(` ×7 | 呼び出しの named import 化 |
| `new SQL.X(` → `new X(` ×13 ／ `Key` クラスの位置移動 | 値 import 化（位置移動は上記のとおり本体一致） |

**インスタンスフィールドの emit は 1 つも増えていない**（規約5 ＝ `declare` 必須の検算。`Designer` /
`Table` / `Key` いずれも `constructor()` の中身が無差分）。

**対話パスの一巡**は段階3-3a・3-3b と同じ 18 項目を `npm run dev`（4173）と `npm run preview`（4174）の
両方で流し、**18/18・pageerror 0 件**（生成経路が全部変わる PR なので必須）。今回は検証を
Playwright の一時 spec に起こして機械実行した（リポジトリには入れていない）。副産物として
**`#keyleft`（`<<`）が avail → fields の追加、`#keyright`（`>>`）が fields からの削除**であること
（[`frontend/js/keymanager.ts`](frontend/js/keymanager.ts) の `left()` / `right()` はボタンの左右と逆の語感になっている）と、
`clientsql` は `output.xsl` を `OZ.Request` で取りに行くので **`#textarea` が埋まるまで待つ必要がある**
ことを確認している。一巡で出る console error 2 件（Dropbox CDN の遮断、F2 quicksave の 404）は
ネットワーク由来で JS 例外ではない。

### 2026-08-14 HANDOVER §3「フロント TS 化」段階3-4b — テストが触る面を `window.d` と自前エントリに寄せた

段階3-4 の 2 本目。**`tests/` しか触らない**（`js/` `src/` は 1 行も変えていない）。
狙いは「`window.OZ` / `window.SQL` がまだ生きている状態で新経路を検証する」こと — 3-4c で
それらを消す前に、最もリスクの高い付け替えを安全側で通す。

**`page.evaluate` と `window.eval` はバンドルの外で走るので、window ハンドルは残さざるを得ない。**
段階3-4 の到達点は「`window` 面をゼロにする」ではなく「**出荷コードが持つ面をゼロにし、
テストのための面はテストが持つ**」になる。2 つの実行系で置き場所が違う。

| 実行系 | 段階3-4a まで | 3-4b 以降 |
|---|---|---|
| Node（`npm test`） | `window.OZ.Request = …` → `window.eval("new SQL.Designer();")` → `window.SQL.designer` | `tests/node/app-entry.ts` が載せる `window.__grabado = { OZ, Designer }` → `api.OZ.Request = …` → `new api.Designer()` の戻り値 |
| page（`test:browser` / `test:dist` / `known-issues`） | `window.SQL.designer` | [`frontend/src/main.ts`](frontend/src/main.ts) が置く **`window.d`**（upstream 由来のデバッグハンドルをテスト API に昇格） |

**node 側は「テスト専用エントリ」を 1 本足す形にした。** [`tests/node/app-entry.ts`](tests/node/app-entry.ts) は
`import "../../src/app.ts"` に続けてハンドルを載せるだけで、**読み込み順の定義は
[`frontend/src/app.ts`](frontend/src/app.ts) の 1 か所のまま**。ハーネスの変更は `lib.entry` の 1 行と参照の付け替えだけで、
**`OZ.Request` を fs 読みに差し替える関数の中身は 1 文字も変えていない**（＝測っているものが変わらない
ので、golden への影響がゼロだと事前に言い切れる）。`window.eval` の呼び方も不変。

却下した 2 案も記録しておく。**(a) IIFE の完了値を拾う**（`window.eval(bundle + ";GrabadoApp;")` で
exports を受け、`src/app.ts` に `export { OZ, Designer }` を足す）は新規ファイルが要らない代わりに、
rolldown の IIFE 出力形（`lib.name` が変数として emit されること）に依存する。**(b) jsdom の
`XMLHttpRequest` 自体を偽装する**はアプリに一切手を入れずに済み、`OZ.Request` 本体も実測対象に入る
最も筋のいい案だが、`open`/`send`/`onreadystatechange`/`status`/`responseText`/`responseXML`/
`getAllResponseHeaders`/`setRequestHeader` の偽装が要り、**ハーネスが測る範囲が広がる**（＝段階3-4 で
新しい赤を引きうる）。§4 で「フックを 0 にする」ときの本命として申し送る。

**page 側は `window.d` に寄せた。** 新しい名前を発明するより、既に存在するハンドルを公開面として
文書化するほうが面が増えない（[`frontend/src/main.ts`](frontend/src/main.ts) のコメントが利用手順として機能している）。
タイミングは現行が `SQL.designer = this`（コンストラクタ先頭）、新形が `new Designer()` の戻り後だが、
page 側テストはすべて `waitForFunction` / `goto` 後のポーリングなので観測できない。バンドル内部から
`SQL.designer` を読む経路（`Table.snap()` などが同期 init 中に読む）は `SQL.designer = this` を
残しているので不変。

**検証**。`git diff tests/golden/` は空（untracked も無し）。`npm test` 61 passed / 21 skipped
（件数不変）、`npm run test:browser` 80 passed、`npm run test:dist` 3 passed、
`npm run known-issues` 9 passed、`npm run typecheck` 0 error。
**副次判定は「バンドルが 3-4a と 1 バイトも変わらない」こと**で、実際に `vite build --minify false` の
出力が完全一致した（本 PR が出荷コードを変えていないことの機械的な証明。歴代の「意図したハンクだけに
収束する」判定の、差分ゼロ版）。

### 2026-08-14 HANDOVER §3「フロント TS 化」段階3-4c — `window` 登録を撤去し、段階3 を終えた

段階3-4 の 3 本目。**ほぼ削除だけ**で、消す対象の消費者が 0 であることは 3-4b 完了時点で
grep により自明になっていた。

| 対象 | 処置 |
|---|---|
| [`frontend/js/oz.ts`](frontend/js/oz.ts) `window.OZ` ＋ `declare global` | 削除（最後の消費者だった Node ハーネスは 3-4b で `window.__grabado` 経由に） |
| [`frontend/js/config.ts`](frontend/js/config.ts) `window.CONFIG` ＋ `declare global` | 削除（読み手 0・段階3-3b の時点でデッドだった） |
| [`frontend/js/globals.ts`](frontend/js/globals.ts) `window._` / `window.SQL` | 削除 |
| [`frontend/js/globals.ts`](frontend/js/globals.ts) `window.LOCALE` | `export const LOCALE` にモジュール化 |
| [`frontend/js/wwwsqldesigner.ts`](frontend/js/wwwsqldesigner.ts) `SQL.Designer = Designer` | 削除（`SqlNamespace` は `{ designer }` だけになった） |
| [`frontend/src/main.ts`](frontend/src/main.ts) `new window.SQL.Designer()` | 値 import して `new Designer()` |
| [`frontend/js/globals.ts`](frontend/js/globals.ts) `window.DATATYPES` ／ [`frontend/src/main.ts`](frontend/src/main.ts) `window.d` | **残す**（下記） |

**出荷コードが持つ `window` 面は `DATATYPES` と `d` の 2 つになった。**
段階3-4 の到達点は「`window` 面をゼロにする」ではない — `page.evaluate` と `window.eval` は
バンドルの外で走るので、テストには window ハンドルが要る（3-4b の記録）。**出荷コードが持つ面を
ゼロにし、テストのための面はテストが持つ**、が実際の線。`d` は upstream 由来のデバッグハンドルを
そのまま公開面に昇格させたもので、新しい名前は増やしていない。

**`LOCALE` は判断を更新し、`DATATYPES` は据え置いた。** 段階3-1 の記録（上の
「`DATATYPES` と `LOCALE` はモジュールローカル変数にしなかった」）は両者を「ハーネスが差し替えるから」で
同列に扱っていたが、**実際に差し替えられるのは `DATATYPES` だけ**だった（`LOCALE` の消費者は
`_()` の読み 2 箇所と `localeResponse` の書き 1 箇所のみ）。`LOCALE` はモジュール変数にしても
到達可能性が `window` から消える以外の差が無いので撤去し、`DATATYPES` は
「読み書き 14 箇所の実行コード変更」＋「`page.evaluate` からモジュールの setter に届かない」の
2 つが効くので §4（型パレット層の抽出）に繰り越した。理由は `js/globals.ts` の `declare global` に
コメントとして残してある。

**検証**。`git diff tests/golden/` は空（untracked も無し）。`npm test` 61 passed / 21 skipped、
`npm run test:browser` 80 passed、`npm run test:dist` 3 passed、`npm run known-issues` 9 passed、
`npm run typecheck` 0 error。完了判定は
**`grep -rn "window\.\(OZ\|CONFIG\|SQL\|LOCALE\)\|window\._" js/ src/ tests/ index.html` が実コード 0 件**
（一致するのは経緯を書いたコメントだけ）と、**`grep -rn "SQL\." js/` が `SQL.designer` の 7 行に収束**したこと。
この 7 行がそのまま §4 の作業対象リストになる。

**treeshaking の実測**（3-4c 固有。トップレベル副作用の大半が消える PR なので）。`vite build` の出力に
各モジュール固有の文字列が全部残っていることを確認した — `rubberband` 3 / `onbeforeunload` 1 /
`showDropboxAuthenticate` 4 / `alignTables` 3 / `Minimap` 2 / `class extends Visual` 5 /
`quicksave` 5 / `keyfields` 2 / `optionvector` 3 / `setSelectionRange` 1。
`src/app.ts` の 18 本の副作用 import は 3-4a 以降そこが無くても値の辺で全モジュールに到達できるが、
**読み込み順の文書として、また Node ハーネスのエントリとして残す**。

**バンドル diff は 6 種類**（`window.OZ` / `window.CONFIG` / `window._` / `window.LOCALE` / `window.SQL` /
`SQL.Designer = Designer` の消滅、`var LOCALE = {}` の追加と `_()` の読みの付け替え、
`window.SQL.Designer` → `Designer`）。**1 件だけソース由来でない差分があった**: `localeResponse` の
`var v = strings[i].firstChild.nodeValue; window.LOCALE[n] = v;` が
`LOCALE[n] = strings[i].firstChild.nodeValue;` にインライン化された。代入先が `window` プロパティ
（getter/setter を持ちうる）から素のオブジェクトになったことで rolldown が畳めるようになったもので、
`a[b] = c` の評価順（`a` → `b` → `c`）は変わらないので挙動は同値。ソース側は `var v` のまま。

**対話パスの一巡**は 18 項目を `npm run dev` と `npm run preview` の両方で流し、**18/18・pageerror 0 件**
（評価順とツリーシェイクが変わる PR なので必須）。

**これで HANDOVER §3（フロント TS 化）は完了**。次は §4（IO: serializer 分離 → JSON 化 → 決定論出力＋
外部変更検知 → XML 読込互換）で、その入力は「`SQL.designer` 7 行」「`window.DATATYPES` 読み 12・書き 2」
「`escape()` 3 箇所（全て `toXML` 経路なので XML 書き出し撤去で消える可能性が高い）」
「`publish` / `subscribe` 4 箇所」。

### 2026-08-14 HANDOVER §4「IO」段階4-0a — `SQL.designer` を DI 化した

§4（IO: JSON 統一＋git 前提の決定論出力）の 1 本目。**`js/` と `tests/` のコメントしか触らない**
最小の PR で、主張は「出力バイト列が 1 バイトも変わっていない」の 1 点だけ。

**§4 を 9 本の PR に割った。** §3 と同じ「1 段階 = 1 PR・挙動不変を機械的に証明できる粒度」で、
安全網（DDL golden 63 本）が効いたまま IO を作り替えられる順に並べてある。

| # | 目的 | golden への影響 |
|---|---|---|
| **4-0a**（本 PR） | `SQL.designer` の DI 化 | 全て不変 |
| 4-0b | 型パレット層の抽出（`window.DATATYPES` 撤去 → `js/io/palette.ts`） | 全て不変 |
| 4-1 | モデル層 ＋ serializer の分離（XML のまま・バイト不変） | 全て不変 |
| 4-2 | JSON serializer 新設（UI には配線しない） | `tests/golden/json/` 7 本を新設 |
| 4-3 | UI 全経路を JSON に切替（XML は読込専用に・Dropbox 撤去） | 全て不変 |
| 4-4 | 決定論化 ＋ known-issues #1 / #7 / #8 | `golden/xml/` を `golden/ddl-input/` に改名し再取得。**DDL 不変** |
| 4-5 | `<default>NULL</default>` 撤去（#2） | **DDL golden 16 本のみ変化** |
| 4-6 | 外部変更検知（save/load 境界の楽観的並行制御） | 全て不変 |
| 4-7 | 仕上げ（`docs/FORMAT.md` 新設・known-issues 棚卸し） | 不変 |

**この分割にあたって決めたこと**（CLAUDE.md「迷ったら確認し、決定を記録する」に該当）。

- **新設ファイルは `js/io/` 配下に置く。** HANDOVER §4 の `io/serializer.ts` は物理パスの指定ではなく
  モジュールパスの表記と解釈する（同じ文中の `db/*.custom.xml` も実在しない）。`src/io/` に置くと
  [`frontend/js/io.ts`](frontend/js/io.ts) → `src/` の逆向き辺が生え、それを避けるには IO ダイアログごと `src/` へ移す
  作業が §4 に乗ってしまう。§2 の `frontend/` 集約でどのみち丸ごと動かす。
- **Dropbox 連携は 4-3 で撤去する**（段階3-3b からの未決を解消）。[`frontend/js/io.ts`](frontend/js/io.ts) が 150 行以上
  減り、[`index.html`](index.html) の CDN 依存（テストが常に遮断している外部依存）も消える。
  「Docker で各自ローカル稼働・正本は git 管理ファイル・共有は PR」という §2 の形と役割が重複する。
- **known-issue #2 は §4 で直し、DDL golden の更新も §4 で行う**。JSON 側だけ直して DDL 入力を
  bug-compatible に残す案は「半移行を放置しない」（CLAUDE.md 制約1）に触れる。他に何も変えない
  PR 4-5 に分ければ、差分の全行が ` DEFAULT NULL`（cubrid / mysql / sqlite）と vfp9 の ` UL ` ゴミの
  削除であることが機械的な完了判定になる。
- **DDL 生成用の XML 書き出しは §6.3 まで `js/io/ddl-xml.ts` に内部専用として隔離する。**
  ユーザーに見える保存経路からは 4-3 で XML が消えるが、`output.xsl` を TS 実装に置換するのは §6.3 で、
  それまで XSLT の入力に XML が要る。§6.3 を §4 に前倒しすると「挙動不変が要件の §4」と
  「house 規約への変更が目的の §6.3」が混ざり、何が壊れたか切り分けられなくなる。

**§4 全体の前提として実測したこと。`db/*/output.xsl` 9 本は `<datatypes>` を一切参照しない。**
`grep -rn "datatypes" db/*/output.xsl` が 0 件で、`xsl:template match=` は `/sql`（9 本すべて）/
`table` / `row` / `datatype`（`<row>` 直下の要素であって `<datatypes>` ではない）/ `relation` /
`comment` のみ。つまり DDL 生成が要求する入力は `<sql><table>…</table></sql>` だけで、
[`frontend/js/wwwsqldesigner.ts`](frontend/js/wwwsqldesigner.ts) の `toXML()` が埋め込むパレット全文と
`<!-- Active URL -->` は DDL に影響しない。4-4 で「決定論な DDL 入力 XML」に作り替えても
DDL golden 63 本が動かないはず、という予測の根拠。**4-4 の完了判定（`git diff tests/golden/ddl/` が空）が
そのままこの実測の検算になる。**

**本 PR の中身は 7 行の置換と名前空間の削除。**

| 箇所 | 旧 | 新 | 同値である理由 |
|---|---|---|---|
| [`frontend/js/row.ts:169`](frontend/js/row.ts#L169) | `var des = SQL.designer;` | `this.owner.owner` | コンストラクタは `this.owner` 代入の**後**に `update(data)` を呼ぶ |
| [`frontend/js/relation.ts:55`](frontend/js/relation.ts#L55) | `SQL.designer.getOption("style")` | `this.owner.…` | 直前の 4 行が同じ `this.owner` を前提に組み立てている |
| [`frontend/js/table.ts:311`](frontend/js/table.ts#L311) | `SQL.designer.getOption("snap")` | `this.owner.…` | — |
| [`frontend/js/table.ts:461`](frontend/js/table.ts#L461) | `SQL.designer.removeSelection()` | `this.owner.…` | `move` / `up` は `down()` が `this.move.bind(this)` で `document` に張る |
| [`frontend/js/table.ts:484`](frontend/js/table.ts#L484) | `var d = SQL.designer;` | `var d = this.owner;` | 同じメソッドの末尾が既に `this.owner.sync()` を呼んでいる |
| [`frontend/js/rowmanager.ts:124`](frontend/js/rowmanager.ts#L124) | `SQL.designer.getFKTypeFor(…)` | `this.owner.…` | 6 行上（`:118`）が同じ `this.owner` を読んでいる |
| [`frontend/js/wwwsqldesigner.ts:76`](frontend/js/wwwsqldesigner.ts#L76) | `SQL.designer = this;` | 削除 | 読み手が 0 になった |

読み手はすべて Designer に**所有される側**（Row / Table / Relation / RowManager）で、`owner` 鎖の終端は
唯一の Designer と同一実体。Designer のコンストラクタ実行中に Table / Row が生成される経路でも、
旧 `SQL.designer` は先頭で `this` を入れていたので参照先は変わらない（どちらも初期化途中の同じ `this`）。
併せて [`frontend/js/globals.ts`](frontend/js/globals.ts) から `interface SqlNamespace` と `export const SQL` を削除し、
5 ファイルの `import { SQL, … }` を整理した。`export type SqlDesigner`（13 本が参照）は残す
— `Designer` への一本化は描画エンジン側の面が固まる 4-1 で判断する。

**検証**。`git diff tests/golden/` は空（untracked も無し）。`npm test` 61 passed / 21 skipped、
`npm run test:browser` 80 passed、`npm run test:dist` 3 passed、`npm run known-issues` 9 passed、
`npm run typecheck` 0 error（**すべて件数不変**）。完了判定は
`grep -rn "SQL\." js/ src/ tests/ index.html` が**実コード 0 件**（一致するのは経緯を書いたコメントだけ）と、
`grep -rn "SqlNamespace" js/ src/ tests/` が同じく 0 件。

**バンドル差分は 14 行・8 ハンクで、全行が上表の 7 箇所と `var SQL = {}` の消滅に対応する**
（`vite build --minify false` の出力比較）。ソース由来でない差分は 1 件もない。なお `up()` の
`var d = …` は変更前後ともに rolldown がインライン化していて、`if (this.owner.getOption("hide"))` に
畳まれている（旧側も `if (SQL.designer.getOption("hide"))` だった）。

**対話パスの一巡**は歴代と同じ 18 項目を `npm run dev`（4173）と `npm run preview`（4174）の両方で流し、
**18/18・pageerror 0 件**。今回は手動ではなく Playwright スクリプトに書き起こして流した（使い捨てで、
リポジトリには残していない）。置換した参照が実際に走る経路 —— テーブルドラッグ（`snap` / `move` / `up`）、
リレーション作成（`Relation` の style 読み）、FK 自動生成（`RowManager` の型解決）、row の追加と編集
（`Row.update`）—— がすべて含まれている。この過程で判明した操作手順を記録しておく:
`#addtable` は「追加モード」に入るだけで実体は `#area` のクリックで生え、直後に編集ダイアログが開く。
`#clientload` は `fromXML` の末尾で `window.close()` するので、続けて `#clientsql` を押すには開き直しが要る。

**次段階（4-0b）への入力**。`window.DATATYPES` は読み 11（[`frontend/js/row.ts`](frontend/js/row.ts) ×4 /
[`frontend/js/wwwsqldesigner.ts`](frontend/js/wwwsqldesigner.ts) ×5 / [`frontend/js/io.ts`](frontend/js/io.ts) ×2）・書き 2
（`dbResponse()` と `Designer.fromXML`）・初期化 1。両ハーネスが `window.DATATYPES` を直接差し替えて
いるので（[`tests/browser/harness.ts:60`](tests/browser/harness.ts#L60) /
[`tests/node/harness.ts:188`](tests/node/harness.ts#L188)）、`page.evaluate` から届く差し替え口
（`Designer` のメソッド）を同時に用意する必要がある。

**4-2（JSON スキーマ設計）への申し送り**。段階3-2 の記録にある「同名のテーブルが 2 つあると `fromXML` で
リレーションが復元されない」（`findNamedTable` の名前解決が両端を同じテーブルに解決する）は、
参照を名前ではなく id で持てば構造的に解消する。`formatVersion: 1` のスキーマを決める時点で判断する。

### 2026-08-14 HANDOVER §4「IO」段階4-0b — 型パレット層を抽出し `window.DATATYPES` を撤去した

§4 の 2 本目。**出荷コードが持つ `window` 面が `d`（テストの入口を兼ねるデバッグハンドル）
1 つだけになった**。4-0a と同じく主張は「出力バイト列が 1 バイトも変わっていない」の 1 点。

`window.DATATYPES` は `db/<db>/datatypes.xml` の `<datatypes>` 要素を丸ごと保持する可変グローバルで、
段階3-4c が `window` 面を掃除したときに 2 つだけ残ったうちの 1 つ。据え置いた理由は
「読み書き 14 箇所の実行コード変更」＋「両ハーネスが `page.evaluate` / `window.eval` から直接
差し替えるので、素のモジュール変数にすると setter に届かない」の 2 つだった。

**決めたこと 1: 保持形態は Designer のプロパティ（DI）。** 4-0a の `SQL.designer` 撤去と同じ論法で、
可変シングルトンを 1 つも残さない形にした。モジュール singleton（`export const palette`）案は
呼び出し側の差分こそ最小だが、`page.evaluate` から届かないので結局 Designer に再公開が要り、
「モジュール変数 ＋ 公開プロパティ」の二重管理になる。差し替え口は node が `designer.palette`
（ハーネスがコンストラクタの戻り値を掴んでいる）、page が `window.d.palette`。

**決めたこと 2: スコープは要素アクセサのみの薄い抽出。** [`frontend/js/io/palette.ts`](frontend/js/io/palette.ts) の
`TypePalette` は `setRoot` / `isLoaded` / `element` / `db` / `types` / `typeAt` / `groups` の 7 メソッドで、
**キャッシュを一切持たない**。現行コードは参照のたびに `getElementsByTagName` を呼んでおり、
唯一のキャッシュは `Designer.typeIndex` / `fkTypeFor`。これを palette に寄せると
**「datatypes を差し替えても消えない」現行の寿命が変わる**（差し替え後も古い型 index を使い続ける
のは現行の癖だが、挙動不変が要件の §4 では温存する）。型解決そのものの再設計 —
`getTypeIndex` / `getFKTypeFor` / `Row.fromXML` の `sql`・`re` 照合 — は §6.1 の型パレット差し替えと
同時に行う。

**内部値は `Element | false` のまま**にした。`null` にすると
[`frontend/js/wwwsqldesigner.ts`](frontend/js/wwwsqldesigner.ts) `toXML()` の `XMLSerializer` フォールバック
（`DATATYPES.xml` を評価する死に分岐）が `undefined` から **TypeError** に変わる。この分岐は
§4 の XML 書き出し撤去で消えるので、そのとき `null` 化する。

**生成はコンストラクタの先頭寄り（`this.title = document.title;` の直後）。** `requestDB()` より前で
あることは必須だが、それより強い理由がある — 旧 `window.DATATYPES` は
[`frontend/js/globals.ts`](frontend/js/globals.ts) が `false` で初期化していたので**評価時点で必ず存在**し、未読込を
`false` で表していた。生成が読み手より後になると「未読込」が `undefined` になり TypeError で割れる。

**読み手の付け替えは owner 鎖**（4-0a と同じ）。[`frontend/js/row.ts`](frontend/js/row.ts) 4 箇所が
`this.owner.owner.palette`（Row → Table → Designer）、[`frontend/js/io.ts`](frontend/js/io.ts) 2 箇所が
`this.owner.palette`、[`frontend/js/wwwsqldesigner.ts`](frontend/js/wwwsqldesigner.ts) は `this.palette`（読み 3・書き 2）。
併せて `src/app.ts` の冒頭コメント（段階3-1 当時の「残り 15 本はまだ `.js`」）を現状に更新した。

**検証**。`git diff tests/golden/` は空（63 ＋ 7 本すべて無差分。untracked も無し＝
`npm run golden:update` をこの PR で一度も打っていない）。`npm test` 61 passed / 21 skipped、
`npm run test:browser` 80 passed、`npm run test:dist` 3 passed、`npm run known-issues` 9 passed、
`npm run typecheck` 0 error（**すべて件数不変**）。完了判定は
`grep -rn "DATATYPES" js/ src/ tests/ index.html` が**実コード 0 件**（一致するのは経緯を書いた
コメントだけ）。

**バンドル差分は 13 ハンク・50 行**（`vite build --minify false` の出力をコメント除去して比較）で、
内訳は次の 4 種類だけ。ソース由来でない差分は 1 件もない。

| 差分 | 由来 |
|---|---|
| `var TypePalette = class {…}` の追加（24 行） | 新設クラス |
| `window.DATATYPES = false;` の消滅 | `js/globals.ts` |
| 参照の付け替え ×12 行（row 4 / io 2 / designer 6） | owner 鎖・`this` 経由へ |
| `this.palette = new TypePalette();` の追加 1 行 | Designer コンストラクタ |

**インスタンスフィールドの emit は他に 1 つも増えていない**（規約5 ＝ `declare` 必須の検算。
`Designer` の constructor に増えたのは上記 1 行だけ）。

**対話パスの一巡**は 19 項目を `npm run dev`（4173）と `npm run preview`（4174）の両方で流し、
**19/19・pageerror 0 件**（Playwright の使い捨てスクリプト。リポジトリには残していない）。
付け替えた参照が実際に走る経路 —— 型セレクトの生成（`groups()`）、型変更後の色（`typeAt()`）、
FK 自動生成（`getFKTypeFor` → `types()`）、`#clientsql` のラベルと XSLT パス（`db()` ×2）、
`toXML()`（`element()`）、`#clientload`（`fromXML` → `setRoot()`）—— をすべて含む。
この過程で確認した現行仕様を記録しておく（いずれも本 PR の回帰ではなく、`develop` でも同じ）:

- **新規テーブルは既定行 `id`（ai）＋ `PRIMARY` key つきで生える**（`TableManager.click`）。
- **shift + mousedown で複数選択されるが、続く click が選択を 1 つに戻す**（`Table.down` だけが
  `shiftKey` を見る。段階3-3a の記録の精密版）。選択が 2 つある間は `#tablekeys` / `#addrow` /
  `#edittable` が disabled になる（`processSelection`）。
- **`?backend=` を読むのは `getOption` ではなく `IO.build()`**（`getOption("backend")` は既定値を
  持たないので常に null）。`?toolbar=hidden` は `Toggle` が `#toggle` を `off` にして `#bar` を畳む。
- `Table.toXML()` の属性順は `x` → `y` → `name`。

**次段階（4-1: モデル層 ＋ serializer の分離）への入力**。`js/` に残る「モデルと描画と直列化の
混線」は `toXML()` / `fromXML()` が Designer / Table / Row / Key に分散していること。
型パレットが Designer からぶら下がったので、**serializer に「どの Designer のパレットか」を
渡せる状態**になった（4-1 で `escape()` と併せて `js/io/serializer.ts` へ移す）。

### 2026-08-14 HANDOVER §4「IO」段階4-1a — 書き出し方向をモデル層に載せた

§4 の 3 本目。**`Designer` / `Table` / `Row` / `Key` に散っていた `toXML()` 4 実装が
[`frontend/js/io/`](frontend/js/io/) の 3 本に移り、描画クラスから書き出しコードが 1 行も残らなくなった**。
主張は 4-0a / 4-0b と同じく「出力バイト列が 1 バイトも変わっていない」の 1 点。

**まず 4-1 を 3 本に割った。** 台帳の §4 は 9 本（段階4-0a の記録の表）だったが、実測すると
`toXML` 側と `fromXML` 側で**証明の性質がまったく違う**。`toXML` 系 4 実装は DOM を一度も読まず
`data` / `x` / `y` / `relations` / `rows` / `keys` と palette しか見ない（純関数化できる）のに対し、
`fromXML` は「XML を再生する UI 操作列」で、`clearTables()` の DOM 削除・`moveTo()` の snap・
`update()` の FK 連鎖・`setTitle()` の関連行リネーム・ff one-pixel shift hack を撒く。
golden は**結果**を押さえるが副作用の順序と回数は 1 つも押さえていないので、同じ PR に混ぜると
赤が出たときにどちらの向きが原因か切り分けられない。§4 は 11 本になる。

| # | 中身 | 完了判定 |
|---|---|---|
| **4-1a**（本 PR） | 書き出し方向（`model` / `extract` / `xml-serializer`） | golden 70 本無差分 |
| 4-1b | 読み込み方向（`xml-parser` / `apply`） | 上 ＋ DOM 状態スナップショットの差分 0 |
| 4-1c | `SqlDesigner` → `Designer` の一本化（13 本） | **バンドル出力が 1 バイトも変わらない** |

書き出しを先にやったのは、**モデルの形を「バイト不変のために何が要るか」から決める**ため
（読み込みを先にするとモデルがパーサ都合で決まる）。4-1a が入った時点で「読み込みは旧コード・
書き出しは新コード」の組み合わせが golden 70 本で検証されるので、**抽出が正しいことの独立証明**にもなる。

**決めたこと 1: モデルは描画エンジンが実際に持っている値を写す。**
[`frontend/js/io/model.ts`](frontend/js/io/model.ts) の `RowModel.type` は**型パレットの添字のまま**で、sql 名に
解決しない。現行 `Row.toXML()` は添字から要素を引いてその要素の `sql` と `quote` を読むので、
モデルを sql 名にすると serializer はパレットを名前で引き直すことになり、同じ `sql` を持つ型が
2 つあるパレット（known-issue #3 の BIGINT）では**別の要素に当たりうる**。今の postgresql では
どちらも `quote=""` なので golden は割れないが、「割れないことがテストで保証されない」種類の
変更になる。添字なら `typeAt(index)` の逐語移動で済む。**パレット依存の解決はすべて
serializer / parser 側の引数（palette）で行う**、が §4 を通す規約。

**決めたこと 2: relation は `RowModel` にぶら下げ、参照は名前で持つ。**
計画段階では `DesignModel` 直下の平坦配列 ＋ 位置参照（`{table: number, row: number}`）にする
案だったが、実装で**逐語に振り直した**。理由は 2 つ。

- 平坦配列にすると「`designer.relations` を走査して child が自分のものを拾う」順序が
  現行の `row.relations` フィルタと一致することの**証明が要る**（成立はする — `new Relation` は
  [`Designer.addRelation`](frontend/js/wwwsqldesigner.ts#L282) の 1 箇所だけで、コンストラクタが
  [両 row に push](frontend/js/relation.ts#L79) した直後に designer 側にも push されるので、
  `row.relations` は `designer.relations` の順序を保つ部分列になる）。`row.relations` を
  そのまま読めば証明そのものが不要になる。
- 位置参照は `designer.tables.indexOf(row.owner)` が −1 を返す場合に現行と同値な出力を作れない
  （現行は名前を読むだけなので落ちない）。到達不能ではあるが、**バイト不変が要件の PR で
  「到達不能だから」を根拠にしたくない**。

XML は元々名前で参照する形式なので、名前で持つことは決定 1 とも整合する。同名テーブルで
リレーションが壊れる既知の不具合は名前解決に由来するが、**id 参照へ移すかは `formatVersion: 1` を
決める 4-2 の判断**（段階4-0a の申し送りどおり）。

**決めたこと 3: ファイル名は `serializer.ts` ではなく [`xml-serializer.ts`](frontend/js/io/xml-serializer.ts)。**
HANDOVER §4 の `io/serializer.ts` は「全入出力を JSON に統一。`serialize`/`deserialize` を集約」の
文脈にある名前なので JSON 用に取っておく。本ファイルは 4-3 で `js/io/ddl-xml.ts` に改名し、
`output.xsl`（DDL 生成）専用の内部モジュールになる。

**決めたこと 4: 基底 [`Visual.toXML()`](frontend/js/visual.ts) の空実装は残さず消した。**
残すと `table.toXML()` の消し漏れが TypeError にならず `undefined` が黙って返り、
`xml += undefined` で golden が壊れる。基底ごと消せば消し漏れは即 TypeError で、
`npm test` の最初の fixture で落ちる。規約4（死にコードの撤去は両実行系で実測してから）に
対する実測は「同じ PR で jsdom と Chromium の安全網が両方走ること」そのものが満たしている。
`Designer.toXML()` の `override` はこれに伴って外れた。`fromXML` の空実装は 4 実装が現役なので残す。

**`extractModel()` はクラスに `toModel()` を生やさず serializer 側が走査する形にした。**
描画中核 3 本の差分が「削除のみ」になって挙動不変の主張が最も強くなること、永続化の知識を
描画クラスに残さないこと（HANDOVER §4「全入出力は serializer を通す」）、`js/table.ts → js/io/` の
辺を生やさず**依存を描画 → io の一方向に揃える**ことの 3 つによる。

**検証**。`git diff tests/golden/` と `git status --porcelain tests/golden/` がどちらも空
（xml 7 ＋ ddl 63 本すべて無差分＝`npm run golden:update` をこの PR で一度も打っていない）。
`npm test` 61 passed / 21 skipped、`npm run test:browser` 80 passed、`npm run test:dist` 3 passed、
`npm run known-issues` 9 passed、`npm run typecheck` 0 error（**すべて件数不変**）。完了判定は
`grep -rn "toXML" js/` が**実コード 11 行**（`Designer.toXML` の宣言と委譲 ＋ `js/io.ts` の呼び出し 8）、
`grep -rn "escape" js/` が `js/io/xml-serializer.ts` だけ（定義 1 ＋ 呼び出し 3）、
`grep -n "\.dom\b\|document\." js/io/extract.ts js/io/xml-serializer.ts` が 0 件。

**バンドル差分は 6 ハンク・178 行**（`vite build --minify false` の出力をコメント除去して比較）で、
内訳は下表の 6 種類だけ。**ソース由来でない差分は 1 件もない**。

| 差分 | 由来 | 行 |
|---|---|---|
| 新モジュール 9 関数の追加 | `extract` 4 ＋ `serialize` 4 ＋ `escapeXML` | +112 |
| `function escape` の消滅 | [`frontend/js/globals.ts`](frontend/js/globals.ts) | −3 |
| `Visual.toXML(){}` の消滅 | [`frontend/js/visual.ts`](frontend/js/visual.ts) | −1 |
| `Row.toXML` の消滅 | [`frontend/js/row.ts`](frontend/js/row.ts) | −26 |
| `Key.toXML` の消滅 | [`frontend/js/key.ts`](frontend/js/key.ts) | −10 |
| `Table.toXML` の消滅 | [`frontend/js/table.ts`](frontend/js/table.ts) | −11 |
| `Designer.toXML` の 1 行化 | [`frontend/js/wwwsqldesigner.ts`](frontend/js/wwwsqldesigner.ts) | −12 / +1 |

**インライン展開は起きていない**（`serializeTable` / `serializeRow` / `serializeKey` は呼び出しが
各 1 箇所だが rolldown は畳まなかった）。位置移動ハンクも無く、新モジュールは `src/app.ts` に
書いた位置（`globals.ts` の直後）にそのまま入っている。規約5 の検算＝インスタンスフィールドの
emit は 1 つも増えていない（新設は関数と型だけでクラス本体に触れないので自明）。

**対話パスの一巡は 21 項目を 4 通り流した**（Playwright の使い捨てスクリプト。リポジトリには
残していない）。`npm run dev`（4173）と `npm run preview`（4174）の**それぞれで develop と本 PR の
両方**を回し、**4 回とも 21/21・pageerror 0 件**。dialogs 6 件・downloads 2 件・console.error 1 件
（backend 不在の 404）まで一致した。**preview では develop と本 PR を同じポートで流して、
`#clientsave` の XML・`#clientsql` の DDL・UI 編集後の `toXML()`・`?backend=` 付き起動の
4 つのハッシュがすべて一致**している（dev 側はバイト数と件数の一致まで。`<!-- Active URL -->` に
ポート番号が入るのでハッシュはポートに依存する）。`toXML()` の消費者は
[`frontend/js/io.ts`](frontend/js/io.ts) の 8 箇所のうち到達可能な 7 本すべてを踏んだ —— `#clientsave` /
`#clientcopy` / `#clientdownloadxml` / `#clientdownloadtxt` / `#clientlocalsave`（`#clientlocalload`
との往復）/ **`#clientsql`（＝`finish()`。XSLT の入力が壊れていないことの確認）** / `#quicksave`。
`#dropboxsave` は `CONFIG.DROPBOX_KEY` 未設定でボタンが hidden。この過程で確認した現行仕様:

- **`#foreigncreate` は「作成モードに入る」だけで、FK 行と relation は相手テーブルの
  クリックで生える**（[`RowManager.tableClick`](frontend/js/rowmanager.ts#L108)）。`#addtable` が
  `#area` のクリックで実体化するのと同じパターン。
- **Chromium のクリップボードは Windows で LF を CRLF に正規化する。** `#clientcopy` の結果を
  `#clientsave` とバイト比較するときは戻す必要がある（localStorage 経由は生のまま）。
- `#quicksave` は `serversave(e, this._name)` で、`_name` が空の初回は prompt が出る。

**次段階（4-1b: 読み込み方向）への入力**。`fromXML` 4 実装の DOM 走査規則は**微妙に不揃い**で、
逐語移設のときに揃えてはいけない。[`Table.fromXML`](frontend/js/table.ts#L392) の `<comment>` だけが
**直下の childNodes 走査で最後の一致が勝つ**（`getElementsByTagName("comment")[0]` にすると
row 内の comment を拾う）のに対し、[`Row.fromXML`](frontend/js/row.ts) は `getElementsByTagName(...)[0]` で
子孫の先頭が勝つ。relation は [`Designer.fromXML`](frontend/js/wwwsqldesigner.ts#L501) が
**document 順の第 2 パス**で回し、所属を `parentNode` / `parentNode.parentNode` の `name` 属性から
**引き直す** —— ここが同名テーブルのバグの本体で、「今パースしている row が子側」と書くと
バグが直ってしまい、テストが 1 本も落ちないまま挙動が変わる。順序依存（`clearTables()` →
`palette.setRoot()` → 行の型解決）も偶然ではない: `clearTables()` は `removeTable` →
`rowManager.select(false)` → `Row.deselect()` → `redraw()` → `getColor()` → `getDataType()` と
たどって**パレットを読む**ので、先に差し替えると古い添字で新パレットを引くことになる。

### 2026-08-15 HANDOVER §4「IO」段階4-1b — 読み込み方向を parser / apply に分けた

§4 の 4 本目。**`Designer` / `Table` / `Row` / `Key` に散っていた `fromXML()` 4 実装が
[`frontend/js/io/`](frontend/js/io/) の 2 本に移り、描画クラスから入出力コードが 1 行も残らなくなった**。
これで 4-1a の格子（ライブ側 = `extract` / `apply`、形式側 = `xml-serializer` / `xml-parser`）が
4 本とも揃い、4-2 以降の JSON は**形式側 2 本を足すだけ**になる。

**2 コミットに割った。** 4-1a の主張は「golden 70 本が無差分」の 1 点で済んだが、読み込み方向には
それが効かない —— golden は `toXML()` の**結果**しか押さえておらず、`fromXML` が撒く副作用
（`clearTables()` の DOM 削除・`moveTo()` の snap・`update()` の FK 連鎖・`setTitle()` の関連行
リネーム・ff one-pixel shift hack）は 1 つも写らない。出荷コードを触る前に安全網を置くのが
CLAUDE.md 制約1 なので、**コミット1 = 状態スナップショット golden の採取（`js/` `src/` 無改修）、
コミット2 = 移設**にした。「コミット2 が golden データを 1 バイトも触っていない」が
`git diff HEAD~1 -- tests/golden/xml tests/golden/ddl tests/golden/state` で機械的に検証できる。

**安全網の設計（コミット1）。** [`tests/support/state.ts`](tests/support/state.ts) の
`captureDesignState()` が読み込み後のライブツリーと DOM を決定論 JSON に落とす。8 本
（fixture 7 × postgresql ＋ `house-defaults` × mysql）。3 つ決めた。

- **relation は名前ではなく添字**（`designer.tables.indexOf` / `table.rows.indexOf`）で採る。
  同名テーブルで両端が先頭のテーブルへ解決される既知の不具合は、名前で採ると
  「名前は合っているが実体が違う」状態がそのまま素通りする。**本段階でいちばん効く 1 項目**で、
  下の「決めたこと 2」を守れているかを唯一検出できるのがここ。
- **レイアウト由来の値を採らない**（`offsetWidth` 系・relation path の `d`・mini のサイズ・
  `designer.width/height`）。jsdom はレイアウトしないので、除外して初めて **1 本の golden を
  Chromium と jsdom で共有**できる。実際に共有して両実行系がバイト一致した。
  relation の色も除外する（`Relation._counter` がページ生涯で単調増加する static なので、
  同じ設計でもテストの実行順で変わる）。
- **採取関数は自己完結**にして正本を 1 本に保つ。page 側は `page.evaluate` がバンドル外で
  import を解決できないので、関数を**ソース文字列として注入**する。

`titleTooltip` を `getAttribute("title")` で採っているのは効いた —— 無コメントのテーブルでは
属性が**存在しない**（`null`）ことが記録され、apply 側で `if (c)` を外して `setComment("")` を
呼ぶと `""` に変わって赤くなる。

**決めたこと 1: モデルの形は 4-1a のまま変えない。** `RowModel.relations`（子側にぶら下がる
親の名前）を parser が埋め、apply が読む。平坦配列に作り替えると 4-1a が避けた
「`designer.relations` の順序と `row.relations` の順序が一致することの証明」が戻ってくる。

**決めたこと 2: relation は両端とも名前で引き直す。** apply は「今作ったばかりの `Row`」を
子側に渡さない。現行が `findNamedTable(parentNode.parentNode.name)` で引き直しているためで、
オブジェクト参照に変えると**同名テーブルのバグが直ってしまい、テストが 1 本も落ちないまま
挙動が変わる**。`id` 参照へ移すかは `formatVersion: 1` を決める 4-2 の判断。

**決めたこと 3: `"NULL"` → `null` の正規化は parser に持ち込まない。** 現行は `Row.update()` の
中（`data.nll && data.def.match(/^null$/i)`）で起き、その相方の「`!nll` かつ `def === null` なら
`""`」も同じ関数にある。片方だけ持ち出すと 2 つの規則が離れる。結果として**モデルは入りと出で
完全には対称でない** —— 読み込みモデルの `def` は「XML が言った値」、`extract` のそれは
「ツリーが保持している値」。同様に `title` / `KeyModel.type` / `name` / `RelationRef` は parser 側
だけ実行時 `null` がありうる（現行 4 実装の `!` と早期 return をそのまま持っている）。
どちらも 4-4 / 4-5 で消す既知の逸脱として [`frontend/js/io/model.ts`](frontend/js/io/model.ts) に書いた。

**決めたこと 4: 「テーブル 1 件ごとに parse→生成」ではなく全 parse → 全 apply。** parse は
ソース XML（`DOMParser` が作った別 Document）だけを読み palette を書き換えないので、
交互実行と同値。ただし**例外の位置は変わる**（空の `<part>` などで落ちる場合、現行は途中まで
テーブルを作ってから、移設後は 1 つも作らずに落ちる）。どちらも `IO.fromXMLText` が捕まえない
未処理例外で、アプリは壊れた状態になる点は同じ。

**決めたこと 5: `<relation>` は `<row>` の直下だけを走る。** 現行は文書順の全走査で所属を
`parentNode` 鎖から引き直すので、`<row>` の**孫**にある `<relation>`（例: `<key>` の中。
serializer は出さない）は親名が `<key>` 由来になって `findNamedTable` が落ち、スキップされる。
`getElementsByTagName` にすると拾ってしまい、手書き XML で挙動が変わる。直下走査ならこれと一致する。

**決めたこと 6: `Designer.fromXML()` は 1 行委譲にせず 4 行残す。** `toXML()` と非対称だが、
**この 4 行の順序が本段階でいちばん危険**だから —— `clearTables()` は**旧パレット**で走らねば
ならず（`removeTable` → … → `getDataType()` でパレットを読む）、行の型解決は**新パレット**で
走る。したがって clear → `setRoot` → parse → apply は入れ替えられない。両方を所有する唯一の
場所に見える形で置くのが安い。`<datatypes>` をモデルに入れず `Element` のまま渡すのも同じ理由
（これは DOM ノードそのものでモデルデータではない）。

**揃えなかった不揃い**（4-1a の申し送りどおり）: `<comment>` の走査規則（table = 直下
childNodes・最後が勝つ / row = `getElementsByTagName` の子孫先頭が勝つ）、型解決ループに
`break` が無く**最後の一致が勝つ**（known-issue #3 の BIGINT ドリフト）、`<part>` の `nodeValue` を
ガードなしで読む。基底 [`Visual.fromXML()`](frontend/js/visual.ts) の空実装は 4-1a の `toXML()` と同じ論法で
残さず消した（残すと消し漏れが TypeError にならず黙って何もしない）。

**検証**。`git status --porcelain tests/golden/xml tests/golden/ddl tests/golden/state` が
コミット2 の後も空（golden 78 本すべて無差分＝`npm run golden:update` をコミット2 で一度も
打っていない。同ディレクトリで動くのは README だけ）。`npm test` 70 passed / 21 skipped、
`npm run test:browser` 89 passed、
`npm run test:dist` 3 passed、`npm run known-issues` 9 passed、`npm run typecheck` 0 error
（**コミット1 で +9 した以外は件数不変**）。層の分離は `grep '\.dom\|document\.\|getAttribute'
js/io/apply.ts` が 0 件、`js/io/xml-parser.ts` の `Designer` / `addTable` / `setTitle` はコメント 5 行だけ。

**バンドル差分は 7 ハンク・184 行追加 / 96 行削除**（`vite build --minify false`）。内訳は下表の
7 種類だけで、**ソース由来でない差分は 1 件もない**。新設 11 関数はすべて独立した関数として
emit されていて**インライン展開は起きていない**。位置移動ハンクも無い。

| 差分 | 由来 | ハンク |
|---|---|---|
| 新モジュール 11 関数の追加 | `parse` 6 ＋ `apply` 5 | +180 |
| `Visual.fromXML(){}` の消滅 | [`frontend/js/visual.ts`](frontend/js/visual.ts) | −1 |
| `Row.fromXML` の消滅 | [`frontend/js/row.ts`](frontend/js/row.ts) | −37 |
| `Key.fromXML` の消滅 | [`frontend/js/key.ts`](frontend/js/key.ts) | −10 |
| `Table.fromXML` の消滅 | [`frontend/js/table.ts`](frontend/js/table.ts) | −21 |
| `findNamedTable` の JSDoc 1 行 | [`frontend/js/wwwsqldesigner.ts`](frontend/js/wwwsqldesigner.ts) | ±1 |
| `Designer.fromXML` の 4 行化 | 同上 | 28 → 5 |

**対話パスは読み込みの 7 経路を移設前後で流した**（Playwright の使い捨てスクリプト。
リポジトリには残していない）。`#clientload` / `#clientpaste`（クリップボード）/
`#clientloadfromfile`（`FileReader`）/ `#clientlocalsave`→`#clientlocalload`（localStorage 往復）/
`#serverload`（**XHR が作った `Document` を `DOMParser` を通さず直接 `IO.fromXML` へ**）/
`#serverimport`（`fromXML` → `alignTables`）/ `?keyword=` 付き起動（`init2()` からの `serverload`）。
backend は不在なので `page.route` で fixture を返した。**7 経路すべてで状態スナップショットと
`toXML()` がバイト一致し、pageerror は両方 0 件**。この過程で確認した現行仕様:

- **`#clientlocalsave` は IO ウィンドウを閉じない**（`IO.fromXML` の `window.close()` を通らないため）。
  以降 `#saveload` は overlay に隠れてクリックできない。
- `#serverimport` の `alignTables()` はテーブルを関係数の降順に並べ替えて再配置するので、
  座標とテーブル順が fixture と一致しなくなる（known-issue #7 のとおり）。

**次段階（4-1c）への入力**。残るのは `SqlDesigner` → `Designer` の一本化（13 本）で、完了判定は
**バンドル出力が 1 バイトも変わらない**こと（型エイリアスの置換だけなので emit は不変）。
[`frontend/js/globals.ts`](frontend/js/globals.ts) の `export type SqlDesigner = Designer` は 3-2 の経緯コメントごと
消える。§4 の残り（4-2 以降）は形式側 2 本の追加なので、ライブ側 2 本は原則もう触らない。

---

### 2026-08-15 HANDOVER §4「IO」段階4-1c — `SqlDesigner` を `Designer` に一本化した

§4 の 5 本目で、4-1 の締め。**型の名前が 2 つあった状態を実体 1 本に寄せ、参照 13 本すべてが
[`frontend/js/wwwsqldesigner.ts`](frontend/js/wwwsqldesigner.ts) の `Designer` を直接見るようにした**。
出荷コードの挙動には一切触れないので、**主張は「バンドル出力が 1 バイトも変わらない」の 1 点**
（4-1a / 4-1b の「golden 無差分」より強い判定 —— テストが通る範囲ではなく emit そのものの同一性）。

**なぜ今か。** `SqlDesigner` は段階3-2 の産物で、当時 `js/wwwsqldesigner.js` がまだ `.js` だった
ため「`Designer` インスタンスの面」を [`frontend/js/globals.ts`](frontend/js/globals.ts) に構造的 interface として
書いていた。段階3-3b で実体が `.ts` になった時点で `export type SqlDesigner = Designer;` の
1 行に縮み、以後は**別名だけが残っていた**。§4 の残り（4-2 以降）はモデル層の型を増やす作業なので、
「どの型が描画エンジンの実体か」が 2 通りに読める状態を持ち込まないためにここで畳む。

**決めたこと 1: 必ずトップレベル `import type` で書く。** インライン形
（`import { type Designer } from "./wwwsqldesigner.ts"`）は `verbatimModuleSyntax` のもとで
**import 文自体が emit に残る**ため、副作用 import として Rollup の依存グラフに辺が生える。
`wwwsqldesigner` は [`frontend/src/app.ts`](frontend/src/app.ts) の読み込み順の**最後尾**なので、辺が生えた瞬間に
順序が壊れる（バイト一致の判定はこれを機械的に検出する）。この警告は 3-1 以来 `globals.ts` の
冒頭にあったが、置き場所ごと [`frontend/js/table.ts`](frontend/js/table.ts) の冒頭へ移した —— `src/app.ts` の順序で
`Designer` 型を最初に使うファイルで、他 9 本は「理由は js/table.ts の冒頭」の 1 行だけを持つ
（`js/oz.ts` / `js/visual.ts` と同じ「イディオムの正本は 1 か所」の形）。

**決めたこと 2: 型の循環参照はそのまま許容する。** `table.ts` → `wwwsqldesigner.ts` →
`table.ts` の循環が 10 本ぶん生まれるが、**型だけの辺なので emit には 1 本も出ない**。
先例は 4-1a / 4-1b で入れた [`frontend/js/io/extract.ts`](frontend/js/io/extract.ts) /
[`frontend/js/io/apply.ts`](frontend/js/io/apply.ts) の `import type { Designer } from "../wwwsqldesigner.ts"` で、
書き方をそれに揃えた。迂回のために `globals.ts` を経由させ続けるのは、**実体を隠す別名を
残すこと**と同義で得がない。副作用として `globals.ts` は js/ のどこにも依存しなくなった。

**見つけたこと: [`frontend/js/row.ts`](frontend/js/row.ts) の `SqlDesigner` は未使用 import だった。**
本文に使用箇所が 1 つも無い（`this.owner` は基底の `Visual` 側で解決され、Row が `Designer` へ
届くのは `this.owner.owner` の owner 鎖）。したがって row.ts だけは `Designer` を足さず
import を落とすだけにした。`noUnusedLocals` は入れていないので `typecheck` では出ず、
今回のように全参照を機械的にたどって初めて出る類の残骸。**参照 13 本の内訳は
「型を実際に使う 10 本 ＋ 未使用だった row.ts ＋ 定義側の globals.ts ＋
[`tests/support/state.ts`](tests/support/state.ts)」**で、`Designer` を足したのは 11 本。

**検証**。`vite build --minify false` の出力を変更前後で `diff -r` して**差分ゼロ**
（62 ファイル。ハッシュ付きファイル名 `index-DLby1PHE.js` まで同一＝内容ハッシュが一致している）。
`npm run typecheck` 0 error、`npm test` 70 passed / 21 skipped、`npm run test:browser` 89 passed、
`npm run test:dist` 3 passed、`npm run known-issues` 9 passed で**すべて 4-1b と同一件数**。
`git status --porcelain tests/golden` は空（golden 78 本無差分）。
`grep -rn "SqlDesigner" js/ src/ tests/` はコード 0 件（残るのは経緯を書いたコメント 5 行だけ）。

**次段階（4-2）への入力**。ライブ側 2 本（`extract` / `apply`）とモデル
（[`frontend/js/io/model.ts`](frontend/js/io/model.ts)）は 4-1a の形のまま確定したので、4-2 は形式側に
`json-serializer` / `json-parser` を足す作業になる。判断が要るのは `formatVersion: 1` の内容で、
4-1b が申し送った **relation の両端を名前で持つか `id` 参照に移すか**（同名テーブルの既知不具合を
直すかどうか）がその中身。決定論出力（キー順・配列順・2 スペース・1 テーブル 1 ブロック）の
要件は CLAUDE.md 制約3 のとおり。

---

### 2026-08-15 HANDOVER §4「IO」段階4-2 — 設計 JSON（`formatVersion: 1`）を新設した

§4 の 6 本目。**形式側に `json-serializer` / `json-parser` の 2 本を足しただけ**で、4-1 で確定した
ライブ側（[`frontend/js/io/extract.ts`](frontend/js/io/extract.ts) / [`frontend/js/io/apply.ts`](frontend/js/io/apply.ts)）とモデル
（[`frontend/js/io/model.ts`](frontend/js/io/model.ts)）には 1 行も触っていない。UI にも配線していない（4-3）ので、
**既存 golden 78 本は 1 バイトも動かず、バンドル差分は削除 0 行の純粋な追加**。

4-0a から申し送られていた 3 つの未決（型を何で焼くか / relation を名前か id か / パレットを同梱するか）を
ここで決着させた。決定の内容は [`docs/FORMAT.md`](docs/FORMAT.md) に散文で、キー順の契約は
[`frontend/js/io/json-format.ts`](frontend/js/io/json-format.ts) に型として置いてある。**FORMAT.md は 4-0a の表では
4-7 の予定だったが前倒しした** —— スキーマを決めるのが本段階なので、未文書の期間を作らない
（CLAUDE.md 制約4「JSON ルートに formatVersion。`docs/` に文書化」）。

**決めたこと 1: 型は `label` で焼く。** 実測すると **`label` は 9 DB すべてで一意**なのに対し、
**`sql` は postgresql で `BIGINT` が重複**する（Big Integer = 添字 2 / Real = 添字 6。known-issue #3 の本体）。
型を sql 名で持つ形式にすると Big Integer → `"BIGINT"` → 照合の後勝ちで **Real に化ける**。
これは `tests/browser/json.spec.ts` の 1 本で機械的に押さえた —— 同じ設計を JSON 経路で往復させると
`Big Integer` のまま、XML 経路で往復させると `Real` になる、という対比をそのままアサートしている。
なお known-issues #3 の記述どおりドリフトの向きは **Big Integer → Real**（逆ではない）。

**決めたこと 2: relation は名前参照のまま。** `{table, column}`。id 参照へ移すと描画クラス側に
id の発番が要り、4-1b / 4-1c の申し送り「4-2 以降はライブ側 2 本を触らない」を破ることになる。
同名テーブルの不具合は形式では直さず、**「壊れた設計を保存させない」方向の始末を 4-4 に申し送る**。

**決めたこと 3: 型パレットは `db` 名だけ持つ。** 現行 XML はパレット全文を埋め込んでいたが、
数百行のノイズが全設計ファイルに乗るのは制約3（diff フレンドリー）と噛み合わない。読み込み側は
`db` を**読んで捨てる** —— 実行中のパレットと食い違うときに fetch し直すか警告するかは UI の
振る舞いの設計なので 4-3 の判断で、ここで決め打ちするとやり直しになる。

**決めたこと 4: 既定値と同じキーは出さない。`default` は `null` と `""` を区別しない。**
どちらも「既定値なし」としてキーごと落とす。これで known-issue #2（nullable な行が保存で
`<default>NULL</default>` を獲得する）と #5（空の `<default>`）が **JSON 経路には最初から無い**。
読み戻しは `null` を入れ、[`Row.update()`](frontend/js/row.ts#L167) の既存規則（`!nll` かつ `def === null` なら `""`）が
そのまま正規化する。**XML 経路（＝ DDL 入力）の #2 撤去は予定どおり 4-5** で、そちらは DDL golden 16 本が動く。

**決めたこと 5: 壊れた入力は部分的に読み込まない。** parser は未知の型 label・`formatVersion` 違い・
必須キーの欠落・型違いをすべて例外にする（メッセージに `tables[0].columns[2].name` の形で位置が入る）。
現行 XML 経路の癖（未知の型は添字 0 ＝ known-issue #4、属性が無ければ実行時 null）は**逆に振った** ——
読む対象が git 管理の正本ファイルなので、黙って別の型で開くのが最悪の失敗だから。あわせて
[`Designer.fromJson()`](frontend/js/wwwsqldesigner.ts) は **parse を `clearTables()` より先**に置いた
（`fromXML()` は現行の挙動を保つ要件があるので clear が先のまま）。「例外が出ても今開いている設計が
消えない」ことはテストで固定してある。

**決めたこと 6: 内部関数に `Json` を冠する**（`serializeJsonTable` / `parseJsonKey` 等）。
素直に `serializeTable` と書くと [`frontend/js/io/xml-serializer.ts`](frontend/js/io/xml-serializer.ts) の同名関数と
バンドル上で衝突し、**rolldown が旧側に `$1` を付ける**。実際に最初はそうなって、差分に
「既存モジュールのリネーム 8 行」が混ざった。名前を分けたことで**差分が純粋な追加だけ**になり、
4-1a / 4-1b と同じ強さの判定に戻った。

**見つけたこと: 情報保存テストが 7 fixture すべて一発で緑になった。** 本段階でいちばん効くテストで、
同じ fixture を XML 経由（`toXML` → `fromXML`）と JSON 経由（`toJson` → `fromJson`）で往復させ、
[`tests/support/state.ts`](tests/support/state.ts) の状態スナップショットがバイト一致するかを見る
（どちらも「2 回目の読み込み」に揃えて履歴依存を相殺する）。**golden は「JSON がこう出る」しか
言わないが、これは「JSON が XML と同じ情報を運ぶ」ことを言う** —— 新形式では golden だけでは
正しさの根拠にならないので、4-1b で作った state の安全網がそのまま効いた形になる。

**検証**。`git status --porcelain tests/golden/xml tests/golden/ddl tests/golden/state` が空
（既存 golden 78 本すべて無差分＝`UPDATE_GOLDEN=1` は `tests/browser/json.spec.ts` に対してだけ打った）。
`npm test` 93 passed / 21 skipped（4-1c から **+23** ＝ 7 fixture × 3 ＋ 2）、
`npm run test:browser` 119 passed（**+30**）、`npm run test:dist` 3 passed、
`npm run known-issues` 9 passed、`npm run typecheck` 0 error（後 3 つは件数不変）。

**バンドル差分は 2 ハンク・165 行追加 / 削除 0 行**（`vite build --minify false` の出力比較）。

| ハンク | 中身 | 行 |
|---|---|---|
| `657a658,814` | 新モジュール 2 本・19 関数（serializer 5 ＋ parser 14） | +157 |
| `3007a3165,3172` | `Designer` の `toJson()` / `fromJson()` | +8 |

**インライン展開も位置移動も無い**（19 関数すべてが独立した関数として emit されている）。
型だけの [`frontend/js/io/json-format.ts`](frontend/js/io/json-format.ts) は emit が空なので
[`frontend/src/app.ts`](frontend/src/app.ts) に載せていない（`js/io/model.ts` と同じ扱い）。

**次段階（4-3）への入力**。UI 全経路を JSON に切り替える（[`frontend/js/io.ts`](frontend/js/io.ts) の 8 経路・Dropbox 撤去）。
ここで決めるのは 3 つ —— `db` が実行中のパレットと食い違うときの扱い、parser の例外をユーザーに
どう見せるか（locale を通すか）、そして [`frontend/js/io/xml-serializer.ts`](frontend/js/io/xml-serializer.ts) を
`js/io/ddl-xml.ts` に改名して `output.xsl` 専用の内部モジュールにすること。
`Designer.toJson()` / `fromJson()` の面は本段階で既にあるので、4-3 は呼び出し側の付け替えになる。

---

### 2026-08-15 HANDOVER §4「IO」段階4-2b — 設計 JSON の型キーを label から安定 `id` に移した

**4-2 の訂正段階。§4 の分割表には無かった 1 本を足した。** 4-2 が確定させた `formatVersion: 1` の
型キー（型パレットの `label`）が**パレット差し替えで壊れる**ことが分かったため、
版を 2 に上げて型キーを `<type>` の新しい `id` 属性に移し、あわせて `db` を必須・照合対象にした。

#### なぜ 4-3 より前でなければならなかったか

**理由 1: 移行コストが 0 の窓が 4-3 で閉じる。** 4-3 の前に存在する v1 のファイルは
`tests/golden/json/` の 7 本だけで、`npm run golden:update` で再導出できる。4-3 で UI が JSON に
切り替わった後は実運用ファイルの移行になり、§6 でパレットを差し替えた後は「動いているパレットの
下でのデータ移行」になる。

**理由 2（決定的）: 4-2b は 4-3 の入力である。** 4-3 が決めなければならない「`db` が実行中のパレットと
食い違うときの扱い」（4-2 の申し送り）は、**型キーが表示 label で、その名前空間がプロファイル間で
衝突している状態では決めようがない**。実測すると **postgresql と mysql は型 label を 12 個共有する**
（`Integer` / `Text` / `Timestamp` / `Char` / `Varchar` / `Decimal` / `Date` / `Time` / `Bit` /
`Binary` / `Single precision` / `Double precision`）。4-2 の parser は `db` を読んで捨てていたので、
**PG の設計を mysql パレットで開くと、この 12 型は例外にならず黙って別の型に解決されていた**
（PG の `Text`=`TEXT` → mysql の `Text`=`MEDIUMTEXT`）。「不一致なら例外」と決めても、
label のままでは 12 型が一致してしまって例外が飛ばない。**id 化と `db` の必須化は片方だけでは
成立しない**ので、同じ段階に入れてある。

#### 決めたこと 1: 型キーは `label` でも `sql` でもなく、新設する `id`

4-2 が `label` を選んだ判断そのものは正しかった（`sql` は postgresql で `BIGINT` が Big Integer と
Real の 2 か所に重複し、sql 名で焼くと known-issue #3 のドリフトが JSON 経路に入る）。
問題は **`label` が表示名であること**で、§6 のパレット現代化がこれを動かす。
[`docs/FORMAT.md`](docs/FORMAT.md) 自身が「§6.1 で差し替えると旧 label のファイルはここで落ちる」と
申し送っていた —— **その申し送りは撤回し、形式側で解く**。

`sql` に戻す案も検討して却下した。`sql` は §6 が**変えることを目的にしている属性**そのもの
（`SERIAL` → identity、`CHAR` → `TEXT`、`TIMESTAMP` → `TIMESTAMPTZ`）で、正本ファイルの型キーに
最も不安定な属性を選ぶことになる。加えて大文字小文字がプロファイル間で不統一（mssql / mysql は
小文字、PG / oracle は大文字）で、空白も含む（`TIMESTAMP WITH TIME ZONE`）。

`label` に alias 表を持たせる案も却下した。**「同じ綴りで別の意味」を表現できない**のが理由で、
PG18 パレットが `timestamptz` を素直に `label="Timestamp"` と名付けると、旧ファイルの
`"type": "Timestamp"`（＝ naive timestamp）が例外にならず**黙って timestamptz に解決される**。
`docs/FORMAT.md` が「正本を黙って別の型で開くのが最悪の失敗」と書いた、まさにその失敗を
構造的に作る案だった。加えて alias 表はファイルを 1 バイトも変えずに意味だけ移すので、
**`git diff` に出ないスキーマ変更**になる（制約3 と噛み合わない）。

#### 決めたこと 2: `id` は `sql` から機械生成する（意味的判断を 4-2b に持ち込まない）

規則は 4 つ。(1) `^[a-z][a-z0-9_]{0,31}$` に適合しパレット内で一意、(2) 語源は `sql` の正規化
（小文字化 → 英数字以外を `_` → 前後の `_` を落とす）、(3) **意味が同じ型の `id` は変えない・
意味が変わったら必ず変える・別の意味で再利用しない**、(4) 衝突する / 語源が壊れている entry には
`x_` を付ける。

**規則 2 を機械生成にしたのは、6-7 の意思決定を 4-2b に漏らさないため。** 「この型を何と呼ぶか」は
パレット現代化の判断で、本段階は「今あるものに安定したキーを振る」だけ。規則 3 が唯一の契約で、
`label` と `sql` は §6 がいくらでも動かしてよい。

**規則 1 が小文字始まりなのは安全装置でもある。** 実測すると **現行 9 パレットの label はこの形に
1 つも一致しない**（すべて大文字を含むか空白を含む）ので、移行し忘れた v1 のファイルが
「たまたま読めてしまう」ことが原理的に起きない。

**`x_` は 9 DB 159 型のうち 2 件だけだった**（実測）。`postgresql: x_real`（`label="Real"` /
`sql="BIGINT"` ＝ known-issue #3 の本体）と `vfp9: x_integer_not_key`（`sql="Integer"` が
`INTEGER` と大小違いで重複）。どちらも sql 属性が壊れている entry で、§6 で現代化すると 0 件になる
（`grep -c 'id="x_'` が 6-7〜6-13 の完了判定に使える）。

#### 決めたこと 3: 移行は parser の後方互換読みではなく、git のコミットとして出す

parser が持つ後方互換は **例外メッセージ 1 つだけ**にし、変換は
[`tools/migrate-design.mjs`](tools/migrate-design.mjs)（`npm run migrate:design`）に置いた。

実行時に黙ってアップグレードすると、**開いて保存し直すまでファイルは旧世代のまま**で、
リポジトリ内に 2 世代が混在し「どれが移行済みか」を機械判定できない（制約2 は正本が git 管理の
ファイルであることを要求している）。かつ意味の変化が `git diff` に出ない（制約3）。
置き場所を `js/` でなく `tools/` にしたのは、**互換コードを出荷バンドルに入れない**ため。

ツールには**前提検査**を入れた —— 「何も変換せずに `JSON.parse` → `JSON.stringify` した結果が
原文とバイト一致するか」を先に見て、一致しなければ変換せずに落とす。手編集されたファイルを
書き直すと、数値リテラルの表記揺れ（`20.0` → `20`）のような意図しない差分が移行コミットに
紛れ込み、「移行だけが入っている」という PR の主張が壊れるため。

#### 決めたこと 4: 移行表の機構は 4-2b では作らない（§6 の着手時に決める）

当初の計画は「機構（ツール＋表のスキーマ＋健全性テスト）を 4-2b で入れ、§6 は表というデータを
足すだけ」だったが、**表の形が違う**ので却下した。4-2b の移行は「label → id」の全射で、
同じ `<type>` 要素を別の属性で引き直すだけ（意味は 1 つも変わらない）。§6 の移行は
「消えた型をどこに寄せるか」という意味的判断を含み、しかも `serial` → `integer` **＋
`autoincrement: true`** のように `type` 以外のキーも動かす必要がある。先に作ると間違った抽象になる。

#### 見つけたこと: パレットに属性を 1 つ足すと XML golden が動く

`tests/golden/xml/` の 7 本は**パレット全文を埋め込んでいる**（`minimal.xml` に `<type` が 29 行）。
`id` を足しただけで 7 本すべてが動く。一方 **DDL golden 63 本と state golden 8 本は 1 バイトも
動かない** —— `output.xsl` 9 本は `id` を参照せず、state は型を添字で持っているため。
この非対称は「変更の性質を機械判定する」うえで有用なので、完了判定に独立の項として入れてある
（`git status --porcelain tests/golden/ddl tests/golden/state` が空）。

#### 検証

- **`git diff -U0 db/` の変更行がすべて `<type ` 行**（0 件の例外）＝ パレットの変更が属性追加だけ
- **`git diff -U0 tests/golden/xml/` も同じく `<type ` 行だけ**（上の従属結果）
- **`git status --porcelain tests/golden/ddl tests/golden/state` が空**（63 + 8 本が不変）
- **`git diff -U0 tests/golden/json/` の変更行が `"type":` と `"formatVersion":` だけ**（0 件の例外）
- **移行ツールと serializer の等価性**: `tests/golden/json/` の 7 本はツールで移行したもので、
  それが serializer の出力と一致することを golden テストが確認している（`golden:update` を
  かけ直しても差分が出ない）
- **冪等**: 同じファイルに 2 回流すと 2 回目は `skip (already v2)`
- `npm test` **133 passed** / 21 skipped（4-2 の 93 から +40）、`test:browser` **121 passed**（+2）、
  `test:dist` 3 passed、`known-issues` 9 passed、`typecheck` 0 error

**次段階（4-3）への入力**。`db` 不一致の扱いは本段階で「例外」に確定したので、4-3 が決めるのは
**UI の導線**だけになった（そのパレットを取り直して開くか、拒むだけか）。あわせて
**保存ファイル名に `.json` 拡張子を付けること** —— 現行 [`backend/php-file/index.php`](backend/php-file/index.php)
の保存先は拡張子なし（`data/<keyword>`）で、これだと `.gitattributes` / `.prettierignore` /
移行 glob のいずれもファイルを名指しできない。

---

### 2026-08-15 HANDOVER §4「IO」段階4-3a — Dropbox を撤去し、XML 書き出しを `ddl-xml.ts` に隔離した

**§4 の分割表の 4-3 を 2 本に割った。本段階は削除と改名だけで、JSON 化の判断を 1 つも含まない。**
4-1 を 3 本に割ったのと同じ論法 —— 1 本でやると「Dropbox 215 行の削除」「保存/読込 8 経路の
書き換え」「ファイル改名」「`.json` 拡張子」「例外の見せ方」「locale の文言」が 1 つの diff に
同居し、赤が出たときに切り分けられない。加えて **4-3a は「バンドル差分が削除に収束する」ことを
完了判定にできる**ので、証明の性質が 4-3b（UI の振る舞いが変わる段階）と根本的に違う。
§4 はこれで 13 本になる。

#### 決めたこと 1: Dropbox は「隠す」ではなく機能ごと撤去する

段階4-0a の決定（本書の §4 分割表）どおり実行した。撤去したのは
[`frontend/js/io.ts`](frontend/js/io.ts) の 6 メソッド ＋ 型宣言（約 215 行）、[`index.html`](index.html) の CDN
`<script>` とボタン 3 つ、`dropbox-oauth-receiver.html`（ファイルごと）、`CONFIG.DROPBOX_KEY`、
locale 7 言語 × 3 行。

役割が §2 と重複しているのが理由。「Docker で各自ローカル稼働・正本は git 管理ファイル・
共有は PR」という形では、クラウドストレージ経由の受け渡しは**正本を 2 つ作る導線**にしかならない
（制約2）。`CONFIG.DROPBOX_KEY` が未設定なら `dropBoxInit()` がボタンを `display: none` にする
実装だったので「既定では見えないから残しても無害」に見えるが、**CDN からの `dropbox.js` 読み込みは
キーの有無と無関係に毎回走る**。分類 B のリポジトリで出荷物に外部オリジンの実行コードを引く
価値がゼロなので、隠すのではなく消した。これで **index.html の外部依存は 0 本**になった。

#### 決めたこと 2: ファイルは改名するが、関数名は変えない

[`frontend/js/io/xml-serializer.ts`](frontend/js/io/xml-serializer.ts) → [`frontend/js/io/ddl-xml.ts`](frontend/js/io/ddl-xml.ts)。
4-3b でユーザーに見える保存経路が JSON になると、この XML は「設計の保存形式」ではなくなり
**`output.xsl` への入力＝ DDL パイプラインの中間表現**だけになるので、名前をその役目に合わせた
（モジュールごと消えるのは §6.3）。

一方 `serializeDesignXml` の関数名は据え置いた。改名するとバンドル差分に「関数リネーム」の
ハンクが混ざり、本段階が主張したい「差分が削除に収束する」が濁る。名前の再検討は
`golden/xml/` → `golden/ddl-input/` の改名と同じ 4-4 が適所。

#### 決めたこと 3: `promptName()` の `suffix` は直さずに消す

`suffix` の実装は `name.substr(0, name.length - 4)` の決め打ちで、**長さ 4 以外の suffix では
壊れる**（`.json` は 5 文字）。呼び手は Dropbox の 2 か所だけだったので、4-3b で `.json` を扱う
前に「直す」のではなく引数ごと撤去した。4-3b の `.json` 付与は別関数（keyword の正規化）で行う。

#### 決めたこと 4: テストの外部依存対策を「遮断」から「検出」に変える

[`tests/browser/harness.ts`](tests/browser/harness.ts) は `page.route(/cdnjs/, abort)` で CDN を
遮断していた。遮断すべきものが無くなったので、**「アプリのオリジン外へリクエストが 1 本でも
出たら初期化エラーで落ちる」**検査に置き換えた。撤去したものが戻ってきたら赤くなる
（`data:` / `blob:` は除外）。オリジンは baseURL 設定ではなく `page.url()` から取るので、
dev（4173）と preview（4174）の両方でそのまま効く。

#### 検証

- **バンドル差分が削除に収束した**（`vite build --minify false` を `develop` と本ブランチで
  走らせて比較）。**3 insertions / 106 deletions** で、追加 3 行の内訳は次で全部：
  `XHR_PATH: ""`（`DROPBOX_KEY` が消えて末尾カンマが落ちた）/ `//#region js/io/ddl-xml.ts`
  （改名）/ `promptName(title) {`（`suffix` 撤去）。**削除 106 行はすべて Dropbox 由来か
  上の 3 点の旧側**で、それ以外のハンクは 1 つも無い。
- `git status --porcelain tests/golden/` が空（**85 本すべて無差分**）。golden は Designer の
  ファサード経由で採るので、本段階が `js/io/` の入出力 4 本と `Designer.{toXML,fromXML,toJson,fromJson}`
  を触らない限り構造的に不変（この非対称は 4-3b の完了判定でも使う）。
- `grep -rn -i "dropbox"` が**実コード 0 件**（一致するのは撤去の経緯を書いたコメントと本書だけ）。
- `js/io.ts` が **813 → 552 行**。
- `npm test` **133 passed** / 21 skipped、`test:browser` **121 passed**、`test:dist` 3 passed、
  `known-issues` 9 passed、`typecheck` 0 error（**すべて件数不変**）。

**次段階（4-3b）への入力**は 4-2b の申し送りのまま（`db` 不一致の UI 導線と `.json` 拡張子）。
本段階で `promptName()` が `suffix` を持たなくなったので、拡張子の付与は 4-3b が
**keyword を組む直前の 1 か所**に置ける。

---

### 2026-08-15 HANDOVER §4「IO」段階4-3b — UI の全経路を JSON に切り替えた

**これで CLAUDE.md 制約4（フォーマットは JSON 固定・XML は読込専用・書き出しは撤去）が
満たされた。** 保存 5 経路（textarea / クリップボード / ダウンロード / localStorage / server）は
すべて設計 JSON を書き、読込 5 経路は JSON と XML の両方を受ける。出荷コードで
`Designer.toXML()` を呼ぶのは **DDL 生成（`finish()`）の 1 か所だけ**になった。

#### 前提: golden はこの段階を 1 ビットも押さえない

golden 85 本はすべて Designer のファサード（`toXML` / `toJson` / `fromXML` / `fromJson`）経由で
採るので [`frontend/js/io.ts`](frontend/js/io.ts) を通らない。つまり **「UI が JSON に切り替わったこと」は
golden 不変と両立してしまう**。歴代の段階が「golden 無差分」を主たる完了判定にできたのは
変更対象が golden の経路上にあったからで、本段階はそこが構造的に違う。

そこで完了判定を 2 本立てにした —— 「golden 85 本が無差分」（＝**描画エンジンと形式側に
触っていない**ことの証明）＋ **UI 経路を固定する新規テスト 2 本**（＝切り替わったことの証明）。
この非対称は本段階でいちばん重要な設計判断で、[`docs/TESTING.md`](docs/TESTING.md) に節を足した。

#### 決めたこと 1: 形式の判別は先頭 1 文字。フォールバックは作らない

[`frontend/js/io/detect.ts`](frontend/js/io/detect.ts)（export 1 本）。BOM と先行空白を飛ばした最初の 1 文字が
`{` なら json、`<` なら xml、無ければ empty、それ以外は unknown。

**拡張子で決めない**のは、読込 5 経路のうち拡張子を持つのが `clientloadfromfile` だけだから
（textarea / クリップボード / localStorage / server には無い）。別ボタンを立てる案も却下 ——
ボタンが倍になるうえ、ファイルと server は結局中身で判別することになる。

**「試して駄目なら他方」を書かない**ことが本ファイルの要件。書くと壊れた JSON を XML として
読み直して `xmlerror: Null document` に着地し、**ユーザーが直せない位置に例外が落ちる**。
先頭 1 文字で行き先を確定させると、`{` で始まる入力は必ず json-parser の位置つきメッセージ
（`tables[0].columns[2].name`）だけを出す。判別を厳しくしない（`{"formatVersion"` まで見ない）
のも同じ理由で、中身の妥当性は parser の仕事。

#### 決めたこと 2: `db` 不一致は拒む。ただし例外メッセージに導線を持たせる

4-2b が形式側を「例外」に確定させたので、本段階が決めるのは UI の導線だけだった。
**パレットを取り直して開き直す案は却下**した ——

- 読込 5 経路すべての非同期化が要る（`requestDB()` / `dbResponse()` は `flag--` と `init2()` を
  持つ初期化専用の副作用で、そのままでは再利用できない）
- `typeIndex` / `fkTypeFor` の古いキャッシュを新パレットに当てる既知の癖（4-0b で意図的に温存）を
  **JSON 経路にも持ち込む**ことになる
- cookie の `db` は変わらないので、リロードすると元に戻る半端な状態を作る
- 現行 UI は「db の変更にはリロードが要る」という契約を locale の `optionsnotice` で明示している

そのぶん例外に「Options の db を "<ファイル側の db>" に変えてページを再読み込みすること」を
足した。**locale は通さない**（形式側の規約）ので、Options の項目名は訳語ではなく設定キーの
`db` で指す —— 訳語を焼くと 21 言語のどれか 1 つと必ず食い違う。

#### 決めたこと 3: `.json` 拡張子はフロントだけで完結させ、PHP には触らない

`serversave` / `serverload` の keyword に `.json` を付ける（4-2b の申し送り）。現行 backend は
body を解釈せず `basename($keyword)` でファイル名を作るだけなので、**PHP には 1 行も要らない**
（捨てる資産に投資しない ＝ 制約6）。`jsonKeyword()` は二重付与を防ぐので、`list` が返した
名前をそのまま prompt に貼っても壊れない。設計の名前（`setTitle`）には付けない。

拡張子の**強制**（`.json` 以外の save を拒む・`list` が `*.json` だけを返す・keyword 省略時 400）は
正本ディレクトリの責務なので **Kotlin 実装の §5.1 に送った**。

**副作用**: `backend/php-file/data/default`（upstream のサンプル XML・2833 バイト）が
`serverload` から到達できなくなる。§5 の PHP 撤去と同時に消える upstream 資産なので、
削除も救済もせず記録だけに留める。

#### 決めたこと 4: ダウンロードは 1 本に統合し、introspection は XML のまま据え置く

`clientdownloadxml` / `clientdownloadtxt` → `clientdownload`（`new-database.json` /
`application/json`）。中身が JSON になった以上「`.txt` でも落とせる」ことに意味が無く、
id に `xml` を残すと落ちるファイルと名前が食い違う。

一方 `serverimport` は `xml: true` のまま。ここが受けるのは「保存した設計」ではなく
**backend が `information_schema` から組み立てた XML** で、JSON 化は backend を Kotlin に移す
§5.2 の仕事。フロントだけ先に JSON を期待させると現行 backend との契約が切れる。

#### 決めたこと 5: 危険な境界を独立したコミットにする

PR 内のコミットを 5 つに割り、**「読みは新・書きは旧」の状態を一度だけ通した**（コミット 2）。
この状態で既存テストが全緑であること自体が「判別ロジックが XML を落としていない」ことの
独立証明になる（4-1a が「読み込みは旧・書き出しは新」で抽出を独立検証したのと同じ論法）。
実際に 142 passed / 121 passed で通っている。

#### 検証

- **`git status --porcelain tests/golden/` が空**（85 本すべて無差分）
- **`git grep "toXML" -- js/` の実コードが 2 行に収束**（`js/wwwsqldesigner.ts` の定義と
  `js/io.ts` の `finish()`）。§6.3 まではこの 1 か所が `output.xsl` の入力を作る
- **`git diff -U0 -- locale/` の変更行が `clientsave` / `clientload` / `empty` の
  `XML` → `JSON` 置換だけ**（21 言語 × 3 行 = 63 行。例外 0 件）＋ `clientdownload` への統合
  （en / de）＋ `jsonerror` / `unknownformat` の追加（en / ja）
- `npm test` **157 passed** / 21 skipped（4-3a の 133 から +24 ＝ `detect.test.ts` 9 ＋
  `io-ui.test.ts` 15）、`test:browser` **133 passed**（+12 ＝ `io-ui.spec.ts`）、
  `test:dist` 3 passed、`known-issues` 9 passed、`typecheck` 0 error
- **対話パスの手動一巡は行っていない。** 保存/読込の全経路を実ブラウザで押さえる
  [`tests/browser/io-ui.spec.ts`](tests/browser/io-ui.spec.ts) を新設したことで置き換えた
  （描画系は本段階で 1 行も触っていない）

**次段階（4-4）への入力**。決定論化（`<!-- Active URL -->` の `location.href` 撤去）と
known-issues #1 / #7 / #8。`golden/xml/` → `golden/ddl-input/` の改名は**本段階で前提が整った** ——
ユーザーに見える保存経路から XML が消えたので、あの 7 本は「設計の保存形式の golden」ではなく
「DDL パイプラインの入力の golden」になった。`js/io/ddl-xml.ts` の `serializeDesignXml` を
役目に合った名前にするのも 4-4 の同じ PR が適所。あわせて **同名テーブルで relation が壊れる件の
始末**（4-2 からの申し送り）も 4-4 のまま。

---

### 2026-08-15 HANDOVER §4「IO」段階4-4 — DDL 入力 XML を決定論・well-formed にした

§4 の 10 本目。**HANDOVER §4 の「決定論出力」要件を書き出し側で満たしきる段階**で、
4-3b までに申し送られた 5 つ（決定論化・known-issues #1 / #7 / #8・golden の改名と
関数の改名・同名テーブルの始末）を 1 本にまとめた。JSON 側は 4-2 の時点で既に決定論
だったので、**本段階が動かすのは XML 側だけ**。

**完了判定は `git status --porcelain tests/golden/ddl/` が空**（DDL golden 63 本が
1 バイトも動かない）。これは 4-0a の実測「`output.xsl` 9 本は `<datatypes>` を一切
参照しない」の検算そのもので、実際に空だった。golden が動いたのは
`tests/golden/ddl-input/` の 7 本だけ。

#### 決めたこと 1: `<datatypes>` の全文埋め込みごと落とす

決定論化は `<!-- Active URL -->` の 1 行を消すだけでも成立するが、**パレット全文の
埋め込みも一緒に落とした**。理由は 3 つ。

- `output.xsl` が参照しないので **DDL には 1 バイトも影響しない**（4-0a の実測）
- 埋め込みは `XMLSerializer` 経由なので、**整形が実行系依存**になりうる。1 行消して
  「決定論になった」と言いながら実行系依存を残すのは筋が通らない
- その `XMLSerializer` の else 節に、**未定義の `e` を参照する到達不能なバグ分岐**が
  居座っていた（段階2 からマーカーとして温存し `@ts-expect-error` を付けていたもの）。
  分岐ごと消えるので、`@ts-expect-error` の消し忘れは typecheck が捕まえる

結果 `ddl-input/` は 7 本とも 44 行減った（-301 / +7）。読み込み互換は不変 ——
`xml-parser` は元から実行中のパレットで型を解決し、同梱 `<datatypes>` を読む
`Designer.fromXML()` は「無ければ `null`」なので、4-3b 以前の XML はそのまま読める。

#### 決めたこと 2: known-issue #7 は「配列の破壊」だけを直す

`alignTables()` が `this.tables` を直接 `sort()` していたため、再配置するだけの
つもりが**保存されるテーブル順まで変わって**いた。ここで切り分けたのは
**不具合＝配列を破壊すること／仕様＝関係数の降順に座標を割り当てること**。
並べ替えた**コピー**を配置順としてだけ使う形にしたので、`moveTo()` が動かす座標は
1 ピクセルも変わらない（`sort` は安定なので同順位の相対順も現行と同じ）。

`importresponse` は従来どおり `alignTables()` を呼ぶ。テストハーネスの `loadFixture` が
`importresponse` を避けているのも従来どおりで、理由が「順序と座標」から「座標」に減った。

#### 決めたこと 3: エスケープ順は `&` が先。`key.name` だけ `String()` を挟む

`escapeAttr` は `escapeXML`（`&` → `>` → `<`）を通してから `"` → `&quot;` を足す。
逆にすると `&quot;` の `&` を後段が拾って `&amp;quot;` になる。実際
`quotes-i18n` の `name="say &quot;hi&quot;"` が二重エスケープされていないことを確認した。

`key.name` にだけ `String()` を挟んだのは、**name 属性の無い `<key>` を読むと実行時に
`null` が入る**ため（`js/io/model.ts` の `KeyModel` に記録済みの嘘）。現行は
`name="null"` と書き出すので、その嘘を保つ。直接 `escapeAttr` に渡すと `TypeError` に
なり、fixture が検出しない経路で挙動が変わってしまう。

#### 決めたこと 4: 同名テーブルは「形式で直さず保存を拒む」

4-2 の決めごとのとおりに始末した。設計 JSON は relation の両端を**名前**で持つので、
同名テーブルがあると読み戻したとき `findNamedTable()` が常に先頭に当たり、
**名前は合っているのに参照先が入れ替わる**。id 参照へ移す案は id の発番が描画クラス側に
要り、4-1c の申し送り「4-2 以降はライブ側 2 本を触らない」を破る。

拒み方は `db` 無し / 型 `id` 無しと同じで、`serializeDesignJson` の入口で
**1 バイトも書かずに落ちる**。受け止めは既存の `IO.toJsonOrAlert()` がそのまま担うので
UI は無改修。メッセージは locale を通さず、重複した名前と `tables[i]` の位置に加えて
「どちらかの名前を変えてから保存すること」まで書く。

#### 決めたこと 5: 直した不具合のテストは消さず、反転させて移す

`tests/known-issues/README.md` の運用 3 に従い、#1 / #7 / #8 の 3 本は削除せず
**「直った後の挙動」のアサートに書き換えて** [`tests/browser/serialize.spec.ts`](tests/browser/serialize.spec.ts)
へ移した。README には「直したもの」の表を新設して移設先を書いてある。同じ理由で
「非決定性の所在」テストも消さず、環境依存が出力に現れないことの確認へ反転させた。
**消えた記録は「そもそも壊れていなかった」ことにされてしまう。**

`amp-in-name.xml` は known-issues 側に置いたまま。正常系 fixture へ昇格させると
`FIXTURES` の母集団が 7 → 8 になり **DDL golden が 63 → 72 本**に増えて、本段階の
完了判定「DDL golden が無差分」がぼやける。読み手だけ
[`tests/support/fixtures.ts`](tests/support/fixtures.ts) の `readKnownIssueFixture` に
共通化した。

あわせて `normalizeDesignXml` / `hasActiveUrlComment` を撤去した。**golden はもう
1 バイトも加工していない**（正規化していた唯一の行が消えたため）。

#### 検証

- **`git status --porcelain tests/golden/ddl/` が空**（DDL golden 63 本が無差分。本段階の完了判定）
- `tests/golden/ddl-input/` の差分は 2 段階に分かれ、**どちらも予測どおり**だった ——
  コミット3 で 7 本とも 44 行減（`<datatypes>` 42 行 ＋ Active URL 1 行 ＋ 前後）、
  コミット4 は `<default>` の改行だけ（5 ファイル）。**エスケープ拡大では 1 バイトも
  動かない**という予測も当たった（正常系 fixture 7 本は `&` と `<` を意図的に持たない
  —— [`tests/fixtures/quotes-i18n.xml`](tests/fixtures/quotes-i18n.xml) の冒頭に明記されている）
- `git grep "serializeDesignXml"` が 0 件、`git grep "golden/xml"` が経緯の記述だけ
- `npm test` **158 passed** / 21 skipped（4-3b の 157 から +1 ＝ 同名テーブル拒否）、
  `test:browser` **136 passed**（133 から +3 ＝ known-issues から移設した 3 本）、
  `test:dist` 3 passed、`known-issues` **6 passed**（9 から -3）、`typecheck` 0 error
- **対話パスの手動一巡は行っていない。** 本段階が触るのは DDL 入力 XML の生成と
  `alignTables()` の 1 行で、前者は golden、後者は移設したテストが押さえている

**次段階（4-5）への入力**。`<default>NULL</default>` の撤去（known-issue #2）。
**DDL golden 16 本が動く唯一の段階**で、差分の全行が ` DEFAULT NULL`（cubrid / mysql /
sqlite）と vfp9 の ` UL ` ゴミの削除であることが機械的な完了判定になる（4-0a の予測）。
`RowModel.def` の `string | null` から「既定 NULL」の内部表現が消えるので、
[`frontend/js/io/model.ts`](frontend/js/io/model.ts) の型注釈もそこで直す。§4 の残りは 4-5 / 4-6
（外部変更検知）/ 4-7（仕上げ）の 3 本。

### 2026-08-15 HANDOVER §4「IO」段階4-5 — `<default>NULL</default>` を撤去した

§4 の 11 本目。**「既定 NULL」の内部表現（`Row.data.def === null`）を撤去し、「既定なし」を
`""` の 1 通りにした**段階。これで既定値を持たない行が保存で `<default>NULL</default>` を
獲得する（＝情報が増える）known-issue #2 が消える。

**§4 で唯一 DDL golden が動く段階**（4-0a の分割表）。完了判定は 4-0a の予測どおり
**「差分の全行が ` DEFAULT NULL` と vfp9 の ` UL ` ゴミの削除であること」**で、
16 ファイル・128 行のうち **説明できない差分は 0 行**だった（内訳は下記）。

#### 決めたこと 1: 潰し先を `null` から `""` に替える。条件は動かさない

`Row.update()` の正規化（`data.nll && data.def.match(/^null$/i)`）は残し、代入先だけ
`null` → `""` にした。**nullable 列の `DEFAULT NULL` は SQL 上も暗黙の既定と同義**なので
情報は失われない。条件（`data.nll`）を残したのは、NOT NULL 行に "NULL" と打った場合の扱い
（文字列としてそのまま残る）を現行のままにするため —— そこまで潰すと「意図して書いた既定値を
勝手に消す」側の変更になり、#2 の範囲を超える。相方の「`!nll` かつ `null` なら `""`」は
`null` が入らなくなったので削除した。

`Row.load()` の「`null` を "NULL" と表示する」分岐も落とした。**既定値を持たない行を展開すると
空欄が出る**（従来は "NULL"）。ここが #2 の UI 側の入口で、ユーザーが何も触らず閉じるだけで
既定値が生えていた。

#### 決めたこと 2: 正規化は `Row.update()` の 1 箇所に残す

`RowModel.def` の型からは `null` が消えるが、**「入り側＝ファイルが言った値／出側＝ツリーが
持つ値」という非対称は残す**。parser 側にも同じ規則を書くと、同じ規則が 2 箇所に分かれて
片方だけ直す事故の余地ができる（4-1b の決めたこと 3 と同じ立場）。[`frontend/js/io/model.ts`](frontend/js/io/model.ts)
のヘッダは「4-5 で消す既知の逸脱」から**「意図して残す理由」**に書き換えた。

4-3b 以前に保存されたファイルの `<default>NULL</default>` は、parser を "NULL" のまま通って
`apply` → `update()` が `""` に潰す。**読み直すと XML からも JSON からも既定値が消える**ことは
コミット4 でテストに固定した（旧ファイルは今までどおり開ける）。

#### 決めたこと 3: 動かない DB は「予測に無い」ではなく「実測して根拠を書く」

4-0a の予測は cubrid / mysql / sqlite と vfp9 の 4 つを挙げていて、**web2py が入っていない**。
実測すると web2py の golden には `default=None` がびっしり出ているので、確認して根拠を残した ——
`db/web2py/output.xsl` は `<default>` が**無い**行にも `xsl:otherwise` で `default=None` を出すので、
`<default>NULL</default>` が消えても出力は 1 バイトも変わらない。他の 4 つも同様に確認した:
postgresql は `default != 'NULL'`、oracle は `not(default = 'NULL')` で既に除外済み、
mssql / sqlalchemy は `default` を一切参照しない。

#### 検証

- **`tests/golden/ddl/` は 16 ファイル・128 行**。内訳は ` DEFAULT NULL` の削除 **96**
  （cubrid / mysql / sqlite × 4 fixture）と vfp9 の `UL ` ゴミの削除 **32**（引用符剥がしの
  `substring` が "NULL" から作っていたもの）。**説明できない差分 0 行**（使い捨ての検算
  スクリプトで 1 行ずつ突き合わせた。リポジトリには残していない）
- `tests/golden/ddl-input/` 4 本は `<default>NULL</default>` の **32 行削除のみ**、
  `tests/golden/state/` 5 本は `"def": null` → `"def": ""` の **35 箇所のみ**、
  **`tests/golden/json/` は無差分**（4-2 が #2 を JSON 経路に持ち込んでいないことの検算）
- `npm test` **158 passed** / 21 skipped（node 側は golden 比較なので件数不変）、
  `test:browser` **139 passed**（136 から +3 ＝ 反転 1・UI 正規化 1・旧ファイル互換 1）、
  `test:dist` 3 passed、`known-issues` **5 passed**（6 から -1）、`typecheck` 0 error
- **対話パスの一巡は `npm run dev`（4173）と `npm run preview`（4174）の両方で 8/8・
  pageerror 0 件**（使い捨ての Playwright スクリプト）。実 UI のボタンだけを踏んで、
  展開直後の default 欄が空欄であること・空のまま閉じても "NULL" と打っても保存 JSON に
  `default` キーが出ないこと・NOT NULL 行の `now()` は従来どおり出ること・`#clientsql` の
  DDL に ` DEFAULT NULL` が出ないことを確認した

#### known-issues の残り

**§4 が引き受けた known-issue はこれで尽きた**（#1 / #7 / #8 が 4-4、#2 が 4-5）。残る 5 本は
#3 / #4 が §6.1（型パレット差し替え）、#5 / #6 が §6.3（`output.xsl` の TS 化）、#9 が §5.2
（introspection）。なお **#5（空の `<default>` で ` DEFAULT ` だけが残る）は、書き出し側では
本段階で構造的に起きなくなった** —— `if (row.def)` は `""` を落とすため。残っているのは
introspection の出力（外部由来の XML）を直接 XSLT に食わせる経路だけで、直すのは §6.3 のまま。

**次段階（4-6）への入力**。外部変更検知（save/load 境界の楽観的並行制御）。本段階までで
**書き出し側の形式の話は終わり**、4-6 は「いつ読み直すか」の話になる。§4 の残りは 4-6 と
4-7（仕上げ・`docs/FORMAT.md` の総点検・known-issues 棚卸し）の 2 本。

### 2026-08-15 HANDOVER §4「IO」段階4-6 — 外部変更検知を入れた

§4 の 12 本目。**server への保存を read-before-write にした**段階。正本は git 管理のファイルなので、
他人の PR を `git pull` で取り込んだ後に古い編集状態のまま保存すると相手の変更が黙って消える ——
HANDOVER §4 の「ファイルが app 外で変化したら検知し再読込を促す。古い編集状態でファイルを
上書きしない」がこれを指している。**F2（quicksave）が無言で上書きしていた経路が塞がる**のが実際の効き目。

#### 決めたこと 1: 手は read-before-write しかない（backend には触らない）

現行 PHP は `save` が 201 空 body、`load` が保存バイト列をそのまま返すだけで、**ETag も
Last-Modified も返さない**（ARCHITECTURE §4.3 の実測）。条件付き更新の手がかりが応答に無いので、
**save の直前に同じ `keyword` で `load` を投げて比べる**のが上限になる。PHP に mtime を返す action を
足す案は取らない（CLAUDE.md 制約6「捨てる資産に投資しない」。4-3b で `.json` をフロント側で
付けたのと同じ立場）。

**TOCTOU の窓は残る** —— プリフライトの load と save の間に他者が書けば、そちらが負ける。これは
backend 側の条件付き更新でしか閉じないので、ETag + `If-Match`（不一致は 412）を §5.1 へ申し送った
（ARCHITECTURE §4.3 にも書いた）。**プリフライトはそこで 1 往復に畳める**。

#### 決めたこと 2: 判定は純関数、UI と通信は js/io.ts

[`frontend/js/io/conflict.ts`](frontend/js/io/conflict.ts) が `verdictForSave(baseline, name, server)` を返すだけの
純関数で（`absent` / `clean` / `exists` / `conflict`）、confirm を出すかどうかも、プリフライトを
投げるかどうかも知らない。文言は locale を通す必要があるので呼び手側 —— `js/io/` 配下は locale を
通さない規約（[`frontend/js/io/json-parser.ts`](frontend/js/io/json-parser.ts) の冒頭）に従った。

台帳（`IO.baseline`）は **keyword ごとの Map にせず 1 本だけ**持つ。「今の編集セッションの派生元」
という意味づけで、別名へ保存すれば派生元も移る。Map にしても比較相手は毎回サーバの現物なので
取りこぼしは出ず、状態が 1 つで済むほうがテストが読める。

#### 決めたこと 3: 衝突は既定で中止、`confirm` で強制上書きを許す

「読み直してください」で終わらせると手元の編集を捨てるしかなくなる。正本は git なので上書きしても
復元できる —— ただし**無言では通さない**。同じ理由で、**まだ一度も読んでいない名前に実体があるとき**
（＝他人／別セッションのファイルを踏む）も確認を出す。現行は黙って上書きしていたが、プリフライトの
応答をそのまま使えるので追加コストは 0。

#### 決めたこと 4: プリフライトの 404 は素通し、500 系は中止

404 は正常系（新規保存）なので `check()` に通さない —— 通すと textarea に「Not Found」が出て、
保存に失敗したように見える。逆に 500 / 501 / 503 は `check()` に通して**中止**する。読めなかったものを
「無かったこと」にして上書きするのは、本機能が防ぎたいことそのもの。`verdictForSave()` も
**404 以外はすべて実体ありに倒す**（安全側）ので、万一そこへ落ちても上書きにはならない。

なお **200 で本文を返す壊れた backend**（MySQL に繋がらない `php-mysql` がこれ）は `exists` に倒れ、
上書き前に confirm が出る。実測で確認した。

#### 決めたこと 5: ベースラインは「観測したバイト列」

`loadresponse` は**読めたかどうかに関わらず**、届いたバイト列を派生元に載せる。壊れた JSON でも
「サーバ上の版はこれ」は事実で、次の保存でそれを黙って上書きしないための記録になる。`loadDesignText()`
の戻り値契約（void）を触らずに済むので、読込 5 経路に手が入らないという利点もある。

#### 検証

- `git diff tests/golden/` は空（4-0a の分割表の予測どおり。golden 85 本は
  [`frontend/js/io.ts`](frontend/js/io.ts) を通らない）
- `npm test` **179 passed** / 21 skipped（158 から +21 ＝ `conflict.test.ts` 9 本・
  `io-ui.test.ts` の 4-6 分 12 本）、`test:browser` **139 passed**・`test:dist` 3 passed・
  `known-issues` **5 passed**（いずれも件数不変）、`typecheck` 0 error
- 既存の serversave 3 本は**書き換えた**（削除していない）。save が 2 往復になったので
  「1 本目が load、2 本目が save」に読み替え、`.json` の二重付与はプリフライトと save の両方で見る
- **実 PHP backend との一巡 12/12・pageerror 0 件**（使い捨ての Playwright スクリプト）。
  `php:8.3-cli` を Docker で起こし、`vite build --base=./` した `dist/` を同じ PHP から配信して
  `xhrpath=../` で `backend/php-file` に繋いだ。実 UI のボタンだけを踏んで確認したのは:
  新規保存で `data/<name>.json` ができること・**ホスト側でファイルを書き換えてから F2 を押すと
  confirm が出て、断ればファイルが 1 バイトも変わらないこと**・承諾すれば上書きされること・
  読み直した後の保存は確認なしで通ること・一度も読んでいない名前に実体があれば確認が出ること
- dev（4173）/ preview（4174）でも server 経路以外の一巡 **11/11・pageerror 0 件**

この過程で分かった操作手順を 1 つ記録する: **backend セレクタは io ダイアログを開くたびに
`IO.click()` → `build()` が作り直す**ので、選択は「開いた後」に行わないと `DEFAULT_BACKEND`
（`php-mysql`）に戻る。4-0a の記録にある `#addtable` / `#clientload` の癖と同じ類。

**次段階（4-7）への入力**。§4 の最後は仕上げ —— `docs/FORMAT.md` の総点検、known-issues の棚卸し、
`js/io/` 配下の見取り図。4-6 で `js/io/` が 11 本になり、**読み込み方向（detect / xml-parser /
json-parser / apply）・書き出し方向（json-serializer / json-format / ddl-xml）・その他（model /
palette / extract / conflict）**の 3 つに割れているので、その線を文書に落とす。

### 2026-08-15 HANDOVER §4「IO」段階4-7 — §4 を閉じた（仕上げ）

§4 の 13 本目で最後の 1 本。**`js/` を 1 行も触らず、文書を実測に合わせた**段階
（4-0a の分割表の「仕上げ・golden 不変」）。中身は 4-6 の申し送りどおり 3 つ ——
`docs/FORMAT.md` の総点検・known-issues の棚卸し・`js/io/` 11 本の見取り図。
これに **§4 を機械的に閉じる表**（下記）を足した。

#### HANDOVER §4 の要件はすべて実装に落ちている

| # | HANDOVER §4 の要求 | 実装 | 根拠になるテスト | 入った段階 |
|---|---|---|---|---|
| 1 | 全入出力を JSON に統一（YAML 不採用） | 保存 5 経路すべてが [`frontend/js/io/json-serializer.ts`](frontend/js/io/json-serializer.ts)、読み込みは [`frontend/js/io/detect.ts`](frontend/js/io/detect.ts) が振り分け | `tests/node/io-ui.test.ts` / `tests/browser/io-ui.spec.ts` | 4-3b |
| 2 | `serialize` / `deserialize` を `io/` に集約 | `js/io/` 11 本。描画クラスに `toXML` / `fromXML` は 1 つも残っていない | 状態スナップショット golden 8 本 | 4-1a / 4-1b |
| 3 | 決定論出力（キー順・配列順・2 スペース・改行区切り） | キー順の契約は [`frontend/js/io/json-format.ts`](frontend/js/io/json-format.ts) の宣言順。**DDL 入力 XML も 4-4 で決定論になった**（`<!-- Active URL -->` と `<datatypes>` 全文の撤去） | 「同一モデル → 2 回の出力が一致」／「環境依存が出力に現れない」 | 4-2 / 4-4 |
| 4 | round-trip ＋「同じモデル → 同じ文字列」 | `toJson` / `fromJson` を 3 周させて 1・2・3 回目が一致 | `tests/node/json.test.ts` / `tests/browser/json.spec.ts` | 4-2 |
| 5 | diff フレンドリー（1 テーブル = 独立ブロック） | テーブル追加で既存部分が 1 バイトも動かない | `tests/browser/json.spec.ts` の diff テスト | 4-2 |
| 6 | 外部変更検知（古い編集状態で上書きしない） | server 経路の save が read-before-write。判定は [`frontend/js/io/conflict.ts`](frontend/js/io/conflict.ts) の純関数 | `tests/node/conflict.test.ts` ＋ 仮想 backend の往復 | 4-6 |
| 7 | XML は読込専用（書き出しは撤去） | ユーザーに見える保存経路から消え、[`frontend/js/io/ddl-xml.ts`](frontend/js/io/ddl-xml.ts) は `output.xsl` への中間表現としてだけ残る | DDL golden 63 本 ＋ DDL 入力 golden 7 本 | 4-3a / 4-3b |
| 8 | `formatVersion` を付け `docs/` に文書化 | `formatVersion: 2`（版 1 は移行コマンドを名指しして拒む）。散文は [`docs/FORMAT.md`](docs/FORMAT.md) | `tests/node/migrate-design.test.ts` ほか | 4-2 / 4-2b |

**未着手の要求は 1 つも無い。** §4 が引き受けなかったもの（条件付き更新・型パレットの現代化・
`output.xsl` の TS 化）はいずれも HANDOVER が別の節に置いているもので、下の申し送りに集めた。

#### 決めたこと 1: 見取り図は `ARCHITECTURE.md` §5.6 に置く（`FORMAT.md` ではない）

2 つの文書の役割が違う。`FORMAT.md` は**正本フォーマットの仕様**（他プロダクトのリポジトリで
`schema/*.json` を読む人が見る）で、`ARCHITECTURE.md` は**この作業リポジトリの構成**
（§5.5 が §3 の `.ts` 化進捗を持っている）。`js/io/` の内部分割は後者で、しかも
§6.3 で `ddl-xml.ts` が消えるように**これから動く**情報なので、外向きの仕様書に混ぜない。

各ファイルの散文はヘッダコメントが既に持っているので、§5.6 は**役割 1 行と境界の規約 4 つ**に絞った
（複製すると必ず片方が腐る）。規約は 4-1a / 4-1b / 4-3b で決めたものを言い直しただけで、新しい決定は無い。

#### 決めたこと 2: known-issues の表に「経路」列を足す（テストは触らない）

残る 5 本はどれも現象が消えていないが、**§4 を通したことで 3 本は届く範囲が狭まっている**。
これが表から読めないと、§6 で直すときに「まだ全経路で起きる」前提の作業見積りになる。

- **#3 / #4 は設計 JSON では起きない。** 型キーが安定 `id` になり（4-2b）、
  [`frontend/js/io/json-parser.ts`](frontend/js/io/json-parser.ts) はパレットに無い id を throw する。
  残るのは互換で読む XML 経路（[`frontend/js/io/xml-parser.ts`](frontend/js/io/xml-parser.ts)）だけで、そこは
  「現行の挙動を 1 バイトも変えない」逐語移設が要件なので**意図して直していない**。
- **#5 は書き出し側では構造的に起きない**（4-5。`if (row.def)` が `""` を落とす）。残るのは
  introspection の出力を直接 XSLT に食わせる経路。

テストのアサートは 1 つも変えていない（現象は生きているので緑のまま）。触ったのは**原因を指す
コメント 2 行**で、`js/row.js:472-479` / `js/row.js:455` を
`js/io/xml-parser.ts:147-153` / `:125` に貼り直した —— 4-1b の移設で 2 世代古くなっていた。

#### 決めたこと 3: 過去の決定ログのリンクは直さない

本書の相対リンクは 25 本が実在しないパスを指している（`js/oz.js` / `js/table.js` /
`types/globals.d.ts` / `js/io/xml-serializer.ts` など）。**直さない。** 本書は時系列の決定ログで、
段階3-1 の記録が `js/oz.js` を指すのは**当時それが事実だった**から。現行ファイルに貼り替えると
行番号アンカーが別の場所を指し、記録としては嘘になる。

そのかわり**「現在を説明する文書」では 0 本にする** —— `docs/` 3 本と
`tests/known-issues/README.md` 4 本を直した（下記）。以後リンクの実在確認は
「`docs/` と `tests/` で欠落 0、`CUSTOMIZATIONS.md` は対象外」で回す。

#### 総点検で見つかった食い違い 3 件（いずれも文書側を直した）

| # | 文書 | 書いてあったこと | 実測 |
|---|---|---|---|
| 1 | `docs/FORMAT.md` | `keys[].type` は `PRIMARY` / `UNIQUE` / `INDEX` の 3 つ | **UI が作るのは 4 つ**（`FULLTEXT` がある。[`frontend/js/keymanager.ts`](frontend/js/keymanager.ts)）。しかも parser も serializer も**値を検査しない**（文字列であることだけ見る） |
| 2 | `docs/TESTING.md` | `npm run typecheck` は「`src/ tests/ types/`、`js/` は `checkJs: false` で対象外」 | [`tsconfig.json`](tsconfig.json) の `include` は `js/ src/ tests/ *.config.ts`。**`types/` は段階3-3b で削除済み**で、`js/` は全部 `.ts` なので当然対象 |
| 3 | 3 文書 | `js/row.js` / `js/config.js` / `types/globals.d.ts` へのリンク 7 本 | §3 で `.ts` 化・削除済み |

1 について、`FULLTEXT` と `INDEX` は PostgreSQL では `ADD CONSTRAINT <table>_pkey KEY (...)` に
落ちる（不正な SQL）。**known-issue には足していない** —— #6（制約名の衝突）と同じ
`db/postgresql/output.xsl` の同じ `xsl:for-each` の粗さで、#6 の fixture が既にこの経路を踏んでおり、
§6.3 で制約名を直す作業が必ずここを通る。テストを 1 本足すより `docs/FORMAT.md` の
`tables[].keys[]` に書いておくほうが、直す人の目に入る。

#### §5 / §6 への申し送り（§4 が送ったものを 1 か所に集める）

| 送り先 | 中身 | 出所 |
|---|---|---|
| §5.1（backend） | **ETag ＋ `If-Match`（不一致は 412）**。プリフライトの load と save の間の TOCTOU はフロントでは閉じない。入れば**保存は 1 往復に畳める** | 4-6 |
| §5.1 | **`.json` 拡張子の強制**（`.json` 以外の save を拒む・`list` は `*.json` だけを返す）。正本ディレクトリの責務 | 4-3b |
| §5.2（introspection） | JSON 化。known-issue #9（PG18 実出力が well-formed でない・index が出ない） | 4-0a の実測 / ARCHITECTURE §4.6 |
| §6.1（型パレット） | known-issues #3 / #4。**パレット差し替えと設計ファイルの移行は同じ PR で**（分けるとリポジトリの設計ファイルが読めない期間ができる＝制約1 違反）。移行表の形は 6-1 の着手時に決める | 4-2b |
| §6.1 | `palette.ts` の型解決の再設計（`getTypeIndex` / `getFKTypeFor` の sql・re 照合）。4-0b は**意図してキャッシュ寿命を変えなかった** | 4-0b |
| §6.3（エクスポート規約） | `output.xsl` の TS 化。これで [`frontend/js/io/ddl-xml.ts`](frontend/js/io/ddl-xml.ts) が**モジュールごと消える**。known-issues #5 / #6 ＋ 上の key type の `KEY (` 落ち | 4-0a / 4-1a |
| §2（Docker） | `js/io.ts`（823 行の UI・通信層）を含む `js/` の `frontend/` への集約 | 4-0a |

#### 検証

- **`js/` の差分は 0 行**（`git diff --stat` の対象は `docs/*.md` 3 本・`CUSTOMIZATIONS.md`・
  `tests/known-issues/` 2 本だけ）
- `git diff tests/golden/` と `git status --porcelain tests/golden/` がどちらも空
- `npm test` **179 passed** / 21 skipped、`test:browser` **139 passed**、`test:dist` 3 passed、
  `known-issues` **5 passed**、`typecheck` 0 error（**すべて 4-6 から件数不変**）
- リンクの実在確認（使い捨てスクリプト。リポジトリには残していない）: 着手前 32 本欠落 →
  完了時 **`docs/` と `tests/` で 0 本**、残る 25 本はすべて本書の過去エントリ（決めたこと 3）
- **対話パスの一巡は行っていない。** `js/` を 1 行も触らないため（4-4 と同じ立場）

**次段階への入力 —— §4 はここで終わり、次は §6.1（PostgreSQL 18 型パレット）**。
HANDOVER §9 の順序（`§4 IO → §6 機能 → §5 backend`）どおり。§6.1 が最初に踏むのは
上の申し送り表の 2 行で、**known-issues #3 / #4 がそこで赤くなる**（`tests/known-issues/README.md`
の運用 1〜4 に従い、直ったことを本書に記録してからテストを書き換える）。
`uuid` が入ると house 既定の PK（`id uuid DEFAULT uuidv7()`）が INTEGER に落ちなくなるので、
**DDL golden が §4 全体より大きく動く段階**になる —— 4-5（16 ファイル・128 行）が
「説明できる差分だけ」で通ったのと同じやり方で、差分の全行に根拠を付けられる粒度に割ること。

---

### 2026-08-15 プロジェクトの目的を記録する —— 公開プロダクト（無料 OSS）であること

**本書に目的が書かれていなかった。** grabado は **会社のブランディングとして無料公開する OSS**
（収益化しない）であり、同時に自社でも使う道具。しかし本書にも [`docs/HANDOVER.md`](docs/HANDOVER.md)
にも [`CLAUDE.md`](CLAUDE.md) にもこれが無く、逆に**社内ツール前提の記述が正本として残っていた**。

#### 何が起きたか

§6.1（型パレット）の計画を組む際、リポジトリに残る記録だけを読むと対応 DB の根拠は
**本書 §7 の 1 行**（「golden の対象は全 9 DB プロファイル。house 到達点は PostgreSQL のみだが、
…他プロファイルの撤去判断を後回しにできるため」）しか無い。ここから
**「PG だけ現代化して非 PG 8 本は撤去する」という誤った計画**を組みかけた。

別セッションで決めていた **「主要 DB を対象にする」「`sql-standard` / `mariadb` / `h2` を追加する」**
は本書にもプロジェクトメモリにも記録されておらず、全文検索で 0 件だった。

**記録されていない決定は、セッションをまたぐと存在しないのと同じ。** CLAUDE.md は「迷ったら…決定を
`CUSTOMIZATIONS.md` に記録する」と定めているが、**目的そのものと対応 DB の 2 つがこれを免れていた**。
再発を防ぐため、今回は本書に加えて**プロジェクトメモリにも書いた**（本書はリポジトリの記録、
メモリはセッション横断の記録で、役割が違う）。

#### 目的から導かれる前提の転換

| 論点 | 社内ツール前提（誤った最適化） | 公開プロダクト前提（正） |
|---|---|---|
| 対応 DB | house が使う PG だけ整えれば十分 | **対応を謳う DB はすべて同じ品質水準**。幅が製品価値 |
| 非 PG の壊れた出力 | 撤去の根拠になる | **修正すべき欠陥**（公開すればバグ報告が来る） |
| DB 別 fixture | 見送り可 | 製品品質の必須要件 |
| §6.3 `output.xsl` の TS 化 | 保守の都合・後回し | **対応 DB を増やす基盤＝製品価値の源泉**。優先度が上がる |
| README / docs | 日本語の内部文書でよい | 英語の公開ドキュメントが要る |
| Railway | 任意・従 | 公開デモ＝ブランディングの主戦場 |

#### 1 世代古くなっていた決定 3 つ（本書の中で更新する）

| 記録 | 内容 | 更新 |
|---|---|---|
| 2026-08-09「リポジトリの起点と公開範囲」 | 「**社内ツールとして private が必要**」を private 化の理由に挙げていた | 公開が目的なので前提が変わる。**公開範囲の選別**が要る（本書には org 名・house 標準・社内運用が含まれる） |
| 2026-08-09「§7 特性化テスト」 | 「house 到達点は PostgreSQL のみ／他プロファイルの撤去判断は後回し」 | 対応 DB は下のエントリで確定 |
| 2026-08-09「ライセンス」 | 「自社改変部分の権利表記は**今後の配布形態確定時に追記**」 | **無料公開の確定＝その時**。`license.txt` は Copyright が `2005-2012 Ondrej Zara` のみで自社改変部分が無い |

#### 無料公開が決めること

- **ライセンスは BSD-3-Clause 継承のまま**（デュアルライセンス・商用制限は不要）。ただし 3 条項目
  「派生物の宣伝に元の作者名を使わない」が効く —— **ベースにしている事実の記載は必須**
  （著作権表示の保持義務）だが、**upstream 作者の公認と読める書き方はできない**
- **公開デモは `READONLY` 一択**。AI 機能（§11）を有効にすると API 費用が自社の垂れ流しになり、
  introspection（§5.2）は任意ホストへ接続を試みるので **SSRF の踏み台**になる。両方 `READONLY=true`
  で無効化される既存設計は正しい
- **それでもデモは成立する** —— 編集ストアはブラウザ内なので READONLY でも「描いて DDL を出す」体験は
  完全に提供できる。落ちるのはファイル保存・introspection・AI だけ。**サーバにユーザーデータが
  残らない**ためプライバシーポリシーが簡潔に書ける
- **特定商取引法の表記は不要**（無料・対価なし）

#### 必要な文書

| 層 | 文書 | 要否 |
|---|---|---|
| 利用者向け | README（全面書き直し・英語）、起動手順、対応 DB と型の一覧、`FORMAT.md` の公開版 | **必須** |
| 法務 | `LICENSE`（BSD 継承 ＋ 自社改変の表記）、第三者ライセンス表記 | **必須** |
| 法務 | `SECURITY.md`（脆弱性報告窓口） | **必須**（org 分類 B） |
| OSS 運営 | `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / Issue・PR テンプレート | 推奨 |
| デモ公開時 | 利用規約・プライバシーポリシー・Cookie ポリシー | **デモを出すなら必須・要法務確認** |

Cookie は現行コードが実際に使っている（db 選択・locale）。`.dev` で世界公開する以上 EU からの
アクセスがありうるので、Cookie とアクセスログ（IP）の扱いは開示対象。**法令判断は法務に確認する**
（本書では要否の洗い出しまで）。

#### 公開の 3 段階

| Phase | 内容 | 前提 |
|---|---|---|
| 1 | リポジトリ公開（README / LICENSE / SECURITY / CONTRIBUTING） | **今すぐ可能**（テスト緑・コードは動く）。ただし本書の**公開範囲の選別**が要る |
| 2 | Docker イメージ配布 | §2 マルチステージ化 ＝ §5 backend が要る |
| 3 | 公開デモ（grabado.dev・`READONLY`） | Phase 2 の後。利用規約・プライバシーポリシーが要る |

#### `HANDOVER.md` との齟齬（本体の改訂は別 PR）

| 箇所 | 現行の記述 | 齟齬 |
|---|---|---|
| 冒頭・§1 | 「社内版」「各自ローカル稼働」 | 目的（公開プロダクト）が無い |
| §1・§2.3 | 「Railway は**任意・従**」「共有サーバ常設は主経路ではない」 | 公開デモはブランディングの主戦場 |
| §6.1 | 型パレットは PostgreSQL 18 のみ | 対応 DB は 8 本（下のエントリ） |
| §6.2・§6.3 | house 既定（`uuidv7` / 複数形 / `fk_` / `idx_`）を前提 | **公開ユーザーに house 規約を強制するか**の判断が要る（「意見のあるツール」として既定にするか、設定可能にするか。§6.2 / §6.3 の着手時に決める） |
| §8 | ドキュメントは `ARCHITECTURE.md` / `CUSTOMIZATIONS.md` の内部 2 本 | 公開文書（README・利用者向け）が無い |
| §9 | 実装順序に公開準備が無い | Phase 1 の位置づけが要る |
| §11.5 | プライバシーは「送信前の匿名化オプション」まで | 公開デモでの AI 無効化を明記すべき |
| §10 | 確定事項に目的が無い | 本エントリで確定 |

#### 現状が明確に不適切な 2 件（§6 の完了を待たず着手してよい）

1. **[`README.md`](README.md) に upstream 作者宛の PayPal 寄付ボタンが残っている**（14 行）。
   自社ブランドで公開する画面に載ると事故。2012 年のリリースノート・Google Code の話・
   CUBRID 紹介文も upstream のまま
2. **`license.txt` の権利表記**が upstream のみ（上表のとおり）

---

### 2026-08-15 HANDOVER §6「機能」段階6-0 —— 対応 DB を確定し、§6 を分割する

§6 の 1 本目。**文書のみで `js/` は 0 行**（§4 の 4-0a が §4 の分割表を作ったのと同じ位置づけ）。

#### 決めたこと 1: 対応 DB は 8 本（既存 5 ＋ 新設 3）、4 本を撤去する

| プロファイル | 実体 | 状態 |
|---|---|---|
| `postgresql` | PostgreSQL 18 | 対象・**house 標準**（最初に現代化） |
| `mysql` | MySQL | 対象 |
| `mariadb` | MariaDB | **新設** |
| `mssql` | SQL Server | 対象 |
| `oracle` | Oracle | 対象 |
| `sqlite` | SQLite | 対象 |
| `h2` | H2（Spring Boot のテスト用途） | **新設** |
| `sql-standard` | ANSI SQL（ベンダ非依存） | **新設** |
| `cubrid` | CUBRID（ニッチ） | **撤去** |
| `vfp9` | Visual FoxPro 9（2015 年 EOL・出力は FoxPro の PRG） | **撤去** |
| `web2py` | web2py の DAL（実質終了・出力は Python コード） | **撤去** |
| `sqlalchemy` | Python ORM（**現役・巨大**） | **撤去して §6.3 で作り直す** |

**撤去の意味づけは「捨てる」ではなく「XSLT のまま延命せず、§6.3 の TS 生成器の上で作り直す」。**
`sqlalchemy` は「ER 図から ORM モデルを生成する」という出力カテゴリの 1 本目で、公開プロダクトの
差別化要素になる（house が Kotlin/Spring Boot なので **JPA entity 生成**は自社利用でも効く。
TypeScript の Prisma / Drizzle も訴求が大きい）。XSLT 実装は `position()` / `last()` のバグで
Node 回帰から既に外れており、延命より作り直しが速い。**黙って消さない**ための記録がこの段落。

#### 決めたこと 2: 現状の非 PG 出力は製品品質に達していない（実測）

fixture は PG 用に書かれており（`types-matrix.xml` は PG パレット網羅として作られた）、
それを 9 DB 全部に流して golden を採っている。他プロファイルで読むと大半の型が**未知型**になり、
先頭型へ落ちた結果がそのまま golden に焼かれている:

| プロファイル | `types-matrix` の未知型 | golden の姿 | 先頭型 |
|---|---|---|---|
| `postgresql` | 0 / 27 | 正しく解決 | Integer |
| `mysql` / `cubrid` | 16 / 27 | mysql は 27 列中 16 列が INTEGER 系 | Integer / Short |
| `oracle` | 18 / 27 | — | INTEGER |
| `mssql` | 22 / 27 | — | TinyInt |
| `sqlite` / `sqlalchemy` / `web2py` | 25 / 27 | — | Text / Integer |
| `vfp9` | **26 / 27** | 27 列中 23 列が INTEGER 系 | INTEGER |

つまり**非 PG の DDL golden 56 本が守っているのは「XSLT が壊れていないこと」と「未知型が先頭型に
落ちること」（＝ known-issue #4 そのもの）だけ**で、その DB の DDL 生成が正しいことは検証していない。
**公開したらそのままバグ報告になる。**

ここから 2 つ従う。**(a) DB 別 fixture の整備は製品品質の必須要件**（PG 用 fixture を全 DB に流す
構造では、どのプロファイルを現代化しても golden が動かず現代化が検証されない）。
**(b) 未知型を throw にするのは現代化済みプロファイルに限る** —— 横断で throw にすると
PG 用 fixture が読めず DDL golden を採れなくなる。「現代化済み ＝ strict / 未現代化 ＝ 従来どおり
フォールバック」をパレット側で表し、**全プロファイルの現代化が終わった時点でこの分岐は消える**。

#### 決めたこと 3: §6 の分割

| 段階 | 目的 | golden への影響 |
|---|---|---|
| 6-0 | 目的と対応 DB の記録・分割表・PG18 パレット案・移行表（本エントリ） | 無し（文書のみ） |
| 6-1 | 撤去 4 本（削除のみ） | 28 本が**消える**。残る 35 本は 1 バイトも動かない |
| 6-2 | 型解決の再設計（`getTypeIndex` / `getFKTypeFor` の `id` 照合化、`sql`/`re` 照合の先勝ち化） | known-issue #3 の分だけ |
| 6-3 | PG18 パレット差し替え ＋ 設計ファイル移行（**同一 PR**） | PG の `ddl` 7・`json` 7・`state` 一部 → **実測は 11 本**（`ddl` 2・`ddl-input` 2・`json` 2・`state` 5）。旧型名を `aka` で受けたので fixture を動かさずに済み、見積りより小さくなった |
| 6-4 | §6.2 初期テーブルテンプレート | PG の一部 |
| 6-5 | §6.3 `output.xsl` の TS 生成器化 | 全対象プロファイル |
| 6-6 | DB 別 fixture の整備 | 母集団の再編 |
| 6-7 | 新設 3 本（`sql-standard` / `mariadb` / `h2`）を TS 生成器の上に載せる（**型マッピングの設計は 2026-08-16 に先行実施済み**。下のエントリ） | 追加 |
| 6-8 | 既存主要 4 本の現代化（`mysql` / `mssql` / `oracle` / `sqlite`） | 各プロファイル |
| 6-9 | ORM 出力の再設計（`sqlalchemy` 復活 ＋ JPA / Prisma / Drizzle の検討） | 追加 |

**新設 3 本を 6-7 に置いたのは、6-5 で `db/<db>/output.xsl` ごと捨てるため。**
いま XSLT で 3 本書くと直後に捨てることになる。

なお 4-2b の時点で [`docs/FORMAT.md`](docs/FORMAT.md) /
[`tools/migrate-design.mjs`](tools/migrate-design.mjs) /
[`tests/node/palette-id.test.ts`](tests/node/palette-id.test.ts) が
「移行表の規則は **6-7** で決める」と書いていたが、これは当時の**仮番号**。実際には
**6-3**（パレット差し替え ＋ 移行）がその段階なので、3 箇所を貼り替えた。

#### 決めたこと 4: PG18 パレット案（24 型）と移行表

現行 29 型から **7 型を撤去し 2 型を追加**、4 型の `sql` を PG18 の正式名に直す。
**`id` は意味が同じなら据え置く**（[`docs/FORMAT.md`](docs/FORMAT.md) の規則 3 が唯一の契約で、
`label` と `sql` は自由に動かしてよい）。

撤去 7 型と移行先:

| 旧 `id` | 旧 `label` / `sql` | 移行先 | 理由 |
|---|---|---|---|
| `serial` | Serial / `SERIAL` | `bigint_identity` | HANDOVER §6.1「`serial`→identity」。**int4 → int8 に広がる**（安全側） |
| `bigserial` | Big Serial / `BIGSERIAL` | `bigint_identity` | 同上（こちらは幅が変わらない） |
| `x_real` | Real / **`BIGINT`** | `bigint` | **実態は `BIGINT` を出力していた**（`label` の Real は upstream の誤記＝ known-issue #3 の本体）。出力を保つほうを採る |
| `char` | Char / `CHAR` | `text` | HANDOVER §6.1「`char(n)`→`text`」。**size が落ちる**（情報の損失を移行表に明記） |
| `timestamp` | Timestamp / `TIMESTAMP` | `timestamp_with_time_zone` | HANDOVER §6.1「`timestamp`→`timestamptz`」。**size は落ちない**（6-3 で訂正。`timestamptz(p)` は秒精度を取れる） |
| `timestamp_without_time_zone` | Timestamp wo/ TZ | `timestamp_with_time_zone` | 同上 |
| `json` | JSON / `JSON` | `jsonb` | HANDOVER §6.1「`json`→`jsonb`」 |

追加 2 型:

| `id` | `label` | `sql` | 備考 |
|---|---|---|---|
| `uuid` | UUID | `UUID` | house 既定 PK。**これが無いことが known-issue #4 の実害**（`house-defaults` の PK が `integer` に落ちている） |
| `bigint_identity` | Big Integer (identity) | `BIGINT GENERATED ALWAYS AS IDENTITY` | `fk="Big Integer"` を付ける —— FK 側は `BIGINT` でなければならない。現行の `serial` が `fk="Integer"` で同じ仕組みを使っている |

`sql` を直す 4 型（`id` は据え置き）:

| `id` | 旧 `sql` | 新 `sql` | 理由 |
|---|---|---|---|
| `decimal` | `DECIMAL` | `NUMERIC` | PG の正式名。`DECIMAL` は別名で**同じ型**なので `id` は変えない |
| `float` | `FLOAT` | `REAL` | PG の単精度は `real`（float4）。`FLOAT` 単独は曖昧 |
| `double` | `DOUBLE` | `DOUBLE PRECISION` | **PG に `DOUBLE` 単独は無い**（現行は不正な SQL を吐いていた） |
| `timestamp_with_time_zone` | `TIMESTAMP WITH TIME ZONE` | `TIMESTAMPTZ` | CLAUDE.md「`timestamptz` 固定」。標準形は `sql-standard` プロファイル（6-7）が持つ |

維持 18 型: `integer` / `smallint` / `bigint` / `varchar` / `text` / `bytea` / `boolean` / `date` /
`time` / `time_with_time_zone` / `interval` / `xml` / `bit` / `varbit` / `inet` / `cidr` /
`geometry` / `jsonb`。

`geometry`（PostGIS 拡張）は**撤去しない** —— 素の PG18 には無い型だが、PostGIS は PG エコシステムで
広く使われており、公開プロダクトとして落とす積極的な理由がない。`xml` / `bit` / `varbit` も同じ。

**配列型 `type[]` と生成列は今回入れない。** どちらも「他の型を修飾する」概念で、`<type>` の列挙
という現行アーキでは表現できない。6-5（TS 生成器）で DDL 表現ごと設計する。

#### 検証

- `js/` の差分は 0 行（本エントリと `docs/` のみ）
- `git status --porcelain tests/golden/` が空
- `npm test` / `test:browser` / `test:dist` / `known-issues` / `typecheck` はすべて件数不変

**次段階への入力 —— 6-1（撤去 4 本）**。削除だけなので残る 5 プロファイルの出力は 1 バイトも動かず、
`git status --porcelain tests/golden/ddl/` に**削除した 4 つ以外が出ないこと**が完了判定になる。
以降の段階で見る golden が 63 → 35 本に減る。

---

### 2026-08-16 HANDOVER §6「機能」段階6-1 —— 対応 DB から 4 本を撤去する

6-0 の分割表の 2 本目。**削除だけ**の段階で、`js/` の実質的な変更は
[`frontend/js/config.ts`](frontend/js/config.ts) の `AVAILABLE_DBS` 1 か所しかない。

消したもの（37 ファイル）:

| 対象 | 数 |
|---|---|
| `db/{cubrid,vfp9,web2py,sqlalchemy}/`（`datatypes.xml` / `output.xsl` ＋ `vfp9` の readme） | 9 |
| `tests/golden/ddl/{cubrid,vfp9,web2py,sqlalchemy}/`（7 fixture × 4） | 28 |

コード側は `AVAILABLE_DBS` から 5 エントリ（`web2py` は 2 回入っていたので重複も同時に消えた）、
[`tests/node/parity-exceptions.ts`](tests/node/parity-exceptions.ts) から 2 エントリ、
[`README.md`](README.md) から upstream の `## Support for CUBRID` の 3 行。

#### 決めたこと 1: 撤去は「捨てる」ではない（6-0 の再掲・実行）

**XSLT のまま延命せず、6-5 の TS 生成器の上で作り直す**というのが 6-0 で決めた意味づけ。
とくに `sqlalchemy` は現役・巨大な ORM で、**6-9 で ORM 出力カテゴリの 1 本目として復活させる**
（house が Kotlin/Spring Boot なので JPA entity 生成は自社利用でも効く）。
この段階の diff だけを見ると 4 本が消えたようにしか見えないので、ここに書いておく。

#### 決めたこと 2: 影響範囲は「削除して赤くなるのが 3 件」で証明した

先にファイルを消し、期待値を直す前に `npm test` を回した。**赤くなったのは正確に 3 件**:

1. `parity 例外がまだ実在する: sqlalchemy`（`useDatatypes()` が ENOENT）
2. `parity 例外がまだ実在する: vfp9`（同上）
3. `x_ 接頭辞は撤去予定の entry にだけ付いている`（期待値配列に `vfp9` 行が残っている）

DDL 本体ループは全緑のまま（`DB_PROFILES` が `readdirSync` で 5 本に縮むため）。
4 件目が出ていたら未把握の依存があったということで、**この 3 件で尽きたこと自体が
「削除以外の影響が無い」ことの機械的な証明**になっている。順序は逆にできない
—— 期待値を先に直すと、`db/sqlalchemy` と `db/vfp9` がまだ在るぶん
**parity 例外が存在する理由そのもの**で赤くなる。

#### 決めたこと 3: この段階に入れなかった 6 件と送り先

6-1 の完了判定は「残る 35 本が 1 バイトも動かない」というバイト単位の主張だけで閉じる。
**削除の必然として発生したのではない変更は、その主張を汚す**ので送った。

| 項目 | 送り先 | 理由 |
|---|---|---|
| `DEFAULT_DB: "mysql"` → `postgresql` | **6-3** | 4 本を消しても `mysql` は残るので、放置して壊れる箇所が 1 つも無い唯一の項目。いま振ると初回ユーザーが最初に触るパレットが **uuid 不在（#4）・`x_real` が `BIGINT`（#3）の未現代化 PG** になる。house 標準を名乗る前に品質が伴っていない。**テストは `DEFAULT_DB` を読まない**（両ハーネスとも `useDatatypes()` で明示指定）ので、これは「テストが止めてくれない変更」でもある |
| `AVAILABLE_DBS` の並び順 | **6-3**（`DEFAULT_DB` と同じ PR） | 並べ替えは `select` の見え方を変える意思決定。行を消すだけなら diff が「4 行消えた」だけになり、挙動不変がレビューで自明になる |
| cookie に撤去 DB が残った場合の防御 | **6-3** | 下の dangling 2 を参照。回復が UI 内で完結する。6-3 は「現在のパレットに無い `id` は例外」というファイル側の非互換を初めて扱う段階なので、`db` 不整合の見せ方をそこで 1 か所にまとめられる |
| backend の `php-cubrid` / `web2py` | **§5** | `AVAILABLE_BACKENDS` は `AVAILABLE_DBS` と別軸。**`backend/cf-mysql` は実体があるのにリストに無い**（実測）ので、リストとディレクトリは元から 1:1 ではない。ここに手を入れると「リストと実体の整合」という別テーマが 6-1 に流入する。§5 で `backend/` ごと消える |
| `.gitattributes` の `db/** -text` → `text eol=lf` | **6-5** | 唯一 CRLF だった `db/vfp9/output.xsl` が消えて根拠は失われたが、改行ポリシーの変更は独立した意思決定。`db/*/output.xsl` ごと消える 6-5 で「`db/` に何が残るか」と一緒に決める。**根拠の文だけは嘘になるので書き直した**（`locale/ko.xml` は今も CRLF なので `locale/** -text` の根拠は残る） |
| `ddl.test.ts` の adapter 2 本 | **6-5** | 実測では現行の母集団に対して両方 no-op（CRLF の XSL は 0 本、残る 35 本の golden に `& < >` は 1 文字も無い）。**しかし根拠は `vfp9`/`sqlalchemy` に閉じていない** —— 4-4 で `&` を含む識別子が書けるようになっており（`tests/known-issues/fixtures/amp-in-name.xml`）、6-6 でその種の入力が正常系に入った瞬間、adapter が無いと Node 側だけがブラウザとずれる。しかも「エンジンの非準拠」ではなく**「移植の回帰」に見える形**で。落とすなら「落として赤くなる仕掛け」を同時に作る必要があり、それは削除より重い |

`README.md` の `## Support for CUBRID` **だけは 6-1 で消した** ——「grabado は CUBRID に対応している」
という記述を CUBRID を消す PR が残すと、**その PR 自身が README を嘘にする**。撤去対象そのものの
説明文なので削除の一部。ただし 6-0 が別件として立てた README の腐り（PayPal 寄付ボタン・
2012 年のリリースノート・Google Code リンク）には触っていない —— 入れると PR の主語が
「対応 DB の撤去」から「README 刷新」に移るため。

#### 決めたこと 4: 6-1 が作った dangling を 2 つ記録する

**(1) `backend/php-cubrid/index.php:37` が消えたファイルを読む。**

```php
@ $datatypes = file("../../db/cubrid/datatypes.xml");
```

`@` が付いているので警告は出ず、`$datatypes` が `false` になって続く `$datatypes[0]`（38 行）が
空になる。実害は「CUBRID 拡張入りの PHP 環境で import を叩いたときだけ `<datatypes>` ブロックが
空になる」で、このリポジトリのどのテストにも無い環境。**§5 で「なぜ壊れているのか」を
再調査させないための 1 行**。

**(2) cookie に撤去済み DB が残っている既存ユーザーは、起動は通るが型に触れない。**
`getOption("db")` は cookie の生値を返すだけで `AVAILABLE_DBS` と照合しない
（[`frontend/js/wwwsqldesigner.ts:335-346`](frontend/js/wwwsqldesigner.ts#L335-L346)）。実ブラウザで実測した:

| | cookie 無し（＝ `DEFAULT_DB` の `mysql`） | cookie `db=cubrid` |
|---|---|---|
| `d.palette.isLoaded()` | `true` | **`false`** |
| `d.palette.db()` | `"mysql"` | **`TypeError: this.element(...).getAttribute is not a function`**（[`frontend/js/io/palette.ts:54`](frontend/js/io/palette.ts#L54)） |
| 起動時の `pageerror` | 0 件 | **0 件**（＝**静かに**通る。画面上は正常に見える） |
| `minimal` を読ませる | テーブル 1 件・例外なし | **`TypeError: this.element(...).getElementsByTagName is not a function`**・テーブル 0 件・alert も出ない |

経路は `requestDB()`（193-202）が `db/cubrid/datatypes.xml` を 404 で引き、`dbResponse()`（204-212）が
`xmlDoc` の falsy を見て `setRoot` を飛ばし、`flag` だけ減らして `init2()` へ進むこと。
**パレット未設定のまま起動が完了する。**

**回復は UI 内で完結する**（これが 6-3 に送れる根拠）。実測:

- Options ダイアログはパレットに触れずに開ける（`js/options.ts` の依存は `CONFIG` と `_()` だけ）
- `select` は `AVAILABLE_DBS` から作られ、`cubrid` に一致が無いので `selectedIndex` は 0 のまま
  ＝ **先頭の `mysql` が選択された状態で表示される**
- そのまま OK → リロードで `palette.isLoaded() = true` / `db = mysql` に復帰

「二度と開けない正本ファイル」型の非可逆な壊れ方ではない。ただし**エラーが 1 つも出ずに
ボタンだけが効かなくなる**ので、体験としては TypeError が見えるより分かりにくい。
6-3 で防御を入れるときは `getOption()`（全設定キー共通の入口で「cookie の生値を返す」契約）ではなく
**`requestDB()` 側**に置くこと —— `Options.save()` 経由の値は常に妥当なので、守るべきは起動時の 1 経路だけ。

#### 検証

削除の完了判定（6-0 が指定したもの）:

```
$ git diff --name-status develop --diff-filter=D | wc -l        # 37（db 9 + golden 28）
$ git status --porcelain tests/golden/ddl/ | grep -v '^D '      # 出力なし
$ git ls-files tests/golden/ddl | wc -l                         # 35
$ git ls-files tests/golden/ddl | cut -d/ -f4 | sort -u         # mssql mysql oracle postgresql sqlite
$ git ls-files db | cut -d/ -f2 | sort -u                       # 同上 5 行
```

**`npm run golden:update` で実ブラウザから採り直しても `tests/golden/ddl/` は 1 バイトも動かなかった**
（`D` 以外の行が 0）。「触っていない」ではなく「削除が残るプロファイルの出力に影響していない」ことを
実行系で確かめている。`tests/golden/README.md` の `M` は本段階で数値を直したドキュメント。

テスト件数（左が `develop`、右が本段階）:

| | 前 | 後 |
|---|---|---|
| `npm test` | 179 passed / 21 skipped（200） | **151 passed / 7 skipped（158）** |
| `npm run test:browser` | 139 passed | **111 passed**（DDL が 63 → 35） |
| `npm run known-issues` | 5 passed | 5 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

skip が 21 → 7 になったのは parity 例外が 3 DB → `oracle` 1 本に減ったため。
`npm run test:dist` は毎回 `vite build`（`emptyOutDir`）を通るので `dist/db/` も 5 本になっている。

UI（`js/options.ts` に自動テストが無い唯一の面）は dev server ＋ 実ブラウザで実測:
**設定ダイアログの DB `select` は 5 件**（`mysql` / `sqlite` / `mssql` / `postgresql` / `oracle`、
`AVAILABLE_DBS` の並び順どおり）、`pageerror` 0 件。

**次段階への入力 —— 6-2（型解決の再設計）**。`getTypeIndex` / `getFKTypeFor` を `id` 照合にし、
`sql` / `re` 照合を先勝ちにする段階で、golden が動くのは known-issue #3 の分だけ。
6-1 が残した `x_` は `postgresql: x_real` の 1 件で、これは #3 の本体そのもの
（[`tests/node/palette-id.test.ts`](tests/node/palette-id.test.ts) がリテラルで押さえている）。
6-3 の PG18 パレット差し替えで 0 件になる。

---

### 2026-08-16 HANDOVER §6「機能」段階6-7（設計先行）—— `sql-standard` / `mariadb` / `h2` の型マッピングを確定する

**設計だけを 6-7 から切り出して先に確定する。** 実装（型パレット ＋ 生成器）は 6-7 のまま。
`db/` にファイルは 1 つも置かない（本エントリの差分は本書だけ）。

#### なぜ「パレットだけ先に作る」ではないのか

新設 3 本を前倒しする案を検討し、**パレットだけ置くのはきれいに切れない**と分かった。

1. **パレットだけでは DDL が出ない。** [`frontend/js/io.ts`](frontend/js/io.ts) の `finish()` が
   `db/<db>/output.xsl` を読むので、UI の db セレクタに出るのに DDL 生成が 404 になる
   ＝ 半移行を UI に晒す（CLAUDE.md 制約1）
2. **`ddl.test.ts` が赤くなる。** `DB_PROFILES`（`db/` のディレクトリ実体）× `DDL_FIXTURES` で
   回るので、`output.xsl` を持たないプロファイルを置いた瞬間に落ちる。skip の仕掛けを足すと、
   6-1 の撤去で減らした複雑さが戻る
3. **パレットの TS 化は 1 段階に収まらない。** 影響は 15 箇所以上（`palette.ts` 全面・
   `requestDB()` の XHR・`getTypeIndex` / `getFKTypeFor`・`xml-parser`・`row.ts` の型セレクタ・
   両ハーネスの差し替え口・`migrate-design.mjs` の `readPalette()`・`smoke.spec.ts`）。しかも
   [`frontend/js/wwwsqldesigner.ts`](frontend/js/wwwsqldesigner.ts) の `fromXML()` が**古い XML に同梱された
   `<datatypes>` を読む互換経路**を持ち、XHR が消えると「db の変更にはリロードが要る」という
   現行契約自体が変わる

一方**二重投資は思ったより小さい**。XML で書いたパレットを TS に移すのは機械的な形式変換で、
**本体は「その DB に何の型を入れて何を外すか」という設計**。これは形式に依存せず、
6-5（生成器の TS 化）の設計入力としてそのまま効く。だから設計だけ先に確定する。

#### 決めたこと 1: `sql-standard` を基底に置き、各 DB は差分で表す

6-0 で確定した PG18 パレット 24 型を軸に、ANSI SQL（SQL:2016 / SQL:2023）での対応を定めた。
**`id` は 6-0 の PG パレットと同じものを使う**（型キーはプロファイル内で一意なだけでよいが、
同じ意味の型に同じ `id` を振ると差分表が読める）。

| `id` | `sql-standard` | 標準での位置づけ |
|---|---|---|
| `integer` / `smallint` / `bigint` | `INTEGER` / `SMALLINT` / `BIGINT` | 標準 |
| `decimal` | `NUMERIC(p,s)` | 標準（`DECIMAL` も同義） |
| `float` / `double` | `REAL` / `DOUBLE PRECISION` | 標準 |
| `bigint_identity` | `BIGINT GENERATED ALWAYS AS IDENTITY` | SQL:2003 |
| `varchar` | `CHARACTER VARYING(n)` | 標準 |
| `text` | `CHARACTER LARGE OBJECT` | 標準（CLOB） |
| `bytea` | `BINARY LARGE OBJECT` | 標準（BLOB） |
| `boolean` | `BOOLEAN` | SQL:1999 |
| `date` / `time` / `time_with_time_zone` / `interval` | 同名 | 標準 |
| `timestamp_with_time_zone` | `TIMESTAMP WITH TIME ZONE` | 標準（PG だけが `TIMESTAMPTZ` と短縮する） |
| `xml` | `XML` | SQL/XML（SQL:2003 Part 14） |
| `jsonb` | `JSON` | **SQL:2023 で標準化** |
| **`uuid`** | **無し** → `CHARACTER(36)` | **標準に UUID 型は無い** |
| `bit` / `varbit` | 無し | SQL:1999 で導入され **SQL:2003 で削除**された |
| `inet` / `cidr` | 無し | 標準外 |
| `geometry` | 無し | SQL/MM Spatial（ISO 13249-3）は別規格 |

**`uuid` が標準に無いことが house 既定に直接効く。** `id uuid DEFAULT uuidv7()` を
`sql-standard` で出すと `CHARACTER(36)` になり、生成関数も標準には無い。

#### 決めたこと 2: `mariadb` は MySQL のコピーではない（別プロファイルにする根拠）

MySQL との差分が 2 つあり、**どちらも house 既定に関わる**:

| `id` | `mariadb` | MySQL との差 |
|---|---|---|
| **`uuid`** | **`UUID`**（10.7+） | **MySQL には無い**（`CHAR(36)` / `BINARY(16)` 運用） |
| **`inet`** | **`INET4`（10.5+）/ `INET6`（10.10+）** | **MySQL には無い** |
| `bigint_identity` | `BIGINT AUTO_INCREMENT` | 同じ（標準の `GENERATED ALWAYS AS IDENTITY` は両者とも無い） |
| `text` / `bytea` | `LONGTEXT` / `LONGBLOB` | 同じ |
| `boolean` | `BOOLEAN`（`TINYINT(1)` のエイリアス） | 同じ |
| `jsonb` | `JSON`（`LONGTEXT` ＋ `JSON_VALID` 制約） | MySQL はネイティブ JSON 型 |
| **`timestamp_with_time_zone`** | **無し** → `TIMESTAMP` | 同じ。**tz を保持しない**（UTC 変換のみ） |
| `interval` | 無し | 同じ（型ではなく式のみ） |
| `xml` / `varbit` / `cidr` | 無し | 同じ |

#### 決めたこと 3: `h2` は house 既定を完全に受けられる（対象にする実用的な理由）

H2 2.x は標準準拠が高く（1.4 の `IDENTITY` 型は廃止され `GENERATED` 句に統一）、
**house 既定の 4 点がすべてネイティブ**:

| house 既定 | `h2` | 判定 |
|---|---|---|
| `id uuid` | `UUID` | **○ ネイティブ** |
| `bigint identity` | `BIGINT GENERATED ALWAYS AS IDENTITY` | **○ 標準どおり** |
| `created_at timestamptz` | `TIMESTAMP WITH TIME ZONE` | **○** |
| `jsonb` | `JSON`（H2 2.x） | **○** |

無いのは `xml`（→ CLOB）/ `bit` / `varbit` / `inet` / `cidr` のみで、`interval` と `geometry` は持つ。
**PG で設計して H2 でテストする経路が型レベルで通る** —— house が Kotlin/Spring Boot である以上、
これが `h2` を対応 DB に入れる理由そのもの。6-7 の実装時に H2 のバージョンを明示すること
（1.4 と 2.x で型システムが違うため。**特定バージョンを焼き込まず docs を参照する**）。

#### house 既定のスキーマが各 DB で失うもの（製品としての情報）

| | `postgresql` | `h2` | `sql-standard` | `mariadb` | `mysql` |
|---|---|---|---|---|---|
| uuid PK | ○ `UUID` | ○ `UUID` | **× `CHARACTER(36)`** | ○ `UUID` | **× `CHAR(36)`** |
| `uuidv7()` 生成 | ○ PG18 | × | × | × | × |
| 監査列 `timestamptz` | ○ | ○ | ○ | **× tz が落ちる** | **× tz が落ちる** |
| `jsonb` | ○ | ○ `JSON` | ○ `JSON`（SQL:2023） | △ `LONGTEXT` 相当 | ○ |
| identity | ○ | ○ | ○ | △ `AUTO_INCREMENT` | △ |

**この表そのものが公開プロダクトの価値情報**（ユーザーが DB を選ぶときに見る）で、
6-7 の実装後に `docs/` の利用者向けドキュメントへ出す。

#### 6-5（生成器の TS 化）への入力

- **生成器は `sql-standard` を基底に持ち、各プロファイルは差分だけを宣言する構造**にできる。
  後から標準を足すと、5 本分の個別実装ができた後に共通項を抽出する順序になる —— 先に
  標準を定義しておく利点はここ
- **未対応型の扱いは書き出し側の問題**で、6-0 の判断2（読み込み側の「移行表 → throw」）とは別。
  現状は設計 JSON が `db` を持ち読み込み時に照合する（4-2b）ので、「PG の設計を mariadb で開く」
  経路は存在しない。書き出し側のフォールバック規約は 6-5 で決める

#### 将来: プロファイル変換（この表が土台になる）

同じ `id` を全プロファイルで共有する設計にしたので、**「PG で設計して MySQL 用 DDL も出す」変換**が
この表だけで書ける。現状は `db` 照合で拒んでいる（4-2b。**型キーの安全性が `db` 照合に依存**して
いるため）ので、変換を作るなら「拒む」の例外として設計する必要がある。
公開プロダクトとしては訴求の大きい機能なので、6-9 以降の候補として記録しておく。

#### 検証

- **`js/` の差分は 0 行**（本エントリのみ。`db/` にファイルを置かないのが本段階の要点）
- `git status --porcelain tests/golden/` が空
- `npm test` / `test:browser` / `test:dist` / `known-issues` / `typecheck` は 6-1 から件数不変

---

### 2026-08-16 HANDOVER §6「機能」段階6-2 —— 型解決を再設計する

6-0 の分割表の 3 本目（6-7 の設計先行を挟んだので記録の並びは 4 本目）。
**`tests/golden/` は 1 バイトも動いていない。**

#### 決めたこと 1: 6-0 の定義のうち `re` の先勝ち化は 6-8 へ送る

6-0 は 6-2 を「`getTypeIndex` / `getFKTypeFor` の `id` 照合化、**`sql`/`re` 照合の先勝ち化**」と
定義していた。実装に入る前に `re` を先勝ちにした場合の影響を実測したところ、**直す向きが
品質を下げる**と分かったので、`sql` の完全一致どうしの順序だけを 6-2 で直した。

`re` には独立した欠陥が 3 つある。

| # | 欠陥 | 実例 |
|---|---|---|
| 1 | **アンカーされていない**（部分一致） | `postgresql` の `integer` は `re="INT"`。`BIGINT` / `SMALLINT` / `INTERVAL` すべてに当たる |
| 2 | **大文字小文字を区別する** | `postgresql` の `decimal` は `re="numeric"`（小文字）。大文字の `NUMERIC` には当たらず先頭型に落ちる |
| 3 | **`sql` の完全一致を後から上書きする** | `oracle` は `integer`(`sql="INTEGER"`) → `number`(`re="INT"`) の順。`INTEGER` は `NUMBER` に解決される |

素朴に先勝ちへ倒したときに動く golden（実測）:

| 入力 | `postgresql` 現行→提案 | `oracle` 現行→素朴先勝ち | `mssql` 現行→素朴先勝ち |
|---|---|---|---|
| `INTEGER` | 0 → 0 | `NUMBER` → `INTEGER`（改善） | **`bigint` → `tinyint`（縮小）** |
| `BIGINT` | **6 `x_real` → 2 `bigint`** | — | — |
| `FLOAT` | 7 → 7 | 変化なし | **`float` → `money`（別の意味）** |
| `INTERVAL(6)` | 17 → 17 | `NUMBER(6)` → `INTEGER(6)` | **`bigint(6)` → `tinyint(6)`** |

**動く golden は 12 本**（`oracle` 6 ＋ `mssql` 6。`empty` だけがテーブル 0 件で対象外）。
確認は `grep -lE "NUMBER|NCLOB" tests/golden/ddl/oracle/*.sql` と
`grep -lE "\bbigint\b|\bfloat\b|\bnumeric\b" tests/golden/ddl/mssql/*.sql` で、どちらも
`autoincrement` / `house-defaults` / `minimal` / `quotes-i18n` / `relations` / `types-matrix` の 6 本。

**壊れているのは照合順ではなくパレット側の `re`。** `mssql` は `re="INT"` を tinyint / smallint /
int / bigint の **4 型**に、`re="FLOAT"` を money / smallmoney / real / float の 4 型に振っている。
現行の後勝ちが正しく見えるのは「パレットが narrow → wide 順に並んでいる」ことに寄りかかった
**偶然の広い方優先**にすぎず、先勝ちにすると偶然が逆に働くだけ。直す場所は 6-8（既存主要 4 本の
現代化）で、その前に 6-6（DB 別 fixture）が要る —— いまの `oracle` / `mssql` の golden は
PG 用 fixture で採っているので、先勝ちの是非を検証する材料がそもそも無い（6-0 の決めたこと 2）。

**黙って落とさないために known-issue #10 を新設した**（`tests/known-issues/README.md`）。
#3 の記述にあった「`re` もアンカー無しの部分一致」はそちらが引き継いでいる。

#### 決めたこと 2: `fk` を id 参照にし、キャッシュは無効化ではなく廃止する

`getTypeIndex()` は `fk` 属性を **label** で引き、`this.typeIndex[label]!` と非 null アサートして
いた。`docs/FORMAT.md` の規則3 は「`label` と `sql` は §6 が自由に動かしてよい」と保証しているので、
**6-3 が label を動かした瞬間に解決が `undefined` になり `Row.update({type: undefined})` →
`palette.typeAt(undefined)` → `getColor()` で TypeError**（FK 作成が UI ごと落ちる）。
`fk` を持つのは全 5 パレット中 `postgresql` の 2 行だけで、対応する id（`integer` / `bigint`）は
既に在るので、書き換えは 2 か所で済む。

さらに 2 つのキャッシュ（`typeIndex` / `fkTypeFor`）は**一度作られると二度と捨てられなかった**。
`palette.setRoot()` を呼ぶ 3 経路（`dbResponse()` / `Designer.fromXML()` / 両ハーネスの
`useDatatypes()`）のどれも無効化しない。**実装前の `develop` で実ブラウザ実測した**（壊れている
コードごと消えるので恒久テストにはできない。6-1 の dangling 実測と同じ扱い）:

| mysql パレットでの FK 自動生成 | キャッシュ無し（＝正しい） | postgresql のキャッシュが残った状態 |
|---|---|---|
| 親 `INT`（添字 4） | `INT`(4) | **`Integer`(0)** |
| 親 `BIGINT`（添字 5） | `BIGINT`(5) | **`SMALLINT`(2)** |

`BIGINT` の FK が `SMALLINT` になる ＝ **参照が入らない DDL が黙って出る**。経路は
`fkTypeFor[5] = getTypeIndex("Big Integer") = 2`（PG の `bigint` の添字）が mysql の添字 2
（`SMALLINT`）として読まれること。到達性もある —— `Designer.fromXML()` は設計 XML に同梱された
`<datatypes>` でパレットを差し替えるので、「PG で FK を作る → 旧形式 XML を開く」で再現する。

**無効化フックを `setRoot()` に足すのではなく、キャッシュごと廃止した。** `id` 照合にすると
解決は線形走査 1 回（n ≤ 29、呼ばれるのは FK 作成時と親行更新時だけ）でキャッシュの価値が消える。
フックを足せば `setRoot()` に「呼ぶたびに 2 つのキャッシュを捨てる」という永続的な契約が増える。
状態を消すほうが小さく、腐らない。

これに伴い `docs/FORMAT.md` と `js/io/json-parser.ts` の**根拠の文だけ**書き直した ——
4-3b が「JSON 読込でパレットを取り直さない」理由として挙げた 3 つのうち 1 つがこのキャッシュの癖
だったが、残る 2 つ（読込 5 経路の非同期化・cookie の `db` が変わらない半端な状態）で結論は
変わらないので**決定そのものは保つ**（6-1 が `.gitattributes` の根拠文でやったのと同じ）。

#### 決めたこと 3: 型解決を `js/io/palette.ts` に集約する

4-0b は `palette.ts` に「型解決の再設計は §6 の型パレット差し替えと同時に行う」と書き残していた。
その留保は**キャッシュについての留保**で、(2) でキャッシュを廃止すると前提ごと消える。
`Designer.getTypeIndex` / `getFKTypeFor` と `xml-parser.ts` の照合ループに分かれていた 3 つが
`TypePalette.indexOfTypeName` / `fkIndexFor` の 2 本になった。

移さなかったもの: サイズ抽出の正規表現・`quote` 剥がし・**一致無しで先頭型に落ちるフォールバック**。
`indexOfTypeName` は「無ければ -1」を返し、`xml-parser.ts` 側が `if (found !== -1)` で受ける。
known-issue #4 は現在地に 1 行として残り、strict 化を後から足せる形になっている（6-3 / 6-8）。

副産物として 6-7 の見積り（TS パレット化の影響 15 箇所以上）が縮んだ。TS パレットが提供すべき面は
`types` / `typeAt` / `groups` / `idAt` / `indexOfId` / `indexOfTypeName` / `fkIndexFor` / `db` /
`setRoot` / `isLoaded` / `element` に確定している。

#### 決めたこと 4: この段階に入れなかった 4 件と送り先

| 項目 | 送り先 | 理由 |
|---|---|---|
| `re` の先勝ち化・アンカー化・大小文字規則 | **6-8**（fixture は 6-6・strict フラグは 6-3 が先） | 決めたこと 1。known-issue #10 として記録済み |
| known-issue #4（未知型 → 先頭型） | **6-3**（PG）/ **6-8**（他） | 6-2 が触るのは照合規則で、フォールバックは呼び手の判断。同じ PR に入れると「golden が動かない」という主張が PG パレットの差し替えと混ざる |
| `x_real` エントリ自体の削除 | **6-3** | 6-2 は「重複していても観測できない」状態にするだけ。`tests/node/palette-id.test.ts` の `postgresql: x_real` は**動かしていない** |
| `types-matrix.xml` に `BIGINT` を足す | **6-6** | #3 が直ったので正常系に入れられるようになったが、列を足すと DDL golden 5 本と json/state golden の中身が動き「golden が 1 バイトも動かない」という完了判定がぼやける。網羅は `tests/browser/types.spec.ts` が持つ。**除外理由のコメントだけは嘘になるので書き直した** |

#### 6-0 の記録の訂正

6-0 の「追加 2 型」の表は `bigint_identity` に **`fk="Big Integer"` を付ける**と書いていたが、
6-2 以降 `fk` は id 参照なので **`fk="bigint"`** と読む。6-3 が地雷を踏まないよう
`tests/node/palette-id.test.ts` に「`fk` の値は同じパレットに実在する `id`」という検査を足した
（6-1 が仮番号 3 箇所を貼り替えたのと同じ扱いで、表の記述はここで訂正する）。

#### 検証

影響範囲の証明は 6-1 と同じ手法 —— **期待値を 1 行も直さずに全ハーネスを回し、赤の件数を数えた。
赤くなったのは正確に 2 件**:

1. `tests/known-issues/known-issues.spec.ts`（#3 が `"Real"` を期待）→ `"Big Integer"`
2. `tests/browser/json.spec.ts`（XML 往復で `"x_real"` になることを期待）→ `"bigint"`

3 件目が出ていたら未把握の依存があったということで、**この 2 件で尽きたこと自体が「#3 以外に
効いていない」ことの機械的な証明**になっている。ただし順方向だけでは足りない ——
`getFKTypeFor` とキャッシュ寿命は**テストが 0 本なので赤くなりようがない**（6-1 が `DEFAULT_DB` を
「テストが止めてくれない変更」と呼んだのと同じ形）。そこで実装前の実測（決めたこと 2 の表）と、
旧規則の参照実装をテスト内に置く差分テストを足した:

```
$ npx vitest run tests/node/type-resolution.test.ts
  差分テスト: expect(diffs).toEqual(["postgresql/BIGINT: 6 -> 2"])
```

全プロファイル × 全候補名（各パレットの `sql` ∪ `re` ∪ 全 fixture の `<datatype>`。実測 82 種）で
新旧を突き合わせ、**違いが 1 件しか無いこと**を固定している。6-3 で `x_real` が消えるとこの配列は
空になって赤くなる（`palette-id.test.ts` の `x_` 検査と同じ「静かに変わらない」ための仕掛け）。

完了判定:

```
$ for db in $(ls db); do grep -o 'sql="[^"]*"' db/$db/datatypes.xml | sort | uniq -d; done
                                                  # postgresql の sql="BIGINT" だけ
$ grep -n 'fk="' db/*/datatypes.xml               # 2 行。fk="integer" / fk="bigint"
$ npm run golden:update && git status --porcelain tests/golden/
                                                  # README.md（本段階で書き足した注記）以外は出ない
$ git ls-files tests/golden | wc -l               # 58（ddl 35 / ddl-input 7 / json 7 / state 8 / README 1）
```

`getTypeIndex` / `getFKTypeFor` / `typeIndex` / `fkTypeFor` の**実コードとしての参照は 0**
（`grep` に残る 16 件はすべて撤去の経緯を書いたコメント）。

テスト件数（左が `develop`、右が本段階）:

| | 前 | 後 |
|---|---|---|
| `npm test` | 151 passed / 7 skipped | **166 passed / 7 skipped**（`type-resolution` +10・`palette-id` +5） |
| `npm run test:browser` | 111 passed | **115 passed**（`types.spec.ts` +4） |
| `npm run known-issues` | 5 passed | 5 passed（#3 を移設し #10 を新設） |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**FK 自動生成（`rowManager` の対話経路）は本段階まで自動テストが 1 本も通っていなかった。**
fixture 読込は経路が違い、リレーションを対話的に張る操作をどのテストもしていなかったため。
`tests/browser/types.spec.ts` がここを塞いだので、6-3 が label を動かしても気づける。

**次段階への入力 —— 6-3（PG18 パレット差し替え ＋ 設計ファイル移行）**。
`fk` は id 参照になっているので `label` を自由に動かしてよい。追加する `bigint_identity` には
`fk="bigint"` を付ける（`fk="Big Integer"` ではない）。`x_real` を撤去すると
`tests/node/type-resolution.test.ts` の差分テストと `tests/node/palette-id.test.ts` の `x_` 検査が
**両方赤くなる**が、どちらも「直す対象が消えた」ことによる正しい赤で、そのとき消してよい。
known-issue #4（未知型 → 先頭型）の strict 化もこの段階から。

---

### 2026-08-17 HANDOVER §6「機能」段階6-3 —— PG18 パレットへ差し替え、設計ファイルを移行する

6-0 の分割表の 4 本目。**`postgresql` が「現代化済み」の 1 本目**になり、残る 4 本
（`mysql` / `mssql` / `oracle` / `sqlite`）は 6-8 で同じ形に移る。

パレットは 6-0 の設計どおり **29 型 → 24 型**（7 撤去・2 追加・`sql` を 4 本修正）。
撤去した型を使う設計 JSON は同じ PR で移行した —— 移行表とパレットが別 PR に分かれると
その間リポジトリの設計ファイルが読めない（CLAUDE.md 制約1「半移行を放置しない」）。

#### 決めたこと 1: 旧型名は新設の `aka` で受ける（6-0 に無かった要素）

実装前に `sql` を PG18 の正式名へ直したときの影響を測ったところ、**6-0 の設計に穴があった** ——
旧型名が照合できなくなる。とくに致命的なのは `TIMESTAMP WITH TIME ZONE` で、
新 `sql` が `TIMESTAMPTZ` になるぶん**受け口が無くなる**。これは
[`docs/samples/introspection-postgresql.xml`](docs/samples/introspection-postgresql.xml) の
実出力そのもの（information_schema は標準名を返す）なので、落とすと PG18 相手の
introspection → 設計取り込みが壊れる。同じ問題が `DECIMAL` / `FLOAT` / `DOUBLE` と
撤去 7 型（`SERIAL` / `CHAR` / `TIMESTAMP` / `JSON` ほか）にもある。

| 案 | 採否 |
|---|---|
| **`<type aka="…">` を新設**（`\|` 区切り・大小無視の完全一致） | **採用** |
| 既存の `re` に旧名を書く | 却下。`re` はアンカー無し・大小区別・後勝ち（known-issue #10）。`text` に `re="CHAR"` と書くと `VARCHAR` にも当たる。避けるには PG の `re` を先勝ち・アンカー化する必要があり、**6-2 が 6-8 へ送った判断を部分的に覆す** |
| 互換を捨てて fixture と introspection サンプルを新名に書き換える | 却下。upstream 由来の XML と introspection 出力が開けなくなる。fixture を動かすと**全 5 プロファイルの DDL golden が動き**、段階の完了判定もぼやける |

`aka` に入れる名前の基準は 3 つに限る（パレットが「PG の全別名辞書」に育つのを防ぐ）:
**(1) 撤去した型の旧 `sql` / `re`、(2) `sql` を直した 4 型の旧 `sql`、(3) PG が公式に認める
短縮別名**（`int4` / `float8` / `bool` ほか）。

照合は **`sql` を全型走査 → 決まらなければ `aka` を全型走査**の 2 段。型ごとに両方を見る
1 段走査だと、並び順次第で**前の型の `aka` が後の型の `sql` を奪う**（`TIME WITH TIME ZONE` は
`time_with_time_zone` の `sql` で、`timestamp_with_time_zone` の `aka` でもありうる）。
`aka` が他の型の `sql` と衝突しないことは `tests/node/palette-id.test.ts` が全プロファイルで
機械的に押さえるので、2 段走査はその二重化になっている。

#### 決めたこと 2: `strict="1"` は「現代化済み」の印で、3 つを同時に切り替える

6-0 の決めたこと 2(b) は「現代化済み ＝ strict / 未現代化 ＝ 従来どおりフォールバック」を
パレット側で表すと決めていた。その 1 属性が切り替えるのは 3 つ:

| | strict（`postgresql`） | 従来（残る 4 本） |
|---|---|---|
| 照合 | `sql` / `aka` の**大小無視の完全一致**のみ。`re` は見ない | `sql` 先勝ち ＋ `re` 後勝ち（#10） |
| 未知型 | **例外**（#4 の解消） | 黙って先頭型（#4） |
| `size` | 寄せ先が `length="0"` なら**捨てる** | そのまま残す |

**PG パレットから `re` を全廃した**（`aka` へ移した）ので、`postgresql` では #10 の 3 欠陥が
まとめて消えている。6-8 は各プロファイルでこれと同じことをやる段階になり、6-3 がその型紙。

#### 決めたこと 3: `formatVersion` は上げない（2 のまま）

4-2b は型キーが `label` → `id` と**構造ごと**変わったので版を上げた。6-3 で動くのは
`columns[].type` に入る**値だけ**で、キーの構造は 1 つも変わらない。移行し忘れたファイルは
「その `id` が現在のパレットに無い」で `json-parser.ts` が位置つきに落とすので、
**版を上げなくても移行済みかを機械判定できる**。上げると内容の変わらない 6 本まで
`formatVersion` の 1 行が動き、「意味のある差分だけが git diff に出る」（制約3）から遠のく。

移行ツールは [`tools/migrate-design.mjs`](tools/migrate-design.mjs) に**同じ 1 パスとして**足した
（`formatVersion: 1` のファイルは「`label` → `id` → 寄せ先」と連鎖する）。規則 5 つと表は
[`docs/FORMAT.md`](docs/FORMAT.md) の「パレットを差し替えるときの移行」に確定版を置いた。

**v1 の移行は現在のパレットの `label` を引く**ので、6-3 で消えた `label`（`Serial` / `Char` /
`Real` ほか）を持つ v1 ファイルは移行できなくなった。歴史的な label 表をツールへ焼くより
落ちて気づく形を採る —— **v1 のファイルはリポジトリに 1 本も無い**ことを確認済み
（4-2 が書いた形式で、7 本とも 4-2b で v2 へ移行してある）。

#### 決めたこと 4: `length` を契約にした（6-0 の移行表を 1 行訂正）

`CHAR(10)` が `text` に寄ると size の "10" が残り、[`frontend/js/io/ddl-xml.ts`](frontend/js/io/ddl-xml.ts) が
`TEXT(10)` という**構文として壊れた DDL** を吐く（size があれば必ず括弧を付ける）。
判断材料は `<type length="…">` にあるが、**この属性は `js/` のどこからも読まれていなかった**
（upstream 由来の死んだ属性で、size は型と無関係な自由文字列だった）。6-3 で読む契約にし、
PG18 の実際に合わせて 4 型を直した:

| `id` | 旧 | 新 | 理由 |
|---|---|---|---|
| `bytea` / `xml` | 1 | **0** | 精度を取らない |
| `time_with_time_zone` / `timestamp_with_time_zone` | 0 | **1** | `timetz(p)` / `timestamptz(p)` は秒精度を取れる |

これで **6-0 の移行表が 1 行変わる** —— 「`timestamp` → `timestamp_with_time_zone` は size が
落ちる」と書いていたが、`timestamptz(3)` は有効なので**保つほうが情報を失わない**。
size が落ちるのは `char` → `text` の 1 本だけになった。

同じ規則を**読み込み側（`xml-parser.ts`）と移行ツールの両方**が持つ。食い違うと
「移行したファイル」と「XML から読み直したファイル」が別物になるので、
**一致は golden が見ている** —— 移行ツールが書いた `json/types-matrix.json` が、
`golden:update` で採り直した serializer の出力と 1 バイトも違わないこと。

#### 決めたこと 5: `fromXML` は同梱パレットが無ければ parse を先に置く

6-3 から parse が例外を投げうるので、**`clearTables()` が先だと読めないファイルを開いただけで
今の設計が消える**。実装中に `tests/browser/types.spec.ts` が実際にこれを捉えた
（例外メッセージは一致したが、開いていた設計が空になっていた）。

4-1b は「`clearTables()` は旧パレット・parse は新パレット」という順序制約を理由に
clear を先に置いていたが、**その制約は同梱 `<datatypes>` を持つ XML にしか無い**
（差し替えが起きなければ clear と parse の間でパレットは動かない）。同梱パレットを持つのは
4-4 以前に grabado が書いた XML と一部の upstream ファイルだけなので、経路を分けて
**大多数を守った**。そちらまで守るにはパレット差し替えのロールバックか破棄したツリーの
復元が要り、どちらも「読み込みの失敗」1 点のためにライブ側へ状態を増やすことになる。

#### 決めたこと 6: この段階に入れなかった 4 件と送り先

| 項目 | 送り先 | 理由 |
|---|---|---|
| `output.xsl` の `@autoincrement=1` → `BIGSERIAL` 固定 | **6-5**（§6.3） | 分割表どおり `output.xsl` はまとめて TS 化する。おかげで `ddl/*/autoincrement.sql` が全 5 DB で無差分になり、完了判定が明確になった |
| `DEFAULT 'uuidv7()'` のように式が引用符で囲まれる | **6-5** | 型の `quote` 属性を式にも当ててしまう設計の問題。**6-3 が作った不具合ではなく**、`DEFAULT 'now()'` として前から golden にある（`tests/golden/README.md`）。uuid が解決するようになって適用範囲が広がっただけ |
| `BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL` の重複 | **6-5** | `sql` に制約句が入っており `output.xsl` はその後ろに `NOT NULL` を足すだけ。PG の構文としては有効（どちらも column_constraint）なので実害は冗長さのみ |
| 新規行の既定型（`Row` のコンストラクタ既定 `type: 0`） | **6-4**（§6.2） | `integer` を添字 0 に保ったので現状維持。house 既定は uuid PK なので初期テンプレートと合わせて判断する |

#### 検証

**赤くなったテストを 1 件ずつ説明できることが影響範囲の証明**（6-1 / 6-2 と同じ手法）。
期待値を 1 行も直さずに全ハーネスを回した時点で赤は **17 件**で、内訳は次の 3 群に尽きた:

| 群 | 件数 | 中身 |
|---|---|---|
| golden の期待値が動く | 11 | `ddl/postgresql` 2・`ddl-input` 2・`json` 2・`state` 5 |
| 主張が消えたテスト | 4 | 6-2 の差分テスト（`x_real` の撤去で空になる）・`x_` 検査・`UUID` が -1・`fkIndexFor(serial)` |
| パレットを読むテスト | 2 | `label -> id`（`Timestamp w/ TZ` / `Real`）・移行ツールの表 |

**`ddl/{mysql,mssql,oracle,sqlite}` の 28 本は 1 バイトも動いていない** —— これが段階の完了判定。

```
$ grep -c '<type ' db/postgresql/datatypes.xml          # 24
$ for db in $(ls db); do grep -o 'sql="[^"]*"' db/$db/datatypes.xml | sort | uniq -d; done
                                                        # 空（6-2 で残していた BIGINT の重複が消えた）
$ grep -c 're="' db/postgresql/datatypes.xml            # 0（すべて aka へ移した）
$ grep -o 'fk="[^"]*"' db/*/datatypes.xml               # postgresql の fk="bigint" 1 行だけ
$ git status --porcelain tests/golden/ddl/{mysql,mssql,oracle,sqlite}
                                                        # 空
$ npm run migrate:design -- tests/golden/json/*.json    # 1 migrated, 6 skipped
$ npm run golden:update && git diff tests/golden/json/  # 移行ツールの出力と 1 バイトも違わない
```

最後の 2 行が**この段階でいちばん強い検証**になっている。移行ツール（`tools/`）と
読み込み側（`js/io/xml-parser.ts`）は `size` の扱いという同じ規則を別々に実装しているので、
両者が一致しなければ diff が出る。

テスト件数（左が `develop`、右が本段階）:

| | 前 | 後 |
|---|---|---|
| `npm test` | 166 passed / 7 skipped | **209 passed / 7 skipped**（`type-resolution` +21・`palette-id` +15・`migrate-design` +9） |
| `npm run test:browser` | 115 passed | **119 passed**（`types.spec.ts` +4） |
| `npm run known-issues` | 5 passed | 5 passed（#4 / #10 を未現代化プロファイルの主張に寄せた） |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

`tests/fixtures/` は **1 行も動かしていない**（コメントのみ書き直した）。`types-matrix.xml` は
`SERIAL` / `CHAR(10)` / `JSON` を書いたまま新しい型に解決する ＝ **互換で読む XML の受け口が
そのままテストされている**形になっている。

**UI の実操作は使い捨ての spec で一巡した**（型セレクタ・セレクタ操作 → DDL 生成・FK の対話生成・
`pageerror` 0 件）。うち **`Row.buildTypeSelect` だけを恒久テストに残した** —— パレットを読む
唯一の UI 面で、golden には 1 ビットも写らない（golden はすべて `toXML` / `toJson` 経由で採る）。
6-3 は label を動かし型を 5 本減らしたので、ここが動いたことに気づける経路が要る。
マウス操作そのものを張るテストは今も 0 本のまま（[`docs/TESTING.md`](docs/TESTING.md)）。

**次段階への入力 —— 6-4（§6.2 初期テーブルテンプレート）**。パレットは `integer` が添字 0 の
ままなので、新規行の既定型は現状維持。house 既定（`id uuid DEFAULT uuidv7()` ＋ `created_at` /
`updated_at` の `timestamptz`）を出すのに必要な型は 6-3 でそろった。`uuidv7()` を既定値に
入れると `DEFAULT 'uuidv7()'` と引用されるので、**テンプレートの既定値を決めるときは
6-5（`quote` の扱い）と順序を確認すること**。

---

### 2026-08-19 HANDOVER §6「機能」段階6-4 —— §6.2 初期テーブルテンプレートを入れる

6-0 の分割表の 5 本目。新規テーブルが house 既定（`id uuid PRIMARY KEY DEFAULT uuidv7()` ＋
`created_at` / `updated_at` = `timestamptz NOT NULL DEFAULT now()`）で作られるようになった。
必要な型は 6-3 でそろっていたので、6-4 が足したのは**定義の置き場所と適用経路**。

#### 決めたこと 1: 式の引用（`DEFAULT 'uuidv7()'`）を 6-5 から前倒しした

6-3 は型の `quote` 属性が式にも当たる問題を 6-5（`output.xsl` の TS 生成器化）へ送りつつ、
「テンプレートの既定値を決めるときは 6-5 と順序を確認すること」と残していた。**確認した結果、
6-4 に前倒しした** —— テンプレートの既定値は `uuidv7()` と `now()` で、`uuid` は `quote="'"` を
持つ。直さずに入れると `DEFAULT 'uuidv7()'`（uuid 列に文字列を入れる DDL）になり、
**新規テーブルを作った瞬間に PG が弾く DDL が出る**。公開プロダクトでその期間を作らない。

| 案 | 採否 |
|---|---|
| **6-4 で式判定を入れる**（`js/io/ddl-xml.ts`。6-5 で TS 生成器へ移す前提の暫定） | **採用**。golden が動くのも 1 回で済む |
| 分割表どおり 6-5 に送る | 却下。6-4 の成果物が「新規テーブル ＝ 壊れた DDL」になる |
| 6-5 を先にやる（順序入れ替え） | 却下。§6 で最大の段階を、テンプレートという小さな段階のために前倒しすることになる |

**判定は「囲まない側」だけを列挙する**（数値 / キーワード / 関数呼び出しの形 / 先頭が `'` /
`::` を含む / `ARRAY[`）。列挙漏れは「囲む」＝従来どおりに倒れるので、`hello` のような
文字列既定値が裸で出る方向には働かない。規則の表は [`docs/FORMAT.md`](docs/FORMAT.md)。

**strict プロファイル限定**にしたので、未現代化 4 本の規則は 1 文字も動いていない
（`CURRENT_TIMESTAMP` だけが特例のまま）。6-3 の型紙をそのまま使った形で、6-8 で移る。
なお 4 本で式が裸で出ているのは `UUID` が `quote=""` の先頭型に落ちているためで
（known-issue #4）、規則の結果ではない —— **その 2 つが 6-8 で入れ替わる**。

#### 決めたこと 2: テンプレートはパレットと同じファイルに置く

`db/postgresql/datatypes.xml` の `<datatypes>` 直下に `<template>` を新設した。

```xml
<template>
	<row name="id" type="uuid" null="0" default="uuidv7()" key="PRIMARY" />
	<row name="created_at" type="timestamp_with_time_zone" null="0" default="now()" />
	<row name="updated_at" type="timestamp_with_time_zone" null="0" default="now()" />
</template>
```

別ファイル（`db/<db>/template.xml`）に切らなかったのは、**`type` が実在する型 `id` である
ことを [`tests/node/palette-id.test.ts`](tests/node/palette-id.test.ts) が機械的に押さえられる**ため。
テンプレートの型 id が壊れると例外が出るのは「新規テーブルを作ろうとしたとき」で、
パレットを触った段階では誰も気づけない。**その間に立てるのはこの検査だけ**。
`fk` を label 参照から id 参照へ移した 6-2 と同じ論法で、同じ場所が見る。

属性の意味は設計 XML の `<row>` に合わせた（`null="1"` が NULL 許可、`autoincrement="1"` が
identity）。**`type` だけは id 参照**で、`sql` 名ではない。`key="PRIMARY"` を複数行に付ければ
複合 PK も書ける（PRIMARY キーは primary な行が 1 つ以上あるときだけ作る）。

#### 決めたこと 3: 適用範囲は strict（`postgresql`）のみ

テンプレートを持たないプロファイルでは `readTemplate()` が空を返し、呼び手が
**従来の「`id` 1 列 ＋ autoincrement」にそのまま落ちる**。未現代化 4 本の初期テーブルは
1 バイトも変わらない。

いま 4 本に書かないのは、**`uuid` 相当の型が `mssql` の `uniqueidentifier` しか無い**ため
（`mysql` / `oracle` / `sqlite` には無く、`text` すら `mysql` / `oracle` に無い）。
ここで決めると 6-8 の現代化方針を先取りすることになる。6-3 が strict でやったことと同じ形で、
**全プロファイルが現代化された時点でこの分岐は消える**。

#### 決めたこと 4: §6.2 の例外 2 つは UI に出さない

§6.2 は既定（`uuidv7()`）のほかに例外を 2 つ挙げている（外部露出 = `gen_random_uuid()`、
完全内部 = `bigint identity`）。**テンプレート選択 UI は作らず、既定 1 種だけを自動適用する。**
選ばせると locale 21 言語に文言が要るのに対し、作成後に型と既定値を変える手間は
2 クリックしか減らない。6-4 を「テンプレートの定義と適用」に閉じられる。

#### 決めたこと 5: 新規行の既定型は `text`（6-3 が送った項目）

`<datatypes newrowtype="text">` をルート属性として新設した。CLAUDE.md の「`text` 優先」に
合わせたもので、テンプレートとは別概念なので `<template>` の中に入れていない。

**`Row` のコンストラクタ既定（`js/row.ts` の `data.type = 0`）は動かしていない** ——
あそこは読み込み経路（`js/io/apply.ts`）も通る道で、直後の `update()` が必ず型を入れる。
「UI で足す行の既定」はプロファイルの性質なので、パレットを見る側（`js/io/template.ts`）が決める。
属性を持たない 4 本は従来どおり添字 0。

#### 決めたこと 6: known-issue #11 を新設した（SQL リテラルのエスケープ）

`O'Brien` を既定値にすると `DEFAULT 'O'Brien'` という壊れた DDL が出る。**6-4 が作った欠陥では
ない** —— 囲む側は upstream から一度も値の中を見ていない。6-4 まで golden に出ていなかったのは
fixture の既定値が式と数値しか無かったためで、**テンプレートで「文字列の既定値を打つ」が
house 既定の一部になった**ぶん、隔離しておく先が要るようになった。直すのは 6-5。

#### 決めたこと 7: この段階に入れなかったもの

| 項目 | 送り先 | 理由 |
|---|---|---|
| UI の size 欄を型ごとに閉じる（`length="0"` の型で入力させない） | **6-8 以降** | 6-3 のパレットが「§6.2（6-4）の判断」と書いていたが、テンプレートとは別件。全プロファイルが strict になるまでは片側だけ閉じることになる |
| テーブル名の複数形・命名規約（§6.3） | **6-5** | 分割表どおり。`_("newtable")` は locale の文言のままにした |
| `output.xsl` の `@autoincrement=1` → `BIGSERIAL` 固定 / `NOT NULL` の重複 | **6-5** | 6-3 が送った 2 件。テンプレートが identity を使わないので、新規テーブルではどちらも踏まない |

#### 検証

**赤くなったテストを 1 件ずつ説明できることが影響範囲の証明**（6-1 / 6-2 / 6-3 と同じ手法）。
期待値を 1 行も直さずに全ハーネスを回した時点で赤は **2 件**で、どちらも式の引用が外れたぶん:

| 対象 | 中身 |
|---|---|
| golden 2 本 | `ddl-input/house-defaults.xml` と `ddl/postgresql/house-defaults.sql` |
| 主張が動いたテスト 1 本 | `serialize.spec.ts` の「`<default>` の後にも改行が入る」（`'uuidv7()'` → `uuidv7()`） |

**テンプレートそのものは golden に 1 ビットも写らない。** golden はすべて fixture を読み込んで
から `toXML()` / `toJson()` で採るので、「テーブル追加ボタンで何ができるか」はどのファイルにも
現れない。受け皿として [`tests/browser/template.spec.ts`](tests/browser/template.spec.ts) を
新設した（6-3 が `Row.buildTypeSelect` だけを恒久テストに残したのと同じ位置づけ）。

```
$ git status --porcelain tests/golden/
 M tests/golden/ddl-input/house-defaults.xml
 M tests/golden/ddl/postgresql/house-defaults.sql
$ git status --porcelain tests/golden/ddl/{mysql,mssql,oracle,sqlite} tests/golden/json tests/golden/state
                                                        # 空 ← 段階の完了判定
$ grep DEFAULT tests/golden/ddl/postgresql/house-defaults.sql
 id UUID NOT NULL DEFAULT uuidv7(),                      # 6-3 は DEFAULT 'uuidv7()'
 is_active BOOLEAN NOT NULL DEFAULT true,
 preferences JSONB NOT NULL DEFAULT '{}'::jsonb...       # 6-3 は ''{}'::jsonb'
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
```

`json` / `state` が不変なのは、**既定値を元から引用符の無い値で持っている**ため
（引用は書き出しの最後に付く）。6-4 が触ったのが出力の 1 点だけであることの裏付けになっている。

テスト件数（左が `develop`、右が本段階）:

| | 前 | 後 |
|---|---|---|
| `npm test` | 209 passed / 7 skipped | **237 passed / 7 skipped**（`template` +15・`palette-id` +10・`serialize` +3） |
| `npm run test:browser` | 119 passed | **123 passed**（`template.spec.ts` +4） |
| `npm run known-issues` | 5 passed | **6 passed**（#11 を新設） |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

`tests/fixtures/` は **1 行も動かしていない**。

`js/io/template.ts` は **実行時の依存が 0 本**（import は型だけ）なので、`js/io/palette.ts` と
同じくハーネス無しで直に叩ける。`applyTemplate` を `TableManager.click()` に書かず読み取り層に
置いたのはそのため —— マウス経路に判断を置くと Node 側からテストが張れない。

**UI の実操作はブラウザ側で一巡した**（テーブル追加 → 3 列と PK・生成 DDL・Add row の既定型・
`mysql` に切り替えて従来経路に落ちること）。`TableManager.click()` はマウスイベントを受けるので、
`#area` の実クリックの代わりに同じ入口を `window.d` 越しに叩いている。**マウス操作そのものを
張るテストは 6-4 でも 0 本のまま**（[`docs/TESTING.md`](docs/TESTING.md)）。

org のセキュリティ基準（分類 B: §2 ／ §3 の [B] ／ §4.2〜4.3 ／ §5.1）は着手前に一読した。
**該当項目は無い** —— 依存・配信・DNS・CI を変えず、`innerHTML` 経路も増やしていない
（テンプレートは既存の `Table.addRow` を通る）。生成する DDL は人が読んでから実行するもので、
アプリ自身は SQL を実行しない。

**次段階への入力 —— 6-5（§6.3 `output.xsl` の TS 生成器化）**。6-4 が `js/io/ddl-xml.ts` に置いた
式判定は**暫定**で、TS 生成器に移すときに「囲む側の規則」ごと設計し直す（known-issue #11 の
エスケープもそこで直す）。6-3 が送った `@autoincrement=1` → `BIGSERIAL` 固定と
`NOT NULL` の重複も同じ段階。テンプレートが identity を使わないので、**新規テーブルでは
そのどちらも踏まない**状態になっている。

---

### 2026-08-20 HANDOVER §6「機能」段階6-5a —— `output.xsl` を TS 生成器へ逐語移植し、XSLT 経路を撤去する

6-0 の分割表の 6 本目。**`db/<db>/output.xsl`（XSLT 1.0・5 本・計 952 行）が消え、
[`frontend/js/io/ddl/`](frontend/js/io/ddl/) の 7 本になった。** `tests/golden/ddl/` の 35 本は 1 バイトも
動いていない —— それが本段階の完了判定そのもの。

#### 決めたこと 1: 6-5 を 2 つに割った

6-5 が引き取る項目は 11 件あり（分割表の「§6.3 `output.xsl` の TS 生成器化」＋ 6-1 / 6-3 / 6-4 が
送った申し送り）、**「挙動不変の移植」と「意図的な出力変更」が混ざっていた**。
6-1〜6-4 が採ってきた「golden が動かないことを完了判定にする」型紙が使えなくなるので割った。

| | 6-5a（本エントリ） | 6-5b |
|---|---|---|
| 中身 | XSLT 5 本の逐語移植・XSLT 経路の撤去 | §6.3 の命名規約・識別子の引用・known-issue #6 / #11 の是正 |
| golden | **`ddl/` 35 本が 1 バイトも動かない** | PG の 7 本が動く（他 4 本は 0 バイト差） |
| 完了判定 | 無差分そのもの | 動いた 7 本を 1 本ずつ説明できること |

1 PR にまとめる案は却下した —— golden が動いたときに「移植の回帰」なのか「意図した是正」なのかを
切り分けられなくなる。**952 行を書き写す作業でその安全網を手放すのは割に合わない。**

#### 決めたこと 2: 生成器の入口は `(DesignModel, TypePalette)`。中間 XML を挟まない

移植前の DDL 生成は **3 段**だった: `extractModel()` → `buildDdlInputXml()`（中間 XML）→
XHR で `output.xsl` を GET → `XSLTProcessor`。他の形式（JSON）は 1 段なので、DDL だけが 2 段深い。

[`frontend/js/io/ddl/generate.ts`](frontend/js/io/ddl/generate.ts) の `generateDdl(model, palette): string` は
[`frontend/js/io/json-serializer.ts`](frontend/js/io/json-serializer.ts) の `serializeDesignJson(model, palette)` と
**同じ 2 引数**にした。`Designer.toXML()` が `buildDdlInputXml(extractModel(this), this.palette)` で
しかなかったので、中間 XML を挟む必然性が元から無かった（4-1a の格子がその形を用意していた）。

**結果として XML の書き出しが grabado から 1 つ残らず消えた。** 4-3b でユーザーに見える保存経路が
JSON になった時点で残っていたのは DDL の中間表現だけで、それが消えた。読み込みは互換で残る
（HANDOVER §4「XML は読込専用」）。

XSLT が見ていた入力に相当する構造体は [`frontend/js/io/ddl/shared.ts`](frontend/js/io/ddl/shared.ts) が組む。
XPath 式をそのまま TS の条件式に写せる形にしてあり（`test="comment"` → `if (table.comment)`、
`@null = 0` → `!row.nullable`）、**型パレットを読むのはここだけ**。5 つのプロファイル実装は
解決済みの文字列しか見ない —— XSLT が `datatypes.xml` を一度も参照していなかったのと同じ分業。

#### 決めたこと 3: プロファイル間の共通化は 6-5a では行わない

5 本の文法差は大きい（`DROP TABLE IF EXISTS` の有無・`GO`・trigger + sequence・79 文字の罫線と
桁揃え・inline FK・識別子の引用文字が 5 通り）。逐語移植の最中に共通項を括ると、**挙動不変の主張が
「共通化が正しいこと」に依存してしまう**。4-1a が `toXML()` 4 実装を移設したときと同じ立場で、
「整理したくなる箇所がそのまま危険箇所」。

共通骨格の抽出は `sql-standard` を基底に置く 6-7 の仕事（6-7 の設計先行エントリ）。
**6-7 が「生成器は基底 + 差分」と書いているのは型マッピングの話**で、DDL 文法の共通化とは別。

#### 決めたこと 4: 消える主張を 1 件ずつ始末した（この段階でいちばん注意が要る作業）

XML の書き出しが消えると、[`tests/browser/serialize.spec.ts`](tests/browser/serialize.spec.ts) と
`tests/node/serialize.test.ts` が持っていた主張が宙に浮く。**黙って消さない**ために全件を振り分けた。

| 主張 | 6-5a での扱い |
|---|---|
| `toXML()` の golden 7 本（`tests/golden/ddl-input/`） | **撤去**。書き出しが無い以上、あのファイルは何も保証しない |
| round-trip 7 本 / 決定論 | **撤去**。JSON 側（`json.spec.ts` / `json.test.ts`）が同じ主張を持つ |
| 環境依存が無い（旧 Active URL） | **JSON と DDL に移設**。CLAUDE.md 制約3 の中身なので書き出しが残る 2 形式で見る |
| `&` を含む識別子（旧 known-issue #1） | **JSON と DDL に移設**。「壊れたファイルができて二度と開けない」は形式が変わっても消えない性質 |
| `<default>` の後に改行（旧 #8） | **消滅**。XML 固有で移設先を持たない |
| 既定値の無い行（旧 #2） | **JSON 版に置換** |
| `alignTables()` の順序（旧 #7） | 比較対象を JSON にしただけ |
| `<default>` の引用規則の表（EXPRESSIONS 13 / LITERALS 4） | **[`tests/node/ddl.test.ts`](tests/node/ddl.test.ts) へ移設**。未現代化 4 本の規則が「実際に何か」を書いてある唯一の場所で、`ddl/{mysql,mssql,oracle,sqlite}` の 28 本が動かないことの規則側の裏付け |
| XML 読込互換のテスト入力（`io-ui` / `types` / `json`） | **fixture をそのまま食わせる形に変えた**。`tests/fixtures/` は手書きの upstream 互換 XML なので、「外から来た XML を読める」という主張としてはむしろ純度が上がる |

**引用規則を DDL で観測すると 1 行だけ見え方が変わる。** `NULL` は strict 側で式と判定されて
囲まれないが、PG の出力側が `default = 'NULL'` のとき句ごと落とすので DDL には現れない
（`db/postgresql/output.xsl:58-64` の逐語）。囲む側の規則と出力側の規則が別物であることが、
XML 経由では見えていなかった。mysql は落とす分岐を持たないので `DEFAULT 'NULL'` が出る。

#### 決めたこと 5: known-issue #5 は経路ごと消え、#12 / #13 を新設した

**#5（空の `<default></default>` で ` DEFAULT ` だけが残る）は構造的に消えた。**
現象が起きるのは「introspection が吐いた XML を**直接 XSLT に食わせる**」経路だけで、
生成器はモデルからしか DDL を作らない。空の値は読み込みの時点で `""` になり（4-5）、
`hasDefault` が false になるので句そのものが出ない。**直したというより到達できなくなった。**

**逐語移植の過程で未記録のバグを 9 件見つけた。** 挙動不変が要件なので TS 側でも忠実に再現して
あり、黙って持ち込まないために記録する。実害の大きい 2 件は known-issues に新設した（直すのは 6-8）。

| 現象 | 扱い |
|---|---|
| **`mssql`: 最終列にコメントがあると区切りカンマが `--` に飲まれ T-SQL が構文エラー** | **known-issue #12 を新設** |
| **`sqlite`: 複合 PRIMARY KEY が UNIQUE に落ち PRIMARY KEY が消える** | **known-issue #13 を新設** |
| `mssql`: DEFAULT を一切出力しない（分岐が無い） | 本エントリに記録 |
| `sqlite`: コメントを一切出力しない | 同上 |
| `mysql`: コメントを 60 字で無言に切り詰める | 同上 |
| `oracle`: 日本語識別子が `ora_ident` を素通りして裸で出る（`translate()` は非 ASCII を変えない） | 同上 |
| `mysql` / `mssql`: FK の参照元列だけ引用符が付かない（テーブル名には付く） | 同上 |
| `oracle`: 複数列が autoincrement だと同名の `CREATE SEQUENCE` が重複 | 同上（golden 未カバー） |
| `mssql`: 複数列 INDEX の 2 列目以降に `[` が付かない（`([c1], c2])`） | 同上（golden 未カバー） |

**`INDEX` / `FULLTEXT` を持つ fixture が 1 本も無い**ので、`CREATE INDEX` 経路は 35 本の golden に
1 行も現れない。下 2 件が golden 未カバーなのはそのため。6-5b が PG の `KEY (...)` を
`CREATE INDEX` に直すときは golden 差分では検証できない（恒久テストを 1 本立てる）。

なお `mysql` の XSLT には `<xsl-text>`（正しくは `xsl:text`）というタイポが 7 箇所あり、
非名前空間のリテラル結果要素として扱われた結果 `method="text"` では中身だけが出て
**たまたま動いていた**。移植でその区別は消えている。

#### 決めたこと 6: `.gitattributes` の `db/**` を `text eol=lf` にした（6-1 が送った項目）

`-text` だった根拠は「`output.xsl` の `xsl:text` 内の改行がそのまま生成 SQL に出る」ことで、
**`db/` の改行コードが DDL golden のバイト列を左右していた**。その経路が消え、`db/` に残るのは
属性を読むだけの `datatypes.xml` だけになったので、他の text ファイルと同じ LF 固定へ揃えた。
5 本とも既に LF でコミットされているのでバイト列は動いていない。`locale/** -text` は
`ko.xml` が CRLF のまま残るので維持。

#### 決めたこと 7: `DEFAULT_DB` の実施漏れを埋めた

[`frontend/js/config.ts`](frontend/js/config.ts) が `DEFAULT_DB: "mysql"` のままだった。6-1 がこれと
`AVAILABLE_DBS` の並び替えを 6-3 へ送っていたが（「いま振ると初回ユーザーが最初に触るパレットが
uuid 不在・`x_real` が `BIGINT` の未現代化 PG になる」）、**6-3 のエントリに実施記録が無く落ちていた**。
`git log -- js/config.ts` の最新も 6-1。6-1 自身が「**テストが止めてくれない変更**」と書いている
とおり、CI は赤くならない。

送り先の条件——PG の現代化——は 6-3 で満たされている。新しい決定ではなく実施漏れなので
6-5a で埋めた（`postgresql` を先頭へ動かし、既定に。残る 4 本の相対順は upstream のまま）。
**同じ表にあった「cookie に撤去 DB が残った場合の防御」は未実施のまま**で、そちらは 6-5a の
スコープ外（`db` 不整合の見せ方という別テーマ）。

#### 決めたこと 8: この段階に入れなかったもの

| 項目 | 送り先 | 理由 |
|---|---|---|
| §6.3 の命名規約（`fk_<table>_<ref>` / `idx_<table>_<cols>`）・識別子の引用 | **6-5b** | 決めたこと 1 |
| known-issue **#6**（`<table>_pkey` の衝突）・**#11**（`'` のエスケープ）・`KEY (...)` 構文・`BIGSERIAL` 固定・`NOT NULL` の重複 | **6-5b** | 同上。どれも golden が動く |
| 未現代化 4 本の粗さ（#4 / #10 / #12 / #13 ほか上の 9 件） | **6-8** | プロファイルごとの現代化と一体。6-6 の DB 別 fixture が先に要る |
| 配列型 `type[]` / 生成列の DDL 表現 | **6-8 以降** | 6-0 は「6-5 で DDL 表現ごと設計する」と書いたが、**パレットに型が無い**（6-0 自身が「`<type>` の列挙では表現できない」として入れなかった）。生成器だけ先に作っても入口が無い |
| 5 本の共通骨格の抽出 | **6-7** | 決めたこと 3 |

#### 検証

**6-5a の完了判定は「赤の内訳を数える」ではなく `golden` 無差分そのもの。**
逐語移植なので、期待値を 1 行も直さずに通ることが移植の正しさの直接の証明になる。

```
$ npm run golden:update && git status --porcelain tests/golden/
D  tests/golden/ddl-input/*.xml                          # 7 本（撤去）以外は 1 行も出ない
$ git status --porcelain tests/golden/ddl tests/golden/json tests/golden/state
                                                         # 空 ← 段階の完了判定
$ find db -type f
db/*/datatypes.xml                                       # 5 本。output.xsl は 1 本も無い
$ grep -c xslt-processor package.json
0                                                        # devDependency が 1 本減った
```

**Node 側の 35 件が一度も期待値を直さずに通った**（最初の実行で 35/35）。ブラウザ側で 1 件だけ
赤くなったが、それは 6-5a が**新しく書いたテスト**（旧 #5 の移設先）のアサーションが甘すぎた
もので、生成器の欠陥ではない（同じテーブルの `id` 列が持つ本物の `DEFAULT uuidv7()` に当たっていた）。

テスト件数（左が `develop`、右が本段階）:

| | 前 | 後 |
|---|---|---|
| `npm test` | 237 passed / **7 skipped** | **228 passed / 0 skipped** |
| `npm run test:browser` | 123 passed | **108 passed** |
| `npm run known-issues` | 6 passed | **7 passed**（#5 が消え #12 / #13 を新設） |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**skipped が 0 になったのがこの段階の副産物**。`oracle` は `xslt-processor` がトップレベルの
`xsl:variable` を解決できず（`XPST0008`）Node 回帰から外れていたが、生成が TS になって
エンジン差そのものが消えた。**`oracle` の DDL 回帰をブラウザ側だけが張っていた状態が解消**され、
`tests/node/parity-exceptions.ts` と `ddl.test.ts` の adapter 2 本も根拠ごと消えている。

件数の増減はすべて「XML の書き出しが消えたこと」に由来する:

| ハーネス | 内訳 |
|---|---|
| Node −9 | `ddl.test.ts` 29 → 38（golden 28 → 35・parity 例外 −1・引用規則 +3）／`serialize.test.ts` 18 → 0（ファイルごと撤去） |
| ブラウザ −15 | `serialize.spec.ts` 23 → 8（golden 7・round-trip 7・決定論 1・`<default>` 改行 1 を撤去、旧 #5 の移設先 1 を追加） |
| known-issues +1 | #5 を撤去、#12 / #13 を新設 |

`tests/fixtures/` は **1 行も動かしていない**。

org のセキュリティ基準（分類 B: §2 ／ §3 の [B] ／ §4.2〜4.3 ／ §5.1）は着手前に一読した。
効くのは依存の項（§2.2 / §3.12 / §5.1）だけで、**本段階は devDependency を 1 本減らす**
（`xslt-processor`）。lock ファイルは更新済み。`innerHTML` 経路は増えておらず（§3.5）、
実行時に `db/*/output.xsl` を fetch していた経路が無くなったぶん配信も減っている。
生成する DDL は人が読んでから実行するもので、アプリ自身は SQL を実行しない。

**次段階への入力 —— 6-5b（§6.3 の規約と既知不具合の是正）**。生成器は
[`frontend/js/io/ddl/shared.ts`](frontend/js/io/ddl/shared.ts) が「囲まない側」の判定を持ち、囲む側は
`quote` 属性を前後に足すだけ（#11）。**PG だけを strict として直し、未現代化 4 本は 6-8 まで
1 バイトも動かさない** —— 6-3 / 6-4 と同じ型紙で、共通層に規則を置いて `palette.isStrict()` で
有効化すれば 6-8 で自動的に効く。`CREATE INDEX` 経路は fixture が無いので golden では
検証できず、[`tests/browser/template.spec.ts`](tests/browser/template.spec.ts) と同じ形の
恒久テストを 1 本立てること。

---

### 2026-08-20 HANDOVER §6「機能」段階6-5b —— §6.3 の規約へ寄せ、known-issue #6 / #11 を直す

6-5a が割った片割れ。**`tests/golden/ddl/postgresql/` の 5 本・31 行が動き、未現代化 4 本の
28 本は 1 バイトも動いていない。** 6-5a の完了判定が「無差分そのもの」だったのに対し、
本段階は**動いた 31 行を 1 行ずつ説明できること**が完了判定で、下の対応表がそれ。

直したのは [`frontend/js/io/ddl/postgresql.ts`](frontend/js/io/ddl/postgresql.ts) が自分のヘッダに列挙していた
7 点 ＋ known-issue #11 の計 8 件。6-5a は挙動不変が要件だったので upstream の粗さを
逐語で持ち込んであり、その一覧がそのまま本段階の作業リストになっていた。

#### 決めたこと 1: FK 名の `<ref>` は**参照元の列名**（`fk_projects_owner_id`）

§6.3 の `fk_<table>_<ref>` は `<ref>` が両義的だった。参照先テーブル名を採ると
`orders.billing_address_id` と `shipping_address_id` がどちらも `fk_orders_addresses` になって
**制約名が衝突する**（PG は同一スキーマ内で制約名の重複を拒む）。列名は 1 テーブル内で必ず
一意なので、名前も必ず一意になる。`idx_<table>_<cols>` が列を並べる規約なのとも揃う。

**FK 名はモデルに保存先が無い**（[`docs/FORMAT.md`](docs/FORMAT.md) の `references[]` は
`table` / `column` だけ）。introspection で読んだ外部由来の FK 名は保持されず、生成のたびに
組み直される —— 制約名を保持できる key（`keys[].name`）との非対称はここに記録しておく。

同じ規約を名乗っている [`docs/samples/introspection-sample-schema.sql`](docs/samples/introspection-sample-schema.sql)
が `fk_articles_users` のままだったので同じ PR で直した。house 規約を名乗るサンプルが規約違反の
まま残るのは、公開プロダクトとしてはコードの不具合と同じ。

#### 決めたこと 2: 識別子は**必要なときだけ**囲む。予約語は実 PG18 から採った

6-5a まで、本体は識別子を裸で出すのに `COMMENT ON` だけ `"` で囲み、しかも値の中の `"` を
エスケープしていなかった（`COMMENT ON COLUMN "顧客"."say "hi""` という壊れた行が golden にある）。
規則を 1 つに揃え、`/^[a-z_][a-z0-9_]*$/` に収まり予約語でなければ裸、それ以外は `"` で囲んで
値の中の `"` を `""` にする。

常に囲む案は却下した —— PG としては最も安全だが `"users"."id"` だらけの DDL になる。
**house 標準（snake_case・複数形）に従っていれば 1 つも囲まれない**のが要点で、
`house-defaults.sql` が丸ごとその証拠になっている（引用が増えた行は 1 行も無く、
むしろ `COMMENT ON` の 8 行から `"` が**外れた**）。

**予約語の一覧は推測せず、`postgres:18` コンテナで採った。**

```
$ docker exec kw psql -U postgres -Atc \
    "SELECT word FROM pg_get_keywords() WHERE catcode IN ('R','T') ORDER BY 1;"
  -> PostgreSQL 18.4 / catcode R 78 語 ＋ T 23 語 = 101 語
```

`T`（reserved (can be function or type name)）を**含める**のが判断の要点。`left` / `is` /
`like` / `join` / `full` は関数名・型名にはなれるが**列名にはなれない**ので、落とすと
`left text` のような壊れた DDL が出る。逆に `C`（`integer` / `varchar` / `between`）は
列名に使えるので入れない —— 入れると house 標準の名前まで囲まれる。採取クエリと版と採取日は
[`frontend/js/io/ddl/keywords.ts`](frontend/js/io/ddl/keywords.ts) の頭に書いてあり、6-8 で 4 プロファイルぶんが
同じ形で足される。

#### 決めたこと 3: autoincrement は**型を尊重して IDENTITY 句を足す**

6-3 が送った 2 件（`BIGSERIAL` 固定 / `NOT NULL` の重複）は同じ列定義の話なので一緒に直した。

| 入口 | 6-5a まで | 6-5b |
|---|---|---|
| `@autoincrement=1`（UI のチェック） | `<datatype>` を捨てて `BIGSERIAL` 固定 | `INTEGER GENERATED ALWAYS AS IDENTITY`（型はそのまま・句だけ足す） |
| 型そのもの（パレットの `bigint_identity`） | 句の後ろに `NOT NULL` を足す | 足さない（identity は暗黙で NOT NULL） |

**identity 列には `DEFAULT` も出さない。** PG は identity と DEFAULT の併用を構文レベルで拒むが、
UI では ai チェックと既定値欄が同時に触れるので到達できる。`NOT NULL` を抑止するのと同じ `if` の
中で 1 行なので同時に塞いだ（PG の golden に該当ケースは無く、0 行）。

`hasIdentityClause()` は `postgresql.ts` に閉じている —— mssql は `IDENTITY(1,1)`、mysql は
列属性 `AUTO_INCREMENT` と、6-8 では各プロファイルが別の判定を持つため、共通層に上げなかった。

#### 決めたこと 4: 制約名は `key/@name` を優先し、空のときだけ規約で組む（#6）

known-issue #6 の実害は `house-defaults.sql` に出ていた —— `users` が PRIMARY と UNIQUE の
2 本を持つのに、どちらも `users_pkey` という名前で出て PG が 2 つ目を弾く。原因は
「`key/@name` を読まずテーブル名から組む」ことなので、**名前欄を読む**のが直し方の本体。
名前欄は [`frontend/js/keymanager.ts`](frontend/js/keymanager.ts) が持つ編集可能な値で、無視してよいものではない。

空のときの生成規約は **PG が自分で付ける名前に合わせた**（`<table>_pkey` / `<table>_<cols>_key`）。
introspection で読み直しても名前が動かないため。**index だけは例外**で、PG の自動名は
`<table>_<cols>_idx` だが §6.3 が `idx_<table>_<cols>` を明記しているのでそちらを採った ——
index 名は `keys[].name` に残るので、往復しても動かない（FK と違う点。決めたこと 1）。

`PRIMARY` / `UNIQUE` 以外が `ADD CONSTRAINT <table>_pkey KEY (...)`（PG に無い構文）に落ちる件も
ここで消えた。`INDEX` / `FULLTEXT` は `CREATE INDEX` として、テーブルブロックの中・key の順のまま出す
（FK と違って順序制約が無く、「1 テーブル = 独立ブロック」の diff 局所性を保てる）。

**`FULLTEXT` は PG では btree の `CREATE INDEX` に落ちる。** PG の全文検索索引は
`USING gin (to_tsvector('config', col))` という式インデックスで、モデルは式も config も持てない
（`keys[].columns` は列名の配列）。`docs/FORMAT.md` が「値を列挙して拒む案は §6.3 の判断に送る」と
書いていた件は、**4 種すべて受ける**で決着させた —— 形式側で拒むと、いま開ける設計が読めなくなる。

#### 決めたこと 5: 列を 1 つも持たないキーは 1 文字も出さない

`KeyManager.add()` は `table.keys.length ? "INDEX" : "PRIMARY"` で **name も列も空**のキーを作る。
つまり「2 本目のキーを足す」だけで `ALTER TABLE users ADD CONSTRAINT users_pkey KEY ();` という
三重に壊れた行（PG に無い構文 ＋ 列が空 ＋ PRIMARY と同名）が出ていた。規約名も cols が空だと
`users__key` / `idx_users_` に退化するので、出力そのものを止めた。**列を持たないキーに情報は無い。**

#### 決めたこと 6: `key/@name` の実行時 null を**源流で**塞いだ（4 本の挙動を意図的に動かした 1 件）

name 属性の無い `<key>` を読むと `getAttribute` が null を返し、DDL 生成が `String()` で受けて
**`"null"` という文字列の制約名**を作っていた。mssql は `CONSTRAINT null`、sqlite は
`CREATE INDEX 'null'` を実際に出す。

この癖を残す根拠は [`frontend/js/io/model.ts`](frontend/js/io/model.ts) が書いていた「serializer が `String()` で
受けて `name="null"` を書く現行仕様を保つ」（段階4-4 の決めたこと 3）だが、**その相手の XML
serializer は 6-5a で撤去済み**。[`frontend/js/io/json-serializer.ts`](frontend/js/io/json-serializer.ts) は falsy を
キーごと落とすので、同じモデルから **JSON は「名前なし」・DDL は「名前は `null`」**という
食い違いだけが残っていた。半移行そのものなので [`frontend/js/io/xml-parser.ts`](frontend/js/io/xml-parser.ts) で
`?? ""` に正規化した。

**これは未現代化 4 本の挙動を意図的に動かした本段階唯一の変更**（golden は 0 バイト差 ——
`tests/fixtures/` の `<key>` 11 個と `tests/known-issues/fixtures/` のすべてが name 属性を持つため）。
「PG だけ整えて他を放置しない」の逆側（4 本の品質が上がる）なので採った。golden が見ていない
以上、恒久テストを 1 本置いてある（`tests/node/ddl.test.ts`）。

#### 決めたこと 7: §6.3 の「snake_case・複数形」は生成器では**何もしない**

6-4 が 6-5 へ送っていた項目。**生成器が識別子を書き換えるのは採らない。**

1. **設計と DDL が食い違う。** 画面の `Customer` が DDL では `customers` になると、`COMMENT ON` や
   FK の参照先を人が追えなくなる。
2. **introspection の往復が壊れる。** 既存 DB から読んだ `顧客` を `customers` として出したら、
   それはもう同じテーブルではない。
3. **正しさが保証できない。** 複数形化は英語の形態論で、`person` → `people` / `data` → `data` を
   機械で正しく倒せない。決定論（同一モデル → 同一バイト列）は守れても、規則自体が当てにならない。

かわりに受けるのは 3 つ。(1) §6.2 のテンプレートが最初から house 規約の列名を作る（6-4 で実装済み）、
(2) **予約語の引用**（本段階）—— §6.3 括弧書きの「予約語回避」の実体はこれで、`order` という
テーブル名が `"order"` として安全に出るようになった、(3) 命名の**検査**（lint）は「警告して人が直す」
性質のものなので **6-9 以降**へ送る（§11 の AI リファクタ提案が review-first で受けるのが素直）。

#### 決めたこと 8: 規則の置き場所を性質で 2 つに割った

`generatePostgresql(tables)` の署名も `DdlTable` も変えていない。**strict フラグを生成器へ配線する
必要が無かった**ため —— #11 を直す `quoteDefault()` は `shared.ts` にあり、そこには既に
`palette` が引数で来ている。

| 規則 | 置き場所 | 6-8 での効き方 |
|---|---|---|
| 命名規約（dialect 非依存） | [`frontend/js/io/ddl/naming.ts`](frontend/js/io/ddl/naming.ts) | **呼ぶだけ** |
| 識別子の引用（dialect 依存。囲む文字が 5 通り） | 同上の `quoteIdentifier(name, rules)` ＋ [`keywords.ts`](frontend/js/io/ddl/keywords.ts) | `IdentifierRules` を 4 つ足す。規則本体は共有 |
| 既定値の `'` エスケープ（#11） | [`frontend/js/io/ddl/shared.ts`](frontend/js/io/ddl/shared.ts) の `isStrict()` の中 | `strict="1"` が付いた瞬間に効く |

**`naming.ts` の順序規約**: 名前は引用前の生名で組み、返り値を呼び手が `quoteIdentifier()` に通す。
逆にすると `fk_"顧客"_"参照"` のような名前ができる（正しくは `"fk_顧客_参照"`）。

**未現代化 4 本が 0 バイト差であることは、検算する事実ではなく 4 ファイルを開いていないという
構造的事実**にした。唯一のゲートは #11 を `isStrict()` の内側に置くことで、外へ出すと
`tests/golden/ddl/sqlite/house-defaults.sql:6` の `DEFAULT ''{}'::jsonb'` が動く（28 本中この 1 行だけ。
mysql / oracle の同じ列は INTEGER に落ちて `quote=""`、mssql は DEFAULT を出さない）。

#### 決めたこと 9: この段階に入れなかったもの

| 項目 | 送り先 | 理由 |
|---|---|---|
| 未現代化 4 本の命名・引用・#11 | **6-8** | 6-3 / 6-4 と同じ型紙。`naming.ts` に `IdentifierRules` を 4 つ足せば効く |
| known-issue **#12** / **#13**（mssql のカンマ / sqlite の複合 PK） | **6-8** | プロファイルごとの現代化と一体 |
| 63 バイトを超える識別子 | **未定（記録のみ）** | PG は黙って切り詰めるので `fk_<長table>_<長column>` が衝突しうる。切り詰め規則を持ち込むと決定論と可読性の両方を損なうので、規則を決める前に実害を見る |
| 空文字の識別子 | 同上 | 現行も裸の空文字で壊れている。入力側（UI）で止める話 |
| 命名の検査（snake_case / 複数形） | **6-9 以降** | 決めたこと 7 |
| `FULLTEXT` を UI の選択肢から外すか | **6-8 / UI 側** | 生成器は 4 種すべて受ける形で決着済み。選択肢の整理は別テーマ |

#### 検証

**golden が動いた 31 行の内訳。** 実装前に立てた予測表と**ファイル単位・行数単位で完全に一致**した
（1 項目直すごとに差分行数を数え、予測との差が出たらそこで止める手順を採った）。

| ファイル | 行 | 内訳 |
|---|---|---|
| `empty.sql` | 0 | 0 バイトのまま |
| `minimal.sql` | 0 | 識別子が裸のまま・コメント無し・key 無し・ai 無し |
| `autoincrement.sql` | **1** | ` id BIGSERIAL NOT NULL,` → ` id INTEGER GENERATED ALWAYS AS IDENTITY,`（決めたこと 3。PK 名は fixture が `counters_pkey` を持つので不変） |
| `types-matrix.sql` | **2** | `c_serial` / `c_bigserial` の末尾 ` NOT NULL` が落ちる（同 3）。**両方 `autoincrement="0"`** で、identity は**型**から来ている |
| `quotes-i18n.sql` | **6** | `CREATE TABLE "顧客"` ／ `"氏名"` `"say ""hi"""` `"メモ"` の 3 列（引用 ＋ インラインコメント除去）／ `ADD CONSTRAINT "顧客_pkey"`（**制約名も識別子**）／ `COMMENT ON COLUMN "顧客"."say ""hi"""`（壊れていた行の是正）。`COMMENT ON TABLE "顧客"` ほか 3 行は**不変** —— 元々引用されており値に `"` を含まない |
| `relations.sql` | **7** | インラインコメント除去 1 ／ `COMMENT ON COLUMN employees.manager_id` の引用が外れる 1 ／ FK 5 本が `fk_employees_manager_id` ほかへ |
| `house-defaults.sql` | **15** | インラインコメント除去 4 ／ 制約名 2（`users_pkey` → **`users_email_key`**（#6 の実害）・`article_tags_pkey` → **`pk_article_tags`**（fixture が持っていた名前が初めて出た））／ `COMMENT ON` の引用が外れる 7 ／ FK 2 |

```
$ git diff --stat tests/golden/
 5 files changed, 31 insertions(+), 31 deletions(-)
$ git status --porcelain tests/golden/json tests/golden/state tests/golden/ddl/{mysql,mssql,oracle,sqlite}
                                    # 空 ← 未現代化 4 本と他形式は 1 バイトも動いていない
```

**列コメントの二重出力**（列定義の `/* ... */` と `COMMENT ON COLUMN`）も同時に落とした。
上の表の「インラインコメント除去」7 行がそれで、`COMMENT ON COLUMN` 側が残る ——
`/* */` は PG では単なるコメントで、`COMMENT ON` と違いカタログに載らない。

テスト件数（左が 6-5a、右が本段階）:

| | 前 | 後 |
|---|---|---|
| `npm test` | 228 passed | **234 passed**（命名・引用・#11 の恒久テストを 6 本追加） |
| `npm run test:browser` | 108 passed | **109 passed**（`tests/browser/keys.spec.ts` を新設） |
| `npm run known-issues` | 7 passed | **5 passed**（#6 / #11 が出た） |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**golden で説明できない主張はすべて恒久テストに置いた。** fixture を 1 本も足していないのは
6-5a と同じ理由 —— `DDL_FIXTURES` に足すと golden が 5 プロファイル分増え、「動いた行を 1 行ずつ
説明する」という完了判定がぼやける。触ったのは `tests/fixtures/autoincrement.xml` の**先頭コメント
1 行だけ**で（「`<datatype>` が無視され BIGSERIAL が出る」という説明が嘘になったため）、
`<sql>` の中身は 1 バイトも動いていない。

| 主張 | golden | 恒久テスト |
|---|---|---|
| name 空 → `<t>_pkey` / `<t>_<cols>_key` / `idx_<t>_<cols>` | **説明できない**（fixture 11 個すべてが name を持つ） | `tests/node/ddl.test.ts`（#6 の移設先） |
| `CREATE INDEX` の経路 | **1 行も出ない**（`INDEX` / `FULLTEXT` の fixture が 0 本） | 同上 ＋ `tests/browser/keys.spec.ts`（UI からの到達点） |
| 予約語の引用 | **出ない**（fixture の識別子に予約語が無い） | 同上。**裸のままであること**も表に入れた（引用しすぎる側の退行が捕まらなくなるため） |
| #11 の `'` エスケープ | 出ない（PG 側の既定値が全部「式」判定） | `LITERALS` 表に `O'Brien` → `'O''Brien'` |
| #11 が未現代化 4 本では**直っていない** | 28 本の 0 バイト差 | 同ファイルの mysql のテスト（規則側の裏付け） |
| `key/@name` の `"null"` | 出ない | `tests/node/ddl.test.ts`（mssql で `CONSTRAINT null` が出ないこと） |

org のセキュリティ基準（分類 B: §2 ／ §3 の [B] ／ §4.2〜4.3 ／ §5.1）は着手前に一読した。
**本段階は依存を 1 本も増やしていない**（予約語表は自前の定数。§2.2 / §3.12 / §5.1）。
`innerHTML` 経路は増えておらず（§3.5）、生成する DDL は人が読んでから実行するもので
アプリ自身は SQL を実行しない。予約語の採取に使った `postgres:18` は使い捨てコンテナ
（`--rm`）で、リポジトリにも配布物にも痕跡を残していない。

#### 次段階への入力 —— 6-6（DB 別 fixture）

6-0 の分割表では次が 6-6。**6-5b が「規則は共通層・有効化は `isStrict()`」という形を作った**ので、
6-8（未現代化 4 本の現代化）は `naming.ts` に `IdentifierRules` を 4 つ足し、`datatypes.xml` に
`strict="1"` を付けるのが主な作業になる。引用文字は mysql が `` ` ``、mssql が `[ ]`、
oracle と sqlite が `"`（sqlite は `'` も受ける）で、**予約語表だけが 4 本ぶん要る** ——
`keywords.ts` の頭にある採取手順が mysql / mssql / oracle にもそのまま使える
（`INFORMATION_SCHEMA.KEYWORDS` / `sys.dm_exec_describe_first_result_set` ではなく、
各 DB のドキュメント付録に相当するものを実物から採ること）。

**6-8 で赤くなるのは 28 本の golden と known-issues #4 / #10 / #12 / #13。** どれも
「未現代化のまま」を固定している主張なので、赤くなること自体が進捗になる。

---

### 2026-08-20 HANDOVER §6「機能」段階6-6a —— fixture を DB 別に分け、配線だけを変える

**入力の母集団を作り替える段階の前半。** 6-0 の決めたこと 2 が実測で示していたとおり、
`tests/fixtures/` の 7 本は**すべて postgresql の型名で書かれており**、それを 5 プロファイル
全部に流して DDL golden 35 本を採っていた。非 PG では大半の型がパレットに無く、先頭型へ
黙って落ちた結果がそのまま焼かれている（`ddl/oracle/house-defaults.sql` は uuid / jsonb /
timestamptz が全部 `INTEGER`、`ddl/sqlite/house-defaults.sql` は全列 `TEXT`）。
**28 本が守っているのは「未知型が先頭型に落ちること」だけ**で、その DB の DDL が正しいことは
1 行も検証していない。

6-8（既存主要 4 本の現代化）でパレットに `strict="1"` を立てると**未知型は例外**になるので、
PG 用 fixture では golden がそもそも採れない。**6-6 は 6-8 の前提条件**で、到達点は
「6-8 で生成器とパレットを直したとき、その DB の golden が動くことで現代化が検証される」状態。

#### 決めたこと 1: 完全複製（`tests/fixtures/<db>/<name>.xml`）にする

共通 fixture を置いて差分だけ DB 別に上書きするオーバーレイ案を検討し、**採らなかった**。
理由は「共通に置ける型が実質存在しない」こと —— 5 プロファイルの型パレットを突き合わせると、
`TEXT` は oracle に無く（`CLOB` / `NCLOB`）、`VARCHAR` は sqlite に無く（affinity 5 型だけ）、
`INTEGER` すら mssql は `int` で `re="INT"` の部分一致に頼っている。**構造だけを見る
`minimal` や `relations` でさえ DB 非依存にはならない。** 真に共通なのは `empty`（テーブル 0 件）
1 本だけで、そのために 2 つの置き場所を持つ規則を足す価値はない。

型名をプレースホルダで書いてテスト側がパレットから展開する案も落とした。**パレットを読んで
入力を組み立てると、6-8 でパレットを差し替えたときに golden が動く理由が二重になる**
（生成器を直したからなのか、入力が変わったからなのか）。fixture は手書きのまま置く
（docs/TESTING.md「fixture の生成に現行コードを使わない」）。

複製の副作用は `empty.xml` のようにほぼ同内容のファイルが増えることだが、規則は
**「DB × 名前 → ファイル」の 1 本**だけになる。6-7 で新設 3 本を足すときも
ディレクトリを 1 つ増やすだけで済む。

#### 決めたこと 2: 6-6a と 6-6b に割る（完了判定が別物になるため）

| 段階 | 変えるもの | 完了判定 |
|---|---|---|
| **6-6a**（本エントリ） | 配線とディレクトリ構成だけ | **DDL golden 35 本が 1 バイトも動かない** |
| **6-6b** | 4 プロファイルの fixture の中身 | **28 本が動き、動いた理由を DB ごとに説明できる** |

6-5a / 6-5b と同じ型紙。**混ぜると golden の差分が「移動由来」と「実型化由来」で
混ざり、レビューで切り分けられなくなる。**

そのため 6-6a では `mysql` / `mssql` / `oracle` / `sqlite` の 7 本ずつを
**postgresql 版の逐語コピー**にしてある。半移行を黙って置かないよう、
**28 ファイルすべての先頭コメント**に「これは 6-6a の暫定コピーで、型名は postgresql のもの。
実型へ書き直すのは 6-6b」と書いた（CLAUDE.md 制約1）。

#### 決めたこと 3: `readFixture(db, name)` の `db` は省略できない

既定値（`db = "postgresql"`）を持たせる案を採らなかった。**「どのプロファイル向けの入力を、
どのパレットで読んでいるか」がずれていること自体が主張になっているテストがある**ため:

| テスト | 入力 | パレット | 主張 |
|---|---|---|---|
| known-issues **#4** | `postgresql/house-defaults` | `mysql` | パレットに無い `UUID` が先頭型 `integer` に落ちる |
| known-issues **#10** | known-issues 側の fixture | `oracle` / `mssql` | `re` の部分一致が `sql` の完全一致を上書きする |
| `state/mysql-house-defaults.json` | `postgresql/house-defaults` | `mysql` | 同じ入力を別パレットで読んだときの解決結果 |

既定値があると、この 3 本は「db を書かない呼び出し」のまま残り、6-6b で 4 本の fixture を
実型に書き換えた瞬間に**主張が静かに消える**（`mysql` の fixture を `mysql` のパレットで
読むのは正常系で、#4 は再現しない）。呼び出し側に db を書かせれば、書き換えの影響が
grep で見える。約 60 箇所は機械的に `readFixture(SERIALIZER_DB, ...)` へ移した。

#### 決めたこと 4: known-issues の fixture は DB 別にしない

[`tests/known-issues/fixtures/`](tests/known-issues/fixtures/) の 5 本は 1 本のまま置く。
既知の不具合はどれも「**特定のパレットで**読んだときに起きること」が主張なので、
入力を DB ごとに分けると再現条件そのものが消える。決めたこと 3 の裏返し。

#### 決めたこと 5: 母集団を見るテストを 1 本足した

[`tests/node/fixture-set.test.ts`](tests/node/fixture-set.test.ts)（3 件）。
`DB_PROFILES` × `FIXTURES` のファイルが**全部実在し、余分も無い**こと・`tests/fixtures/`
直下に `.xml` が残っていないこと・fixture のディレクトリが `db/` のプロファイルと 1 対 1 で
あることを見る。

分けた瞬間に「置き忘れ」という新しい壊れ方が生まれるのが理由。6-7 で
`db/<db>/datatypes.xml` だけ置いて fixture を忘れると DDL golden のテストが
「golden が無い」で落ち、**原因が期待値の不在に見えて実際は入力の不在**という読み違えやすい
形になる。`tests/node/palette-id.test.ts` がパレット側にやっていることの、入力側の対応物。

[`tests/node/type-resolution.test.ts`](tests/node/type-resolution.test.ts) の
`candidateNames()`（照合に掛かりうる型名の母集団）も **全プロファイルの fixture の和集合**へ
配線し直した。直下を `readdirSync` していたので、放置すると **fixture 由来の型名が 0 件に
なって母集団が静かに縮む**（「未現代化プロファイルは旧規則と 1 件も違わない」という
6-2 からの安全網が空振りになる）。件数の下限を見るテストが既に隣にあるので実害は出ないが、
配線としては誤り。

#### 決めたこと 6: この段階に入れなかったもの

| 項目 | 送り先 | 理由 |
|---|---|---|
| 4 プロファイルの fixture を実型・実既定値で書き直す | **6-6b** | 決めたこと 2 |
| `types-matrix` のパレット全型網羅と、その網羅を機械検査するテスト | **6-6b** | 同上。網羅は中身の話 |
| 新設 3 本（`sql-standard` / `mariadb` / `h2`）の fixture | **6-7** | `db/` にディレクトリが無く `DB_PROFILES` に入らない。6-6a の構造にディレクトリを足すだけで済む |
| パレットの現代化・`strict="1"`・`re` の是正（#4 / #10） | **6-8** | 変わらず |
| fixture を XML から設計 JSON へ移す案 | **見送り（記録のみ）** | XML 経路は #4 / #10 の唯一の再現路で、互換読込の特性化そのもの。形式を変えると再現条件が消える |

#### 検証

**完了判定は golden 無差分そのもの。** 配線だけを変える段階なので、期待値が 1 バイトも
動かないことが正しさの直接の証明になる。

```
$ git status --porcelain tests/golden/{ddl,json,state}
                                    # 空 ← 期待値 50 本（ddl 35 / json 7 / state 8）すべて不動
```

（`tests/golden/README.md` だけは本段階で書き換えている —— 期待値ではなく注意書きのほう。
入力が DB 別になったことと、6-6a の時点では 4 本が暫定コピーであることを追記した。）

| | 6-5b | 6-6a |
|---|---|---|
| `npm test` | 234 passed | **237 passed**（`fixture-set.test.ts` の 3 本） |
| `npm run test:browser` | 109 passed | 109 passed |
| `npm run known-issues` | 5 passed | 5 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

`js/` の差分は **0 行**（本段階が触ったのは `tests/` と `docs/` だけ）。

org のセキュリティ基準（分類 B: §2 ／ §3 の [B] ／ §4.2〜4.3 ／ §5.1）は着手前に一読した。
**依存は 1 本も増やしていない**（§2.2 / §3.12 / §5.1）。§2.1 の「実データをテストの入力に
置かない」は本段階で 28 ファイルを増やしたので改めて確認した —— fixture のスキーマは
`users` / `articles` / `article_tags` の架空のもので、実データは 1 行も含まない。
CI のワークフローは増やしていない（トリガーも不変。テスト件数は +3、実行時間は不変）。

#### 次段階への入力 —— 6-6b（4 プロファイルの実型化）

書けるのは**現行パレットに実在する `sql` 名だけ**。パレットに無い型（mysql の `JSON`、
oracle の `TIMESTAMP WITH TIME ZONE` など）を足すのは 6-8 なので、**6-6b の golden は
「6-8 直前のベースライン」**であってその DB の理想形ではない。house 既定の写り方:

| house 既定 | `mysql` | `mssql` | `oracle` | `sqlite` |
|---|---|---|---|---|
| `id uuid DEFAULT uuidv7()` | `CHAR(36)` / `UUID()` | **`uniqueidentifier`** / `NEWID()` | `RAW(16)` / `SYS_GUID()` | `TEXT` / 既定値なし |
| `text` | `MEDIUMTEXT` | `nvarchar(4000)` | `CLOB` | `TEXT` |
| `boolean` | `bit` | `bit` | `NUMBER(1)` | `INTEGER` |
| `jsonb` | `MEDIUMTEXT` | `nvarchar(4000)` | `CLOB` | `TEXT` |
| `timestamptz` / `now()` | `TIMESTAMP` / `CURRENT_TIMESTAMP` | `datetime` / `GETDATE()` | `TIMESTAMP` / `SYSTIMESTAMP` | `TEXT` / `CURRENT_TIMESTAMP` |
| `numeric(12,2)` | `DECIMAL(12,2)` | `decimal(12,2)` | `DECIMAL(12,2)` | `NUMERIC`（`length="0"` なので精度が落ちる） |
| `date` | `DATE` | **`datetime`**（`date` 型がパレットに無い） | `DATE` | `TEXT` |
| `integer` | `INTEGER` | `int` | `INTEGER` | `INTEGER` |

**`mssql` の `timestamp` は行バージョンであって日時ではない**（`datetime` を使う）。
この表は 6-7 の「house 既定のスキーマが各 DB で失うもの」を 4 本ぶん埋めるもので、
**表そのものが公開プロダクトの価値情報**（ユーザーが DB を選ぶときに見る）。

**6-6b で予測される粗さ**は直さずに golden へ焼く —— 未現代化の生成器は式と文字列リテラルを
区別しないので、`oracle` の `raw`（`quote="'"`）に `SYS_GUID()` を置くと
`DEFAULT 'SYS_GUID()'` が出る。**known-issue #11 の未現代化 4 本ぶんの実害が初めて
golden に現れる形**で、6-8 で直すときにその行が動くことが現代化の証明になる。

---

### 2026-08-20 HANDOVER §6「機能」段階6-6b —— 4 プロファイルの fixture を実型で書き直す

**入力の母集団を作り替える段階の後半。** 6-6a が配線だけを変え（golden 無差分）、
本段階が中身を各 DB の実型・実既定値にする。**非 PG の DDL golden が初めて
「その DB の DDL」になった**段階。

#### 決めたこと 1: パレットも生成器も 1 バイトも触らない

書けるのは**現行パレットに実在する型だけ**。mysql の `JSON`、oracle の
`TIMESTAMP WITH TIME ZONE`、mssql の `date` はどれもパレットに無いので使えない。
足すのは 6-8 で、**6-6b の golden は「6-8 直前のベースライン」**であってその DB の
理想形ではない。

これを外すと段階が混ざる —— golden が動いた理由が「入力を変えたから」なのか
「パレットを変えたから」なのか切り分けられなくなる。6-6a が
「移動由来と実型化由来を混ぜない」ために段階を割ったのと同じ論法。

#### 決めたこと 2: house-defaults は「その DB で普通に書く形」にする

型だけ機械的に置き換えるのではなく、**その DB の制約に従って設計そのものを寄せた**。
判断が要ったのは 3 つで、どれも「house 既定をそのまま訳すと壊れる」箇所:

| 箇所 | 機械的な訳 | 採った形 | 理由 |
|---|---|---|---|
| `oracle` の `email`（UNIQUE 付き） | `text` → `CLOB` | **`VARCHAR2(255)`** | **CLOB には UNIQUE も PRIMARY KEY も張れない** |
| `mysql` の `email` / `tag`（UNIQUE・複合 PK） | `text` → `MEDIUMTEXT` | **`VARCHAR(255)` / `VARCHAR(64)`** | TEXT 系にキーを張るには prefix 長が要る |
| `mysql` の `preferences` | `jsonb` → `MEDIUMTEXT` ＋ `DEFAULT '{}'` | **既定値を持たせない** | **MySQL は TEXT 系に DEFAULT を付けられない** |

`sqlite` の `id` も既定値を持たない —— **SQLite に uuid 生成関数が無い**ため（4 本で唯一）。

#### 決めたこと 3: types-matrix はパレット全型を 1 列ずつ。網羅は機械的に見る

| プロファイル | 6-6a まで | 6-6b |
|---|---|---|
| `mysql` | PG 用 27 列（16 列が INTEGER 系に落ちる） | **23 列 = パレット全型** |
| `mssql` | PG 用 27 列（22 列が未知型） | **26 列** |
| `oracle` | PG 用 27 列（18 列が未知型） | **15 列** |
| `sqlite` | PG 用 27 列（25 列が TEXT） | **5 列**（型ではなく型親和性。これが SQLite の全部） |
| `postgresql` | 27 列（24 型中 22 型を網羅） | 29 列（**`BIGINT` / `UUID` を追加**。決めたこと 4） |

検査は [`tests/node/fixture-set.test.ts`](tests/node/fixture-set.test.ts) に 2 種
× 5 プロファイル（計 10 件）:

- `types-matrix` がパレットの全型を 1 列以上書いている
- どの fixture もパレットが知らない型名を書いていない（書き間違いは未現代化では
  黙って先頭型に落ち、strict では例外になる。**現れ方が違うので入力の時点で捕まえる**）

**判定は `sql` そのものではなく `sql` ∪ `aka`。** `postgresql` の types-matrix は旧名
（`SERIAL` / `DECIMAL` / `TIMESTAMP` …）で書いてあり、それは `aka` で読む互換経路を
fixture 由来の実バイト列で通す役目を兼ねている。別名で書いてもその型を網羅している。

**見るのは入力側の網羅だけで、解決結果は見ない。** `oracle` の `INTEGER` のように
書いた型に到達できないものがあり（下）、そちらは golden と
[`type-resolution.test.ts`](tests/node/type-resolution.test.ts) の仕事。混ぜると
6-8 でどちらが直ったのか分からなくなる。

#### 決めたこと 4: `postgresql` に `BIGINT` / `UUID` を足した（6-2 が送った項目）

6-2 は「#3 が直ったので `BIGINT` を正常系に入れられるが、列を足すと golden が動いて
完了判定がぼやける」として **6-6 へ送っていた**。母集団を再編する 6-6 がその送り先そのもの。
この 2 型を足すまで PG の types-matrix は 24 型中 22 型しか覆っておらず、決めたこと 3 の
網羅検査が通らない。**旧名の列は残してある**（決めたこと 3 の後段）。

#### 決めたこと 5: known-issue **#14** を新設した

`mssql` の UNIQUE キーが **T-SQL に無い `UNIQUE KEY (...)` 構文**（MySQL のもの）で出る。
[`frontend/js/io/ddl/mssql.ts:63`](frontend/js/io/ddl/mssql.ts#L63) が `db/mssql/output.xsl` の逐語で、
正しくは `CONSTRAINT <name> UNIQUE ( <cols> )`。**6-5a が移植した upstream の粗さで、
当時の 9 件の一覧から漏れていたもの** —— 4 本の fixture を実型で書き直すときに
house 既定の UNIQUE を読み直して見つかった。house 既定は `users` に UNIQUE を 1 本持つので
**この DB では必ず踏む**。直すのは 6-8。

#### 6-6b で初めて golden に写った粗さ（どれも 6-8 の材料）

fixture が PG 用のままだった間は「未知型が先頭型に落ちる」ことに隠れて見えなかったもの。

| 現象 | 実物 | 記録 |
|---|---|---|
| `oracle`: `INTEGER` と書いた列が `NUMBER` になる（**このパレットで `integer` 型には到達できない**） | `ddl/oracle/types-matrix.sql` の `c_integer` | known-issue **#10** |
| `mssql`: `DEFAULT` が 1 つも出ない（生成器に分岐が無い） | `ddl/mssql/house-defaults.sql` —— `NEWID()` も `GETDATE()` も既定値 `1` も丸ごと落ちる | 6-5a の 9 件の 1 つ。**golden 未カバー → カバー済みに昇格** |
| `mssql`: `UNIQUE KEY (...)` | 同上 | known-issue **#14**（本段階で新設） |
| `sqlite`: コメントが 1 つも出ない | `ddl/sqlite/house-defaults.sql` に 1 行も無い（`mysql` の同じ fixture は 7 行出す） | 6-5a の 9 件の 1 つ |
| 未現代化 4 本: 式の既定値が引用符で囲まれる | `DEFAULT 'UUID()'`（mysql）／ `DEFAULT 'SYS_GUID()'`（oracle） | known-issue **#11** の未現代化ぶん |

**`CURRENT_TIMESTAMP` だけが裸で出る**のは upstream が特例を 1 つだけ持っているため
（[`frontend/js/io/ddl/shared.ts`](frontend/js/io/ddl/shared.ts) の `quoteDefault`）。strict なら
`isSqlExpression()` が式全般を見るので、6-8 で `UUID()` も `SYS_GUID()` も裸になる。

**`mysql` の「コメントを 60 字で無言に切り詰める」は golden に出ていない**
（fixture のコメントが最長 26 文字のため）。出ていないことのほうを
`tests/golden/README.md` に書いた。

#### house 既定が各 DB で何を失うか（**現行パレットでの実測**）

6-7 が `sql-standard` / `mariadb` / `h2` について設計として書いた表の、**残り 4 本の実測版**。
6-8 でパレットを現代化すると改善する行があるので、○×は「いまの `db/<db>/datatypes.xml` で
書ける範囲」であることに注意。

| house 既定 | `postgresql` | `mysql` | `mssql` | `oracle` | `sqlite` |
|---|---|---|---|---|---|
| uuid PK | ○ `UUID` | × `CHAR(36)` | **○ `uniqueidentifier`** | × `RAW(16)` | × `TEXT` |
| uuid の生成 | ○ `uuidv7()` | △ `UUID()`（v4） | △ `NEWID()`（v4） | △ `SYS_GUID()` | **× 関数が無い（既定値を持てない）** |
| 監査列の tz | ○ `TIMESTAMPTZ` | × `TIMESTAMP` | × `datetime` | × `TIMESTAMP`（パレットに tz 付きが無い） | × `TEXT` |
| jsonb | ○ | × `MEDIUMTEXT` | × `nvarchar` | × `CLOB` | × `TEXT` |
| boolean | ○ | △ `bit` | △ `bit` | △ `NUMBER(1)` | △ `INTEGER` |
| date | ○ | ○ `DATE` | **× `datetime`**（日付だけの型がパレットに無い） | ○ `DATE` | × `TEXT` |
| numeric(p,s) | ○ | ○ | ○ | ○ | **× `NUMERIC`**（`length="0"` で精度を書けない） |
| 既定値が DDL に出るか | ○ | ○（式は引用される） | **× 1 つも出ない** | ○（式は引用される） | ○ |

**この表そのものが公開プロダクトの価値情報**（ユーザーが DB を選ぶときに見る）。
6-8 の後にもう一度採り直し、利用者向けドキュメントへ出す。

#### 検証

**動いた golden は 21 本。** DB ごとに 1 本ずつ理由を説明できる形にした
（コミットも DB 単位で割ってある）。

| プロファイル | 本数 | 動かなかったもの | 主な内訳 |
|---|---|---|---|
| `mysql` | **4** | `empty` / `minimal` / `autoincrement` —— 型が `INTEGER` と `VARCHAR(64)` だけで PG 版と一致 | 型が `CHAR(36)` / `VARCHAR` / `bit` / `MEDIUMTEXT` / `TIMESTAMP` へ、既定値が `UUID()` / `CURRENT_TIMESTAMP` へ |
| `mssql` | **6** | `empty` のみ | PG 用の `INTEGER` / `VARCHAR` がパレットに無く `bigint` / `tinyint` に落ちていたので `minimal` と `autoincrement` も動いた |
| `oracle` | **5** | `empty` / `minimal` —— `INTEGER` は実型版でも `NUMBER` に化けるので結果が同じ | `RAW(16)` / `VARCHAR2` / `NUMBER(1)` / `CLOB` / `TIMESTAMP(6)` へ |
| `sqlite` | **3** | `minimal` / `relations` / `quotes-i18n` —— PG 用の `INTEGER` と `TEXT` がどちらも実在する | `types-matrix` が 27 → 5 列、既定値の是正、`TEXT(64)` → `TEXT` |
| `postgresql` | **3** | `ddl` 6 本 | `types-matrix` の 2 列追加だけ（`ddl` 2 行 / `json` 10 行 / `state` 44 行） |

```
$ git diff --shortstat <6-6a> -- tests/golden/
 22 files changed, 248 insertions(+), 217 deletions(-)   # 21 本 ＋ README.md
```

| | 6-6a | 6-6b |
|---|---|---|
| `npm test` | 237 passed | **247 passed**（網羅検査 10 件） |
| `npm run test:browser` | 109 passed | 109 passed |
| `npm run known-issues` | 5 passed | **6 passed**（#14 を新設） |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

`js/` の差分は **0 行**（本段階も触ったのは `tests/` と `docs/` だけ）。

org のセキュリティ基準（分類 B: §2 ／ §3 の [B] ／ §4.2〜4.3 ／ §5.1）は着手前に一読済み。
**依存は 1 本も増やしていない。** §2.1 の「実データをテストの入力に置かない」は 28 ファイルを
書き直したので改めて確認した —— スキーマは `users` / `articles` / `article_tags` の架空のもので、
実データも実在の資格情報も 1 行も含まない。CI のワークフローは増やしていない
（テスト件数は +11、実行時間は不変）。

#### 次段階への入力

**6-6 は閉じた。** 6-0 の分割表の次は 6-7（新設 3 本）。

- **6-7**: `db/sql-standard` / `db/mariadb` / `db/h2` を置き、
  `tests/fixtures/<db>/` を 3 つ増やす。**fixture の置き忘れは
  `fixture-set.test.ts` が名指しで落とす**（6-6a の決めたこと 5）。型マッピングは
  2026-08-16 の設計先行エントリが確定済み
- **6-8**: 4 本のパレットに `strict="1"` と `aka` を入れ、`re` を落とす。
  そのとき **`naming.ts` に `IdentifierRules` を 4 つ足す**（6-5b の決めたこと 8）。
  赤くなるのは known-issues **#4 / #10 / #12 / #13 / #14** と、本段階が採り直した
  **19 本の DDL golden** —— どれも「未現代化のまま」を固定している主張なので、
  赤くなること自体が進捗になる。**6-6b がその比較対象を作った**

---

### 2026-08-20 HANDOVER §6「機能」段階6-7a —— `sql-standard` を TS 生成器の上に載せる

**新設 3 本の 1 本目。** 6-0 の分割表は 6-7 を「新設 3 本（`sql-standard` / `mariadb` / `h2`）を
TS 生成器の上に載せる」としており、型マッピングは 2026-08-16 の設計先行エントリで確定済み。
実装は **3 段階に割った**（6-6 と同じ理由 —— プロファイルごとに golden が 7 本増えるので、
1 本ずつなら「増えた 7 本を 1 本ずつ説明する」が完了判定になる）。
`sql-standard` を最初に置くのは 6-7 の決めたこと 1 のとおり **これが基底**だから。

#### 決めたこと 1: 予約語は SQL:2016 の 365 語。PostgreSQL のソースから採った

6-5b が「予約語の一覧は推測せず実物から採る」を規約にしたが、**ISO/IEC 9075 は有料**で
起動できるコンテナも無い。一次資料に選んだのは **PostgreSQL のソースツリー** ——
`doc/src/sgml/keywords/` に各版の予約語が規格から転記されており、付録 C「SQL Key Words」の
表がそこから生成されている。

```
$ curl https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/    doc/src/sgml/keywords/sql2016-02-reserved.txt
  -> 採取日 2026-08-20 / ISO/IEC 9075-2:2016 の <reserved word> / 365 語
```

**PG の 101 語より遥かに多いのは、標準が関数名まで予約しているため**（`abs` / `acos` /
`avg` / `count` …）。それでも落とさない —— 標準準拠を名乗るプロファイルで
「この DDL は SQL:2016 として妥当」と言えることが `sql-standard` の存在理由そのもの。
実害は `year` や `value` のようなありふれた列名が引用されることだが、囲めば必ず通る。

**この語彙差そのものを恒久テストにした**（[`tests/node/ddl.test.ts`](tests/node/ddl.test.ts)
の `VOCABULARY` 表）。`year` / `value` / `abs` / `count` は **PG で裸・標準で引用**、
`analyse` / `ilike` / `freeze` は **PG で引用・標準で裸**。片方の語彙をもう片方に貼り間違えると
必ず落ちる形にしてある。**golden には 1 行も出ない**（fixture の識別子に標準予約語が無い）。

#### 決めたこと 2: 標準に無い 2 つは「出さない」ではなく「行コメントで出す」

| 構文 | 標準では | 採った形 |
|---|---|---|
| `COMMENT ON` | 無い（PostgreSQL / Oracle の拡張） | `-- users.email: ログイン用メールアドレス` |
| `CREATE INDEX` | **索引は標準の範囲外**（どの版にも無い） | `-- CREATE INDEX idx_... ; (索引は SQL 標準の範囲外)` |

**設計が持っている情報を落とさない**ほうを採った。このプロファイルの用途は「ベンダ非依存で
書いて各製品へ持っていく出発点」なので、移し先に渡すものが減るのは損失が大きい。
コメントなので**標準 SQL として実行できることは変わらない**。

行コメントにしたぶん **改行を空白へ畳む必要がある**（`--` は行末までがコメントなので、
値に改行が入ると 2 行目から SQL として解釈されて壊れる）。`postgresql` は `'...'` で囲むので
同じ危険が無く、この処理は `sql-standard` に閉じている。

#### 決めたこと 3: テンプレートは各プロファイルが house 既定を最も近く表す形で持つ

6-4 は「テンプレートを持つのは strict なプロファイルだけ」と決め、当時それは `postgresql` の
1 本だった。**新設は最初から strict なので、テンプレートも同時に要る。**

```xml
<row name="id" type="char" size="36" null="0" key="PRIMARY" />
```

**標準に UUID 型も生成関数も無い**ので、house 既定の PK は `CHARACTER(36)` で
**既定値を持たない**（採番はアプリ側）。監査列は `TIMESTAMP WITH TIME ZONE` ＋
`CURRENT_TIMESTAMP` で、**tz は失わない** —— 標準にある型で、PG の `TIMESTAMPTZ` のほうが短縮形。
6-6b で実測した 4 プロファイルが全部失う tz を、このプロファイルは保つ。

`newrowtype` は `varchar`。house 標準は「text 優先」だが**標準の text 相当は
`CHARACTER LARGE OBJECT`（CLOB）**で、新規行の既定が CLOB になるのは実用的でない。

#### 決めたこと 4: 共通骨格の抽出は 3 本そろうまで待つ

6-5a が 6-7 へ送った項目。**まだやらない。** `sql-standard.ts` は `postgresql.ts` と骨格が
同じで、違うのは決めたこと 2 の 2 点だけ。いま括れば「2 本の共通項」しか見えない。
`h2`（標準に近い）と `mariadb`（MySQL 系文法）を書くと**別系統の差が出る**ので、
3 本そろってから括るほうが正しい抽象になる。6-7c の後半でやる。

既存 5 本には 1 行も触っていない。**新設プロファイルは既存の出力に触れない**のが本段階の
安全性の根拠で、それが下の完了判定そのもの。

#### 決めたこと 5: この段階に入れなかったもの

| 項目 | 送り先 | 理由 |
|---|---|---|
| `h2` / `mariadb` | **6-7b / 6-7c** | 決めたこと 4 の分割 |
| 8 本の共通骨格の抽出 | **6-7c** | 決めたこと 4 |
| 未現代化 4 本の現代化（#4 / #10 / #12 / #13 / #14） | **6-8** | 変わらず |
| `sql-standard` を UI の既定にする案 | **採らない（記録のみ）** | house 標準は PostgreSQL 18。既定を動かす理由が無い |

#### 検証

**完了判定は「既存 35 本が 1 バイトも動かず、新設 7 本が増える」。**

```
$ git status --porcelain tests/golden/
?? tests/golden/ddl/sql-standard/      # 新規 7 本だけ。既存に M は 1 つも付かない
```

| | 6-6b | 6-7a |
|---|---|---|
| `npm test` | 247 passed | **269 passed** |
| `npm run test:browser` | 109 passed | **116 passed**（DDL golden が 7 件増えた） |
| `npm run known-issues` | 6 passed | 6 passed |
| `npm run test:dist` | 3 passed | 3 passed（`dist/db/sql-standard/` も入っている） |
| `npm run typecheck` | 緑 | 緑 |

`js/` に足したのは **新設 1 ファイル**（`ddl/sql-standard.ts`）＋ `keywords.ts` / `naming.ts` /
`generate.ts` / `config.ts` への追記。**既存プロファイルの生成器は 1 行も変えていない。**

org のセキュリティ基準（分類 B: §2 ／ §3 の [B] ／ §4.2〜4.3 ／ §5.1）は着手前に一読済み。
**依存は 1 本も増やしていない**（予約語表は自前の定数。取得に使った `curl` は採取時 1 回きりで、
リポジトリにも配布物にもネットワーク経路は残らない。§2.2 / §3.12 / §5.1）。
CI のワークフローは増やしていないが、**`test:browser` の実行時間が 35 秒 → 1.8 分に伸びた**
（DDL golden が 35 → 42 件）。6-7b / 6-7c でさらに 14 件増えるので、
`ci-strategy.md` の判断規約に照らす必要が出たらそのときに測る。

#### 次段階への入力 —— 6-7b（`h2`）

6-7 の設計表が「**house 既定の 4 点がすべてネイティブ**」と書いたプロファイル
（`UUID` / `BIGINT GENERATED ALWAYS AS IDENTITY` / `TIMESTAMP WITH TIME ZONE` / `JSON`）。
**PG で設計して H2 でテストする経路が型レベルで通る**ことが対応 DB に入れた理由そのものなので、
テンプレートは `postgresql` にいちばん近い形になる（uuid 生成関数だけが無い）。

- 予約語は **H2 の実物から採る**（`INFORMATION_SCHEMA.KEYWORDS` を持つ）。6-5b の PG と同じ手順
- 生成器は `sql-standard` にいちばん近い。**H2 は `COMMENT ON` を持つ**ので、そこが分岐点
- **H2 のバージョンを明示する**（1.4 と 2.x で型システムが違う。6-7 の設計エントリの指示）


---

### 2026-08-21 HANDOVER §6「機能」段階6-7b —— `h2` を入れ、ansi 系 3 本の骨格を括る

**新設 3 本の 2 本目。** 6-7 の設計（2026-08-16）が「**house 既定の 4 点がすべてネイティブ**」と
書いた唯一の非 PostgreSQL で、**PG で設計して H2 でテストする経路が型レベルで通る**ことが
対応 DB に入れた理由そのもの（house は Kotlin/Spring Boot）。

#### 決めたこと 1: 予約語は「実物に総当たりで聞く」で採った

6-7 の設計エントリは「H2 は `INFORMATION_SCHEMA.KEYWORDS` を持つ」と書いていたが、**2.4.240 に
そのビューは無い**（35 ビューを数えて確認）。PG の `pg_get_keywords()` にあたる一覧が引けない。

かわりに**実物に総当たりで聞いた** —— 語ごとに `CREATE TABLE t_probe(<語> INT)` を試し、
拒まれた語を集める。「列名に使えるか」で採るのは PG（catcode R / T）と同じ基準。

```
$ curl -O https://repo1.maven.org/maven2/com/h2database/h2/2.4.240/h2-2.4.240.jar
$ java -cp h2-2.4.240.jar Kw.java <母集団> <出力>
  -> 採取日 2026-08-21 / H2 2.4.240 / 母集団 391 語 -> **90 語**
```

**母集団の作り方が採取の限界そのもの。** SQL:2016 の 365 語 ∪ PostgreSQL の 101 語 ∪
H2 のソース（`org/h2/util/ParserUtil.java`）の文字列リテラルを合わせた 391 語で、
**ここに無い語は漏れる**。ParserUtil を混ぜたのは標準にも PG にも無い H2 固有語を拾うためで、
実際に 6 語（`if` / `key` / `minus` / `qualify` / `rownum` / `_rowid_`）がそこからしか出ていない。

jar は採取時 1 回きりで、リポジトリにも配布物にも残していない（6-5b の `postgres:18` と同じ扱い）。

#### 決めたこと 2: 型も実物に聞いた —— 設計表を 1 行訂正した

候補ごとに `CREATE TABLE t(c <型>)` を試して通った型だけをパレットに置いた。
**6-7 の設計表が「`h2` は `interval` を持つ」としていたのは誤り**で、

```
NG   INTERVAL       -> SQL ステートメントに文法エラー "CREATE TABLE t_probe(c INTERVAL[*])"
OK   INTERVAL YEAR  -> INTERVAL
```

**単独の `INTERVAL` 型が無い**（`INTERVAL YEAR` のように単位が要る）。`<type>` の列挙では
表せないので**入れない** —— 配列型や生成列を 6-0 が入れなかったのと同じ理由。
`XML` と `INET` も無いことを実測で確かめた（`XML` は `aka` で `text`＝CLOB が受ける）。

かわりに H2 にあって PG に無い `tinyint` / `decfloat` / `varbinary` を足し、**22 型**にした。
`enum` / `varchar_ignorecase` / `java_object` は入れない —— どれも H2 固有で、
設計ツールとして他プロファイルへ持っていけない（`java_object` は Java 依存そのもの）。

#### 決めたこと 3: 6-7a の「3 本そろうまで待つ」を前倒しした（ansi.ts の抽出）

6-7a は共通骨格の抽出を 6-7c へ送っていた。**`h2` を書く段になって前提が変わった** ——
H2 は postgresql と**構文レベルで同一**（`COMMENT ON` も `CREATE INDEX` も
`GENERATED ALWAYS AS IDENTITY` も持ち、識別子は `"` で囲む）で、違うのは予約語の語彙だけ。
このまま書けば **170 行のコピーが 3 本目としてできる**。

[`frontend/js/io/ddl/ansi.ts`](frontend/js/io/ddl/ansi.ts) を作り、3 本の違いを 2 つに畳んだ:

| | `postgresql` | `sql-standard` | `h2` |
|---|---|---|---|
| `rules`（識別子の語彙） | PG 101 語 | SQL:2016 365 語 | H2 90 語 |
| `hasCommentOn` | ○ | **×**（標準に無い→行コメント） | ○ |
| `hasCreateIndex` | ○ | **×**（索引は標準の範囲外→行コメント） | ○ |

**6-7a の判断を覆したのではなく、対象を切り分けた。** あそこで待つと決めたのは
「**8 本の一般化**」で、`mysql` / `mssql` / `oracle` / `sqlite` / `mariadb` は DROP 文・GO・
trigger + sequence・inline FK と骨格からして違う。`ansi.ts` が受け持つのは
「**CREATE TABLE ＋ ALTER TABLE ADD CONSTRAINT で組み立てる系**」だけで、
それらを含む抽象は 6-7c（mariadb）と 6-8 で決める。

**postgresql と sql-standard の出力はバイト単位で不変**（golden 14 本が 1 バイトも動いていない）。
`postgresql.ts` は 170 行 → 39 行になり、残ったのは「このプロファイルは何者か」の記述だけ。

#### 決めたこと 4: house 既定が H2 で失うのは 1 つだけ

| house 既定 | `h2` |
|---|---|
| `id uuid` | ○ `UUID`（ネイティブ） |
| **`uuidv7()`** | **× `RANDOM_UUID()`（v4。時系列の順序性を失う）** |
| `created_at timestamptz` | ○ `TIMESTAMP WITH TIME ZONE` |
| `jsonb` | ○ `JSON` |
| `boolean` | ○ `BOOLEAN` |
| identity | ○ `BIGINT GENERATED ALWAYS AS IDENTITY` |

6-6b で実測した 4 プロファイル（uuid も tz も jsonb も失う）と対照的で、
**この 1 行が「PG で設計して H2 でテストする」を支えている**。

#### 決めたこと 5: 生成した DDL を実物に流して確かめた

golden を採ったあと、**6 本すべてを H2 2.4.240 で実際に実行した**（`empty` は空なので除く）:

```
$ java -cp h2-2.4.240.jar org.h2.tools.RunScript     -url jdbc:h2:mem:v -user sa -script tests/golden/ddl/h2/<name>.sql
  -> minimal / house-defaults / relations / types-matrix / autoincrement / quotes-i18n
     すべてエラー無し（日本語識別子を含む quotes-i18n も通る）
```

**grabado の歴史で初めて「生成した DDL が実物で動く」ことを確かめた段階。**
これまでの 5 プロファイルは golden（バイト列の固定）しか根拠を持っておらず、
6-6b で見つかった `mssql` の `UNIQUE KEY` のような構文エラーは目で読んで気づくしかなかった。

**恒久テストにはしない** —— jar が要り、依存を増やす（分類 B の §5.1）。採取時の検証として
記録に残し、6-8 以降で他プロファイルにも同じ手当てをするかは別途判断する
（`mysql` / `mariadb` / `mssql` / `oracle` は docker が要る）。

#### 決めたこと 6: この段階に入れなかったもの

| 項目 | 送り先 | 理由 |
|---|---|---|
| `mariadb` | **6-7c** | MySQL 系文法で `ansi.ts` に載らない。骨格の一般化と一緒にやる |
| 8 本ぶんの共通骨格 | **6-7c / 6-8** | 決めたこと 3 |
| 生成 DDL の実物検証をテスト化する案 | **見送り（記録のみ）** | 決めたこと 5 |
| `interval` を単位付きで表す | **6-9 以降** | 決めたこと 2。配列型・生成列と同じ「型の修飾」の問題 |

#### 検証

**完了判定は「既存 42 本が 1 バイトも動かず、新設 7 本が増える」。**
骨格の抽出（決めたこと 3）でも動いていないことが、同じ 1 行で示せている。

```
$ git status --porcelain tests/golden/
?? tests/golden/ddl/h2/       # 新規 7 本だけ。postgresql / sql-standard にも M は付かない
```

| | 6-7a | 6-7b |
|---|---|---|
| `npm test` | 269 passed | **287 passed** |
| `npm run test:browser` | 116 passed | **123 passed** |
| `npm run known-issues` | 6 passed | 6 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

org のセキュリティ基準（分類 B: §2 ／ §3 の [B] ／ §4.2〜4.3 ／ §5.1）は着手前に一読済み。
**依存は 1 本も増やしていない** —— H2 の jar は採取時にダウンロードして使い、
`package.json` にも配布物にも入れていない（§2.2 / §3.12 / §5.1）。
CI のワークフローは増やしていない。**`test:browser` は 1.8 分 → 2 分台**（DDL golden 42 → 49 件）。

#### 次段階への入力 —— 6-7c（`mariadb`）

新設 3 本の最後。**MySQL 系文法なので `ansi.ts` には載らない** —— バッククォート、
`AUTO_INCREMENT`、列定義内の `COMMENT`、`DROP TABLE IF EXISTS` と骨格からして違う。

- 6-7 の設計表のとおり **`mariadb` は MySQL のコピーではない**（`UUID` 型 10.7+ と
  `INET4` / `INET6` を持つ）。`mysql` パレットは未現代化のまま 6-8 で触るので、
  **`mariadb` を先に現代化済みで作ると 6-8 の型紙になる**
- 予約語は **MariaDB の実物から採る**（docker が使える。`INFORMATION_SCHEMA.KEYWORDS` を持つ）
- **共通骨格の仕上げはここ** —— `mysql` / `mariadb` の系統が見えて初めて、
  `ansi.ts` の外側にもう 1 つ骨格が要るのか、それとも 6-8 で `mysql` を現代化するときに
  まとめるのかが決まる


---

### 2026-08-21 HANDOVER §6「機能」段階6-7c —— `mariadb` を入れ、**対応 DB 8 本がそろった**

**新設 3 本の最後。** 6-0 が決めた対応 DB 8 本
（`postgresql` / `mysql` / `mariadb` / `mssql` / `oracle` / `sqlite` / `h2` / `sql-standard`）が
これで全部 UI に出て DDL を生成できるようになった。**§6 の「対応 DB を広げる」側はここで閉じる**
（残るのは 6-8 の「既存 4 本の現代化」と 6-9 の ORM 出力）。

#### 決めたこと 1: 予約語は 247 語。ここも「実物に総当たりで聞く」

**MariaDB の `INFORMATION_SCHEMA.KEYWORDS` は `WORD` 列しか持たない**（MySQL 8.0 の同名ビューに
ある `RESERVED` 列が無い）ので、702 語のうちどれが予約語かはそこから分からない。H2 と同じ方式:

```
$ docker run -d --rm --name mdb -e MARIADB_ROOT_PASSWORD=x mariadb:11
$ // 母集団の各語で CREATE TABLE p<n>(<語> INT) を流し、作れなかった n を予約語とする
$ mariadb -uroot -px --force < probe.sql
$ mariadb -uroot -px -N -e "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='probe'"

  採取日 2026-08-21 / MariaDB 11.8.8 / 母集団 874 語（KEYWORDS 702 ∪ SQL:2016 365 ∪ PG 101）
  -> **247 語**
```

**PG の 101 語や H2 の 90 語より遥かに多いのは、型名まで予約されているため**
（`bigint` / `char` / `character` / `blob` / `binary` …）。house 標準の snake_case な列名は
当たらないが、`char` や `binary` という列名を書くと引用される。

#### 決めたこと 2: 型は設計表どおりだった（h2 と違い訂正なし）

6-7 の設計表を実測で確かめ、**4 点とも一致**した:

| | 実測（`INFORMATION_SCHEMA.COLUMNS` の `COLUMN_TYPE`） |
|---|---|
| `UUID` | `uuid` —— **ネイティブ**（MySQL には無い） |
| `INET4` / `INET6` | `inet4` / `inet6` —— **ネイティブ**（同上） |
| `JSON` | **`longtext`**（エイリアス。型としては受けられる） |
| `BOOLEAN` | **`tinyint(1)`**（エイリアス） |
| `XML` / `INTERVAL` / `TIMESTAMP WITH TIME ZONE` | **無い**（`Unknown data type` / 構文エラー） |

**`TIMESTAMPTZ` / `TIMESTAMP WITH TIME ZONE` を `timestamp` の `aka` に入れない。**
入れると PG で書いた設計を読んだときに **tz が黙って落ちる**。読めないほうが安全 ——
`aka` は「同じ意味の別名」を受けるためのもので、意味が変わる寄せ先に使わない。

#### 決めたこと 3: `mariadb` は `ansi.ts` に載らない（MySQL 系はもう 1 つの骨格）

6-7b が抽出した [`ansi.ts`](frontend/js/io/ddl/ansi.ts) は「CREATE TABLE ＋ ALTER TABLE ADD CONSTRAINT で
組み立てる系」で、MySQL 系は骨格からして違う:

| | ansi 系（postgresql / sql-standard / h2） | MySQL 系（mariadb / mysql） |
|---|---|---|
| キー | `ALTER TABLE ... ADD CONSTRAINT` | **テーブル定義の中**（`PRIMARY KEY (...)`） |
| コメント | `COMMENT ON TABLE / COLUMN` | **列定義と表定義の `COMMENT` 属性** |
| identity | `GENERATED ALWAYS AS IDENTITY` | **`AUTO_INCREMENT`**（列属性） |
| 識別子 | `"` | **`` ` ``** |

**`mariadb.ts` は独立実装にした。** ただし §6.3 の命名規約（`naming.ts`）は共有していて、
足したのは `MARIADB_IDENTIFIER` 1 つだけ —— **6-5b が「命名は dialect 非依存・引用は
dialect 依存」と割った切り方が、囲む記号が `"` でない初めてのプロファイルでも効いた。**

#### 決めたこと 4: 未現代化の `mysql` から意図的に落としたもの

`mariadb.ts` は `mysql.ts`（upstream の逐語）のコピーではない。**落としたのは 3 つ**:

| 落としたもの | 理由 |
|---|---|
| **`DROP TABLE IF EXISTS`** | 生成した DDL が既存データを消しうる。人が読んで実行する成果物として危険 |
| Globals / Table Properties / Test Data の飾りブロック | 設計の情報ではない（upstream の装飾） |
| コメントの 60 字切り詰め | **情報が黙って消える**（6-5a が記録した粗さの 1 つ） |

加えて §6.3 の規約を適用した。**`mysql` と `mariadb` の golden を並べると 6-8 が何を直すのかが
そのまま読める**:

```
mysql    ALTER TABLE `articles` ADD FOREIGN KEY (author_id) REFERENCES `users` (`id`);
mariadb  ALTER TABLE articles ADD CONSTRAINT fk_articles_author_id FOREIGN KEY (author_id) REFERENCES users (id);
```

**FULLTEXT は MariaDB がネイティブに持つ**ので `FULLTEXT KEY` としてそのまま出す
（`postgresql` は btree の `CREATE INDEX` に落とす。docs/FORMAT.md の判断）。
**PRIMARY だけ名前を出さない** —— MariaDB の主キー名は常に `PRIMARY` で、別名を付けると構文エラー。

#### 決めたこと 5: 生成した DDL を実物に流して確かめた（h2 に続き 2 本目）

```
$ docker exec mdb mariadb -uroot -px v < tests/golden/ddl/mariadb/<name>.sql
  -> minimal / house-defaults / relations / types-matrix / autoincrement / quotes-i18n
     すべてエラー無し（日本語識別子を含む quotes-i18n も通る）
```

**8 プロファイル中 2 本（`h2` / `mariadb`）が「実物で動く」ところまで確かめられた。**
残る 6 本のうち `postgresql` / `mysql` / `mssql` / `oracle` は docker で同じことができ、
`sqlite` と `sql-standard` は実物が無い（前者は CLI、後者は規格）。**6-8 で 4 本を現代化する
ときに同じ手当てをする**かは、そのときの判断（恒久テストにはしない。依存が増える）。

#### 決めたこと 6: この段階に入れなかったもの

| 項目 | 送り先 | 理由 |
|---|---|---|
| `mysql` を `mariadb.ts` の上に載せ替える | **6-8** | 現代化と一体。**`mariadb.ts` がその型紙**になっている |
| MySQL 系の骨格を `mysql-style.ts` として括る | **6-8** | いま括ると「未現代化の mysql」と「現代化済みの mariadb」の両方を満たす形になり、6-8 で作り直しになる |
| 既存 4 本の現代化（#4 / #10 / #12 / #13 / #14） | **6-8** | 変わらず |
| ORM 出力（`sqlalchemy` 復活 ＋ JPA / Prisma / Drizzle） | **6-9** | 変わらず |

#### 検証

**完了判定は「既存 49 本が 1 バイトも動かず、新設 7 本が増える」。**

```
$ git status --porcelain tests/golden/
?? tests/golden/ddl/mariadb/       # 新規 7 本だけ
```

| | 6-7b | 6-7c |
|---|---|---|
| `npm test` | 287 passed | **305 passed** |
| `npm run test:browser` | 123 passed | **130 passed** |
| `npm run known-issues` | 6 passed | 6 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

org のセキュリティ基準（分類 B: §2 ／ §3 の [B] ／ §4.2〜4.3 ／ §5.1）は着手前に一読済み。
**依存は 1 本も増やしていない** —— MariaDB は使い捨てコンテナで、リポジトリにも配布物にも
痕跡を残していない（6-5b の `postgres:18`・6-7b の H2 jar と同じ扱い）。
CI のワークフローは増やしていない。**`test:browser` は 2 分台**（DDL golden 49 → 56 件）。

#### §6 の残り

| 段階 | 内容 | 状態 |
|---|---|---|
| 6-0 〜 6-7c | 目的の記録・撤去・型解決・PG18 パレット・テンプレート・TS 生成器・DB 別 fixture・新設 3 本 | **完了** |
| **6-8** | 既存主要 4 本（`mysql` / `mssql` / `oracle` / `sqlite`）の現代化 | 次 |
| 6-9 | ORM 出力の再設計（`sqlalchemy` 復活 ＋ JPA / Prisma / Drizzle の検討） | 未着手 |

**6-8 で赤くなるのは known-issues #4 / #10 / #12 / #13 / #14 と、未現代化 4 本の DDL golden 28 本。**
型紙は 3 つそろっている —— パレットは `db/mariadb/datatypes.xml`（MySQL 系）と
`db/h2/datatypes.xml`（ansi 系）、生成器は `mariadb.ts` と `ansi.ts`、規約は `naming.ts`。


---

### 2026-08-21 HANDOVER §6「機能」段階6-8a —— `mysql` を現代化する

**既存主要 4 本の現代化の 1 本目。** 6-0 の分割表の 6-8 を **4 段階に割った**
（プロファイルごとに golden 7 本が動くので、1 本ずつなら増減を全部説明できる）。
`mysql` を最初に置くのは **6-7c の `mariadb` がそのまま型紙**だから。

#### 決めたこと 1: MySQL 系の骨格を `mysql-style.ts` に括った（6-7c が送った項目）

6-7c は「いま括ると『未現代化の mysql』と『現代化済みの mariadb』の両方を満たす形になり、
6-8 で作り直しになる」として送っていた。**mysql を現代化する本段階が正しい時期。**

[`frontend/js/io/ddl/ansi.ts`](frontend/js/io/ddl/ansi.ts)（6-7b）の対で、8 本が 2 つの骨格 ＋ 3 本の独立実装に分かれた:

| 骨格 | プロファイル | 特徴 |
|---|---|---|
| [`ansi.ts`](frontend/js/io/ddl/ansi.ts) | `postgresql` / `sql-standard` / `h2` | `ALTER TABLE ADD CONSTRAINT` ／ `COMMENT ON` ／ `"` |
| [`mysql-style.ts`](frontend/js/io/ddl/mysql-style.ts) | **`mariadb` / `mysql`** | テーブル定義内のキー ／ `COMMENT` 属性 ／ `AUTO_INCREMENT` ／ `` ` `` |
| 独立 | `mssql` / `oracle` / `sqlite` | 6-8b 〜 6-8d で現代化 |

**mariadb の出力はバイト単位で不変**（golden 7 本が 1 バイトも動いていない）。

#### 決めたこと 2: 予約語は 262 語。**ビューと総当たりが完全に一致した**

MySQL の `INFORMATION_SCHEMA.KEYWORDS` は MariaDB と違って `RESERVED` 列を持つ。
**それでも総当たりで検算した**（母集団 914 語）:

```
$ docker run -d --rm --name msq -e MYSQL_ROOT_PASSWORD=x mysql:8
$ mysql -uroot -px -N -e "SELECT WORD FROM INFORMATION_SCHEMA.KEYWORDS WHERE RESERVED=1"
  -> 262 語
$ // 母集団 914 語（KEYWORDS 734 ∪ SQL:2016 365 ∪ PG 101）で CREATE TABLE p<n>(<語> INT)
  -> 262 語。**両者は 1 語も違わない**

  採取日 2026-08-21 / MySQL 8.4.11
```

**この一致は総当たり方式そのものの傍証になる。** H2 は KEYWORDS ビューが無く、MariaDB は
`RESERVED` 列が無いので、どちらも総当たりの結果しか根拠が無い。ここで一致したことで、
その 2 本の 90 語 / 247 語も同じ方法で正しく採れていると言える。

#### 決めたこと 3: パレットの移行表（3 型を撤去）

| 旧 `id` | 旧 `sql` | 新 `id` | 影響 |
|---|---|---|---|
| `int` | `INT` | `integer` | MySQL の `INTEGER` は `INT` の別名で**同じ型**。id を 1 つに統合した |
| `mediumtext` | `MEDIUMTEXT` | `text` | **上限が 16MB → 4GB に広がる**（安全側）。house は text 優先 |
| `blob` | `BLOB` | `bytea` | **上限が 64KB → 4GB に広がる**（安全側） |

追加は `bigint_identity` / `boolean` / `jsonb` の 3 型で、どれも house 既定に要る。
旧名はすべて `aka` が受けるので、既存の設計 XML はそのまま読める。

**型は MySQL 8.4.11 の実物に聞いた** —— `UUID` / `INET4` は**無く**（MariaDB との最大の差）、
`JSON` は**ネイティブ**（MariaDB は `longtext` のエイリアス）。

#### 決めたこと 4: **MySQL 8 は式の既定値に括弧が要る**（実物に流して見つけた）

golden を採った後で MySQL 8.4.11 に流したところ、`house-defaults` だけが構文エラーになった:

```
ERROR 1064 (42000): ... right syntax to use near 'UUID(),
```

MySQL 8.0.13 で入った**式デフォルト**の構文で、`DEFAULT (UUID())` と包む必要がある。
**MariaDB は `DEFAULT UUID()` をそのまま受ける**ので、2 本の間の実際の差。

規則は「**関数呼び出しだけ**を包む」にした（[`shared.ts`](frontend/js/io/ddl/shared.ts) の
`isFunctionCall` を切り出し、`MysqlDialect.parenthesizeFunctionDefaults` で切り替える）。
`isSqlExpression` 全体ではないのは、**キーワードを包むと意味が変わる**ため ——
MySQL の `DEFAULT CURRENT_TIMESTAMP` は TIMESTAMP 列の自動初期化で、
`DEFAULT (CURRENT_TIMESTAMP)` にすると式デフォルトとして扱われる。

実物に流していなければ **golden は緑のまま壊れた DDL を固定していた**。
6-7b で始めた「生成 DDL を実物で確かめる」がここで初めて**バグを捕まえた**。

ついでに分かったこと: **MySQL の JSON 列はリテラルの既定値を持てない**
（`DEFAULT '{}'` は ERROR 1101、`DEFAULT ('{}')` なら通る）。fixture の `preferences` は
6-6b の判断で既定値を持たないので実害は無いが、6-9 以降で JSON の既定値を扱うときに効く。

#### 決めたこと 5: 未現代化テストの寄せ先を 1 本ずつ動かす

`mysql` が strict 側へ移ったので、**「未現代化プロファイルではこうなる」と書いてあるテストの
寄せ先を移した**。6-8b 〜 6-8d でも同じ作業が起きる（最後は寄せ先が無くなり、テストごと消える）。

| テスト | 6-8a まで | 6-8a から |
|---|---|---|
| known-issue #4（未知型が先頭型に落ちる） | `mysql` | **`oracle`** |
| known-issue #10 の (2)（`re` の後勝ち） | `mysql` | **`mssql`**（`re="INT"` を 4 型に持つ） |
| `state` golden（PG の設計を別パレットで読む） | `mysql-house-defaults.json` | **`oracle-house-defaults.json`** |
| `type-resolution` の 5 本（-1 / fk 恒等 / size / isStrict ほか） | `mysql` | **`oracle`** |
| `ddl.test.ts` の「未現代化の DEFAULT 規則」 | `mysql` | **`oracle`** |

**`state` golden はファイル名ごと移した**（削除 ＋ 新規採取）。strict なパレットは未知の型を
例外にするので、PG の設計（`UUID` / `JSONB`）を読ませられるのは未現代化のものだけ ——
`mysql` のまま残すと**テストが落ちる**（それは #4 が解消した証明であって、状態スナップショットの
主張ではない）。

**寄せ先を動かすと、テスト側の隠れた前提が 4 つ露出した。** どれも mysql では成り立ち、
oracle では成り立たなかったもの:

| 露出した前提 | 直し方 |
|---|---|
| `probe` の型が `VARCHAR` | **oracle に `VARCHAR` は無い**（`VARCHAR2`）。先頭型（`INTEGER`・`quote=""`）に落ちて空振りしていた。両方が `quote="'"` で持つ `CHAR` に変えた |
| `defaultsOf()` が識別子の囲みを `` ` `` と裸しか見ない | oracle の `"` を足した。値の切り出しも「最初の空白まで」に変えて一度壊し（`'new table'` が切れた）、「末尾から `NOT NULL` を削る」に落ち着いた |
| `serialize.spec.ts` が `mysql` に `BYTEA` が無いことを #4 の例にしていた | 現代化した mysql は `aka` で `BYTEA` を受ける。oracle へ移した |
| `template.spec.ts` が**パレットを差し替えてから空にしていた** | 下記 |

最後の 1 つは**この段階でいちばん危ない発見**だった。前のテストが postgresql のテンプレート
（24 型）で作ったテーブルが残ったまま oracle（**15 型**）へ切り替えると、`clearTables()` の
後始末が**範囲外の型添字**を引いて `Row.getColor` で落ちる。mysql（23 型）が寄せ先だった間は
添字が収まっていたので露出しなかった。**空にしてからパレットを差し替える**順に直した ——
UI では db の切り替えにリロードが要る（現行契約）ので実アプリには届かないが、
**型数の少ないプロファイルへ切り替えると壊れる**という性質そのものは残っている
（6-8d の sqlite は 5 型。同じ形の事故が起きうる）。

#### 決めたこと 6: この段階に入れなかったもの

| 項目 | 送り先 | 理由 |
|---|---|---|
| `mssql` / `oracle` / `sqlite` の現代化 | **6-8b / 6-8c / 6-8d** | 1 本ずつ golden を説明する |
| known-issues **#12** / **#13** / **#14** | 同上 | それぞれ mssql / sqlite / mssql の話 |
| `mariadb` にも括弧を付けるか | **採らない（記録のみ）** | MariaDB は包まなくても通る。既存の golden を動かす理由が無い |
| 生成 DDL の実物検証をテスト化する案 | **見送り（6-7b と同じ）** | docker / jar が依存になる |

#### 検証

**動いた golden は 7 本 ＋ state の 1 本（名前ごと移動）。**

| ファイル | 変化 |
|---|---|
| `ddl/mysql/empty.sql` | **192 → 0 バイト**（Globals / Table Properties / Test Data の飾りが消えた） |
| `ddl/mysql/house-defaults.sql` | 型が `CHAR(36)` / `JSON` / `BOOLEAN` へ、`DEFAULT (UUID())`、FK 名 `fk_articles_author_id` |
| `ddl/mysql/types-matrix.sql` | 23 → 25 列（パレットの全型） |
| 他 4 本 | 飾りブロックの除去と識別子の引用規則 |
| `state/mysql-house-defaults.json` | **削除**し `oracle-house-defaults.json` として採り直し |

**他 7 プロファイルの golden 49 本は 1 バイトも動いていない**（骨格の抽出でも動いていない）。

| | 6-7c | 6-8a |
|---|---|---|
| `npm test` | 305 passed | **303 passed**（`LEGACY_PROFILES` ごとに回るテストが 4 → 3 本になった 2 件ぶん） |
| `npm run test:browser` | 130 passed | 130 passed |
| `npm run known-issues` | 6 passed | 6 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**生成した DDL 6 本を MySQL 8.4.11 で実際に実行して確かめた**（決めたこと 4 の修正後）。
使い捨てコンテナで、リポジトリにも配布物にも痕跡を残していない。
org のセキュリティ基準（分類 B）は着手前に一読済み。**依存は 1 本も増やしていない。**

#### 次段階への入力 —— 6-8b（`mssql`）

- known-issues **#12**（最終列のコメントが区切りカンマを飲む）と **#14**（`UNIQUE KEY` は
  T-SQL に無い）が**同時に直る**。#10 の (2) もここが寄せ先なので 6-8b で動く
- 骨格は **独立実装**（`GO` 区切り・`[ ]` の識別子・`IDENTITY(1,1)`）。`ansi.ts` にも
  `mysql-style.ts` にも載らない
- 予約語は **SQL Server の実物から採る**（docker の `mcr.microsoft.com/mssql/server`。
  `sys.dm_exec_describe_first_result_set` ではなく、他の 3 本と同じ総当たりで）
- パレットに `date` / `datetime2` / `datetimeoffset` が無いのは 6-6b で実測済み。
  現代化で足す（house 既定の `timestamptz` は `datetimeoffset` が受けられる）


---

### 2026-08-21 HANDOVER §6「機能」段階6-8b —— `mssql` を現代化する

**既存主要 4 本の現代化の 2 本目。** known-issue **#12** と **#14** が同時に直り、
**6-6b が実測した「date が無い」「tz 付きの型が無い」も解消**した。

#### 決めたこと 1: 予約語は 179 語。母集団に**公式ドキュメントのソース**を混ぜた

**SQL Server には予約語を返すシステムビューが無い**（PG の `pg_get_keywords()`、MySQL の
`INFORMATION_SCHEMA.KEYWORDS` にあたるものが存在しない）。総当たりは他の 3 本と同じだが、
**母集団を他プロファイルの予約語だけで作ると 118 語しか採れず**、`NONCLUSTERED` / `TOP` /
`BROWSE` / `TEXTSIZE` などが丸ごと漏れた。

```
$ curl https://raw.githubusercontent.com/MicrosoftDocs/sql-docs/live/    docs/t-sql/language-elements/reserved-keywords-transact-sql.md      -> 184 語
$ docker run -d --rm --name mss -e ACCEPT_EULA=Y ... mcr.microsoft.com/mssql/server:2022-latest
$ // 母集団 575 語（他 4 本の予約語 ∪ SQL:2016 ∪ ドキュメント 184）を GO 区切りで流す

  採取日 2026-08-21 / SQL Server 2022 (RTM-CU26) 16.0.4265.3 -> **179 語**
```

**ドキュメントとの差は 5 語**（`DISK` / `DUMP` / `LOAD` / `PRECISION` / `SECURITYAUDIT`）で、
どれも**ドキュメントは予約と書くが実物は列名に使える**。逆向き（ドキュメントに無いのに実物が
拒む）は 0 語。**採るのは実物の 179 語** —— 基準は「列名に使えるか」で、PG の catcode で
`C`（`integer` / `varchar`）を入れなかったのと同じ考え方。

T-SQL は**バッチ単位でパースする**ので、`CREATE TABLE` ごとに `GO` を入れないと 1 つの
構文エラーでバッチ全体が実行されない（最初はそれで 0 語しか作れなかった）。

#### 決めたこと 2: パレットに入れた 3 型 ／ 外した 5 型

**入れた**（どれも house 既定に直接効く。6-6b の実測で「無い」と記録していたもの）:

| 型 | 効き方 |
|---|---|
| `datetimeoffset` | **timestamptz を tz ごと受けられる**（6-6b では `datetime` に落ちて tz が消えていた） |
| `date` | **日付だけの型**（同じく `datetime` に落ちていた） |
| `datetime2` | tz 無しの高精度。`TIMESTAMP` / `TIMESTAMP WITHOUT TIME ZONE` を `aka` で受ける |

**外した**:

| 型 | 理由 |
|---|---|
| `text` / `ntext` / `image` | **SQL Server が非推奨にしている**（将来削除予定）。house は非推奨型を勧めない —— 6-0 が PG から `serial` / `char(n)` を外したのと同じ判断。text 相当は `nvarchar` が `aka` で受ける |
| `money` / `smallmoney` | CLAUDE.md「`numeric`（not `money`）」。PG で外したのと同じ |
| `numeric` | `decimal` と同義。`aka` に寄せて 1 型に統合した |

**`json` は SQL Server 2022 に無い**（`Msg 2715` で実測。2025 で追加される型）。`nvarchar` で表す。

#### 決めたこと 3: **`bigint_identity` と `text` の id を持たない唯一のプロファイル**

| 持たない id | 理由 |
|---|---|
| `bigint_identity` | **T-SQL の `IDENTITY` は型の一部ではなく列の属性。** PG の `BIGINT GENERATED ALWAYS AS IDENTITY` や MySQL の `BIGINT AUTO_INCREMENT` は型名に句が入るが、mssql は `bigint IDENTITY (1, 1)` と分かれる。`autoincrement` のチェックで表し、生成器が句を付ける |
| `text` | SQL Server の text 相当は `nvarchar(max)` だが、**括弧を含む型名は照合に掛からない**（照合はサイズを外して `sql` と比べるので `nvarchar(max)` は `nvarchar` に当たる）。house の text 優先は `nvarchar` で表す |

#### 決めたこと 4: known-issue **#12** / **#14** が直った

| # | 現象 | 直し方 |
|---|---|---|
| **#12** | 最終列にコメントがあると区切りカンマが `--` に飲まれ T-SQL が構文エラー | **コメントを表定義の後ろの行に出す。** 位置を変えたのが是正の本体で、コメント自体は落としていない |
| **#14** | UNIQUE キーが T-SQL に無い `UNIQUE KEY (...)`（MySQL の構文） | `CONSTRAINT <name> UNIQUE (...)` |

同時に 6-5a が記録した粗さも消えた —— **DEFAULT を 1 つも出さない**（分岐が無かった）/
FK の参照元列だけ引用符が付かない / 複数列 INDEX の 2 列目以降に `[` が付かない /
FK 文の後のタブ 4 個 / `ON [PRIMARY]`（ファイルグループ指定。設計の情報ではない）。

**コメントは行コメントで出す。** T-SQL に列コメントの構文は無く、正式には
`EXEC sp_addextendedproperty` だが 6 引数（スキーマ名・オブジェクト種別…）を要求し、
設計モデルが持たない前提まで埋めることになる。**情報は落とさず、実行できる形で出す**という
6-7a の `sql-standard` と同じ判断。

#### 決めたこと 5: known-issue #10 の (2) が**寄せ先を失った**

#10 は「`re` の後勝ちが `sql` の完全一致を上書きする」で、例を 2 つ持っていた。
(1) は oracle（`INTEGER` → `NUMBER`）、(2) は 6-8a まで mysql・6-8b まで mssql が
「`re="INT"` を複数の型に振っている」例だった。**どちらも現代化されて `re` を持たない。**

**`re` を残しているのは `oracle` と `sqlite` だけで、sqlite は `re` 属性を 1 つも持たない。**
(2) を落とし、実例は (1) の 1 つになった（6-8c で #10 ごと消える）。

#### 決めたこと 6: 型添字の範囲外が**また出た**（6-8a の再発）

known-issues の #13 が `useDatatypes(page, "sqlite")` を先に呼んでおり、前のテストが残した
テーブル（oracle の 15 型で解決済み）を **sqlite の 5 型**で後始末して `Row.getColor` で落ちた。
6-8a が `template.spec.ts` で踏んだのと同じ形。

**プロファイルが現代化されて寄せ先が動くたびに露出する** —— 型数の少ない側へ切り替えると起きる。
どちらも「空にしてからパレットを差し替える」で直したが、**性質そのものは残っている**
（6-8d で sqlite を現代化するときに寄せ先がまた動く）。

#### 検証

**動いた golden は 6 本。** `empty.sql` は 0 バイトのままで不変（mssql は元から飾りを持たない）。

| ファイル | 変化 |
|---|---|
| `house-defaults.sql` | `datetimeoffset` ＋ `SYSDATETIMEOFFSET()`、`date`、`DEFAULT NEWID()`、`CONSTRAINT ... UNIQUE`、コメントが表定義の後ろ |
| `types-matrix.sql` | 27 → 26 列（非推奨 3 型と money 2 型が出て、date / datetime2 / datetimeoffset が入った） |
| 他 4 本 | 識別子の引用規則と `ON [PRIMARY]` の除去 |

**他 7 プロファイルの golden 50 本は 1 バイトも動いていない。**

| | 6-8a | 6-8b |
|---|---|---|
| `npm test` | 303 passed | **303 passed**（#12 / #14 が known-issues から ddl.test.ts へ移っただけ） |
| `npm run known-issues` | 6 passed | **4 passed**（#12 / #14 が出た） |
| `npm run test:browser` | 130 passed | 130 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**生成した DDL 6 本を SQL Server 2022 で実際に実行して確かめた**（日本語識別子を含む
`quotes-i18n` も通る）。使い捨てコンテナで、リポジトリにも配布物にも痕跡を残していない。
org のセキュリティ基準（分類 B）は着手前に一読済み。**依存は 1 本も増やしていない。**

#### 次段階への入力 —— 6-8c（`oracle`）

- **known-issues #10 と #4 の最後の寄せ先。** oracle を現代化すると #10 は実例が無くなり、
  #4 は sqlite だけになる。**未現代化テストの寄せ先が軒並み sqlite へ動く**（6-8a / 6-8b と
  同じ作業だが、**sqlite は 5 型しか無いので型添字の範囲外に注意**）
- 骨格は**独立実装**（桁揃え・`DROP TABLE ... PURGE` のコメントブロック・`CREATE SEQUENCE`）。
  6-5a が記録した「複数列が autoincrement だと同名の `CREATE SEQUENCE` が重複」もここで直す
- パレットは `TIMESTAMP WITH TIME ZONE` と `NUMBER(1)`（boolean 相当）を入れるかが焦点。
  **Oracle 23ai は BOOLEAN を持つ**ので、対象バージョンの判断が要る（6-7 の h2 と同じ形）
- 予約語は **Oracle の実物から採る**（`V$RESERVED_WORDS` がある。docker は
  `gvenzl/oracle-free` などが軽い）


---

### 2026-08-22 HANDOVER §6「機能」段階6-8c —— `oracle` を現代化する

**既存主要 4 本の現代化の 3 本目。** known-issue **#10 の実例が尽き**、`re` を持つパレットが
1 つも無くなった。**未現代化は `sqlite` の 1 本だけ**になる。

#### 決めたこと 1: 予約語は 92 語。**一覧が引けるのに、それだけでは足りなかった**

Oracle は `V$RESERVED_WORDS` を持ち `reserved='Y'` で 81 語を返す。**総当たりでは 92 語が拒まれた**:

```
$ docker run -d --rm --name ora -e ORACLE_PASSWORD=... gvenzl/oracle-free:slim
$ sqlplus ... "SELECT keyword FROM v$reserved_words WHERE reserved='Y'"        -> 81 語
$ // 母集団 588 語（ビュー 81 ∪ SQL:2016 ∪ 他 5 本の予約語）で CREATE TABLE     -> **92 語**

  採取日 2026-08-21 / Oracle AI Database 26ai Free Release 23.26.2.0.0
```

**ビューに無いのに列名として拒まれた 11 語**: `add` / `column` / `current` / `file` /
`initial` / `row` / `rownum` / `rows` / `user` / `whenever` / `_rowid_`。
**実物のほうが厳しい**ので実測を採る —— mssql はドキュメントのほうが広く（5 語）、
**方向が逆だった**。どちらも「一次資料より実物」という同じ結論になる。

#### 決めたこと 2: **識別子を必ず囲む唯一のプロファイル**（`IdentifierRules.bare`）

Oracle は引用符の無い識別子を**必ず大文字へ畳む**。house 標準の snake_case を保つには
全部囲むしかない —— 囲まないと設計の `users` が DB では `USERS` になり、
introspection（§5.2）で読み直したときに設計と突き合わせられなくなる。

`IdentifierRules` に **`bare`（裸で書ける形の正規表現）** を足した。他 7 本は
`BARE_LOWER`（`^[a-z_][a-z0-9_]*$`）、Oracle だけ `BARE_UPPER` を渡す ——
**小文字の識別子は 1 つも通らない**ので house 標準の設計は全部引用される。
6-5b の「囲まないと意味が変わるものだけ囲む」という基準の、いちばん広い側。

**h2 と sql-standard も大文字へ畳むが、そちらは小文字を裸で出している**（6-7a / 6-7b）。
違いは用途 —— 畳んだ結果で一貫していれば動く「書いて渡す」プロファイルと、
読み直して設計と突き合わせる経路を持つ Oracle の差。

導入で**既存 7 本の golden は 1 バイトも動いていない**（同じ正規表現を渡しているため）。

#### 決めたこと 3: SEQUENCE ＋ TRIGGER をやめ、identity 列にした

upstream は `CREATE SEQUENCE` ＋ `BEFORE INSERT` トリガーで採番していた（11g 以前の手法）。
**12c で identity 列が入って以降その手順は要らない**ので、`GENERATED BY DEFAULT AS IDENTITY`
に置き換えた。6-5a が記録した「複数列が autoincrement だと同名の SEQUENCE が重複する」も
これで消えた。

`BY DEFAULT` にしたのは、移行時に既存の値を INSERT できる形が設計ツールの出力として
扱いやすいため（`ALWAYS` だと拒まれる）。

#### 決めたこと 4: 桁揃えと DROP ブロックを落とした

| 落としたもの | 理由 |
|---|---|
| **桁揃え**（列名の長さで空白を詰める） | upstream の作り込みだが、**列名を 1 つ変えると無関係な行の空白まで動く**ので diff フレンドリー（CLAUDE.md 制約3）と噛み合わない。他 7 本とも揃う |
| **DROP のコメントブロック** | 生成 DDL が既存データを消す手順を含む。6-7c で mariadb の `DROP TABLE IF EXISTS` を落としたのと同じ判断 |
| `??INDEX??` という壊れた SQL | PRIMARY / UNIQUE 以外を `CREATE INDEX` にした（XSLT は「黙って落とすよりは目に見える形で壊す」と書いていた） |
| FK 名 `FK_<tail13>_<tail13>` | §6.3 の `fk_<table>_<列>`。テーブル名を 13 文字で切る細工は 12.2 以降の 128 文字制限では不要 |

#### 決めたこと 5: **`SYSTIMESTAMP` を式のキーワード表に足した**（実物で見つけた）

golden を採った後で Oracle に流し、house 既定の監査列が `DEFAULT 'SYSTIMESTAMP'` と
**引用されている**ことに気づいた。`SYSTIMESTAMP` / `SYSDATE` は**括弧を付けられない擬似列**で、
`isFunctionCall` にも `SQL_DEFAULT_KEYWORDS` にも掛からず「文字列」と判定されていた。

dialect ごとにリストを分ける案は採らず、**共通表に 2 語足した** —— 分けるほどの数ではなく、
他プロファイルで `SYSDATE` という**文字列**を既定値にしたい場面が現実的に無いため。
必要になったら `IdentifierRules` と同じ形（プロファイルごとの規則オブジェクト）へ移す。

#### 決めたこと 6: known-issue **#15** を新設した（Oracle は識別子に `"` を持てない）

`quotes-i18n` を流すと **ORA-25716** で落ちた。grabado は他の 7 本と同じ規則で `""` に
エスケープして出すが、**Oracle だけが識別子内の `"` を許さない**。

**grabado の欠陥ではなく Oracle の制約**だが、「実行できない DDL を出す」ことに変わりはない
ので隔離した。**直し方が生成器の中に無い**のがこの 1 本の特徴 —— 識別子を書き換えるのは
6-5b の決めたこと 7 で採らないと決めており、残る手は「入力側（UI）で止める」しかない。
6-5b が同じ棚に送った「63 バイトを超える識別子」「空文字の識別子」と同じ性質で、直すのは 6-9 以降。

**実物に流さなければ golden は緑のまま実行できない DDL を固定していた** ——
6-8a の `DEFAULT (UUID())` に続く 2 件目。

#### 決めたこと 7: known-issue #10 が**実例ごと消えた**

「`re` が `sql` の完全一致を後勝ちで上書きする」規則は `js/io/palette.ts` の
`indexOfTypeNameLegacy` に残っているが、**`re` 属性を持つパレットが 1 つも無くなった** ——
6-8a / 6-8b / 6-8c で mysql / mssql / oracle が strict になり、最後の `sqlite` は元から
`re` を 1 つも持たない。

テストは「直った側」に書き換えて `type-resolution.test.ts` へ移した
（`oracle` の `INTEGER` が `integer` に解決すること ＋ **`re` を持つパレットが 0 本**であること）。
規則そのものが消えるのは 6-8d。

#### 検証

**動いた golden は 6 本 ＋ state の 1 本（名前ごと移動）。**

| ファイル | 変化 |
|---|---|
| `house-defaults.sql` | `BOOLEAN` / `JSON` / `TIMESTAMP WITH TIME ZONE`、`DEFAULT SYS_GUID()` / `SYSTIMESTAMP`、FK 名が `fk_<table>_<列>`、桁揃えと DROP ブロックの除去 |
| `types-matrix.sql` | 15 → 23 列（binary_float / boolean / jsonb / xml / interval 2 種ほか） |
| 他 4 本 | 同上（`empty` は元から空で不変） |
| `state/oracle-house-defaults.json` | **削除**し `sqlite-house-defaults.json` として採り直し |

**他 7 プロファイルの golden 49 本は 1 バイトも動いていない**（`bare` の導入でも動いていない）。

| | 6-8b | 6-8c |
|---|---|---|
| `npm test` | 303 passed | **301 passed**（#10 の 2 本が 1 本に畳まれ、`LEGACY_PROFILES` ごとに回るテストが 2 → 1 本になった） |
| `npm run test:browser` | 130 passed | 130 passed |
| `npm run known-issues` | 4 passed | **4 passed**（#10 が出て #15 が入った） |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**生成した DDL を Oracle 23ai で実際に実行して確かめた** —— 6 本中 5 本が通り、
`quotes-i18n` だけが #15 で落ちた。使い捨てコンテナで痕跡は残していない。
org のセキュリティ基準（分類 B）は着手前に一読済み。**依存は 1 本も増やしていない。**

#### 次段階への入力 —— 6-8d（`sqlite`）

**§6 の未現代化がここで尽きる。**

- known-issue **#4**（未知型が先頭型に落ちる）と **#13**（複合 PK が UNIQUE に落ちる）が
  同時に直る。**#4 が消えると `js/io/xml-parser.ts` のフォールバックごと落とせる**
- **`re` を見る `indexOfTypeNameLegacy` と `strict` の分岐が消える**（6-3 が
  「全プロファイルの現代化が終わった時点でこの分岐は消える」と書いた、その時点）
- **未現代化テストの寄せ先が無くなる。** 6-8a 以降 1 本ずつ動かしてきたテスト群
  （`type-resolution` / `template` / `state` / `types.spec` / `serialize.spec`）は
  役目を終えるか「strict どうし」の主張に作り直す
- パレットは 5 型（型ではなく型親和性）。**sqlite は数値と文字列の区別が緩い**ので、
  house 既定をどう表すかは 6-6b の判断（uuid も timestamptz も TEXT）を引き継ぐ


---

### 2026-08-22 HANDOVER §6「機能」段階6-8d —— `sqlite` を現代化する

**§6 のパレット現代化がここで終わった。** 対応 DB 8 本すべてが `strict="1"` になり、
**未現代化プロファイルが 0 本**になった。6-3 が「全プロファイルの現代化が終わった時点で
消える」と予告した分岐（`indexOfTypeNameLegacy` / `isStrict()` / 先頭型フォールバック）が
**コードごと落ち**、known-issue **#4 / #10 / #13 が同時に出た**（収録は 2 本に）。

#### 決めたこと 1: **STRICT テーブルを出す**（ユーザー承認）

`CREATE TABLE ... ) STRICT;` を出す。SQLite 最大の落とし穴（どの列にもどの型の値でも入る）が
DB 側で止まるかわりに、**型名が 6 語に固定され、サイズを 1 つも書けなくなる**。
SQLite 3.37+（2021-11）が要る ——Android 12 以前の同梱 SQLite では動かない。

実測（`node:sqlite` / SQLite 3.51.2。以下すべて同じ）:

```
  STRICT が受ける   INT / INTEGER / REAL / TEXT / BLOB / ANY —— **この 6 語だけ**
  STRICT が拒む     NUMERIC / VARCHAR / BOOLEAN / DATE / DATETIME / DECIMAL / DOUBLE /
                    BIGINT / JSON / UUID …（unknown datatype for <t>.<c>）
  **括弧も拒む**     TEXT(255) / INT(11) / BLOB(16) すべて unknown datatype
                    -> **全型 length="0"**。8 本で size を 1 つも取らないのはここだけ
```

非 STRICT のまま現代化する案（互換性最優先）と、他 DB と同じ実用型名を出す案
（`VARCHAR` / `BOOLEAN` / `DATETIME`）は採らなかった。後者は **`BOOLEAN` も `JSON` も
NUMERIC 親和性に落ちる**ので、名前と挙動が食い違う設計を作ることになる。

#### 決めたこと 2: 型は 5 本。**`aka` は SQLite 自身の affinity 規則の展開**にした

`INT` は `INTEGER` と同義（`INT PRIMARY KEY AUTOINCREMENT` は拒まれる）なので `aka` に落とし、
型は `integer` / `real` / `text` / `blob` / `any` の 5 本。**本数が 5 → 5 で変わらない**ので
`Row.getColor` の添字事故を新たに増やしていない。

| id | sql | aka（SQLite の affinity 決定規則） |
|---|---|---|
| `integer` | `INTEGER` | 規則1（`INT` を含む）: `INT` `INT2` `INT8` `TINYINT` `SMALLINT` `MEDIUMINT` `BIGINT` `UNSIGNED BIG INT` |
| `text` | `TEXT` | 規則2（`CHAR`/`CLOB`/`TEXT`）: `CHAR` `CHARACTER` `VARCHAR` `VARYING CHARACTER` `NCHAR` `NATIVE CHARACTER` `NVARCHAR` `CLOB` |
| `blob` | `BLOB` | **持たない**（規則3 は `BLOB` 自身と「型名なし」だけ。`BYTEA` も `BINARY` も SQLite の綴りではない） |
| `real` | `REAL` | 規則4（`REAL`/`FLOA`/`DOUB`）: `FLOAT` `DOUBLE` `DOUBLE PRECISION` |
| `any` | `ANY` | 規則5（その他＝NUMERIC 親和性）: `NUMERIC` `DECIMAL` `BOOLEAN` `DATE` `DATETIME` ＋ 旧 sql の `NONE` |

**規則が一次資料なので、`aka` の中身が機械的に決まる。** 6-8c が oracle で `re` を捨てて
列挙に移したのと同じ形。規則5 は「それ以外」で原理的に無限なので、**SQLite 公式の例示表に
載る 5 つ**だけを列挙した。

**PG 固有の綴り（`UUID` / `JSONB` / `TIMESTAMPTZ` / `INET` / `XML`）は入れない。**
入れると PG の設計が sqlite で**黙って開けてしまい、失われる情報が可視化されない**。
読めずに例外になるのが正しい。プロファイル間の変換が要るならそれは 6-9 の変換層の仕事。

id は `text` / `integer` / `real` を再利用（意味が 1 ミリも変わらない）、`numeric` / `none` を
撤去して `blob` / `any` を新設。移行表（`tools/migrate-design.mjs`）は
`numeric` → `any` / `none` → `any` ＋ **`text` → `text` の自己写像で `dropSize`**
（旧パレットの text は `length="1"` で size を持てた）。

#### 決めたこと 3: 制約はすべて `CREATE TABLE` の中（**#13 の直し方はこれしか無い**）

```
$ ALTER TABLE t ADD CONSTRAINT ...   -> near "CONSTRAINT": syntax error
$ CREATE TABLE t(..., CONSTRAINT pk PRIMARY KEY (a, b), CONSTRAINT fk FOREIGN KEY ...)  -> OK
$ CREATE TABLE t(..., CONSTRAINT pk PRIMARY KEY (id AUTOINCREMENT))                     -> OK
```

`ALTER TABLE ADD CONSTRAINT` が無い**唯一のプロファイル**なので、`ansi.ts` には載らない。
`mysql-style.ts` にも載らない（識別子が `"`、`AUTO_INCREMENT` ではない）。**独立実装のまま**に
したのは、`mssql` / `oracle` と共通なのが「キーを表定義に置く」1 点だけで、8 本目に 3 つ目の
骨格を作ると中身が boolean の束になるため（6-7b が `ansi.ts` を作った根拠に当たらない）。

表内 `PRIMARY KEY (id AUTOINCREMENT)` が合法だったので、**単一 PK も複合 PK も 1 本のコードで
書けた** —— これで known-issue #13（複合 PK が UNIQUE に落ち PRIMARY KEY が消える）が消えた。

**FK も表定義の中に置く。** 前方参照は許される（`foreign_keys=ON` でも、まだ存在しない表への
FK を宣言する `CREATE TABLE` は成功し、違反が出るのは INSERT 時。実測）ので、他 7 本のように
2 周目へ回す必要が無い。

SQLite は **PRIMARY / UNIQUE の制約名を保持しない**（自動索引が `sqlite_autoindex_<t>_<n>` に
なり、別テーブルで同名を再利用しても通る。実測）が、それでも `CONSTRAINT <名>` は出す ——
`key/@name` は **UI で編集できるモデルの値**（#6 の是正で優先すると決めた値）で、出さないと
生成物から消える。生成 DDL は人が読んでから実行する成果物なので、DB に残らなくても書く。

#### 決めたこと 4: `PRAGMA foreign_keys = ON;` を出す（ユーザー承認）

SQLite の `foreign_keys` は**接続ごとの設定で既定 OFF**。書かないと生成 DDL の FK が
「作られるが 1 度も検査されない」状態になり、**出力が嘘になる**。対照実験:

```
$ // 既定 OFF の接続に house-defaults.sql を流す
  流す前 PRAGMA foreign_keys = 0 -> 流した後 1 -> FK 違反の INSERT が FOREIGN KEY constraint failed
$ // PRAGMA の 1 行だけ削って同じことをする
  -> **FK 違反がそのまま入る**（1 行）
```

FK を 1 本も持たない設計には出さない（意味を持たない 1 行を全ファイルの先頭に置かないため）。

#### 決めたこと 5: `AUTOINCREMENT` は合法形のときだけ出し、それ以外は理由を残す

実測した 6 パターンのうち通るのは**単一列の `INTEGER PRIMARY KEY`** だけ:

```
  INTEGER PRIMARY KEY AUTOINCREMENT     OK
  INT     PRIMARY KEY AUTOINCREMENT     AUTOINCREMENT is only allowed on an INTEGER PRIMARY KEY
  TEXT    PRIMARY KEY AUTOINCREMENT     同上
  PRIMARY KEY (id AUTOINCREMENT, y)     near ",": syntax error
  x INTEGER AUTOINCREMENT（PK でない列）  near "AUTOINCREMENT": syntax error
```

合法形でないときは**黙って落とさず、理由を行コメントで残す**（6-8c が `??INDEX??` について
「黙って落とすよりは目に見える形で」と書いたのと同じ立場を、実行できる形でやる）。

**SQLite 公式は AUTOINCREMENT を非推奨としている**が、これは**ユーザーが明示的にチェックを
入れたときだけの経路**なので出す —— §6.2 のテンプレートは ai を立てないので house 既定の
新規テーブルには 1 つも出ず、公式の勧め（既定では使うな）は既定側で守られている。

#### 決めたこと 6: 予約語 59 語。**母集団の完全性を主張できる唯一のプロファイル**

SQLite には `pg_get_keywords()` に当たるものが無い（`sqlite_keyword_count()` /
`sqlite_keyword_name()` は C API 専用で SQL からは `no such function`。`pragma_function_list`
にも 0 件）。他の 4 本と同じ総当たりだが、**母集団を実物から採れた**:

```
$ // node の実行ファイルに静的リンクされた SQLite の zKWText[]（mkkeywordhash.c が生成する
$ //   キーワード連結文字列）を binary から /[A-Z_]{120,}/ で拾う      -> 666 文字
$ // その全部分文字列（長さ 2〜20）∪ 他 7 本の予約語 ∪ SQL:2016        -> 12,297 語
$ // 各語を 3 位置で試す: 列名 / 表名 / 索引名

  採取日 2026-08-22 / SQLite 3.51.2（node v24.14.0 組み込みの node:sqlite）
  列名 58 語 ∪ 表名 59 語 ∪ 索引名 59 語 -> **59 語**（8 本で最少）
```

zKWText は SQLite のパーサが持つキーワード表そのものなので、その全部分文字列を試している
以上どの語も漏れない。h2 / mariadb / mssql は「母集団の作り方が採取の限界」だった。

**基準を「列名に使えるか」から「表名・列名・索引名のどれかに使えないか」へ広げた** ——
`quoteIdentifier()` は 3 位置すべてに同じ規則で当たるため。差は **`if` の 1 語**だけ
（列名にはできるが `CREATE TABLE if(...)` / `CREATE INDEX if ON ...` が構文エラー）。
逆向き（列名では拒まれるが表名では通る）は 0 語。囲む方向にしか動かないので他 7 本に無関係。

識別子は `"` 囲み・`""` エスケープ・`bare` は `BARE_LOWER`（SQLite は裸の識別子を大小畳まない）。
**Oracle と違って識別子の中の `"` を受ける**ので、known-issue #15 に当たる制約はここには無い。

#### 決めたこと 7: **`indexOfTypeNameLegacy` / `isStrict()` / 先頭型フォールバックを撤去した**

6-3 が予告した「その時点」。消したのは 3 か所:

| 場所 | 消したもの |
|---|---|
| `js/io/palette.ts` | `indexOfTypeNameLegacy()` ／ `indexOfTypeName()` の分岐（strict 版に畳んだ）／ `isStrict()` |
| `js/io/xml-parser.ts` | 未知型の先頭型フォールバック（**#4 の本体**）／ size を捨てる分岐の strict ガード |
| `js/io/ddl/shared.ts` | `quoteDefault()` の strict 分岐と未現代化の `CURRENT_TIMESTAMP` 特例（**#11 の最後の 1 本**） |

**`strict="1"` 属性そのものは 8 本に残した。** 読み手が js/ から 0 になるが、消すと
「このファイルは `sql` / `aka` の完全一致だけで解決でき、`re` を持たず、`length` を守る」という
**ファイルの契約を宣言する唯一の面**が無くなる。代わりに
`tests/node/palette-id.test.ts` に「8 本すべてが持つ」検査を足して test-enforced にした ——
6-9 で新しいプロファイルを足すとき、コードはもう何も止めてくれない。

**記録すべき挙動変化**: 旧 XML（同梱パレットあり）に、そのパレットに無い型名が手書きされて
いた場合、**import が例外で止まる**（従来は黙って先頭型）。`fromXML` の同梱パレット経路は
`clearTables()` が先なので**その場合は編集中の設計が消える**。既存の契約どおりで本段階では
変えていないが、黙って別の型で開くより落ちて気づく側に倒すという 6-3 の判断の帰結。

#### 決めたこと 8: `size` が STRICT を壊す穴を閉じた（PG パレットが 6-8 に送っていた項目）

`db/postgresql/datatypes.xml` の頭が「UI の size 欄を型ごとに閉じるかは、全プロファイルが
strict になる 6-8 まで片側だけ閉じる形になる」と送っていた、その時点。読み込み側は寄せ先が
`length="0"` なら size を捨てるが、**UI で打った size はそこを通らない** —— sqlite は全型が
`length="0"` なので、閉じないと `TEXT(255)` という STRICT が必ず拒む DDL が出る。
`js/io/ddl/shared.ts` の `buildRow()` に 1 行のガードを入れた。**既存 golden 56 本への影響は 0**
（サイズ付きで `length="0"` に解決する列が 1 つも無い）。UI の size 欄そのものは 6-9。

#### 決めたこと 9: **寄せ先が尽きたテストの作り直し方**

6-8a 以降「未現代化プロファイル」を寄せ先にしてきたテスト群が、動かす先を失った。
**消してよいもの（比較相手がコードから消えた）と、消すと守りが薄くなるものを分けた。**

| 処遇 | 対象 | 理由 |
|---|---|---|
| 削除 | `LEGACY_PROFILES` / `legacyIndexOfTypeName` / 差分テスト 2 本 / `isStrict` の describe | 「6-2 の旧規則」を足場にしたもの。**空配列のループは黙って 0 件パスする**ので定数ごと消す |
| **機構を引き継ぐ** | 差分テストの `candidateNames()` 全数掃き | 「**8 プロファイル × 全候補名で、解決先は必ずその名前を `sql` か `aka` に持つ型**」に裏返した。#10 も #4 も再発すればこの形を破る |
| **人工パレットへ**（必ず作り直す） | 「`re` はどのパレットでも読まれない」「strict 属性を持たないパレットでも未知型は例外 / `length="0"` なら size を捨てる」「`<template>` / `newrowtype` を持たないパレット」 | 撤去したコードの再発を止める**唯一の**テストで、しかも**旧 XML 同梱パレットという実経路がある** |
| 反転 | template「8 本すべてが `<template>` と `newrowtype` を持つ」／ ddl の `LITERALS` を 8 本横断 | 空振り防止の役目をそのまま引き継ぐ |
| 寄せ先変更 | state golden ／ `serialize.spec` の「型解決はパレット依存」 | **`h2` へ**（下） |

**state golden の寄せ先は `h2` に落ち着いた。** house 既定の 8 型（`UUID` / `TEXT` /
`INTEGER` / `JSONB` / `TIMESTAMP WITH TIME ZONE` / `DECIMAL(12,2)` / `DATE` / `BOOLEAN`）が
**全部 `aka` で解決する唯一の非 PG プロファイル**で、主張が「別パレットで読むと潰れる」から
**「strict どうしなら潰れずに移る」**に変わる。次に動かす先が要らない形で、6-9 の
プロファイル変換への足がかりにもなる。

あわせて**添字事故を構造で止めた** —— 6-8a / 6-8b で 2 度踏んだ「型の少ないパレットへ移ると
後始末が範囲外の型添字を引く」の原因は、**両ハーネスの `useDatatypes()` が tables を残したまま
`setRoot()` していた**こと。実アプリ側（`Designer.fromXML`）は「clearTables → 差し替え」の順を
守っており、**その順序制約がハーネスに写っていなかっただけ**。各テストが書いていた儀式を
呼ばれる側 1 か所に畳んだ（壊れたパレットをわざと入れる `io-ui` の 2 本だけは、後始末を
`setRoot(元の要素)` に変えてある —— 型 0 個のパレットでは `clearTables()` を通せない）。

#### 検証

**動いた golden は 6 本 ＋ state の 1 本（名前ごと移動）。**

| ファイル | 変化 |
|---|---|
| `ddl/sqlite/house-defaults.sql` | `) STRICT;`、`PRAGMA foreign_keys = ON;`、**複合 PK が `PRIMARY KEY (…)` に（#13）**、識別子が `"`、**コメント 7 行が新たに出る**、`price` が TEXT |
| `ddl/sqlite/types-matrix.sql` | 5 → 5 列（`TEXT(255)`/`NUMERIC`/`INTEGER`/`REAL`/`NONE` → `INTEGER`/`REAL`/`TEXT`/`BLOB`/`ANY`。**括弧が落ちた**） |
| `ddl/sqlite/relations.sql` | `employee_projects` に PRIMARY KEY が復活、`PRAGMA`、FK が制約名付きに |
| 他 3 本（`autoincrement` / `minimal` / `quotes-i18n`） | `STRICT` と引用規則（`quotes-i18n` はコメント 4 行も） |
| `ddl/sqlite/empty.sql` | **0 バイトのまま不変** |
| `state/sqlite-house-defaults.json` | **削除**し `h2-house-defaults.json` として採り直し |

**他 7 プロファイルの golden 49 本と `tests/golden/json/` は 1 バイトも動いていない**
（`git diff --raw -- tests/golden/` が 8 行しか出ない。blob SHA の対を出すので、
**現れないこと自体がバイト一致の証明**になる）。

| | 6-8c | 6-8d |
|---|---|---|
| `npm test` | 301 passed | **305 passed** |
| `npm run test:browser` | 130 passed | **129 passed** |
| `npm run known-issues` | 4 passed | **2 passed** |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

増減の内訳（1 件残らず説明できる）:

```
  npm test        +4 = type-resolution -3（差分 2 / isStrict 2 / STRICT 列挙 1 を削除、全数掃き 2 を追加）
                       template +2（LEGACY ループ 2 を削除、sqlite 2 ＋ 人工 2 を追加）
                       ddl +4（未現代化 1 を削除、8 本横断 1 と sqlite の describe 4 を追加）
                       palette-id +1（8 本すべてが strict="1"）
  test:browser    -1 = types.spec の「未現代化では先頭型に落ちる」（反転版は Node の人工パレットへ）
  known-issues    -2 = #4 と #13 が出た（残るのは #9 と #15）
```

**生成した DDL 6 本を SQLite 3.51.2 で実際に実行して確かめた** —— 全部通り、STRICT の型
チェック・UNIQUE・FK・複合 PK の NULL と重複が正しく効くことも INSERT で確認した。
6-7b（h2）/ 6-7c（mariadb）/ 6-8a（mysql）/ 6-8b（mssql）/ 6-8c（oracle）に続く**実物検証の
6 本目**で、**8 本中 6 本が「実物で動く」ところまで確かめられた**（残るのは `postgresql` と
規格である `sql-standard`）。恒久テストにはしない（`node:sqlite` は experimental API）。
**依存は 1 本も増やしていない**（Node 24 の組み込み）。org のセキュリティ基準（分類 B）は
着手前に一読済み。CI のワークフローは増やしていない。

#### §6 の残り

| 段階 | 内容 | 状態 |
|---|---|---|
| 6-0 〜 6-8d | 目的の記録・撤去・型解決・PG18 パレット・テンプレート・TS 生成器・DB 別 fixture・**8 本の現代化** | **完了** |
| 6-9 | ORM 出力の再設計（`sqlalchemy` 復活 ＋ JPA / Prisma / Drizzle の検討） | 次 |

#### 次段階への入力 —— 6-9

- **プロファイル変換が必要になった。** strict どうしでは `aka` に無い型名が例外になるので、
  「PG の設計を sqlite で開く」には変換層が要る（`h2` だけが偶然そのまま通る）。
  6-7 が「将来」として記録した項目が、8 本そろったことで実際の欠落になった
- **`TYPE_MIGRATIONS` に mysql / mssql / oracle の分が無い**（6-8a 〜 6-8c の積み残し）。
  id を撤去したのに移行表が無いので、旧い設計 JSON を持っている人が移行できない
- **UI の size 欄を型ごとに閉じる。** 6-8d は DDL 側だけ塞いだ（決めたこと 8）
- known-issue **#15**（Oracle の識別子 `"`）／63 バイト超・空文字の識別子は入力側で止めるしかない
- SQLite の `CHECK (json_valid(x))` / `WITHOUT ROWID` は**設計モデルが持たない**ので出せない
  （`keys[].columns` は列名の配列で、式も表オプションも表せない）

---

### 2026-08-22 HANDOVER §6「機能」段階6-9a —— 積み残しを片付ける

**6-9 を 4 段階に割った。** 6-8d が「次段階への入力」として積んだ 5 項目は、どれも ORM とは
独立した DDL 側の宿題で、「6-9」というラベルだけを共有していた。**小さくて実害のあるものを
先に閉じる**（とくに移行表の欠落は「撤去した型 id を持つ旧い設計 JSON が移行できない」という
現存の欠陥）。

| 段階 | 内容 |
|---|---|
| **6-9a** | **積み残しの片付け**（移行表の欠落・UI の size 欄）。本エントリ |
| 6-9b | 識別子の検査（known-issue #15 / 63 バイト超 / 空文字）。**警告表示**で出す |
| 6-9c〜 | ORM 出力の骨格 ＋ JPA（Kotlin）を 1 本目に、以降 Prisma / Drizzle / SQLAlchemy |
| 6-10 | プロファイル変換層（設計の db と出力の db を別にする） |

#### 決めたこと 1: ORM 出力は **db プロファイルではなく別軸**（ユーザー承認・6-9c の前提）

現状は `db` の 1 文字列が「型パレット」と「生成器」と「設計 JSON の型キーの名前空間」を
同時に決めている。ORM を `AVAILABLE_DBS` に足す upstream 流のやり方だと:

- **ORM は型パレットではないのに、パレットの契約を全部背負う** —— `strict="1"` /
  `<template>` / `newrowtype` / `types-matrix` の全型網羅（`tests/node/fixture-set.test.ts` と
  `palette-id.test.ts` が `db/` のディレクトリ実体を母集団にしているため）
- **fixture 7 ＋ golden 7 で 1 本あたり 14 ファイル**増える（4 本なら 56 ファイル）
- 設計 JSON の `db` が `"jpa"` になり、**同じ設計から DDL と ORM の両方を出せない**
  （`docs/FORMAT.md` の「`db` は型パレット id」という契約と正面衝突）

`js/io/ddl/shared.ts` の `buildDdlModel()` が**型パレットを読む唯一の場所**で、8 本の生成器は
解決済み文字列しか見ない。`docs/ARCHITECTURE.md` の格子も「形式が増えると形式側だけが増える」
と書いており、**ORM は形式側の 3 本目**として受けるのが素直。実装は 6-9c。

#### 決めたこと 2: 移行表の欠落を埋めた（**17 型**）

`tools/migrate-design.mjs` の `TYPE_MIGRATIONS` は 6-8d の時点で `postgresql` と `sqlite` しか
持っていなかった。**6-8a〜6-8c は型 id を撤去したのに表を入れていない** ——
mysql 3 型 / mssql 10 型 / oracle 1 型ぶん、旧い設計 JSON が移行できない状態だった。

寄せ先の根拠は**各プロファイルの新パレットの `aka`**（旧 sql 名 → 新型）に置いた。
表と `aka` が同じ判断を指していることを目で確かめられる。判断が割れた 3 件:

| 移行 | 判断 |
|---|---|
| `mssql.timestamp` → `rowversion` | **T-SQL の timestamp は日時ではない。** 旧パレットの note が「Locally unique binary number updated as a row gets updated」と書いているとおり `rowversion` の旧称。`datetime2` に寄せると **8 バイトの版数が日時になる**（意味が変わる） |
| `mssql.money` / `smallmoney` → `decimal` | CLAUDE.md「`numeric`（not `money`）」 |
| `mssql.text` / `ntext` → `nvarchar` | SQL Server 2005 で非推奨。6-8b が `nvarchar` の `aka` で `TEXT` / `NTEXT` を受けている |

#### 決めたこと 3: **表とパレットの一致を機械で見る検査を足した**（そして 6-8d の漏れが出た）

`tools/migrate-design.mjs` の冒頭は「`dropSize` の判断は `db/<db>/datatypes.xml` の `length` と
一致していなければならない」と宣言していたが、**検査は golden 経由の間接的なものしか無く、
表を手で書くたびに漏れうる形**だった。

`tests/node/migrate-design.test.ts` に「表の全件について、寄せ先が `length="0"` なら size が
落ち、`length="1"` なら残る」を機械で見るテストを足したところ、**6-8d 自身の漏れが 2 件出た**
（`sqlite` の `numeric` / `none` → `any` に `dropSize` が無く、`ANY(10)` という STRICT が拒む
DDL を生む設計 JSON を書きうる）。17 件のうち **8 件で `dropSize` が要る**。

**これが 6-9a を先にやった理由そのもの。** 移行表は「意味的判断をリテラルで固定する場所」
なので、機械で見られる部分は機械に見せておかないと、後の段階が同じ漏れを繰り返す。

#### 決めたこと 4: UI の size 欄を型ごとに閉じた（6-3 が 6-9 へ送った項目）

6-3 が `length` を読む契約にしたのは**読み込み側だけ**で、UI は型と無関係に size を打てる
ままだった。6-8d が DDL 側を塞いだので出力は壊れないが、**打った値が黙って消える**のは
UI として不親切。閉じ方は 2 段:

| 層 | やったこと |
|---|---|
| モデル | `Row.update()` に「サイズを取らない型は size を持たない」正規化。**`def` の正規化と同じ「ここ 1 箇所だけ」の位置**で、UI・FK の伝播・テンプレート適用の 3 経路を同時に塞ぐ |
| UI | 編集フォームの size 入力を、選択中の型が `length="0"` なら `disabled` にして値も捨てる（型セレクタの `change` で追随） |

これで**読み込み・DDL 生成・UI の 3 経路が同じ `TypePalette.hasSize` を共有する**。
属性を持たない旧パレットでは `hasSize` が true を返すので、従来どおり自由に打てる。

#### 検証

| | 6-8d | 6-9a |
|---|---|---|
| `npm test` | 305 passed | **307 passed**（migrate-design +2） |
| `npm run test:browser` | 129 passed | **130 passed**（size 欄の UI テスト +1） |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**golden は 1 バイトも動いていない。** size の正規化を入れても動かないのは、
**サイズ付きで `length="0"` に解決する列が 8 プロファイル × 7 fixture のどこにも無い**ため
（唯一の候補だった PG の `CHAR(10)` は、読み込み側が 6-3 から size を捨てている）。

依存は 1 本も増やしていない。CI のワークフローも増やしていない。

#### 次段階への入力 —— 6-9b（識別子の検査）

- **出し方は「警告表示」に決めた**（ユーザー承認）。問題のある識別子を持つ行 / テーブルに
  印を付け、理由を出す。**入力は拒まない** —— 拒むと、PG で作った設計を oracle で開いた
  瞬間に既存の名前が不正になり、直せない状態に落ちる
- 対象は known-issue **#15**（Oracle は識別子に `"` を持てない）／**63 バイト超**（PG）／
  **空文字**。長さの上限はプロファイルごとに違う（PG 63 / MySQL 64 / mssql 128 / Oracle 128）
  ので、**`IdentifierRules` に足すのが素直**（`js/io/ddl/naming.ts`）
- **`docs/FORMAT.md` が 6-9 以降へ送った「命名の検査（snake_case / 複数形）」と同じ土台**に
  なる。6-5b は「生成器が識別子を書き換えるのは採らない・lint は警告して人が直す性質」と
  決着させており、その受け皿がここで要る
- CSS と locale（21 言語）の追加が要る点だけ、これまでの段階と毛色が違う

---

### 2026-08-22 HANDOVER §6「機能」段階6-9b —— 識別子を入力側で警告する

6-5b が「**生成器が識別子を書き換えるのは採らない**」と決着させて棚に送った 3 件
（known-issue #15 の Oracle の `"` ／ 63 バイトを超える識別子 ／ 空文字の識別子）の受け皿。
**§6 で初めて画面に手を入れた段階**で、CSS と locale 21 ファイルが動く。

#### 決めたこと 1: **止めずに警告する**（ユーザー承認）

入力を拒む案は採らなかった。理由は 1 つで十分 —— **PG で作った設計を oracle で開いた瞬間に、
既存の名前が不正になる**。拒む実装だと、その設計は**開いた時点で直せない状態**に落ちる
（名前を直そうにも、直した名前もまた拒まれうる）。日本語識別子の長さ判定で誤検知したときの
痛みも同じ向きに効く。

出し方は **波線（`class="invalid"`）＋ tooltip の理由**。赤字にも背景色にもしない ——
**行の背景色は型パレット由来**（`Row.getColor`）で意味を持っており、そこを奪うと
「型が変わった」ように見える。

#### 決めたこと 2: 見るのは **3 つだけ**。「囲めば通る」ものは 1 つも警告しない

| 見るもの | 根拠 |
|---|---|
| 空文字 | 名前の無い列 / テーブル。**sqlite だけは実際に作れてしまう**（実測）が、設計として壊れている |
| 長さ超過 | プロファイルごとの上限（下） |
| Oracle の `"` | known-issue #15（ORA-25716。6-8c で実測） |

**予約語・日本語・空白・記号は警告しない。** `quoteIdentifier` が囲むので実行できる DDL に
なるため。ここを混ぜると house 標準の snake_case が大量に引っかかり、**印そのものが無視される**。

#### 決めたこと 3: 長さの上限は「数字 1 つ」では表せなかった

`IdentifierLimit`（`max` / `unit` / `onExceed`）を `IdentifierRules` に足した。
**単位も超えたときの挙動もプロファイルで違う**:

```
$ docker run -d --rm -e POSTGRES_PASSWORD=x postgres:18   （mysql:8 / mariadb:11 も同様）
  採取日 2026-08-22

  postgresql  63 バイト  **黙って切る**   a×64 -> 63 に切られ、a×63 の表と衝突して初めて分かる
                                          顧×22（66 バイト）も 63 バイトへ。**日本語は 21 文字が上限**
  mysql       64 文字    ERROR 1059
  mariadb     64 文字    ERROR 1103
  sqlite      上限なし   10,000 文字の識別子が通る（node:sqlite）
```

**いちばん危ないのは postgresql** —— 64 文字目以降がエラー無しで消えるので、設計と DB が
**黙って食い違う**。house 標準が PG であることを考えると、この 1 本だけでも警告する価値がある。
tooltip では `postgresql: 64 > 63 bytes, silently truncated` と、切られる側にだけ印を足す。

**mssql（128 文字）/ oracle（128 バイト）/ sql-standard（128 文字）はドキュメントと規格由来で、
実測していない**（イメージが手元に無い）。**h2 は上限そのものが文書化されていない**ので
持たせなかった —— 知らないものを数字で書かない。コードのコメントに実測/一次資料の別を書いてある。

> 実測の副産物: **mysql / mariadb は多バイトのテーブル名で別の壁に当たる**
> （MariaDB は `errno: 36 File name too long`）。識別子の上限とは別のファイル名の制約で、
> 警告に入れるには条件が細かすぎるので採らなかった。

#### 決めたこと 4: 規則は `IdentifierRules` に同居させ、文言だけを UI 側に置いた

規則（`identifierIssue`）は `js/io/ddl/naming.ts` —— **DDL 生成が使う表と同じ場所**。
プロファイルごとの識別子の性質が 2 か所に散らない。db 名から規則を引く
`identifierRulesFor` もここに置いた（8 つの `IdentifierRules` が全部このファイルに在るため）。

文言にするのは `js/identifier-hint.ts` の 1 本だけで、`Row` と `Table` の 2 か所から呼ぶ。
locale は **4 キー**（`identifierempty` / `identifiertoolong` / `identifierforbidden` /
`identifiertruncated`）を **21 ファイルすべてに足した** —— `_()` は辞書に無ければ**キー名を
そのまま返す**ので、en / ja だけに足すと他の言語で `identifiertoolong` と表示される。
**翻訳の無い 19 本には英語を入れてある**（生のキーよりは読める）。数字と記号は文に混ぜず
括弧の中に出すので、翻訳が無くても情報は落ちない。

#### 決めたこと 5: known-issue #15 は「緩和」であって「直った」ではない

**出力そのものは今も ORA-25716 で落ちる。** 6-9b がやったのは「実行できない DDL が出ることに、
**出す前に**気づけるようにする」ことだけ。根治は Oracle 側の制約なので存在しない ——
`tests/known-issues/README.md` の「直したもの」へは移さず、収録表に残したまま「直る予定」列を
書き換えた。テストもそのまま残る。

#### 検証

| | 6-9a | 6-9b |
|---|---|---|
| `npm test` | 307 passed | **319 passed**（`identifier.test.ts` 12 本を新設） |
| `npm run test:browser` | 130 passed | **134 passed**（`identifier.spec.ts` 4 本を新設） |
| `npm run known-issues` | 2 passed | 2 passed（#15 は残る） |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**golden は 1 バイトも動いていない。** 一度動きかけた —— `title` 属性を空文字で置くと
DOM が変わり `state` golden の `titleTooltip` が `null` → `""` になる。**空なら属性ごと外す**
形にして戻した（そのほうが意味も正しい）。

依存は 1 本も増やしていない（検証コンテナは使い捨てで、リポジトリにも配布物にも痕跡なし）。
CI のワークフローも増やしていない。org のセキュリティ基準（分類 B）は着手前に一読済み。

#### 次段階への入力 —— 6-9c（ORM 出力の骨格 ＋ JPA）

- **出力は別軸**（6-9a の決めたこと 1）。`db` は型パレットのまま、ORM は「出力ターゲット」
- **1 本目は JPA（Kotlin）**（ユーザー承認）。house 標準が Kotlin/Spring Boot なので自社利用でも効き、
  型マッピング（`uuid` / `jsonb` / `timestamptz` → 言語型）がいちばん難しいので骨格の検証になる
- **クラス名は変換する**（`articles` → `Article`。ユーザー承認）。**元のテーブル名は
  `@Table(name = ...)` に必ず残す**ので往復が壊れない。単数化は英語の規則だけで、
  倒せない語（`people` / `children`）はそのまま残す
- `DesignModel` が**持っていないもの**が効いてくる: 関係の多重度（1:1 / 1:N は「FK 列に UNIQUE が
  あるか」から推論するしかない）・逆参照名・cascade・SQL 型 → 言語型の表
- `js/io/ddl/shared.ts` の `DdlRow` は `datatype` を文字列に潰すので**そのままでは流用できない**
  （ORM 生成器は型 id が要る）。`DdlRow` に型 id を足すか、ORM 用の別ビルダを作るかの判断が要る

---

### 2026-08-22 HANDOVER §6「機能」段階6-9c —— 正規型を型パレットに入れる

**ORM 出力の下ごしらえ。出力は 1 バイトも動かない。** 6-9 を割ったとき 6-9c は
「ORM の骨格 ＋ JPA」だったが、**型の写像だけを先に切り出した** ——
`golden の増減を全部説明できる単位` にすると、この段階は「**golden が 1 本も動かない**」
という完了判定になる。172 型に属性を 1 つ足す作業を、生成器の新設と混ぜない。

#### 決めたこと 1: 写像は**正規型としてパレットに持つ**（ユーザー承認）

「SQL 型 → 言語型」の表をどこに持つかの選択。ORM ごとに `(db, 型 id)` の表を持つ案は、
**ORM が 4 本（JPA / Prisma / Drizzle / SQLAlchemy）になったとき同じ写像を 4 回書く**
ことになる。各 `<type>` に `kind` を 1 つ足せば、ORM 側は「正規型 → 言語型」の小さい表
1 つで済む。

**同じ写像を 6-10 のプロファイル変換が要る** ——「PG で設計して MySQL 用 DDL も出す」は
まさに型の写像で、6-8d が「変換が要るならそれは 6-9 の変換層の仕事」と送った項目。
土台を共有できるのがこの案を採った決め手。

「ORM は postgresql の設計からだけ出す」案は採らない —— CLAUDE.md の
「対応 DB を絞る・PG だけ整えて他を放置する判断はしない」と正面から衝突する。

#### 決めたこと 2: 語彙は **21 語で閉じる**

```
int8 int16 int32 int64 decimal float32 float64
string binary boolean
date time time_tz timestamp timestamp_tz interval
uuid json xml geometry
other
```

決めたのは 4 つ:

| 決めたこと | 例 |
|---|---|
| **名前ではなく値の域で決める** | **Oracle の `DATE` は時刻を含む**ので `timestamp`（`date` ではない）。名前で決めると変換が壊れる |
| **tz の有無を分ける** | house 標準が `timestamptz` 固定。ここが潰れると設計の意味が消える。MySQL 系で tz を持つのは `TIMESTAMP` だけ（パレットの label が `Timestamp (UTC)` と書いていた） |
| **生成（identity）は含めない** | `bigint_identity` は `int64`。生成は列の性質（`RowData.ai`）と型の `sql` に既に在り、混ぜると「`int64` と `int64_identity` のどちらに写すか」を変換のたびに考えることになる |
| **`other` は逃げ道ではなく主張** | 「正規型に写せない」の明示。PG の `inet` / `cidr` / `bit`、mssql の `hierarchyid` / `sql_variant` / `rowversion`、mysql の `enum` / `set` / `year`、sqlite の `ANY` |

`char` / `varchar` / `text` / `clob` を `string` 1 つに畳んだのは、**別は `length` 属性と `sql` が
既に持っている**ため。`kind` に境界を持ち込むと同じ情報が 2 か所になる。

#### 決めたこと 3: 語彙の検査は**ファイル規則**（実行時に見ない）

`TypePalette.kindAt()` は属性を読むだけで、値が語彙に載っているかを検査しない ——
実行時に見ると「知らない値が来たらどうするか」という分岐が増える。パレットはリポジトリが
持つファイルなので、`tests/node/palette-id.test.ts` が **172 型ぜんぶ**について押さえる
（`strict="1"` を 6-8d でファイル規則にしたのと同じ立場）。

あわせて「**プロファイルをまたいで同じ意味に使われている**」を代表だけリテラルで固定した ——
6-10 の変換層はここが揃っていることに依る（PG の `timestamptz` と oracle の
`TIMESTAMP WITH TIME ZONE` が同じ `kind` でなければ、変換のしようがない）。

#### 検証

| | 6-9b | 6-9c |
|---|---|---|
| `npm test` | 319 passed | **321 passed**（`palette-id` に 2 本） |
| `npm run test:browser` | 134 passed | 134 passed |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**golden は 1 本も動いていない。それがこの段階の完了判定そのもの** ——
`kind` はどの生成器からも読まれておらず、172 型に属性が 1 つ増えただけ。
読み手が付くのは 6-9d（ORM 出力）と 6-10（変換層）。

#### 次段階への入力 —— 6-9d（ORM 出力の骨格 ＋ JPA）

- **出力軸を足す**（6-9a の決めたこと 1）。UI は Save/Load ダイアログの「SQL 出力」の隣に
  **ターゲット select ＋ ボタン**（ユーザー承認）—— 既存の `clientsql` 経路を 1 ビットも変えない
- **1 本目は JPA（Kotlin）**。`kind` → 言語型の表を書く。`other` は「写せない」ので
  そこで止まれる（JPA なら `String` に落とさず、コメントで理由を出すのが素直）
- **関係は子側だけ**（`@ManyToOne` ＋ `@JoinColumn`。ユーザー承認）。逆参照（`@OneToMany`）は
  **設計モデルが持たない情報を捏造する**ことになるので出さない。多重度も同じ理由で推論しない
- **クラス名は変換する**（`articles` → `Article`）。**元のテーブル名は `@Table(name = ...)` に
  必ず残す**ので往復が壊れない。単数化は英語の規則だけで、倒せない語はそのまま残す
- `js/io/ddl/shared.ts` の `DdlRow` は `datatype` を文字列に潰すので**そのままでは流用できない**
  （ORM 生成器は型 id と `kind` が要る）。ORM 用の別ビルダを作るか `DdlRow` を広げるかの判断が要る
- golden は `tests/golden/orm/<target>/<fixture>.<ext>` を新設する。**`db/` にディレクトリを
  作らない**こと —— 作った瞬間 `DB_PROFILES` に入り、パレットの契約を全部背負う

---

### 2026-08-22 HANDOVER §6「機能」段階6-9d —— ORM 出力の骨格と JPA（Kotlin）

**6-0 が「ORM 出力カテゴリの 1 本目」と書いた項目**（撤去した `sqlalchemy` を作り直す話の本体）。
出力の 2 本目の軸が入り、`tests/golden/orm/` が新設された。

#### 決めたこと 1: ORM は**出力の別の軸**（6-9a で決め、ここで実装した）

`db` の 1 文字列が「型パレット」と「生成器」と「設計 JSON の型キーの名前空間」を同時に
決めていたところに、**db を変えずに出力だけ切り替える軸**を足した。実装は 3 か所:

| 場所 | 役割 |
|---|---|
| `js/io/orm/generate.ts` | ターゲットの登録（`ORM_TARGETS`）と入口。**db プロファイルの switch とは別の表** |
| `js/wwwsqldesigner.ts` | `toOrm(target)`。`toDdl()` と対で、どちらも同じ `extractModel(this)` を渡す |
| `js/io.ts` ＋ `index.html` | Save/Load ダイアログに ORM ターゲットの select ＋ ボタン。**既存の「SQL 出力」は 1 ビットも変えていない** |

**`db/` にディレクトリを作らなかった**のが要点 —— 作った瞬間 `DB_PROFILES`
（`tests/support/fixtures.ts` が `db/` の実体を母集団にしている）に入り、ORM が型パレットの
契約を全部背負う。ブラウザ側に「**同じ設計から DDL と ORM の両方が出る**」テストを 1 本置いて、
この判断が実際に効いていることを固定した。

#### 決めたこと 2: 型は**正規型 1 段だけ**を介して写す

`js/io/ddl/shared.ts` の `buildDdlModel` に `kind` と `size` を足し、**型パレットを読むのは
今もそこ 1 か所**のまま。ORM 生成器はパレットを 1 度も触らない。

JPA 側の表は 21 行（`KOTLIN_TYPES`）。**写せない型は `null` にして `String` に落とし、
理由を行コメントで残す** —— `interval` / `json` / `xml` / `geometry` / `other` の 5 つ。
黙って `String` にすると、設計が持っていた意味が生成物から消えたことに誰も気づけない。

```kotlin
    @Column(name = "preferences", nullable = false)
    /* json: JPA の標準に対応する型が無いので String で出す（JSONB） */
    var preferences: String,
```

`int8` を `Byte` ではなく `Short` にしたのは、**mssql の `tinyint` が 0..255 で
Kotlin の `Byte` が符号付き**だから（`Byte` にすると 128 以上が負になる）。

#### 決めたこと 3: **逆参照（`@OneToMany`）は出さない**（ユーザー承認）

設計モデルは「子側の FK 1 本」しか持たない。親側のコレクション名（`articles` / `tags`）は
**発明するしかなく**、6-5b の「生成器は識別子を書き換えない」と衝突する。多重度（1:1 / 1:N）も
同じ理由で推論しない —— FK 列に UNIQUE があれば 1:1、という推論は**外れたときに黙って嘘になる**。

出すのは `@ManyToOne` ＋ `@JoinColumn` だけ。1:1 が欲しい人は `@OneToOne` に直す
（型は合っているので 1 語の書き換えで済む）。

**PK でもある FK 列はスカラーで出す。** 関連にすると JPA の derived identity
（`@IdClass` のフィールドが参照先の id 型になる規則）に踏み込み、生成物を読む人が JPA の
細則を知らないと直せなくなる。多対多の中間テーブルがまさにこの形。

#### 決めたこと 4: クラス名は変換し、**元の名前は必ず残す**（ユーザー承認）

`articles` → `Article`。**単数化は英語の規則だけ**（`-ies` / `-(s|x|z|ch|sh)es` / `-s`）で、
倒せない語（`people` / `children`）はそのまま残す —— 不規則複数の表を持つと、その表に無い語で
黙って間違える。**元のテーブル名は `@Table(name = ...)` に必ず出る**ので、単数化が外れても
情報は 1 つも失われない。テストが `people` → `People` を**倒せないこととして固定**している。

#### 決めたこと 5: Kotlin 識別子は 3 段（**golden を採って初めて気づいた**）

最初の採取で `quotes-i18n` から **`var say "hi": String?` という書けない Kotlin** が出た。
DB の識別子はどんな文字でも持てるが、Kotlin のソースには書けない。3 段にした:

| 段 | 例 | 名前 |
|---|---|---|
| そのまま書ける | `createdAt` / `顧客` | 変わらない |
| バッククォートで囲めば書ける | `` `say "hi"` `` / `` `order by` `` | **1 文字も失わない** |
| 囲んでも書けない（JVM が名前に使えない `. ; [ ] / < > : \` と改行） | `a.b` → `a_b` | ここで初めて変わる |

**DB の名前を書き換えているのではない**（`@Column(name = ...)` に必ず残る）。6-5b の
「識別子を書き換えない」は**出力先の SQL で意味が変わること**を禁じた判断で、言語識別子は別。

**実物を採らなければ気づけなかった**という点で、6-8a の `DEFAULT (UUID())` や
6-8c の `SYSTIMESTAMP` と同じ形（あちらは DB に流して、こちらは golden を読んで）。

#### 決めたこと 6: golden は **14 本**（8 × 7 = 56 本にしない）

ORM 出力は「型の写像」と「構造の組み立て」に分かれ、**構造の側はプロファイルに依らない**
（生成器が見るのは `kind` と関係とキーだけで、SQL 型名も識別子の引用も通らない）:

```
型の写像   8 プロファイル × types-matrix   そのプロファイルの全型が 1 列ずつ入っている
構造       postgresql × 残り 6 本           複合 PK・自己参照 FK・identity・日本語識別子
```

`types-matrix` が全型網羅であることは `fixture-set.test.ts` が機械的に押さえているので、
**8 本を掃けば 172 型ぜんぶを通ったことになる**。ORM が 4 本になっても 56 本で、DDL と同じ桁。

テーブルが 0 件なら **1 バイトも出さない**（DDL の `empty.sql` が 0 バイトなのと揃える）——
見出しだけのファイルは「生成に失敗した」と見分けが付かない。

#### 検証

| | 6-9c | 6-9d |
|---|---|---|
| `npm test` | 321 passed | **349 passed**（`orm.test.ts` 28 本を新設） |
| `npm run test:browser` | 134 passed | **151 passed**（`orm.spec.ts` 17 本を新設） |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**既存の golden（`ddl` 56 / `json` 7 / `state` 8）は 1 バイトも動いていない。**
動いたのは `tests/golden/orm/` の新設 14 本だけで、`DdlRow` に `kind` と `size` を足した
変更も 8 本の DDL 生成器には 1 文字も届いていない（あちらは解決済みの `datatype` しか見ない）。

依存は 1 本も増やしていない。CI のワークフローも増やしていない。

#### 次段階への入力 —— 6-9e（残る ORM）と 6-10（プロファイル変換）

- **Prisma / Drizzle / SQLAlchemy は「正規型 → 言語型」の表 1 つで書ける** —— 骨格
  （`ORM_TARGETS` への登録・UI の select・golden の母集団）は 6-9d が用意した。
  ただし **Prisma と Drizzle は逆参照を書式として要求する**（`@relation` / `references`）ので、
  「逆参照を出さない」判断をそのまま持ち込めるかは 1 本目を書くときに決め直す
- **6-10 のプロファイル変換は `kind` の上に立つ。** `other` に落ちる型（PG の `inet` /
  mssql の `hierarchyid` / sqlite の `ANY`）は**変換できないことが分かる**ので、そこで止まれる
- JPA の `@GeneratedValue(strategy = IDENTITY)` は下敷きのプロファイルに依らず固定。
  sequence 方式（Oracle / PG）を選べるようにするかは未決

---

### 2026-08-22 HANDOVER §6「機能」段階6-9e —— Prisma を出す（ORM 2 本目）

**ORM の 2 本目。** 6-9d が JPA で敷いた骨格（出力軸・正規型 1 段・golden 14 本）の上に
乗るが、**Prisma だけは 6-9d の判断を 2 つ決め直している**。

#### 決めたこと 1: **SQLAlchemy は保留にした**（ユーザー判断）

6-0 は「`sqlalchemy` を撤去して §6.3 で作り直す」と書いており、6-9 の順番としては
SQLAlchemy が先だった。**やめた理由は 3 つ**:

| 理由 | 中身 |
|---|---|
| **「復活」の中身が元から動いていなかった** | 撤去した実装は classic mapping（**2.0 で削除済み**）／`sa.Timestamp` / `sa.Binary` は**存在しない綴り**／import を 1 行も出さず**そのままでは走らない**／`nullable=False` を出さず **NOT NULL が黙って消える**／PG の fixture で **27 列中 25 列が先頭型に落ちる**。復活ではなく新規開発 |
| 目的と合わない | 自社利用は Kotlin/Spring Boot（JPA で足りる）。ブランディングは **TS 圏（Prisma / Drizzle）が grabado 自身の利用者層と重なる**。SQLAlchemy はどちらにも当たらない |
| 制約に反しない | CLAUDE.md の「対応 DB を絞る判断はしない」は**対応 DB 8 本**の話。ORM ターゲットは 6-9a で足した別の軸で、6-0 自身も「JPA / Prisma / Drizzle の**検討**」と書いている |

**やらないと決めたのではなく後回し**。優先度は Prisma > Drizzle > SQLAlchemy。

#### 決めたこと 2: **Prisma は逆参照を出す**（6-9d の判断を決め直した）

6-9d は「逆参照（`@OneToMany`）は出さない」と決めた —— 設計モデルが親側のコレクション名を
持たず、発明するしかないため。**JPA ではそれが選べた**（逆参照の無い entity も有効）。

**Prisma では選べない。** 片側だけの relation はスキーマ検証が拒む。形式が要求する以上、
名前を発明するしかない —— ただし**規則は機械的**にして人の判断を入れない:

| 場面 | 親側のフィールド名 | 名前付き relation |
|---|---|---|
| 通常 | 子テーブル名の camelCase（`articles`） | 要らない |
| 同じ子から 2 本以上 | 子テーブル名 ＋ FK 列名（`projectsOwnerId`） | **要る**（どの対か決まらない） |
| **自己参照** | 子テーブル名のまま（衝突しない） | **要る**（1 本でも Prisma が要求する） |

**「名前が要るか」と「フィールド名がぶつかるか」は別の条件**で、1 つのフラグに畳むと
自己参照 1 本のフィールド名が要らない長さになる。実物は `relations` fixture の
`employees.manager_id`（自己参照）で、`@relation("employees_manager_id")` が両側に出る。

#### 決めたこと 3: **識別子は ASCII だけ。潰れた名前を通し番号で一意化する**

Prisma の識別子は `[A-Za-z][A-Za-z0-9_]*` で、**Kotlin のバッククォートに当たる逃げ道が無い**。
`quotes-i18n` を流すと `氏名` も `メモ` も `m__` に潰れ、**同じモデルに同名フィールドが 2 つ**
できた（Prisma が拒む形）。JPA では囲めたので起きなかった問題。

一意化は**モデル 1 つの中でまとめて**やる —— 列・関連フィールド・逆参照が同じ名前空間を
共有するので、3 つを 1 本の配列にしてから通し番号を振る。別々に振ると衝突が残る。
モデル名も同じ理由でスキーマ全体で一意化する。**元の名前は `@@map` / `@map` に必ず残る。**

#### 決めたこと 4: native type 属性を出さない ／ provider が無ければ datasource も出さない

`@db.Uuid` / `@db.VarChar(255)` は **provider ごとに別の表**が要る。それは 6-9c が
「(db, 型 id) の表を ORM ごとに持たない」として避けた形そのものなので出さない ——
`uuid` は `String` に、`date` / `time` / `timestamp` は `DateTime` に丸まる。丸めたことは
先頭のコメントに書く。

**Prisma の provider は 8 プロファイル中 5 本にしかない**（h2 / oracle / sql-standard に無い）。
その 3 本では `datasource` ブロックを出さず、**理由を先頭のコメントで言う** ——
黙って `postgresql` と書くと、動かないスキーマを動くように見せることになる。

#### 決めたこと 5: 名前の変換を `js/io/orm/naming.ts` に括った

単数化と PascalCase / camelCase を JPA から出した。**2 本目を書く段で括る**のは
6-7b（`ansi.ts`）や 6-8a（`mysql-style.ts`）と同じ取り方で、重複が実際にできてから動かす。
**言語ごとの識別子の規則は各生成器が持つ** —— Kotlin は囲める、Prisma は囲めない、という
違いを 1 本に畳むと、どちらでもない規則になる。

#### 検証

| | 6-9d | 6-9e |
|---|---|---|
| `npm test` | 349 passed | **367 passed**（`orm.test.ts` 28 → 46） |
| `npm run test:browser` | 151 passed | **165 passed**（golden 14 本ぶん） |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**既存の golden（`ddl` 56 / `orm/jpa` 14 / `json` 7 / `state` 8）は 1 バイトも動いていない。**
増えたのは `tests/golden/orm/prisma/` の 14 本だけ。

**途中で 2 つ直している**（どちらも生成物を読んで気づいたもので、6-9d の
`var say "hi"` と同じ形）: 自己参照に名前付き relation が要ること、非 ASCII の
識別子が潰れてぶつかること。**Prisma を実際に走らせてはいない**（Node に prisma CLI を
入れると依存が増える）ので、そこは 6-8 系の「実物に流す」より弱い検証にとどまる。

#### 次段階への入力 —— 6-9f（Drizzle）

- **Drizzle は逆参照を要求しない**（`relations()` ヘルパは任意で、FK は
  `references(() => users.id)` が持つ）。**6-9d の「出さない」判断がそのまま通る側**
- 型は `pgTable` / `mysqlTable` / `sqliteTable` と **dialect ごとに関数が違う** ——
  Prisma の provider と同じ問題が、より強く出る（8 本中 3 本にしか対応が無い）
- **Prisma を実物に流す検証は積み残し。** `prisma validate` は devDependency が増えるので、
  やるなら使い捨てのコンテナで（6-8 系の DB 検証と同じ扱い）

### 2026-08-22 HANDOVER §6「機能」段階6-10a —— プロファイル変換層（出力時変換）

**`db` の 1 文字列が決めていた 4 つ**（型パレット／DDL 生成器／設計 JSON の型キーの名前空間／
識別子規則）**のうち、前 2 つを設計側と出力側に割った。** これで「PostgreSQL で設計して
MySQL 向けの DDL を出す」が通る。6-8d が次段階への入力として送った項目で、
8 本そろったことで実際の欠落になっていたもの。

#### 決めたこと 1: **Drizzle（6-9f）を保留し、6-10 を先に置いた**（ユーザー判断）

6-9e は「優先度は Prisma > Drizzle > SQLAlchemy」と書いていたが、**次にやるのは Drizzle か**を
改めて問い直した結果、順番を入れ替えた。理由は 3 つ:

| 論点 | 中身 |
|---|---|
| **8 本中 3〜4 本しか出せない** | Drizzle は dialect ごとに table 関数が違う（`pgTable` / `mysqlTable` / `sqliteTable`、`mssqlTable` は 1.0.0-beta.2 以降）。h2 / oracle / sql-standard には対応が無く「pg-core の形で出してコメントで断る」妥協になる。**JPA は 8 本すべてで、Prisma も 5 本で意味のある出力が出る**のに対して一番弱い |
| **API のバージョン依存が強い** | 0.31 → 0.36 で第 3 引数が配列に変わり、いまも 1.0 beta が進行中。golden がライブラリの版に縛られ、公開後のメンテ負債になる（SQL の規格に縛られる DDL より変化が速い） |
| **限界効用が 6-10 より低い** | ORM は JPA（自社 = Kotlin/Spring Boot）＋ Prisma（TS 圏のブランディング）で 2 軸を押さえ済み。対して 6-10 は**現存の欠陥**を直す |

**やらないと決めたのではなく後回し**（SQLAlchemy と同じ扱い）。優先度は
**Drizzle > SQLAlchemy** のまま。

#### 決めたこと 2: **スコープは出力時変換のみ**（ユーザー判断）

6-10 の定義文（6-9a の段階表）は「設計の db と出力の db を別にする」で、過去の記録は
**2 つの別々の使い方**を指していた —— 6-9c / `docs/FORMAT.md` の「PG で設計して MySQL 用 DDL も
出す」（出力時）と、6-8d の「PG の設計を sqlite で**開く**」（読み込み時）。**前者だけをやる。**

読み込み時変換をやらないことで、次がすべて守られる:

- [`frontend/js/io/json-parser.ts`](frontend/js/io/json-parser.ts) の db 照合はそのまま（4-2b の「型キーの安全性が
  `db` 照合に依存」が生き続ける）。**設計 JSON の形式も `formatVersion` も 1 バイトも動かない**
- 4-3b が却下した「パレットを取り直して開き直す」に触れない
- 6-8d が却下した「`aka` を膨らませて黙って開けるようにする」にも触れない

6-7 の「将来: プロファイル変換」が「変換を作るなら『拒む』の**例外**として設計する必要が
ある」と書いていた宿題は、
**穴を開けずに済んだ**ぶん先送りになる（読み込み時変換をやる段があれば、そこで必要になる）。

#### 決めたこと 3: 寄せ先の決め方は **4 段で、上ほど正確**

[`frontend/js/io/convert.ts`](frontend/js/io/convert.ts) の `resolveType`:

1. **同じ `id`** —— 6-7 が「同じ意味の型には全プロファイルで同じ id を振る」と決めているので
   最も確か（PG の 24 型のうち h2 で 18 本、mysql で 15 本が当たる）。ただし
   **同じ id でも値の域は違いうる**（PG の `integer` は int32、sqlite の `INTEGER` は int64）ので、
   `kind` が違えば黙らせずに記録する
2. **同じ `kind`** —— 候補が複数ならサイズを取るかどうかで絞り、なおも複数なら**パレット順で先勝ち**
3. **劣化して受けられる `kind`**（`KIND_FALLBACKS`）
4. **落とし先**に置いて `unmappable`

**sql 名での照合（`indexOfTypeName`）は `kind` を持たないパレット（旧 XML 同梱の
`<datatypes>`）にしか使わない。** 名前で寄せると **Oracle の `DATE` が PG の `DATE` を
受けてしまう** —— 前者は時刻を含むので kind は timestamp で、6-9c の「名前ではなく値の域で
決める」はこの罠のこと。テストで固定してある。

**`other` どうしは寄せない**（id 一致のときを除く）。`other` は「正規型に写せない」という
主張であって値の域ではない（6-9c）ので、PG の `INET` を mysql の別の `other` 型に寄せると
**写せないものを別の写せないものに置き換えただけ**になり、しかも losses に出ない。

#### 決めたこと 4: `KIND_FALLBACKS` は **落とす向きだけ**を持つ

`int32 -> int64`（値が保たれる）や `timestamp_tz -> timestamp`（tz が落ちる）は入れ、
**逆向き（`timestamp -> date` / `float64 -> float32` / `decimal -> float64`）は 1 つも入れない。**
変換層が最も避けるべきなのは「開いたら別の意味になっていた」で、それは 6-8d が `aka` を
膨らませる案を却下した理由そのもの。逆向きが入っていないことは
[`tests/node/convert.test.ts`](tests/node/convert.test.ts) が 13 対で固定する。

**表が要るのは、無いと実用にならないから。** sqlite は型が 5 本しかなく、PG が使う kind のうち
14 種類を持たない。表が無いと sqlite 向けの出力はほぼ全列が既定型落ち＋警告になるが、実際には
uuid も date も TEXT に置くのが sqlite の慣行で、**それは劣化ではなくその DB のやり方**。
**(db, 型 id) の表ではない** —— 21 語の kind の中だけで閉じており、プロファイルが 1 本増えても
1 行も増えない（6-9c が避けた形に当たらない）。

#### 決めたこと 5: **落とし先に `newrowtype` をそのまま使わない**

8 本中 6 本の既定型はサイズを要求する型（`varchar` / `nvarchar` / `varchar2`）で、あれは
「UI で Add row したときの既定」＝ 人がその場でサイズを入れる前提の値。**補えない変換の
落とし先には向かない** —— そのまま使うと `c_cidr VARCHAR NULL` という、MySQL が長さ必須で拒む
DDL が出た（**生成した DDL を MySQL 8.4 に流して見つけた**）。サイズを取らない文字列型が
あればそちらへ逃がす（`fallbackIndex`）。

#### 決めたこと 6: **`uuid` の逃げ道だけがサイズを持つ**

`uuid -> string` は `size: "36"`（正準形の文字数。mysql の `CHAR(36)` / oracle の `VARCHAR2(36)`）、
`uuid -> binary` は `"16"`（生のバイト数。oracle の `RAW(16)`）。

**補わないと PRIMARY KEY が作れない。** サイズを取らない `LONGTEXT` に寄った版を MySQL 8.4 に
流したところ `BLOB/TEXT column 'id' used in key specification without a key length` で
**CREATE TABLE ごと拒まれた** —— house 既定の PK が uuid なので、補わないと変換した DDL が
まず流せない。値の幅が決まっている kind は uuid だけなので、表は 1 行で済む。

#### 決めたこと 7: 損失は**生成物のコメント**で出す。ダイアログは作らない

ORM 出力（6-9d / 6-9e）が「写せない型は既定型に落として理由を行コメントで残す」とやっている
のと同じ立場で、同じ層に 2 つの流儀を持たない。SQL を見るのは頻繁な操作なので毎回ダイアログが
挟まると邪魔になり、生成物だけで完結するほうが**ファイルを人に渡しても情報が付いて回る**。
UI を増やさないので locale 21 ファイルにも触れていない。

**一覧は先頭にまとめ、列ごとの行コメントは出さない。** 行コメントにすると 8 本の生成器すべてに
差し込み口が要り、「既存 golden が 1 バイトも動かない」という完了判定を自分で危うくする。

**正規型を併記する**のは生成物を読んで決めた —— `INTEGER -> INTEGER` や `DATE -> DATE` は
sql 名だけ見ると何が起きたのか分からない。いまは `INTEGER (int32) -> INTEGER (int64)` /
`DATE (date) -> DATE (timestamp)` と出る。

#### 決めたこと 8: **既定値（DEFAULT）は 1 文字も触らない**

`uuidv7()` や `'{}'::jsonb` が寄せ先で通るかは型の写像とは別の問題で、関数名の対応表を持つのは
**(db, 関数) の表**を作ること（6-9c が避けた形）。そのまま出して DB に拒ませ、
**先頭のコメントで「既定値は変換していない」と言う**側に倒した。黙って別の関数に変えるより
気づける。ただし実害は確認済み（下の検証）。

#### 検証

| | 6-9e | 6-10a |
|---|---|---|
| `npm test` | 367 passed | **398 passed**（`convert.test.ts` が 31 本） |
| `npm run test:browser` | 165 passed | **183 passed**（golden 14 本 ＋ 性質 4 本） |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**既存の golden（`ddl` 56 / `orm` 28 / `json` 7 / `state` 8）は 1 バイトも動いていない。**
増えたのは `tests/golden/convert/` の 14 本だけ。根拠は `convertDesign` が同じ db を恒等で
返すこと（`from === to` かインスタンスが別でも db 名が同じなら早期リターン）。

**実物に流した**（6-8 系と同じ扱い。恒久テストにはせず、依存も増やしていない）:

| 対象 | 結果 |
|---|---|
| sqlite / types-matrix | **通る**（`node:sqlite`。全 24 型の写像が STRICT sqlite で成立） |
| sqlite / house-defaults | `'{}'::jsonb` で落ちる ＝ **決めたこと 8 の実害**（型ではなく既定値） |
| mysql / house-defaults | 既定値を手で直すと `users` が作れ、**uuid が 36 文字・`jsonb` が JSON（`JSON_TYPE` = OBJECT）・boolean・timestamp すべて期待どおり**に入る |
| mysql / types-matrix | 流せない。ただし**変換のせいではない** —— `AUTO_INCREMENT` の列がキーを持たないためで、**既存の `tests/golden/ddl/mysql/types-matrix.sql` も同じ理由で流せない**（fixture が全型を 1 列ずつ並べただけでキーを持たない性質） |

#### 次段階への入力 —— 6-10b

- **UI がまだ無い。** 出力先 db の select（[`frontend/js/io.ts`](frontend/js/io.ts) の `ormtarget` が型紙）と
  locale 1 キー、`Designer.toOrm(target, targetDb?)` への波及、`docs/TYPE-MAPPING.md`
  （kind × 8 プロファイルの表。6-7 が「この表そのものが公開プロダクトの価値情報」と書いて
  未処理のままの宿題）が 6-10b
- **MySQL は TEXT 系をキーにできない。** house 既定は `text` 優先なので、`email` を UNIQUE に、
  `tag` を複合 PK に使っている house-defaults は**変換した DDL がそこで落ちる**（実測）。
  直すには「キーに含まれる列はサイズ付きの文字列型に寄せる」が要るが、**補うサイズが恣意的**に
  なる（255 に根拠が無い）。パレットに「キーに使える型か」を持たせる案も含めて要判断
- **mssql はサイズを取らない文字列型を 1 本も持たない。** PG の `TEXT` を持っていくと
  `nvarchar` とだけ書かれ、SQL Server はこれを `nvarchar(1)` と解釈する。いまは
  `size-required`（「寄せ先はサイズを要求する。流す前に長さを足すこと」）で警告するに留めた ——
  `nvarchar(max)` 相当をパレットに足すのが本筋だが、mssql の types-matrix fixture と
  DDL golden が動くので 6-8b の完了判定に手を入れることになる
- **既定値の変換は手つかず**（決めたこと 8）。house 既定（`uuidv7()` / `now()` / `'{}'::jsonb`）は
  grabado 自身が薦める値なので、変換すると必ず踏む。キャスト（`::jsonb`）を落とすだけでも
  効くが、「def は触らない」を崩すことになるので判断が要る

---

### 2026-08-22 HANDOVER §6「機能」段階6-10b —— 出力先を UI から選べるようにし、型マッピング表を出す

6-10a が入れた変換層には**画面から使う道が無かった**（`toDdl(targetDb)` を呼べるだけ）。
本段階で select を 1 つ足し、**ORM 出力にも同じ軸を通し**、6-7 が「公開プロダクトの価値情報」と
書きながら置き場所の無かった型マッピング表を `docs/` に出した。

#### 決めたこと 1: select は **1 つだけ**置き、DDL と ORM の両方に効かせる

「出力先の db」は DDL にも ORM にも同じ意味で効く（どちらも**下敷きのプロファイル**を選ぶ話）。
select を 2 つ置くと同じ設定が 2 か所に分かれ、片方だけ変えた状態が作れてしまう。
ORM の select（ターゲット）とは軸が違うので、そちらはそのまま残っている ——
**「どの言語で出すか」と「どの DB を下敷きにするか」の 2 軸**になった。

**先頭の option は「設計と同じ」で値は空文字**。これが既定なので、選ばないかぎり 6-10a 以前と
バイト単位で同じ出力になる。設計の db は選択肢に重複して出さない（`AVAILABLE_DBS` から除く）。

#### 決めたこと 2: **生成は同期のまま。パレットの取得だけを 2 段にした**

出力先のパレットは XHR で取るので非同期だが、`toDdl()` を非同期にすると
tests/browser の golden 採取も known-issue #15 も呼び形が変わる。そこで
`loadPalette(db, cb)` と `toDdl(targetDb)` を分け、**UI 側が押す前に読み込んでおく**形にした:

- select の `change` で先読みする（押した瞬間の待ちを無くす）
- ボタンの経路も `withOutputPalette()` を通す（先読みが間に合わなくても正しく動く）
- **読み込み済みなら `loadPalette` は同期で callback を呼ぶ**ので、2 回目以降は待たない
- 「設計と同じ」のときは `loadPalette` を通らない —— 6-10a 以前と 1 バイトも変わらない経路

#### 決めたこと 3: SQL ボタンのラベルは**選んでいるときだけ** `設計 -> 出力先` にする

6-9d までは `SQL (postgresql)` で、パレットが 1 つしか無いのだから db 名 1 つで足りていた。
出力先を選べるようになると**どちらの話か**が曖昧になるので、選択時だけ
`SQL (postgresql -> mysql)` に変える。選んでいなければ従来どおり。

#### 決めたこと 4: ORM 側の変換コメントは **DDL と別実装**にした

どちらも「変換した」と言うだけだが、**コメント記法が違う**（DDL は `--`、JPA / Prisma は `//`）。
1 本に括ると「どちらでもない形」になるので分けてある —— 6-9e が「言語ごとの識別子の規則は
各生成器が持つ」と決めたのと同じ立場。ORM 側は列の一覧だけを出し、**理由の内訳は DDL 出力に
出る**と案内する（同じ設計から両方出せるので、詳しく知りたければそちらを見ればよい）。

#### 決めたこと 5: **型マッピング表は手で書かない**

[`docs/TYPE-MAPPING.md`](docs/TYPE-MAPPING.md) は house 既定 8 型 × 7 プロファイルの表を持つが、
[`tests/node/type-mapping.test.ts`](tests/node/type-mapping.test.ts) が **docs の表を読んで
`convertDesign` の実際の出力と 1 セルずつ比べる**。パレットを触れば docs が赤くなり、
docs を直せば実装との食い違いが赤くなる。

**手で書いた表が腐る**ことは実証済み —— `tests/support/fixtures.ts` の `readFixture` の
コメントは、根拠として挙げていた 3 件のうち 2 件が消えたまま 6-10a まで残っていた
（同段階で書き直した）。

表から見えたこと（利用者向けの要点として docs にも書いた）:

| | |
|---|---|
| `UUID` | h2 / mariadb は `UUID`、mssql は `uniqueidentifier`、**mysql / oracle は `CHAR(36)`**、sqlite は `TEXT` |
| `TIMESTAMPTZ` | **mysql / mariadb にタイムゾーン付きの時刻型は無い**（`TIMESTAMP` に丸まる）。house 標準が `timestamptz` 固定なので必ず踏む |
| `TEXT` | mssql だけ `nvarchar`（サイズ無し ＝ 要手直し）。他は `LONGTEXT` / `CLOB` / `CHARACTER LARGE OBJECT` |
| `JSONB` | mssql 以外の 6 本は `JSON` を持つ |

#### 検証

| | 6-10a | 6-10b |
|---|---|---|
| `npm test` | 398 passed | **407 passed**（`type-mapping.test.ts` が 9 本） |
| `npm run test:browser` | 183 passed | **189 passed**（UI 経路 6 本） |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**golden は 1 本も動いていない**（`ddl` 56 / `orm` 28 / `json` 7 / `state` 8 / `convert` 14）。
ORM に変換経路を通したが、`outputPalette` を渡さないかぎり `convertDesign` が恒等なので
既存の 28 本は無差分のまま。

locale は 21 ファイルすべてに 2 キー（`outputdblabel` / `outputdbsame`）を足した。訳は
en / ja だけ固有で、残る 19 は英語のまま（6-9b の識別子警告と同じ扱い）。

#### 次段階への入力

- **§6 で残っているのは 6-9f（Drizzle）と §6.4 の仕上げ**（日本語ロケール微調整・初期ズーム /
  スナップ・ロゴ差し替え）。6-10 は本段階で閉じた
- 6-10a が積んだ 3 つ（**MySQL は TEXT 系をキーにできない** / **mssql にサイズ無し文字列型が無い** /
  **既定値の変換**）はそのまま残っている。どれも「補うサイズに根拠が要る」か「パレットに手を入れると
  6-8 系の完了判定が動く」ので、着手前に方針を決めること
- **`docs/TYPE-MAPPING.md` は公開ドキュメントの 1 本目**になった。README から辿れるようにするのは
  公開準備（未着手の Phase 1 の宿題）の側の仕事

---

### 2026-08-22 HANDOVER §5「backend」段階5-0 —— 契約を確定し、§5 を分割する

§6 は 6-10b で閉じ、HANDOVER §9 の順序では次が §5。着手の前提（特性化テストが緑）は満たしている。

**本段階は文書だけで、実装は 0 行**（6-0 が §6 の分割表を作ったのと同じ位置づけ）。§5 には
決めないと後段の PR の形が変わる未決事項が 12 件あり、そのどれもが「あとで思い出す」では
済まない。**記録されていない決定は次のセッションでは存在しないのと同じ**（2026-08-15 に目的と
対応 DB の 2 つを実際に失った）ので、決定を先に確定して台帳に置く。

**契約の正は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §4**（§0 実測でそう宣言した）。
本段階で §4 の見出しを「実測・旧 PHP」に改題し、**§7「Kotlin backend の契約（到達点）」の枠を
予約**した。中身は 5-1b 以降が埋める。

#### 決めたこと 1: Kotlin は **`server/` を新設**して置き、PHP は **5-2 で `backend/` ごと消す**

`backend/` を再利用する案（HANDOVER §2.2 の Dockerfile が `COPY backend/ ./` なのでそちらが
文書とは一致する）を採らなかった理由は 3 つ。

- **`backend/` は URL 空間でもある。** `backend/php-file/?action=` は実際に PHP をディレクトリとして
  解決していた。同じ名前に「ソースの置き場」と「URL パス」の二役をさせ続けると、dev server が
  `backend/src/main/kotlin/*.kt` を配る経路を別途塞ぐ必要が出る
- **PHP 撤去が「ディレクトリごと `git rm`」という最も単純な操作になる。** 再利用すると「PHP だけ消す」
  細かい削除になり、追加と削除が同じ diff に混ざって読めない
- **最終形が `frontend/`（§2 で `js/` を集約）と `server/` で対称になる。** `backend/` は upstream の
  語彙で、grabado の到達点の語彙ではない

Dockerfile のパス修正は §2 の仕事。**`server/` を独立した Gradle root にする**（リポジトリルートに
置くと IDE がリポジトリ全体を Gradle プロジェクトとして開き `node_modules/` を舐める）。

**PHP を消すのは 5-2** —— 5-1b で Kotlin が実測契約を満たしたことを証明した直後。最初の PR で
消す案（半移行の期間がゼロになる）と、§5 の最後まで残す案の中間を採った。

- **最初に消さない理由**: 動く backend が 0 本の commit を develop に置くことになる
- **最後まで残さない理由**: introspection を JSON 化したあとも PHP が残ると、`AVAILABLE_BACKENDS` に
  「XML を返す PHP」と「JSON を返す Kotlin」が並ぶ＝二重管理の最悪形。6-1 が作った
  `backend/php-cubrid/index.php:37` の dangling のような腐りが増える一方になる
- **5-7 の introspection 実装で PHP を参照する必要は無い**。実測は完了して出力は
  `docs/samples/introspection-postgresql.xml` にバイト列で固定済み、2 つの不具合は「再現しない」と
  決定済み＝**逐語移植ではない**。PHP のクエリは反面教師としてしか価値が無い。それでも読みたく
  なったら `git show <sha>:backend/php-postgresql/index.php` で読めるので、**ARCHITECTURE に
  「旧実装は commit `<sha>` の `backend/` にある」と 1 行残す**。凍結コピーを `docs/` に置くのは
  それ自体が二重管理なのでやらない

#### 決めたこと 2: 5-1b は **URL を 1 文字も変えない** —— `{backend}` は受けて捨てる

`@RequestMapping("/backend/{backend}/")` で受け、**`{backend}` の値を一切見ない**。
`CONFIG.DEFAULT_BACKEND` が `["php-mysql"]`（配列バグ）のままでも、`?backend=` に何を渡されても
同じハンドラに届く。

こうすると **5-1b の完了条件を「既存 601 本と golden 114 本が 1 本も動かずに緑」に置ける**。これが
移植で唯一機能する安全網で、URL を同時に動かすと `tests/node/io-ui.test.ts` の URL リテラルが
同じ PR で書き換わり、**「Kotlin が契約を満たしたから緑」なのか「期待値を合わせたから緑」なのかが
区別できなくなる**。CLAUDE.md「backend の契約は実測に一致させる（フロント無改修のため）」とも
正面から一致する。

**この値が絶対にファイルシステムに到達しないこと**をコードのコメントとテストで明示する。

`backend/file/` への固定と backend セレクタ UI の撤去は **5-5**。撤去する理由は、選択肢が実質 1 つの
`<select>` は情報量ゼロで、公開 OSS では「何を選ぶのか」という誤解を生むだけだから（CLAUDE.md
制約6「backend は Spring Boot 一本」からの素直な帰結）。撤去すると `AVAILABLE_BACKENDS` /
`DEFAULT_BACKEND` / `?backend=` / `backendlabel`（21 言語）/ `<select>` が一緒に落ちる ——
**`DEFAULT_BACKEND` が配列というバグは「是正」ではなく「消滅」で決着する**（是正コストが 0 になる）。

「将来 S3 backend を足したくなる」への答え: それは env（`GRABADO_STORE=file|s3`）でサーバ側が
決める話。**どの store が生きているかはサーバしか知らない**ので、ブラウザに選ばせるのは筋が悪い。

REST 化（`/api/schemas/{name}`）は **§5 ではやらない**。`/api/` は §11 の AI proxy が始める。

#### 決めたこと 3: introspection は **設計 JSON を返さない**

設計 JSON v2（`docs/FORMAT.md`）をそのまま返す案を採らず、**中立な introspection JSON**
（`introspectionVersion: 1`）を新しい形式として宣言する。

```json
{
  "introspectionVersion": 1,
  "source": "shop", "dialect": "postgresql", "schema": "public",
  "tables": [{
    "name": "articles", "comment": "記事",
    "columns": [{
      "name": "price", "sqlType": "numeric", "udtName": "numeric",
      "numericPrecision": 12, "numericScale": 2,
      "characterMaximumLength": null, "arrayElementType": null,
      "nullable": true, "default": null, "comment": "…",
      "references": []
    }],
    "keys": [{ "type": "PRIMARY", "name": "articles_pkey", "columns": ["id"] }]
  }]
}
```

根拠 4 つ。

1. **`x` / `y` は backend の持ち物ではない。** 座標は描画の都合で `information_schema` に無い。現行の
   XML 経路も持たず、`importresponse` が `alignTables()` を呼んで**ブラウザ実測の `offsetWidth`** で
   並べている。設計 JSON を返すと `js/io/json-parser.ts` の「`x`/`y` は必須（undefined で throw）」に
   引きずられて backend が 0 を詰め、フロントが直後に上書きする無意味な往復になる。
   **「introspection の出力は設計ファイルではない」ことを形式で表す**
2. **型 id への解決はフロントが持つ。** `columns[].type` は型パレットの安定 id で、パレット
   （`db/<db>/datatypes.xml`）は**フロントの静的資産**。backend が id を返すにはパレット XML を
   読む必要があり、それは**現行 PHP がやっていたこと**（全文連結）＝ backend と frontend が
   パレットを二重に持つ構造そのもの
3. **`kind`（正規型）も backend は付けない。** `kind` も同じ `datatypes.xml` の属性なので、PG の
   `data_type` → `kind` の表を Kotlin に持つと `db/postgresql/datatypes.xml` の写しになる。
   代わりに **backend は生の型情報を最大限返す**（`sqlType` / `udtName` / `numericPrecision` /
   `numericScale` / `characterMaximumLength` / `arrayElementType`）。`db/postgresql/datatypes.xml`
   の冒頭が「`aka` に入れる基準の 2 番目は **introspection の実出力**（`TIMESTAMP WITH TIME ZONE`）」と
   明記しているとおり、**パレットは introspection の型名を受けるように設計済み**で、
   `TypePalette.indexOfTypeName()` と `tests/node/type-resolution.test.ts`（8 プロファイル全候補名の
   全数掃き）がそれを守っている。そこに寄せる
4. **ルートの `db` が設計 JSON の致命傷。** v2 の `db` は「実行中パレットと違えば throw」（4-2b）。
   PG を import したいのに実行中が `mysql` なら何も入らない。中立形式なら `dialect` は情報として
   残り、**寄せは 6-10 の変換層が担う**

**あわせて: import はパレットを差し替えない。** 現行 XML は `<datatypes>` を連結するので
`Designer.fromXML()` が `palette.setRoot()` の経路に入り、**MySQL で作業中に import すると実行中
パレットが PG に化ける**（cookie の `db` は変わらないのでリロードで戻る＝半端な状態）。これは
再現しない。実行中パレットに写し、落ちた型は 6-10b と同じ見せ方で textarea に出す。

**フロントの `serverimport` 側は分離できない**（レスポンス形式を変えた瞬間に `importresponse` /
`fromXML` が壊れる＝半移行の放置）。ただし PR は 2 つに割る —— **5-6 で変換層（TS 純関数）だけを
足してテストで固め、5-7 で Kotlin 実装と配線と XML 経路撤去**。4-2（形式側を先に足して安全網 →
4-3 で UI）と同じ形。

**5-6 の fixture には必ず配列型（`text[]`）と enum（`USER-DEFINED`）を入れる。** どちらもパレットに
存在せず、`indexOfTypeName` が -1 を返す。落とし先が無いと import ごと throw で全滅する。

#### 決めたこと 4: introspection の接続先は **env の名前付き表からしか選べない**

```yaml
grabado:
  introspect:
    sources:
      shop: { url: "${SHOP_JDBC_URL:}", user: "${SHOP_DB_USER:}", password: "${SHOP_DB_PASSWORD:}", schema: public }
```

`?action=import&database=<name>` の `<name>` を**接続の名前**として読み替える。現行 PHP は
`database` を**使っていない**（`Define()` でハードコードし、パラメータはコメントアウト済み）ので、
新しい意味を与える余地がそのまま空いている。`serverimport` の prompt はそのままでよく、
**フロント無改修で allowlist 方式になる**。

**リクエストで JDBC URL を受ける案は採らない** —— それは完全な SSRF プリミティブ。名前付き表なら
クライアントが指定できるのは表のキーだけで、ホスト名は 1 バイトも渡らない。**SSRF が「対策」では
なく「不可能」になる**。公開デモを READONLY 一択にした理由（2026-08-15）は「introspection が任意
ホストへ接続を試みる」ことだったので、これで READONLY は二重の安全になる。

org の `security-baseline.md` には SSRF の項目が無い（規約の穴）ので、**「外部入力をコネクション
文字列にしない」を grabado 側の決定として台帳に置く**。思想は同 §3.1「識別子は列挙した定数からしか
選ばない」・§3.11「公開するパスは列挙する」と同じ。

- 未知の名前 / ソース 0 件 → **404**
- 接続失敗 → **503 を維持**。意味論では 502 が正しいが、`check()` に文言があるのは 501 / 503 だけで、
  **502 は素通しして無反応になる**。PHP 実測とも一致する 503 を採る
- 資格情報はログにもエラー応答にも出さない（org §4.1 / §4.5 / §5.2）
- コネクションプールは持たない（1 リクエスト 1 接続、`isReadOnly` / `loginTimeout` / `socketTimeout`）。
  **`spring-boot-starter-jdbc` を入れない＝ HikariCP が classpath に無い＝ `spring.datasource.*` の
  auto-configuration が存在しない**ので、DB レス既定（制約5）が構造的に保証される

**対応 DB は段階的に広げる**（ユーザー判断）: 5-7 で `postgresql`、5-8 で `mysql` / `mariadb` / `h2`。
`mssql` / `oracle` は **JDBC ドライバのライセンスと再配布可否を確認してから**判断、`sqlite` は
サーバ接続の概念が無いので対象外。CLAUDE.md「対応 DB を絞る判断はしない」は**出力品質**に掛かる
規約で、introspection の本数は「同梱ドライバ＝イメージサイズ ＋ CVE 面積 ＋ 到達先」の運用側の
話として切り分けた。**1 本足すごとに根拠を残す。**

#### 決めたこと 5: READONLY は **403**。実現は **Bean の差し替え**

`501` に寄せれば `check()` を触らずに済む（既存文言を流用できる）が、**「READONLY だから save
できない」と「サーバが壊れている」が同じ画面になる**。意味を曲げて locale 1 キーをケチる取引は
公開 API として割に合わない。403 を採り、`locale` に `http403` を足して `check()` に `case 403` を
足す。訳は en / ja だけ固有で残る 19 は英語のまま（6-9b / 6-10b と同じ扱い）。

実現方法は **Bean の差し替え** —— `grabado.readonly=true` のとき `DesignStore` を
`ReadOnlyDesignStore(delegate)` にし、`IntrospectionService` は `@ConditionalOnProperty` で
**そもそも登録しない**。フィルタや各ハンドラの `if` にしない理由は、**禁止を「禁止したいもの」の
直上に置く**ため。副作用を持つのは `DesignStore` だけ、外部到達性を持つのは `IntrospectionService`
だけなので、ここで塞げば将来 action が増えても自動的に守られる。フィルタ方式は「守るべき経路の
一覧」を人が維持することになり、制約6 を人力に依存させる。副産物として **HTTP なしでテストが書ける**。

**落ちるのは保存・introspection・AI の 3 つだけ**で、`list` / `load` は残す（読み取りビューア）。
編集ストアはブラウザ内なので、READONLY でも「描いて DDL を出す」体験は完全に提供できる。

UI でボタンを隠すには**サーバの能力をフロントが知る必要がある** → 5-5 で `?action=capabilities`
（`{"readonly":true,"introspection":false,"ai":false}`）を足す。**引けなければ「全部できる」に倒す**
（`npm run dev` 単体＝ backend 無しのときに現行と同じ挙動になる）。

#### 決めたこと 6: ETag は **内容の SHA-256**。mtime は使えない

`load` の応答に strong ETag（SHA-256）を付け、`save` は `If-Match` を見て不一致なら **412**。

**mtime ベースの弱 ETag を採らない理由が、この製品の正本モデルから出てくる** —— 正本は git 管理の
ファイル（制約2）で、`git checkout` / `git pull` は**内容が同じでも mtime を書き換える**。つまり
**ブランチを切り替えるたびに全ファイルが偽の 412 を出す**。「内容が同じなら同じ ETag」が git 正本と
噛み合う唯一の形。

**移行は 2 段**にする。

- **5-4 の前半（backend）**: ETag を返し `If-Match` を尊重する。`If-Match` が無ければ従来どおり
  上書き。**既存 601 本を 1 本も壊さない**
- **5-4 の後半（フロント）**: `If-Match` / `If-None-Match: *` を送り、**プリフライトの `load` を撤去**。
  ここで「未指定 ＋ 既存あり」を **428** に締める。`js/io/conflict.ts` の `verdictForSave()` は
  「事前判定」から「412 を受けたあとの分岐」に役割が変わり、`Baseline` は `text` を捨てて `etag` を
  持つようになる。**TOCTOU の窓が閉じる**

`If-Match: *` は「存在すれば無条件上書き」として RFC どおり受ける（CLI 利用者の逃げ道）。
**412 は `check()` に通さない**（フロントが握って confirm に流す。プリフライトの 404 を通さないのと
同じ理屈）。`If-Match` の照合は keyword 単位のロックで「読む→比べる→書く」を囲む —— 囲まないと
412 は「たいてい正しい」だけの機能になり、§4.3 が「TOCTOU の窓を閉じる」と書いた目的を果たさない。

**書き込みは同一ディレクトリの一時ファイル → `ATOMIC_MOVE`。** マウント先は git が見ている
ディレクトリなので、部分書き込みは「壊れた設計ファイルがコミットされる」に直結する。

#### 決めたこと 7: `load` は **`application/octet-stream`** を名乗る

`text/xml` 固定（現行）でも「先頭 1 文字で json / xml を判別」でもなく、
**`application/octet-stream` ＋ `X-Content-Type-Options: nosniff` ＋ `Content-Disposition: attachment`**。

フロントは 4-3b で `xml: true` を外して**中身の先頭 1 文字で判別**するようになったので、
Content-Type を一切見ない。**つまり正直さのコストがゼロ**。一方これは、分類 B のリポジトリで
**同一オリジンから任意のユーザー内容を返す唯一の経路**なので、ブラウザで直接
`?action=load&keyword=evil.json` を開いても描画されない形にしておく。

`304` は返さない（`If-None-Match` を実装しない）。`check()` が 304 を知らないので `default` に落ち、
空 body が `loadDesignText("")` に渡って「empty」の alert が出る。**実装しないことを明示的に決める。**

#### そのほかの決定

| 項目 | 決定 | 根拠 |
|---|---|---|
| `save` の成功 status | **201 を維持** | `locale` の `http201` は `Saved` で 21 言語訳済み。200 にすると `check()` が黙り、**アプリ唯一の保存完了通知が消える**。`saveresponse` は既に 200/201 の両対応（4-6 で移植を見越して入れた）なので将来倒す自由は残る |
| `list` の形式 | `\n` 区切りを維持し、**並びを昇順に固定**（`String.compareTo`。`Collator` はロケール依存なので使わない） | `listresponse` は textarea に直流しするので改行区切りが「人が読む一覧」として正しい。PHP の `glob()` は fs 順＝未規定だった。決定論は制約3 の価値観。空一覧は 0 バイト（`\n` 1 個を返さない） |
| `remove` | **作らない** | 実在せず（未知 action として 501）、フロントに削除 UI も無い。必要になったら新規機能として設計する |
| HTTP メソッド | **固定する**（list/load/import は GET、save は POST）。ミスマッチは 405 | PHP は method を見ていなかったので**これは強化＝挙動変更**。フロントは正しい method しか投げない |
| `keyword` の検証 | 空/未指定・`.json` 以外（**大小無視**）・トラバーサル・制御文字・Windows 予約名・255 バイト超を **400**。**`basename()` 相当の黙った書き換えは採らない** | 書き換えるとユーザーが指定した名前と実際のファイル名がずれ、`js/io/conflict.ts` の `Baseline.name` が**別ファイルを見張る**ことになる。`.JSON`（大文字）は `tests/node/io-ui.test.ts` が契約として固定しているので大小無視が必須 |
| Unicode 正規化 | **しない**（入ってきた UTF-8 のまま作り、`list` もそのまま返す） | 正本は git 管理のファイル。NFC↔NFD を勝手に動かすと**git の差分に出ない形でファイルが二重化する** |
| `save` の body の読み方 | **`HttpServletRequest.inputStream` を直読み**（`@RequestBody` を使わない） | 「backend は body を解釈しない」という実測契約の直訳。加えて後述の Content-Type 結合疑い（`@RequestBody` だと 415 で全滅する） |
| env 名 | `application.yaml` で橋渡し。`grabado.readonly: ${GRABADO_READONLY:${READONLY:false}}` / `grabado.schema-dir: ${GRABADO_SCHEMA_DIR:${SCHEMA_DIR:/data/schema}}` | HANDOVER §2.4 の外向きの名前を保ったまま型付き `@ConfigurationProperties` が使える（テストがコンストラクタで値を作れる＝ Spring を起動せずに store をテストできる） |
| 起動時検証 | 正本ディレクトリが存在しない / ディレクトリでない / 読めない（`readonly=false` なら書けない）なら**起動失敗** | mount 忘れでコンテナ内 fs に書き、コンテナ破棄で設計を失う事故を塞ぐ。「起動はするが save のたびに 500」は最悪の失敗モード |
| CSRF | **除外設定は不要** | 現行に CSRF トークンの仕組みが無い（§4.2 で実測）。`setXhrHeaders()` は `src/main.ts` にコメントアウトされた拡張ポイントがあるだけ |
| 認証 | **入れない**（`spring-boot-starter-security` を足さない） | 単一ユーザーのローカルコンテナ。入れると全経路が 401 になり `permitAll` の列挙が判断対象として増える（org §3.11）。要るのはセキュリティヘッダ 3 本だけで、`OncePerRequestFilter` 20 行で足りる |
| CSP | **今回は入れない**（棚卸ししてから入れると書き残す） | `index.html` にインラインスクリプトがあり、Vite ビルド後の inline 資産を棚卸ししないと `unsafe-inline` 付きの見せかけの CSP になる |
| `js/` の `frontend/` 集約 | **§2 のまま。順序を変えない** | vite root・`tests/support/fixtures.ts` のパス定数・`playwright.config.ts`・`.gitattributes` の glob を一斉に動かす作業。§5 の完了条件が「既存テストが 1 本も動かず緑」に賭けている以上、同じ PR に 2 種類の大移動を混ぜない。`server/` 新設なら §2 がいつ来ても §5 は影響を受けない |
| HANDOVER の改訂 | **§0 / §5 の action 名の誤り（`connect` / `remove`）だけ訂正**。§2.3 Railway 等の方針は触らない | 誤りの訂正と方針の改訂は別物。前者は読んだ人が実装を間違えるので直す。後者は当時の判断の記録でもあり、消すと「なぜ変えたか」が失われる。**HANDOVER = 入口 / CUSTOMIZATIONS = 正**という現行の役割分担（CLAUDE.md が宣言済み）は壊さない |

#### CI —— org の規約を読んで決めた

`propagandist/.github` の `docs/ci-strategy.md` を取得して判断した。**追加する。**

- **ワークフローを 2 本に分ける** —— `ci-frontend.yml` / `ci-server.yml`。`paths` は `on:` にしか
  書けず、ジョブ単位では絞れない。判定ジョブ（`dorny/paths-filter` 等）を置く方式は**その判定ジョブ
  自体が 1 分 × 全 run** かかるので、ワークフロー分割のほうが安い
- `concurrency` ＋ `cancel-in-progress` / `permissions: contents: read` を明示 / 全ジョブに
  `timeout-minutes`（既定 6 時間のハングが枠を一晩で溶かす）/ action は SHA ピン **＋ 末尾の版
  コメントを消さない**（Dependabot が SHA と一緒に書き換える対象）
- `push` は `develop` / `main` に限る。`pull_request` は**マージ結果の SHA に対して走る**ので、
  push 側で同じ検査を回す価値は「PR の CI 実行後に base が進んだ場合」に限られる
- 重い層（`test:dist` / `known-issues` / 実 DB 統合テスト / Docker ビルド）は**週次 `schedule`** へ隔離。
  CLAUDE.md が言う「手元／既存ジョブ／週次の 3 層」の週次層にちょうど収まる
- **`npm run test:browser` は CI に入れる。** `docs/TESTING.md` が「暗黙グローバルは `npm test` では
  捕まらない。`test:browser` だけが赤くする」と明記しており、かつブラウザ側が **golden の唯一の
  権威**。ここを外した CI は、この製品の安全網の定義を外した CI になる
- Windows runner は使わない（2 倍課金）。Windows 固有のリスクは `scripts/vitest.mjs` ＋
  `tests/node/workarounds.test.ts` が既に張っている。**明示的に採らない選択として記録する**

**★ GitHub の「Automatic dependency submission」を有効にしない。** Settings → Advanced Security →
Dependency graph の自動提出機能は、**Gradle プロジェクトで全ブランチの全 push に走る**。cartera では
有効化後 9.5 日で 123 回（うち 73 回が feature ブランチ）走り、**月換算 1,100 分＝ org 全体の枠
2,000 分の半分以上を単独で消費していた**。依存グラフが使われるのは default branch だけなのに、である。
必要になったら `gradle/actions/dependency-submission` を **default branch への push かつ Gradle の
ファイルが変わったときだけ**動かす自前ワークフローに置き換える。**5-1b の PR にこの判断を明記する** ——
Kotlin を入れた誰かが善意で有効化する経路を、先に塞いでおく。

**★ `dependencyLocking` は 5-1b の最初の commit から有効にし、`gradle.lockfile` を commit する。**
org の `security-baseline.md` §3.12 / §5.1 が、分類 B に対して「**解決済みの依存グラフをどこにも
持たない**」を崩れる変更として名指ししている。Gradle は locking が既定 off で、`gradle.lockfile` が
無いと `trivy fs` が未走査を返す。**CI を足すかどうかと無関係に必要**（手元で見るため）で、後から
入れると初回生成が巨大 diff になり、要件を満たしていない期間が develop に残る。

**§5 完了時点で分類の見直しを org に上げる。** grabado は `security-baseline.md` で**分類 B**
（ブラウザで完結・ビルドして配る）と名指しされているが、§5 で「サーバ ＋ 外部 DB への接続」が入ると
分類 A の要素に触れる（認証は無い）。少なくとも §3.1（introspection がカタログ名を組み立てる）/
§3.3（`keyword` のパス）/ §3.11（READONLY）が効くようになる。同 §6 の更新契機「新しいリポジトリが
分類 A/B/C/L に入った」に該当するので、5-9 の申し送りに入れる。

#### §5 の段階分割

**フロント 0 行の帯**（5-1 / 5-2 / 5-6 / 5-8）を最大化し、フロント同時変更を後ろに寄せた。

| 段階 | タイトル | スコープ | フロント |
|---|---|---|---|
| **5-0** | 契約を確定し §5 を分割する | 本エントリ。**実装 0 行** | 0 行 |
| **5-1a** | CI を置く | `ci-frontend.yml` のみ。**Kotlin が 1 行も無いうちに現状 601 本の緑を PR 上で見えるようにする** | 0 行 |
| **5-1b** | Gradle/Spring Boot の骨格と、実測契約そのままの list/load/save | `server/` 新設・4 action（`import` は 501）・契約表・vite dev proxy・dependency locking・`ci-server.yml`。**入れない: `.json` 強制 / READONLY / ETag / URL 変更** | 0 行 |
| **5-2** | PHP を撤去し、正本ディレクトリの規則を入れる | `backend/` ごと削除 ＋ submodule ＋ `.gitmodules`。`.json` 強制・`keyword` 検証・load の Content-Type・list 昇順・起動時 fail-fast | 0 行 |
| **5-3** | READONLY で副作用を止める | `grabado.readonly`・save が 403・`locale` に `http403`・`check()` に `case 403` | 微 |
| **5-4** | ETag ＋ If-Match で save を 1 往復にする | ETag・412 / 428・`Baseline` を `text` → `etag`・プリフライト撤去・仮想 backend に ETag | 中 |
| **5-5** | backend セレクタを撤去し URL を確定、capabilities | `AVAILABLE_BACKENDS` 等の撤去・`backend/file/` に固定・`?action=capabilities` でボタン非表示 | 中（削除中心） |
| **5-6** | introspection の変換層を先に足す（純関数） | `js/io/introspect-parser.ts` ＋ fixture ＋ テスト。**UI 未配線・backend 無し** | 追加のみ |
| **5-7** | Kotlin introspection（PostgreSQL）と `serverimport` の JSON 化 | JDBC・allowlist・PG18 の 2 不具合を再現しない・型情報を落とさない・XML 経路撤去 | 中 |
| **5-8** | introspection を MySQL / MariaDB / H2 へ広げる | 方言ごとのカタログ差 | 0 行 |
| **5-9** | 実 HTTP の E2E と §5 のクローズ | `playwright.server.config.ts` ＋ E2E・文書整理・分類見直しの org 申し送り | 文書中心 |

**各段階の完了条件は「既存 601 本と golden 114 本が 1 本も動かずに緑」＋「Kotlin テストが緑」**
（フロントを触る段階は増減の内訳を PR に出す）。§7 特性化テストの思想（挙動不変を保証してから内部を
作り替える）を backend にも当てた形。

**順序の根拠を 3 つ。**

- **`.json` 強制（5-2）が READONLY（5-3）より先**なのは、`.json` 強制が**フロントの
  `jsonKeyword()` があるので到達しない**＝フロント 0 行で入るから。フロント 0 行の帯を後ろに
  寄せると後戻りの総量が増える
- **ETag（5-4）がセレクタ撤去（5-5）より先**なのは、ETag が**振る舞い**（往復数・conflict の判定）を、
  セレクタ撤去が**識別子**（URL・config・DOM）を変えるから。両方が `js/io.ts` と
  `tests/node/io-ui.test.ts` を触るので、同時にやると「URL が変わったから落ちた」のか「往復が
  変わったから落ちた」のかを切り分けられない
- **変換層（5-6）が Kotlin 実装（5-7）より先**なのは 4-2 → 4-3 と同じ形。純関数とテストを先に
  置けば、5-7 は配線だけになる

#### 検証

実装 0 行なので、検証は「1 バイトも動いていないこと」の確認。

| | 6-10b | 5-0 |
|---|---|---|
| `npm test` | 407 passed | 407 passed |
| `npm run test:browser` | 189 passed | 189 passed |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

golden 114 本（`ddl` 56 / `orm` 28 / `json` 7 / `state` 8 / `convert` 14）は無差分。
`js/` `src/` `tests/` `db/` `locale/` `index.html` の diff は空。

#### 次段階への入力

**5-1b で、テストが無いと「緑なのに契約違反」で通る罠が 2 つある。** 先にテストを書くこと。

1. **末尾スラッシュ。** 実測 URL は `backend/php-file/?action=list` で**ディレクトリ末尾に `/` が付く**。
   Spring Boot 3 は trailing slash match が既定 off なので、`["/backend/{backend}/", "/backend/{backend}"]`
   の 2 つを登録する
2. **未知 action の 501。** `params = "action=..."` の条件に当たらないリクエストを Spring は **404** で
   返す。条件なしのフォールバック `@RequestMapping` を最後に置かないと、契約違反のまま緑になる

**実装上の申し送りが 2 つ。**

3. **`save` の body は `HttpServletRequest.inputStream` から直読みする。** `js/oz.ts` は POST のとき
   `Content-Type: application/x-www-form-urlencoded` を立てた**あと**に呼び手の
   `Content-type: application/json` を足す。XHR の `setRequestHeader` は同名ヘッダを `, ` で連結するため、
   **wire 上の値が `application/x-www-form-urlencoded, application/json` になっている疑いがある**。
   PHP は `php://input` を直読みするので §0 実測では絶対に露見しない。`@RequestBody` は
   `MediaType.parseMediaType` を通るので、結合していれば **415 で全滅**する。
   **これは実測項目**（`npm run dev` ＋ 受け口を立てて生ヘッダを読む）—— 結合していれば
   `js/oz.ts` の form ヘッダを撤去できる（form でボディを送る呼び手は現在 1 つも無い）。
   **結合の有無にかかわらず直読みが正しい**ので、設計は分岐しない
4. **`js/io.ts` の `check()` は 201 / 404 / 500 / 501 / 503 しか知らない。** §5 で新設する
   **400 / 403 / 412 / 413 はすべて `default: return true` に落ちて「成功」に倒れる**。
   status を増やす PR では `check()` と `locale` を**同じ PR で**広げること（分けると無言で成功扱いの
   期間ができる＝制約1 違反）。5-1b は新しい status を返さない（`keyword` 省略の 400 は 5-2）ので、
   最初に効くのは 5-2

**そのほか。**

- `tests/node/harness.ts` の仮想 backend は **未知 action を 404 で返す**（php-file の fs 解決に
  落ちた頃の副産物で、実契約の 501 と違う）。5-1b で 501 に直す
- 契約を 2 言語で二重に書かないため、**機械可読な契約表**（`tests/contract/backend-cases.json`）を
  5-1b で導入する。Kotlin の `@ParameterizedTest` と、TS 側の仮想 backend の**両方が同じ表を読む** ——
  これで仮想 backend が「サーバについての手書きの推測」から「**同じ表で検証された第 2 実装**」になる。
  加えて「表に出てくる全 status が `check()` に載っていること」を TS 側で機械的に確認し、上の 4 を
  再発不能にする。`tests/node/type-mapping.test.ts` が `docs/TYPE-MAPPING.md` を実装と 1 セルずつ
  突き合わせているのと同じイディオム
- **golden は introspection にだけ持ち込む**（`tests/golden/introspect/`）。save/load/list は
  「5 つの status ＋ `\n` 連結」で、golden にすると差分が読めないノイズになる。
  `tests/golden/README.md` を「**各 golden ディレクトリは producer をちょうど 1 つ宣言する**」形に
  一般化し、`introspect/` の producer は実 PG18 の統合テストにする（「Node 側からは絶対に更新しない」は
  その特殊形として保たれる）
- **introspection のフィクスチャを手で書き始めない。** 実 PG18 から採る（`docs/ARCHITECTURE.md` §4.1 に
  `docker run … postgres:18` のレシピがある）。手で書くと §4.6 と同じ罠に自分で落ちる ——
  「PG18 はこう返すはずだ」という信念を符号化したフィクスチャは、信念が間違っていても緑になる
- **6-9f（Drizzle）と §6.4 の仕上げは §6 に残ったまま。** §5 が閉じたあと、§11 / §2 との順序で判断する

---

### 2026-08-22 HANDOVER §5「backend」段階5-1a —— CI を置く

§5 の最初の実装段階。**Kotlin が 1 行も無いうちに、現状の 601 本が PR 上で緑に見える状態を作る。**

これまで GitHub Actions は 1 本も無く、品質ゲートは `.githooks/pre-push`（ブランチ保護のみ。
テストは走らせない）と手元実行だけだった。つまり「特性化テストが緑であることが移植の前提」
（CLAUDE.md 制約1）は**人の記憶に依存していた**。§5 は「既存テストが 1 本も動かないこと」を
各段階の完了条件に据えるので、その判定を先に機械へ移す。

#### 決めたこと 1: 5 系統すべてを 1 ジョブに入れた（5-0 の「週次へ隔離」から変えた）

5-0 では「重い層（`test:dist` / `known-issues`）は週次 `schedule` へ隔離」と書いたが、
**手元で測ったらどちらも軽かった**ので同じジョブに入れた。

| 検査 | 実測 |
|---|---|
| `npm run typecheck` | 数秒 |
| `npm test`（vitest 407） | 14 秒 |
| `npm run test:browser`（playwright 189） | 23 秒 |
| `npm run known-issues` | 1.3 秒 |
| `npm run test:dist` | 7 秒（＋ `vite build`） |

org 規約は「課金は**ジョブ単位で 1 分未満切り上げ**。**1 分未満のジョブが 3 つ以上並んでいたら
まとめられないか考える**」。5 つとも 1 分未満なので、まとめるのが最も安い。**ステップは何本
あっても課金は変わらず、どこで落ちたかは画面で分かる。**

**週次に出すのは「時間で変わる層」**（依存の CVE・ベースイメージの更新）と、**1 分を大きく超える
検査**（5-7 の実 DB を要する introspection 統合テスト、§2 の Docker ビルド）。どちらもまだ実体が
無いので、**週次ワークフローは中身ができる段階で作る**（先に空の器を置かない）。

#### 決めたこと 2: `push` では回さない

`main` / `develop` への直接 push は `.githooks/pre-push` が禁じており、`develop` が動くのは PR の
squash merge だけ。`pull_request` イベントは **PR ブランチと base のマージ結果**に対して走るので、
「マージしたらどうなるか」は PR の時点で検査済み。push 側を足すと **PR 1 本あたりの消費が倍**になる。

org のテンプレートも「直接 push をしない運用なら `push:` を外してよい（消費は半分になる）」と
明記している。枠は org 全体で共有（2,000 分/月）で、**枯らすと他リポジトリの本番デプロイまで止まる。**

#### 決めたこと 3: `paths` は実際に確かめて書いた

「入力が変わらなければ出力も変わらない」が規約の判断軸なので、**テストが `tests/` の外を読む面を
grep で洗い出してから**列挙した。

| 入力 | 読んでいるもの |
|---|---|
| `tools/` | `migrate-design.test.ts` が `tools/migrate-design.mjs` を import する |
| `scripts/` | `npm test` は `scripts/vitest.mjs`（Windows の cwd 問題のラッパ）を呼ぶ |
| `db/` `locale/` `index.html` | `tests/node/harness.ts` が静的資産として読む |
| `docs/TYPE-MAPPING.md` | `type-mapping.test.ts` が実装の出力と 1 セルずつ突き合わせる（6-10b） |

**`docs/` をまるごとは入れない。** 文書だけの PR（**段階5-0 がまさにそれ**）で数分使うのは判断軸に
反する。テストが読む repo ルートのファイルを増やしたら paths に足す —— **この対応関係は
ワークフロー自身のコメントにも書いた**（ここだけに書くと、次に触る人が気づけない）。

`paths` を 2 回書く必要は無い（`push` が無いため）。**YAML アンカーは使わない** —— org 規約が
明示的に見送っている。`zizmor` の対応がベータであることに加え、**アンカーが解釈されないと
workflow が invalid になって静かに起動しない**＝「枠が枯れて起動しない」と区別がつかないため。

#### 決めたこと 4: Playwright のブラウザキャッシュは足さない

規約 §3③「**高速化は最後。しかも実測してから**」。`actions/cache` を足すと action が 1 つ増え、
SHA ピンの管理対象も増える。まず素の形で回し、
`gh api repos/{owner}/{repo}/actions/runs/{run_id}/jobs` の `steps[]` の時刻差で内訳を採ってから
判断する。org には「遅いと思っていたジョブの時間はほぼテスト本体で、キャッシュ復元は数秒だった」
という実測（cartera）があり、**効いているものを直そうとしても何も減らない**。

`setup-node` の `cache: npm` は組み込みなので入れた（action は増えない）。

#### そのほか

- action は **SHA ピン ＋ 版コメント**（`actions/checkout` v7.0.1 / `actions/setup-node` v7.0.0）。
  **テンプレートの SHA は Dependabot が追随しない**（対象は `.github/workflows/` だけ）ので、
  使う時点で最新を取り直して確認した
- `permissions: contents: read` を明示 / `concurrency` ＋ `cancel-in-progress` / `timeout-minutes: 15` /
  `checkout` に `persist-credentials: false`
- 最後に **`git diff --exit-code`** を置いた。ここで追跡ファイルが動いていたら、テストが副作用を
  持っているか golden が書き換わっている（**どちらも見逃してはいけない**）
- **Dependabot の設定はまだ置かない。** SHA ピンは Dependabot の `github-actions` entry とセットで
  初めて安全になる（凍結したまま放置すると、セキュリティ修正が降りてこない浮動タグより悪い）が、
  Gradle の entry と一緒に置くほうが 1 ファイルで済む。**5-1b で置く**
- `playwright.config.ts` は既に `process.env["CI"]` を見て reporter を `list` にし
  `reuseExistingServer` を切る。CI 側で足すことは何も無かった

#### 検証

ワークフローの追加だけで、コードは 1 行も動いていない。

| | 5-0 | 5-1a |
|---|---|---|
| `npm test` | 407 passed | 407 passed |
| `npm run test:browser` | 189 passed | 189 passed |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |

**この PR 自身が CI の最初の run になる**（`paths` に `.github/workflows/ci-frontend.yml` を
入れてあるため）。**起動しなければ workflow が invalid** —— 上で YAML アンカーを避けた理由と
同じ失敗モードなので、PR を出したら Actions タブで run が立つことを目視する。
→ **run 32569135886 が立ち、全ステップ緑**。

#### CI の実測 —— キャッシュは入れない（確定）

規約 §3③「高速化は最後。**しかも実測してから**」に従って、最初の run の内訳を
`gh api repos/{owner}/{repo}/actions/runs/{run_id}/jobs` の `steps[]` から採った。

| ステップ | 秒 |
|---|---|
| set up job / checkout / setup-node | 4 |
| 依存の取得（`npm ci`） | **4** |
| **Chromium の取得** | **27** |
| 型検査 | 4 |
| 高速回帰（vitest 407） | 17 |
| 特性化テスト（playwright 189） | 15 |
| 既知の不具合 | 4 |
| 配布物のスモーク | 5 |
| 作業ツリーの確認 | 0 |
| 後片付け | 3 |
| **合計** | **約 83 秒 → 課金 2 分** |

**結論: Playwright のブラウザキャッシュは入れない。** 最大のステップは Chromium の取得（27 秒）
だが、**キャッシュで 10 秒に縮めても合計 66 秒で課金は同じ 2 分**。1 分未満切り上げの世界では、
**120 秒の壁を割らないかぎり時間短縮は 1 分も効かない**。`actions/cache` を足せば action が
1 つ増え、SHA ピンの管理対象とキャッシュキーの保守（`@playwright/test` の版に追随させる）が
生えるだけになる。

**次にこの判断を見直すのは合計が 120 秒を超えたとき。** 5-1b の Gradle は別ワークフロー
（`ci-server.yml`）に出るので、frontend 側がすぐ超えることはない。

`npm ci` が 4 秒で済んでいるのは `setup-node` の `cache: npm` が効いているため
（こちらは action が増えないので最初から入れた）。**org の cartera でも「遅いと思っていた
ジョブの時間はほぼテスト本体で、キャッシュ復元は数秒だった」という同じ結論が出ている。**

#### 次段階への入力

- **5-1b で `ci-server.yml` を足す。** paths は `server/**` と自分自身。Gradle は
  `gradle/actions/setup-gradle` の `validate-wrappers: true` で wrapper を毎回検証する
  （60KB の不透明なバイナリを分類 B のリポジトリに置く懸念は、これで「検証済みバイナリ」に変わる）。
  `gradle-wrapper.properties` には `distributionSha256Sum` を書く
- **★ GitHub の「Automatic dependency submission」を有効にしない**（5-0 の記録）。Gradle を入れる
  5-1b が、この判断の当事者になる
- **`.gitattributes` に `gradlew` の改行指定を足す**（`gradlew` は `eol=lf`、`gradlew.bat` は
  `eol=crlf`、`gradle-wrapper.jar` は `binary`）。既に `.githooks/**` と `scripts/*.sh` に同じ
  ことをしている。**抜けると Windows で clone した人の `./gradlew` が起動しない**
- CI の実測（各ステップの秒数）を採ってから、Playwright キャッシュの要否を判断する

---

### 2026-08-22 HANDOVER §5「backend」段階5-1b —— Gradle/Spring Boot の骨格と、実測契約そのままの list/load/save

**Kotlin が 1 行も無かったリポジトリに backend の実体が入った。** 実装は
[`server/`](server/)（Spring Boot 4.1.1 / Kotlin 2.4.10 / Gradle 9.7.1 / JVM 21）。

**フロントは 1 行も触っていない。** 5-1b の完了条件は「既存 601 本と golden 114 本が 1 本も
動かずに緑」で、それが「Kotlin が実測契約を満たした」ことの証明になる。契約を同時に動かすと
「満たしたから緑」なのか「期待値を合わせたから緑」なのか区別できなくなる。

#### 決めたこと 1: URL は 1 文字も変えず、`{backend}` は**受けて捨てる**

`@RequestMapping(path = ["/backend/{backend}/", "/backend/{backend}"])` で受け、値を読まない。
`CONFIG.DEFAULT_BACKEND` が `["php-mysql"]`（配列バグ）のままでも、`?backend=` に何を渡されても
同じハンドラに届く。**ファイルシステムには絶対に到達させない**ことをテストでも押さえた
（`<backend名>` を変えても同じ正本ディレクトリを見る／その名前のディレクトリを作らない）。

**パスを 2 つ登録している**のは、実測 URL が `backend/php-file/?action=list` と**ディレクトリ
末尾に `/` が付く**のに対し、Spring Boot 3 以降は trailing slash match が既定 off だから。

#### 決めたこと 2: 未知 action の 501 は**フォールバックを明示的に置く**

`params = "action=..."` の条件に当たらないリクエストを Spring は **404** で返す。実測契約は
501 なので、条件なしの `@RequestMapping` を最後に置いた。**これはテストが無いと「緑なのに
契約違反」で通る**（5-0 の申し送りどおり、先にテストを書いた）。

フォールバックの中で action を見て分岐する:

| 来たもの | 返す |
|---|---|
| 既知の action に違う HTTP メソッド | **405**（PHP は method を見ていなかったので**強化**＝意図した挙動変更） |
| `import` / `remove` / 未知 / 指定なし | **501**（実測どおり。`import` の中身は 5-7） |

#### 決めたこと 3: save の body は `inputStream` を直読みする

`@RequestBody ByteArray` を使わない。`js/oz.ts` は POST のとき
`Content-Type: application/x-www-form-urlencoded` を立てた**あと**に呼び手の
`application/json` を足しており、XHR の `setRequestHeader` は同名ヘッダを `, ` で連結する。
`@RequestBody` は `MediaType.parseMediaType` を通るので、**結合値なら 415 で全滅**する。
PHP は `php://input` を直読みするので §0 実測では絶対に露見しない類の罠。

直読みは「**backend は body を解釈しない**」という実測契約の直訳でもある。壊れた JSON を
保存して読み戻すテストで、それが実際に成り立つことを確かめた。

#### 決めたこと 4: 実測から**先に**動かしたもの（3 つ）と、その理由

5-0 の分割表では 5-2 に置いていたが、5-1b に前倒しした。**いずれもフロントに届かないので、
既存 601 本は 1 本も動かない。**

| 項目 | 前倒しの理由 |
|---|---|
| **トラバーサルを 400 で拒む** | 5-1b の時点で穴を開けないため。php-file は `basename()` で**黙って書き換えて保存**していた。どちらも「repo 外に書けない」点は同じだが、書き換えると `js/io/conflict.ts` の `Baseline.name` と実ファイル名がずれ、段階4-6 の外部変更検知が別のファイルを見張る |
| **`load` を `application/octet-stream` + `nosniff` + `attachment`** | 実測は `text/xml` 固定だが、フロントは 4-3b から中身の先頭 1 文字で判別するので**見ない**。一時的にでも嘘の Content-Type を書く理由がない。ここは分類 B のリポジトリで**同一オリジンから任意のユーザー内容を返す唯一の経路** |
| **`list` の昇順固定と dotfile 除外** | PHP の `glob` は fs 順＝**未規定**だったので、昇順にしても契約違反ではない。dotfile を返さないのは `glob` と同じ挙動で、ついでに save の一時ファイル（`.grabado-*.tmp`）が見える窓も塞げる |

`.json` の強制（大小無視）・制御文字全般・Windows 予約名・255 バイト超は **5-2 のまま**。
規則を足すたびに、それがフロントに届くかどうかを 1 段階ずつ確かめる。

#### 決めたこと 5: 契約は**機械可読な表 1 つ**に置く

[`tests/contract/backend-cases.json`](tests/contract/backend-cases.json)（25 ケース）。
Kotlin の `BackendContractTest` が `@ParameterizedTest` で全ケースを実 HTTP に流す。
**5-1c で `tests/node/` の仮想 backend にも同じ表を流す** —— そうすると仮想 backend が
「サーバについての手書きの推測」から「**同じ表で検証された第 2 実装**」になる。

`virtual: false` は仮想 backend では再現できないケース（Map であってファイルシステムでは
ないので、パス解決や dotfile を模せない）。**模せる範囲を表の中で宣言する**ことで、
harness がどこまでサーバなのかが文書ではなくデータになる。

散文の正は `ARCHITECTURE.md` §4（実測・旧 PHP）と §7（Kotlin の到達点）のまま。手で書いた表が
腐る問題への対処は、`type-mapping.test.ts` が `docs/TYPE-MAPPING.md` を実装と 1 セルずつ
突き合わせているのと同じイディオム。

#### 決めたこと 6: Kotlin のテストは **MockMvc ではなく実サーバ**

契約には**日本語 keyword の URL 往復**と `%2F` の扱いが含まれ、どちらもサーブレットコンテナの
デコード層の話で **MockMvc はそこを素通りする**。`@SpringBootTest(webEnvironment = RANDOM_PORT)`
＋ JDK 標準の `HttpClient` なら実際に通り、しかも依存が 1 つも増えない。

**Boot 4 では `@AutoConfigureMockMvc` が `spring-boot-starter-test` の外に出ている**ので、
MockMvc を使うなら依存を 1 つ足すことになった。結果的に、正しいほうが安かった。

#### 実測で分かったこと: Tomcat は `%2F` を含むパスを 400 で拒む

契約表に「`<backend名>` に `..%2F..%2Fetc` を入れても 200」と書いて走らせたら **400** だった。
**アプリに届く前にサーブレットコンテナの段階で閉じている**。実測に合わせて表を直し、
ケース名も `backend-segment-encoded-slash-is-rejected` に変えた（エンコードしない `..` を含む
名前は普通のパスセグメントとして届き、`<backend名>` を読まないので無害 —— こちらも表に足した）。

#### 依存とビルド

| | 選んだもの | 備考 |
|---|---|---|
| Spring Boot | **4.1.1** | 新規プロジェクトなので最新メジャー。3.5.x（旧世代）を選ぶ理由が無い。**Jackson 3（`tools.jackson`）** に移っている点だけ注意 |
| Kotlin | **2.4.10** | `jvmToolchain(21)` で出力を固定（開発機の JDK が何であれ決定論的）。`allWarningsAsErrors` |
| Gradle | **9.7.1** | wrapper を commit し、`gradle-wrapper.properties` に **`distributionSha256Sum`** を書いた |
| BOM | `platform(spring-boot-dependencies)` | `io.spring.dependency-management` plugin を使わない（plugin を 1 つ減らせる） |
| 版の置き場 | `gradle/libs.versions.toml` | Dependabot の gradle ecosystem が読む。starter の版は**書かない**（BOM が解決するので必ず Boot に追随する） |

**入れなかったもの**: `starter-jdbc`（DB レス既定を構造で保証 —— HikariCP が classpath に無い
＝ `spring.datasource.*` の auto-configuration がそもそも存在しない。JDBC は 5-7）/
`starter-security`（認証も認可も無い。要るのはヘッダ 3 本で、`OncePerRequestFilter` 20 行で足りる）/
`starter-validation`（`keyword` の検証は純関数で書きたい）/ `jackson-module-kotlin`
（いま JSON は書き出し方向しか無い）。

**入れたもの**: `kotlin-reflect`。`@ConfigurationProperties` の constructor binding が
パラメータ名を reflect 越しに読むため、無いと `ClassNotFoundException:
kotlin.reflect.jvm.ReflectJvmMapping` で **Bean 生成ごと落ちる**（実際に踏んだ）。

**★ `dependencyLocking` を最初の commit から有効にした。** org `security-baseline.md`
§3.12 / §5.1 が分類 B に対して「解決済みの依存グラフをどこにも持たない」を崩れる変更として
名指ししており、Gradle は locking が既定 off。効いていることは実地で確認できた ——
`kotlin-reflect` を足したとき **`Resolved ... which is not part of the dependency lock state` で
ビルドが止まった**。更新は `./gradlew dependencies --write-locks`。

#### そのほか

- **`server/` を新設**（`backend/` を再利用しない。5-0 の決定どおり）。PHP の撤去は 5-2
- `.gitattributes` に **`gradlew` は LF / `gradlew.bat` は CRLF / jar は binary** を足した。
  抜けると **Windows で clone した人の `./gradlew` が起動しない**（`.githooks/**` と同じ問題）
- **`gradlew` の実行ビットを git に記録した**（`git update-index --chmod=+x`）。Windows で
  `gradle wrapper` を実行すると mode 100644 のままコミットされ、**Linux では
  `./gradlew: Permission denied`（exit 126）で CI が落ちる**。改行だけ直しても駄目で、
  これは `.gitattributes` では表現できない別の属性 —— **実際に CI で踏んでから直した**
- `.gitignore` に `/server/bin/` を足した（VSCode の Kotlin 拡張が作る Eclipse 系の出力）
- `vite.config.ts` に **dev proxy**（`/backend` → 8080）。**同一オリジンのまま**なので
  `tests/browser/harness.ts` の「オリジン外へのリクエストが出たら失敗」検査に触れない。
  backend を起こしていなければ ECONNREFUSED になるだけで、5-1b 以前と同じ体験
- 起動時 fail-fast —— 正本ディレクトリが存在しない / ディレクトリでない / 読めない / 書けないなら
  **起動させない**。mount 忘れでコンテナ内 fs に書き、コンテナ破棄で設計を失う事故を塞ぐ
- save は同じディレクトリの一時ファイル → `ATOMIC_MOVE`。正本は git 管理のファイルなので、
  **半端に書かれた JSON が `git add` される**のが最悪の失敗
- `.github/workflows/ci-server.yml` と `.github/dependabot.yml` を追加（下記）

#### CI —— Gradle を入れる当事者として

- **`ci-server.yml` は `paths: server/** , tests/contract/** , 自分自身` で絞る。**
  Kotlin を 1 行も触らない PR で Gradle を回さない。frontend と別ワークフローなのは
  `paths` が `on:` にしか書けないため（5-1a の記録と同じ理由）
- `gradle/actions/setup-gradle` に **`validate-wrappers: true`**。`gradle-wrapper.jar` を
  Gradle の既知リリースのハッシュと毎回突き合わせる。**60KB の不透明なバイナリを分類 B の
  リポジトリに置く懸念は、これで「検証済みバイナリ」に変わる**（`distributionSha256Sum` と 2 段）
- 最後に `git diff --exit-code`。**`--write-locks` を忘れたまま依存を足した PR をここで捕まえる**
- **★ GitHub の「Automatic dependency submission」は有効にしない。** Gradle プロジェクトで
  **全ブランチの全 push に走り**、cartera では 9.5 日で 123 回・**月換算 1,100 分＝org 枠の
  半分以上**を単独で消費した実測がある。依存グラフが使われるのは default branch だけなのに、である。
  **判断をワークフローのコメントに書いた** —— Kotlin を入れた誰かが善意で有効化する経路を先に塞ぐため
- `.github/dependabot.yml` を追加（github-actions / gradle / npm）。**SHA ピンは Dependabot と
  セットで初めて安全**（凍結したまま放置すると、セキュリティ修正が降りてこないぶん浮動タグより悪い）。
  更新 PR も枠を食うので weekly ＋ grouped ＋ limit 3。**Dependabot は `gradle.lockfile` を
  更新できない**ので、gradle の更新 PR は上の `git diff --exit-code` で落ちる ——
  落ちること自体が「ロックを更新し忘れていない」証拠になる

#### 検証

| | 5-1a | 5-1b |
|---|---|---|
| `npm test` | 407 passed | **407 passed** |
| `npm run test:browser` | 189 passed | **189 passed** |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |
| `cd server && ./gradlew test` | （無し） | **64 passed** |

golden 114 本は無差分。`js/` `src/` `tests/browser/` `tests/node/` `db/` `locale/` `index.html` の
diff は空（`tests/` は `contract/` の新規追加のみ）。

Kotlin 側の内訳: 契約表 25 ケース ＋ 表の健全性 1 / 振る舞い 9 / `DesignName` 19 / `FileDesignStore` 10。

**CI の実測**（PR の run。5-1a と同じく `jobs` API の `steps[]` から採った）:

| ワークフロー | 内訳 | 合計 |
|---|---|---|
| `ci-frontend.yml` | （5-1a の記録どおり。Chromium 27 秒が最大） | 77 秒 → 課金 **2 分** |
| `ci-server.yml` | セットアップ 4 秒 ／ **ビルドとテスト 76 秒** ／ 残り 3 秒 | 83 秒 → 課金 **2 分** |

`ci-server.yml` の 76 秒は**ほぼ全部が Gradle 本体**（依存解決 ＋ Kotlin コンパイル ＋
Spring コンテキスト 2 回起動）。`setup-gradle` のキャッシュ復元は 0 秒 —— org の cartera で
「遅いと思っていたジョブの時間はほぼテスト本体で、キャッシュ復元は数秒だった」という
実測が出ているのと同じ形で、**キャッシュを疑う前に測るべき**という規約 §3③ の実例が
grabado にも 2 つ揃った。

**両方に触れる PR（これがそれ）は 4 分**だが、`paths` で絞ってあるので通常はどちらか一方
＝ 2 分。`timeout-minutes: 20` は実測 83 秒に対して十分な余裕がある。

#### 次段階への入力

- **5-1c（新設）: 契約表を TS 側にも流す。** `tests/node/harness.ts` の仮想 backend に
  `virtual: true` の 14 ケースを流し、**未知 action の応答を 404 → 501 に直す**（現在の 404 は
  php-file の fs 解決に落ちた頃の副産物で、実契約と違う）。あわせて「表に出てくる全 status が
  `js/io.ts` の `check()` に載っていること」を機械的に確認するテストを置く ——
  **400 / 403 / 412 が無言で成功に倒れる**問題を再発不能にするため。
  5-0 の分割では 5-1b に含めていたが、**5-1b の完了条件（既存テストが 1 本も動かない）を
  純粋に保つため**に分けた
- **5-2 で PHP を撤去する。** `backend/` ごと `git rm` ＋ submodule ＋ `.gitmodules`。
  同じ PR で `.json` 強制・`keyword` 検証の残り・`list` の `*.json` 限定を入れる
- **`js/oz.ts` の Content-Type 結合は未実測のまま。** 直読みにしたので**設計は分岐しない**が、
  結合しているなら `js/oz.ts` の form ヘッダは撤去できる（form でボディを送る呼び手は現在 1 つも無い）。
  測るなら `npm run dev` ＋ 受け口を立てて生ヘッダを読む
- **Boot 4 は Jackson 3（`tools.jackson`）。** `JsonNode` が自前の `map(...)` を持つので
  **Kotlin の `Iterable.map` が解決されない**（`for` で回す）。`asText()` ではなく `asString()`、
  `fields()` ではなく `properties()`。5-7 で introspection JSON を組むときに再び効く

---

### 2026-08-22 HANDOVER §5「backend」段階5-1c —— 契約表を TS 側にも流し、`check()` の穴を塞ぐ

5-1b が置いた契約表（`tests/contract/backend-cases.json`）を **`tests/node/` の仮想 backend にも
流した**。これで仮想 backend は「サーバについての手書きの推測」から
**同じ表で検証された第 2 実装**になる。

5-0 の分割では 5-1b に含めていたが、**5-1b の完了条件（既存 601 本が 1 本も動かない）を純粋に
保つため**に分けた。本段階はフロントを触る（`js/io.ts` / `locale` / `tests/node/`）。

#### 見つかった穴 1: 仮想 backend は未知の action に **404** を返していた

実測契約は **501**（`ARCHITECTURE.md` §4.3）。404 は php-file の fs 解決に落ちた頃の副産物で、
**4-6 で仮想 backend を書いたときにそのまま写していた**。同じ表で両側を検証したら即座に出た ——
契約表を置いた効果がいきなり現れた形。

あわせて仮想 backend を Kotlin 実装に揃えた:

| | 5-1c 以前 | 以後 |
|---|---|---|
| 未知 action / `import` / `remove` / 指定なし | 404 | **501** |
| `list` | **未実装**（404 に落ちる） | 昇順・末尾にも改行・空なら 0 バイト・dotfile を返さない |
| `load` の応答ヘッダ | 無し | `Content-Type: application/octet-stream` ＋ `X-Content-Type-Options: nosniff` |
| 空 body | `null` | `""`（実 XHR の `responseText` と同じ形） |

**既存 407 本は 1 本も動かなかった。** 未知 action の 404 に依存しているテストは無く、
`null` → `""` を見ているテストも無かった。

#### 見つかった穴 2: `check()` が **400 / 405 を知らない**

`js/io.ts` の `check()` は「表示すべき応答」を `switch` で列挙しており、**知らない status は
`default: return true` に落ちて「成功」に倒れる**。5-1b で Kotlin が 400（`keyword` が空・
パスを脱出しうる形）と 405（メソッド違い）を返すようになったのに、フロントは**無言で成功扱い**
していた。

`check()` に 2 つ足し、`locale/*.xml` 21 本に `http400` / `http405` を足した。

**★ この穴を再発不能にするテストを置いた** —— `backend-contract.test.ts` が
**契約表に出てくる 400 以上の status を集め、`check()` が全部 `false` を返すことを確かめる**。
さらに `locale/en.xml` に対応するキーがあることも見る（`_()` は未知キーをキー名のまま返すので、
`check()` だけ足すと textarea に翻訳されない `http400` という文字列が出る）。

これで **5-4 の 412・5-3 の 403 を足すとき、`check()` と locale を忘れたら赤くなる**。
5-0 の「status を増やす PR では `check()` と locale を同じ PR で広げること」という申し送りが、
散文から機械に移った。

`type-mapping.test.ts` が `docs/TYPE-MAPPING.md` を実装と 1 セルずつ突き合わせているのと同じ
イディオム —— **手で書いた表は必ず腐る**ので、腐ったら赤くなる仕掛けを一緒に置く。

#### 決めたこと: 模せない範囲を「表の中で」宣言し続ける

仮想 backend は Map であってファイルシステムではないので、パス解決・dotfile・拡張子の強制は
模せない。契約表の `virtual: false`（11 ケース）がそれで、TS 側は `virtual: true`（14 ケース）
だけを流す。**`virtual: false` が 0 件になったら「仮想 backend が実サーバと同等になった」より
「宣言を書き忘れた」ほうがずっと起こりやすい**ので、両方が 1 件以上あることもテストで見ている。

#### locale の扱い

`http400` = `Bad Request` / `http405` = `Method Not Allowed` を **21 本すべて英語**で足した。
既存の `http*` は locale ごとにまちまち（`ko.xml` は韓国語訳が入っているが `en` / `ja` は英語）で、
**`ja.xml` の `http201` も `Saved` のまま**。ここだけ日本語にすると不揃いになるので揃えた。
**`ja` の `http*` をまとめて訳すのは §6.4（日本語ロケール微調整）の仕事**として送る。

改行コードはファイルごとに保った（`locale/**` は `.gitattributes` で `-text`）。`sed` で挿入すると
LF 混在になりうるので、既存の `http404` 行からインデントと行末を採って組み立てるスクリプトを使った
（差分は 21 ファイル × 2 行 ＝ **+42 / -0** で、既存行は 1 バイトも動いていない）。

#### 検証

| | 5-1b | 5-1c |
|---|---|---|
| `npm test` | 407 passed | **425 passed**（`backend-contract.test.ts` が 18 本） |
| `npm run test:browser` | 189 passed | 189 passed |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |
| `cd server && ./gradlew test` | 64 passed | 64 passed |

**増えた 18 本の内訳**: 契約表の `virtual: true` 14 ケース / 表の健全性 2 / `check()` の網羅 1 /
locale の網羅 1。**既存 407 本は 1 本も動いていない**（425 − 18 = 407）。golden 114 本も無差分。

#### 次段階への入力

- **5-2 で PHP を撤去する。** `backend/` ごと `git rm` ＋ submodule ＋ `.gitmodules`。同じ PR で
  `.json` 強制（大小無視）・`keyword` 検証の残り（制御文字・Windows 予約名・255 バイト超）・
  `list` の `*.json` 限定を入れる。**契約表の `list-keeps-non-json` は期待値が変わる**
  （いまは実測どおり非 `.json` も返す）ので、表を先に直してから実装すること
- **5-3 / 5-4 で status を足すときは `check()` と locale を同じ PR で。** 忘れたら
  `backend-contract.test.ts` が赤くする。ただし **412 は `check()` に通さない**と決めてある
  （フロントが握って confirm に流す）ので、表に 412 を載せるときはこのテストの対象から
  外す必要がある —— **そのとき「なぜ 412 だけ別扱いか」を表かテストに書くこと**
- `ja.xml` の `http*` は英語のまま。§6.4 で他の日本語ロケール調整とまとめて訳す

---

### 2026-08-22 HANDOVER §5「backend」段階5-2 —— PHP を撤去し、正本ディレクトリの規則を入れる

**upstream 由来の PHP backend 15 実装（31 ファイル）と submodule が消えた。** 同じ PR で、
正本ディレクトリが受け付ける名前の規則を確定した。

**フロントは 1 行も触っていない**（触ったのは `tests/node/harness.ts` の仮想 backend だけ）。
`js/io.ts` の `jsonKeyword()` が必ず `.json` を付けるので、**新しい規則はどれも UI からは
到達しない** —— 変わるのは「公開 API として何を受け付けないか」だけ。

#### 決めたこと 1: PHP は「Kotlin が実測契約を満たしたことを確かめてから」消した

5-0 では「最初に消す」「最後まで残す」の中間として 5-2 に置いた。実際その順序が効いた ——
**5-1b で 25 ケース、5-1c で仮想 backend まで揃えてから消した**ので、消す時点で
「PHP と同じ契約を Kotlin が満たす」は表で証明済みだった。

**旧実装は commit `7b3bb3d` に残っている。**

```bash
git show 7b3bb3d:backend/php-file/index.php         # save / load / list の形
git show 7b3bb3d:backend/php-postgresql/index.php   # introspection の SQL（§4.6 の 2 不具合込み）
```

**凍結コピーを `docs/` に置くことはしない** —— それ自体が二重管理になる。5-7 で必要になるのは
「どのカタログを読むかの意味」と「出力構造」の 2 つだけで、後者は
`docs/samples/introspection-postgresql.xml` にバイト列で固定してある。**PG18 の 2 不具合は
「再現しない」と決めてあるので、そもそも逐語移植ではない。**

撤去したもの: `backend/` 31 ファイル（`php-file` / `php-postgresql` / `php-mysql` / `php-pdo` /
`php-sqlite` / `php-s3` / `php-blank` / `php-cubrid` / `php-mysql+file` / `perl-file` / `asp-file` /
`cf-mysql` / `web2py`）、submodule `backend/php-s3/amazon-s3-php`、`.gitmodules`。
**6-1 が作った `backend/php-cubrid/index.php:37` の dangling も一緒に消えた。**

#### 決めたこと 2: 規則は 6 つ。**表を先に直してから実装した**

5-0 の申し送りどおり、`tests/contract/backend-cases.json` を先に書き換えてから Kotlin を直した。
おかげで「実装に合わせて期待値を書いた」形にならない。

| 規則 | 拒否理由 | 入った段階 |
|---|---|---|
| 空 / 未指定 | `MISSING` | 5-1b |
| パス区切り・`..` 始まり | `TRAVERSAL` | 5-1b |
| **制御文字（NUL 含む）** | `CONTROL_CHARACTER` | **5-2** |
| **`.json` で終わらない**（大小無視） | `NOT_JSON` | **5-2** |
| **UTF-8 で 255 バイト超** | `TOO_LONG` | **5-2** |
| **Windows の予約デバイス名**（`CON.json` など） | `WINDOWS_RESERVED` | **5-2** |

- **NUL は `TRAVERSAL` から `CONTROL_CHARACTER` に移った**（どちらも 400 なので外から見た挙動は
  同じ）。制御文字の規則ができたので、そちらに寄せるほうが分類として素直
- **長さは文字数ではなくバイト数**。日本語は UTF-8 で 3 バイトなので、85 文字で上限に届く
- **Windows 予約名は前方一致で弾かない**（`CONSOLE.json` は通る）。開発機が Windows でも動かす
  ための規則で、ここを通すと `FileDesignStore` が OS 依存の例外を投げて 500 になる
- `list` も **`*.json` だけ**を返すようにした（大小無視）。正本ディレクトリは `README.md` や
  `.gitattributes` と同居しうる ——「そのディレクトリにあるもの全部が設計」ではない

#### そのほか

- **仮想 backend（`tests/node/harness.ts`）も同時に揃えた。** 契約表が両側を検証するので、
  片方だけ直すと赤くなる。5-1c で作った仕掛けが最初に効いた場面
- `js/config.ts` の `AVAILABLE_BACKENDS` は **PHP の名前のまま残っている**（撤去は 5-5）。
  実体の無いディレクトリ名がセレクタに並ぶ状態になるが、**Kotlin は `{backend}` を読まない**ので
  動作には影響しない。5-5 でセレクタごと消える
- 契約表の `note` にある「php-file は…」という記述は**実測の記録**なので残す（歴史であって
  現状の説明ではない）

#### 検証

| | 5-1c | 5-2 |
|---|---|---|
| `npm test` | 425 passed | **426 passed**（契約表に `virtual: true` が 1 ケース増えた） |
| `npm run test:browser` | 189 passed | 189 passed |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |
| `cd server && ./gradlew test` | 64 passed | **84 passed** |

golden 114 本は無差分。`js/` `src/` `index.html` `db/` `locale/` の diff は空。
差分は **+207 / -3297**（削除が本体）。

Kotlin の内訳: 契約表 31 ケース ＋ 表の健全性 1 / 振る舞い 9 / `DesignName` 33 / `FileDesignStore` 10。

#### 次段階への入力

- **5-3: READONLY で副作用を止める。** `grabado.readonly` を足し、save を **403**。
  `locale` に `http403` を足して `js/io.ts` の `check()` に `case 403` を足すこと ——
  **忘れたら `backend-contract.test.ts` が赤くする**（契約表に 403 のケースを足した時点で）。
  実現は `DesignStore` の Bean 差し替え（`ReadOnlyDesignStore` の delegate）
- **5-4 の 412 だけは `check()` に通さない**と決めてある（フロントが握って confirm に流す）。
  契約表に 412 を載せるときは `backend-contract.test.ts` の網羅テストの対象から外す必要があり、
  **そのとき「なぜ 412 だけ別扱いか」を表かテストに書くこと**
- **`Dockerfile` は upstream の busybox httpd のまま**で、いま何も配れない。§2 の仕事だが、
  `backend/` が消えて `COPY backend/ ./` が壊れたので**参照だけは先に直っている**（HANDOVER §2.2 の
  骨格は `server/` を指すよう §2 で書き換える）

---

### 2026-08-22 HANDOVER §5「backend」段階5-3 —— READONLY で副作用を止める

**公開デモ（grabado.dev）が成立する条件が入った。** `GRABADO_READONLY=true` で保存が 403 になる。

**落ちるのは保存だけ**（introspection は 5-7 で実装が入ったときに同じ扱いになる。AI は §11）。
`list` / `load` は生きているので、**READONLY でも「読んで・描いて・DDL を出す」体験は完全に
提供できる** —— 編集ストアはブラウザ内だから。2026-08-15 に「公開デモは READONLY 一択」と
決めた根拠がこれで実装として立った。

#### 決めたこと 1: 実現は **Bean の差し替え**（フィルタでも各ハンドラの `if` でもない）

`grabado.readonly` が真なら `DesignStore` を `ReadOnlyDesignStore(delegate)` にする。

**禁止を「禁止したいもの」の直上に置くため。** 副作用を持つのは `DesignStore.save` だけなので、
ここで塞げば**将来 `?action=rename` のような経路が増えても自動的に守られる**。フィルタ方式や
各ハンドラの `if` は「守るべき経路の一覧」を人が維持することになり、CLAUDE.md 制約6 を
人力に依存させる。

副産物として **HTTP を 1 バイトも通さずにテストできる**。

これに伴い `FileDesignStore` の `@Component` を外し、`StoreConfiguration` が組み立てるようにした。
**READONLY のときは正本ディレクトリの書き込み可能性を要求しない**（読み取り専用マウントでも
起動できるべき。5-1b のコメントで予告していたとおり）。

#### 決めたこと 2: status は **403**

| 案 | 却下の理由 |
|---|---|
| 501 Not Implemented | `check()` を触らずに済むが、**「READONLY だから save できない」と「サーバが壊れている」が同じ画面になる**（どちらも `http501` の文言） |
| 503 Service Unavailable | 「一時的に不能」の意味。READONLY は恒久的な構成 |

意味を曲げて locale の 1 キーをケチる取引は、公開 API として割に合わない。403（このデプロイでは
禁止）が正しい。

#### 決めたこと 3: 契約表は 1 つのまま、**流す側を 2 つに割った**

READONLY は**サーバの起動条件**なので同じインスタンスでは試せない。表に `serverMode` を足し、
`BackendContractTest` が通常起動のケースを、新設の `ReadOnlyContractTest` が
`serverMode: "readonly"` のケースを流す。**契約が 2 か所に割れることは避けた。**

TS 側（仮想 backend）は `serverMode` を持つケースを流さない —— 仮想 backend に READONLY の
概念を持ち込むと、模していないものを模しているように見せることになる。

#### 5-1c の仕掛けが 2 度目に効いた

契約表に 403 を足した時点で、`backend-contract.test.ts` が
**「`check()` が 403 を知らない」「`locale/en.xml` に `http403` が無い」で赤くなった**。
5-1c で「status を増やす PR では `check()` と locale を同じ PR で広げること」という申し送りを
散文から機械に移しておいたのが、そのまま働いた形。

`js/io.ts` の `check()` に `case 403` を、`locale/*.xml` 21 本に `http403` = `Forbidden` を足した
（差分は **+21 / -0**。既存行は 1 バイトも動いていない）。

#### 検証

| | 5-2 | 5-3 |
|---|---|---|
| `npm test` | 426 passed | 426 passed |
| `npm run test:browser` | 189 passed | 189 passed |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |
| `cd server && ./gradlew test` | 84 passed | **90 passed** |

`npm test` が増えていないのは、READONLY のケースが `virtual: false` で TS 側を流れないため
（網羅テストは既存の 2 本が status の集合を見ているだけなので本数は動かない）。golden 114 本は無差分。

Kotlin の内訳: 契約表 31 ＋ 健全性 1 / **READONLY 6**（表の 4 ケース ＋ 実在確認 ＋
「拒んでもファイルが 1 つも作られない」）/ 振る舞い 9 / `DesignName` 33 / `FileDesignStore` 10。

#### 次段階への入力

- **5-4: ETag ＋ If-Match で save を 1 往復にする。** backend 先行（ETag を返し `If-Match` を
  尊重する。既存テストを 1 本も壊さない）→ フロント追随（`If-Match` を送り、プリフライトの
  `load` を撤去。`Baseline` が `text` を捨てて `etag` を持つ）の 2 段
- **★ 412 だけは `check()` に通さない**と決めてある（フロントが握って confirm に流す。
  プリフライトの 404 を通さないのと同じ理屈）。契約表に 412 のケースを足すと
  `backend-contract.test.ts` の網羅テストが「`check()` が 412 を知らない」で赤くなるので、
  **そのテストの対象から 412 を外し、「なぜ 412 だけ別扱いか」をテストのコメントに書くこと**
- `js/config.ts` の `AVAILABLE_BACKENDS` は PHP の名前のまま（撤去は 5-5）

---

### 2026-08-23 HANDOVER §5「backend」段階5-4a —— ETag と条件付き更新（backend 先行）

`load` が **ETag（内容の SHA-256）** を返し、`save` が **`If-Match` / `If-None-Match`** を尊重する
ようになった。**フロントは 1 行も触っていない** —— 条件ヘッダを送らない既存の save は今までどおり
上書きできる。フロントが送るようにして**プリフライトの `load` を撤去する**のは 5-4b。

2 段に割ったのは、5-4a だけなら**既存 601 本を 1 本も壊さずに入る**から。振る舞い（往復数）と
識別子（`Baseline` の中身）を同じ PR で動かすと、落ちたときの切り分けができない。

#### 決めたこと 1: ETag は**内容の SHA-256**。mtime は使えない

**理由がこの製品の正本モデルから出てくる。** 正本は git 管理のファイル（CLAUDE.md 制約2）で、
`git checkout` / `git pull` は**内容が同じでも mtime を書き換える**。mtime ベースの弱 ETag だと
**ブランチを切り替えるたびに全ファイルが偽の 412 を出す**。「内容が同じなら同じ ETag」だけが
git 正本と噛み合う。

SHA-256 を選ぶのは速度ではなく**説明コスト**（MD5 / SHA-1 は CVE スキャナと社内基準で毎回
説明が要る）。ヘッダの読みやすさのために hex は先頭 16 バイト（128 bit）へ切り詰める。

#### 決めたこと 2: CAS を**本当に成立させる**（keyword 単位のロック）

`save` は「読む → 比べる → 書く」を keyword 単位のロックで囲む。**囲まないと 412 は
「たいてい正しい」だけの機能**になり、`ARCHITECTURE.md` §4.3 が「TOCTOU の窓を閉じる」と
書いた目的を果たさない。

ロックは同じ JVM の中でしか効かない。**正本ディレクトリを複数プロセスで共有する構成は
想定していない**（各自ローカルの単一コンテナ。HANDOVER §2.1）ので、これで足りる。

#### 決めたこと 3: 条件ヘッダの意味は RFC どおり

| ヘッダ | 対象あり | 対象なし |
|---|---|---|
| `If-Match: "<etag>"` | 一致すれば 201、違えば **412** | **412** |
| `If-Match: *` | 201（**無条件で上書き**。意図的に上書きしたい CLI 利用者の逃げ道） | **412** |
| `If-None-Match: *` | **412**（「新規のつもり」だったのに実在した） | 201 |
| 無し | 201（**5-4a では今までどおり上書き**。428 に締めるのは 5-4b） | 201 |

`save` の応答にも**新しい ETag を付ける**ので、フロントは load し直さずに baseline を更新できる。

#### 決めたこと 4: 412 は `check()` に**通さない**（5-3 の申し送りどおり）

「衝突したので上書きするか？」は**エラー表示ではなく分岐**。フロントが握って `confirm` に流すので、
textarea に文言を出してはいけない（プリフライトの 404 を `check()` に通さないのと同じ理屈）。

契約表に 412 を足した時点で、予告どおり `backend-contract.test.ts` が
「`check()` が 412 を知らない」で赤くなった。**除外リスト（`HANDLED_BY_FRONTEND`）を作り、
「通さないことも契約」として逆向きのテストを 1 本足した** —— 412 を `check()` が拾ってしまったら
赤くなる。

除外リストのコメントに **「ここに足すのは『フロントが自分で処理する』status だけ。表示すべきものを
足して検査から逃がさないこと」** と書いた。逃げ道を作ると、このテストが守っているものが無くなる。

#### そのほか

- `DesignStore.load` の戻りが `ByteArray?` から `Stored`（bytes ＋ etag）になった。
  **`data class` にしていない** —— `ByteArray` の `equals` は参照比較なので、生成される `equals` が
  直感に反する（AssertJ の `isEqualTo` が黙って落ちる）
- 原子的な置換は `writeAtomically` として切り出した（条件評価と書き込みの責務を分ける）
- 契約表に `request.ifMatch` / `request.ifNoneMatch` を足した。**表に書けるのは固定文字列だけ**
  なので、「一致する etag を送る」側は `BackendBehaviourTest` が持つ（動的な値が要るため）

#### 検証

| | 5-3 | 5-4a |
|---|---|---|
| `npm test` | 426 passed | **428 passed** |
| `npm run test:browser` | 189 passed | 189 passed |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |
| `cd server && ./gradlew test` | 90 passed | **101 passed** |

golden 114 本は無差分。`js/` `src/` `db/` `locale/` `index.html` の diff は空
（触ったのは `tests/node/backend-contract.test.ts` だけ）。

増えた 2 本（TS）: 契約表の `virtual: true` が 1 ケース ＋「フロントが自分で処理する status は
`check()` に通さない」1 本。増えた 11 本（Kotlin）: 契約表 6 ケース ＋ 振る舞い 5 本
（ETag の決定論・内容が変われば変わる・save も返す・一致する If-Match の往復・412 で 1 バイトも
書き換わらない）。

#### 次段階への入力

- **5-4b: フロントを追随させる。** `Baseline` が `text` を捨てて `etag` を持ち、
  `serversave` はプリフライトの `load` を投げずに `If-Match`（baseline あり）/
  `If-None-Match: *`（新規のつもり）を送る。**412 を受けたら load し直して `confirm` に流す** ——
  `verdictForSave()` は「事前判定」から「412 後の分岐」へ役割が変わり、2 行に縮む
- **仮想 backend にも ETag が要る**（`tests/node/io-ui.test.ts` が往復を検証するため）。
  `node:crypto` の `createHash` で同じ計算をする。**契約表の ETag ケースを `virtual: true` に
  変えられるのはそのとき**
- 5-4b で「未指定 ＋ 既存あり」を **428** に締めるかは、フロントが必ず条件ヘッダを送るように
  なってから決める（締めると条件ヘッダを送らない外部クライアントが壊れる）

---

### 2026-08-23 HANDOVER §5「backend」段階5-4b —— プリフライトを撤去し、保存を 1 往復にする

**段階4-6 から残っていた TOCTOU の窓が閉じた。** 保存は 1 往復になり、衝突したときだけ
412 → confirm → 再送の 2 往復になる。

| | 4-6（read-before-write） | 5-4b（条件付き更新） |
|---|---|---|
| 通常の保存 | **2 往復**（`load` → `save`） | **1 往復** |
| 衝突時 | 2 往復（プリフライトで気づく） | 2 往復（412 で気づく） |
| 判定の主体 | クライアント（バイト列を比較） | **サーバ**（`If-Match` の評価） |
| TOCTOU | **窓が残る**（load と save の間に他者が書くと勝つ） | **閉じた**（サーバが 1 つのロックで読んで比べて書く） |
| `Baseline` が持つもの | 設計 1 件ぶんの**バイト列** | **ETag 1 個** |

#### 決めたこと 1: 条件ヘッダは「派生元の有無」で決まる

| 状況 | 送るもの | サーバ |
|---|---|---|
| 観測済み（baseline あり・同名） | `If-Match: "<etag>"` | 一致 → 201 ／ 不一致 → **412** |
| 新規のつもり（baseline なし・別名） | `If-None-Match: *` | 不在 → 201 ／ 実在 → **412** |
| 412 を受けて confirm した後 | `If-Match: *` | 存在すれば無条件で上書き |

**`save` の応答にも ETag が付く**ので、書いた直後に load し直さずに baseline を更新できる。

#### 決めたこと 2: 412 は `check()` に通さず、confirm に流す

5-4a で決めたとおり。`saveresponse` が 412 を見たら `verdictAfterConflict()` で
`conflict` / `exists` を決め、locale の文言を出して confirm する。承諾したら
**同じ内容を `If-Match: *` で再送**する。

「412 は textarea に文言を出さない」ことをテストで固定した —— `check()` に通すと
confirm と二重になり、ユーザーには「失敗した」と「上書きするか」が同時に見える。

#### 決めたこと 3: `verdictForSave()` は消え、規則が小さくなった

段階4-6 の `verdictForSave()`（プリフライトの応答とバイト列を比べる。テスト 9 本）は
**`verdictAfterConflict()`（2 行）に縮んだ**。`absent` / `clean` が消えたのは、
**それらが 412 にならない**から —— サーバが 201 で応え、そもそもクライアントの分岐に来ない。

`tests/node/conflict.test.ts` は 9 本 → 10 本。**カバレッジが落ちたのではなく、守るべき規則
そのものが小さくなった**（比較の主体がサーバへ移ったぶん、クライアントに残るのは
「412 を受けたときに何と言うか」と「次の save に何を載せるか」の 2 つだけ）。

#### 踏んだバグ: `getXhrHeaders()` は**共有オブジェクト**を返す

`js/wwwsqldesigner.ts` の `getXhrHeaders()` は Designer が持つオブジェクトを**そのまま**返す。
`sendSave` が直に `h["If-Match"] = ...` と書いていたため、**前回の保存で載せた条件ヘッダが
次の保存にも残り**、`If-Match` と `If-None-Match` が両方立った状態で送られていた（テスト 7 本が
一斉に落ちて発覚）。

段階4-3b 以降 `Content-type` は同じ書き方で足していたが、**毎回同じ値だったので露見しなかった**。
条件ヘッダは排他なので初めて表に出た。`sendSave` の中で 1 回ぶんのコピーを作るようにした。

#### 仮想 backend も条件付き更新を実装した

`tests/node/harness.ts` に **Kotlin と同じ ETag 計算**（`node:crypto` の SHA-256 先頭 16 バイト）と
`If-Match` / `If-None-Match` の評価を入れた。おかげで契約表の ETag ケース 5 本を
**`virtual: false` → `true`** に変えられた ——「両側で検証された第 2 実装」の範囲が広がった。

`RequestRecord` に `headers` を足した（送った条件ヘッダを検査するため）。

#### 検証

| | 5-4a | 5-4b |
|---|---|---|
| `npm test` | 428 passed | **437 passed** |
| `npm run test:browser` | 189 passed | 189 passed |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |
| `cd server && ./gradlew test` | 101 passed | 101 passed |

golden 114 本は無差分（**save の往復数を変えても golden は 1 バイトも動かない** ——
golden は Designer のファサード経由で採るので `js/io.ts` を通らない。4-3b が
「golden はここを 1 ビットも押さえない」と書いたとおりの形）。

ファイル別の増減: `conflict.test.ts` 9 → **10**（規則が小さくなった）/ `io-ui.test.ts` 27 → **30**
（条件ヘッダと 412 の経路が増えた）/ `backend-contract.test.ts` 21 → **26**（ETag ケースが
`virtual: true` になった）。

#### 次段階への入力

- **5-5: backend セレクタを撤去し、URL を確定する。** `AVAILABLE_BACKENDS` /
  `DEFAULT_BACKEND`（配列バグごと）/ `?backend=` / `backendlabel`（21 言語）/ `<select>` が
  一緒に落ちる。URL は `backend/file/` に固定。あわせて `?action=capabilities` を足し、
  READONLY のときに保存ボタンを隠す（**引けなければ「全部できる」に倒す** —— `npm run dev`
  単体で backend が無いときに現行と同じ挙動になる）
- **契約表の URL リテラルが動く。** `tests/node/io-ui.test.ts` と
  `tests/contract/backend-cases.json` の `backend` フィールドが `php-mysql` から `file` へ。
  **表を先に直してから実装すること**（5-2 と同じ手順）
- 「未指定 ＋ 既存あり」を **428** に締めるかは 5-5 以降で判断する。**いまは締めない** ——
  条件ヘッダを送らない外部クライアント（curl での手作業）が壊れるため

---

### 2026-08-23 HANDOVER §5「backend」段階5-5 —— backend セレクタを撤去し、capabilities を足す

**upstream の「12 本の backend から選ぶ」UI が消えた。** grabado の backend は
Kotlin/Spring Boot 1 本（CLAUDE.md 制約6）で、その実体は段階5-2 で PHP ごと消えている ——
**選択肢が実質 1 つの select は情報量ゼロで、公開 OSS では「何を選ぶのか」という誤解を
生むだけ**だった。

同じ PR で `?action=capabilities` を足し、**READONLY のデプロイでは保存ボタンを押せなくした**。

#### 決めたこと 1: URL は `backend/file/` に固定。サーバは**読まないまま**にする

フロントの `BACKEND_PATH`（`js/io.ts`）1 か所で決まる。`file` はストアの実体
（正本ディレクトリへのファイル I/O）を指す。

**サーバ側は `{backend}` を読まないままにしてある。** 5-1b で「受けて捨てる」と決めた形を
そのまま残すので、**`?backend=php-mysql` 付きの古いブックマークも動く**（何を入れても
同じ正本ディレクトリを見る）。撤去したのは UI であって URL 空間ではない。

将来 store を増やすとしても env（サーバ側）で決める —— **どの store が生きているかは
サーバしか知らない**ので、ブラウザに選ばせるのは筋が悪い。

#### 決めたこと 2: `DEFAULT_BACKEND` の配列バグは**是正ではなく消滅**で決着した

upstream の `CONFIG.DEFAULT_BACKEND` は文字列ではなく配列 `["php-mysql"]` で、
`bs[i] == be` の緩い比較が配列を文字列化するため**偶然動いていた**。段階3-3b が
「§5 の backend 移植で既定 backend の扱いごと決める」と送っていた項目だが、
**セレクタごと消えたので是正コストが 0 になった**。

一緒に落ちたもの: `AVAILABLE_BACKENDS`（PHP 名 12 本）/ `DEFAULT_BACKEND` / `?backend=` の
解釈 / `backendlabel`（locale 21 本）/ `index.html` の `<select>` / `IoDom.backend`。

#### 決めたこと 3: capabilities は「**引けなければ全部できる**」に倒す

```json
{"readonly": false, "introspection": false, "ai": false}
```

フロントは起動時に 1 回引き、`readonly` なら `serversave` / `quicksave` を `disabled` にする。
**403 を押してから知るのではなく、押せなくする** —— できることの説明として、そのほうが正確。

★ **引けなければ何も隠さない。** `npm run dev` 単体（backend を起こしていない）でボタンが
消えると 5-5 以前より不便になるだけで、誰も得しない —— 引けないのは「機能が無い」ではなく
「サーバがいない」。壊れた JSON が返ったときも同じ扱い。

`introspection` は 5-7、`ai` は §11 まで**常に false**。実装が無いのに true を返さない
（嘘をつくと、フロントが押せるボタンを出して 501 を踏む）。

**`applyCapabilities()` は冪等**にした。片方向にしか効かない実装だと「一度隠したら戻らない」
ものが増えていく。DOM を触るだけの関数なので UI テストから直接呼べる。

#### 5-2 と同じ手順（表を先に直す）

`tests/contract/backend-cases.json` の `backend` 既定を `file` にし、capabilities の 2 ケース
（通常 / READONLY）を足してから実装した。テストの URL リテラルも同じ PR で動く ——
**この 4 本が「フロントが投げる URL」の正**なので、期待値を後から合わせる形にしない。

`backend-segment-is-ignored` のケースは **`php-mysql` を指定したまま残した**（古い URL が
動き続けることの証明になる）。

#### 検証

| | 5-4b | 5-5 |
|---|---|---|
| `npm test` | 437 passed | **442 passed** |
| `npm run test:browser` | 189 passed | 189 passed |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |
| `cd server && ./gradlew test` | 101 passed | **103 passed** |

golden 114 本は無差分（**セレクタを消しても golden は動かない** —— golden は Designer の
ファサード経由で採るので `js/io.ts` を通らない）。

増えた 5 本（TS）: 契約表の capabilities 1 ケース ＋ UI 反映 4 本（READONLY で隠す・
そうでなければ隠さない・`readonly` が無ければ「できる」・冪等）。
増えた 2 本（Kotlin）: capabilities の通常 / READONLY。

#### 次段階への入力

- **5-6: introspection の変換層を先に足す（フロントの純関数だけ）。**
  `js/io/introspect-parser.ts`（introspection JSON ＋ `TypePalette` → `DesignModel`）と
  fixture ＋ テスト。**UI に配線しない・backend も触らない**ので、既存テストは 1 本も動かない
- **★ 5-6 の fixture には必ず配列型（`text[]`）と enum（`USER-DEFINED`）を入れる。**
  どちらもパレットに存在せず `indexOfTypeName` が -1 を返す。落とし先が無いと
  **import ごと throw で全滅する**（5-0 の記録）
- 5-7 で introspection が入ったら **capabilities の `introspection` を true にする**
  （接続先が 1 つも設定されていなければ false のまま）。フロントは
  `serverimport` ボタンをそれで隠す —— **`applyCapabilities()` に分岐を足すだけ**

---

### 2026-08-23 HANDOVER §5「backend」段階5-6 —— introspection の変換層（純関数だけ）

**introspection JSON を設計モデルへ写す純関数を先に置いた。UI にも backend にも配線しない。**
`serverimport` は今も XML を受けており、JSON 化は 5-7（Kotlin 実装と同じ PR）。

4-2（形式側を先に足して安全網 → 4-3 で UI）と同じ形。おかげで**既存 442 本は 1 本も動かない**。

#### 決めたこと 1: introspection JSON は**設計 JSON ではない**（形式を分けた）

| | 設計 JSON | introspection JSON |
|---|---|---|
| 座標 | `x` / `y` は**必須**（欠けると parser が throw） | **持たない** |
| 型 | パレットの**安定 id** | **SQL の生の情報** |
| `db` | 実行中パレットと**違えば throw** | `dialect` を情報として持つだけ |

設計 JSON を返す形にすると **backend が 0 を詰めてフロントが直後に `alignTables()` で
上書きする**無意味な往復になり、型 id を返すには **backend がパレット XML を読む**ことに
なる（＝現行 PHP の `<datatypes>` 全文連結と同じ構造）。

**解決はフロントが引き受ける。** `db/postgresql/datatypes.xml` の冒頭が
「`aka` に入れる基準の 2 番目は **introspection の実出力**（`TIMESTAMP WITH TIME ZONE`）」と
明記しているとおり、**パレットはこの入力を受けるように作られている** ——
`tests/node/type-resolution.test.ts` が 8 プロファイル全候補名の全数掃きで守っているのも
同じ経路。Kotlin 側に写像を作らないのはこのため。

#### 決めたこと 2: 解決できない型で **throw しない**

段階6-8d で `indexOfTypeName()` は strict 一本になり、一致しなければ **-1**。
PG の `text[]` は `data_type = ARRAY`、enum は `USER-DEFINED` で、**どちらもパレットに無い**。
素直に throw すると **1 列のせいで import が全滅する**。

解決は 3 段（上ほど正確）:

1. `sqlType` をパレットの `sql` / `aka` に当てる
2. **`ARRAY` / `USER-DEFINED` の逃げ道** —— `data_type` が実際の型を隠しているので、
   要素型（`text[]` の `text`）や `udtName` で引き直す。**配列であることは落ちるが型は保たれる**
3. 落とし先（`fallbackIndex`。サイズを取らない文字列型）へ落とす

落ちた分は `TypeLoss`（6-10a の語彙を再利用）で返す。**黙って落とさない**のが要点で、
6-9d / 6-9e の ORM 出力・6-10a の変換層と同じ流儀。

#### 決めたこと 3: **CHECK を最初から読まない**

`toKeys()` は `PRIMARY` / `UNIQUE` / `INDEX` の **allowlist**。

これが「PG18 が NOT NULL を `table_constraints` に CHECK として出す」問題
（`ARCHITECTURE.md` §4.6-1）を**構造的に不可能**にしている —— 現行 PHP は `_not_null`
サフィックスの **denylist** で除外しようとして `</key>` を余分に出し、**XML が
well-formed でなくなった**。**denylist は必ず漏れる。** 設計モデル（`KeyModel.type`）に
CHECK の概念が無い以上、最初から読まないのが正しい。

fixture に `users_id_not_null` という CHECK を入れて、写らないことをテストで固定した。

#### 現行 PHP が落としていた情報を拾った

| 現行 | 5-6 |
|---|---|
| `numeric(12,2)` → `NUMERIC`（精度・スケール落ち） | `12,2` が `size` に入る |
| `text[]` → `ARRAY`（要素型落ち） | 要素型 `text` で引き直し、`kind-widened` として残す |
| `autoincrement` は常に 0 | **今も写さない**（下記） |

**自動採番は写さない。** `information_schema` の identity / serial は方言ごとに表れ方が違い
（PG は `column_default` の nextval、MySQL は `extra`）、現行の XML 経路も常に 0 だった。
拾うなら **backend 側で方言ごとに判定してから渡す** —— 5-7 以降の判断として送る。

#### fixture の置き場を宣言した

`tests/fixtures/introspection/postgresql.json` を足したら
`fixture-set.test.ts` の「fixture のディレクトリは `db/` のプロファイルと 1 対 1」が落ちた
（**撤去した DB の残骸を捕まえる**検査で、正しく機能した）。

除外を暗黙にせず、`NON_PROFILE_FIXTURE_DIRS` として**明示的に宣言**した ——
5-1c で契約表に `virtual: false` を宣言したのと同じ流儀で、「知らないディレクトリが増えても
気づかない」状態を作らない。

fixture は**手で書いた形**で、実 PG18 から採ったものではない（実採取は 5-7 の統合テストの
仕事）。ここで見たいのは「パレットへの写し方」であって「PG がどう返すか」ではない。

#### 検証

| | 5-5 | 5-6 |
|---|---|---|
| `npm test` | 442 passed | **463 passed** |
| `npm run test:browser` | 189 passed | 189 passed |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |
| `cd server && ./gradlew test` | 103 passed | 103 passed（触っていない） |

golden 114 本は無差分。**既存 442 本は 1 本も動いていない**（463 − 21 = 442）——
UI に配線していないので当然だが、それが「安全網を先に置いた」ことの証明になる。

#### 次段階への入力

- **5-7: Kotlin introspection（PostgreSQL）と `serverimport` の JSON 化。**
  JDBC ＋ env の名前付きソース表（allowlist）、PG18 の 2 不具合を再現しない、
  型情報を落とさない（`udt_name` / `numeric_precision` / `numeric_scale`）、XML 経路の撤去
- **★ fixture を手で書き始めない。** 実 PG18 から採る（`ARCHITECTURE.md` §4.1 に
  `docker run … postgres:18` のレシピがある）。手で書くと §4.6 と同じ罠に自分で落ちる ——
  「PG18 はこう返すはずだ」という信念を符号化したフィクスチャは、信念が間違っていても緑になる。
  **本段階の fixture は「写し方」を見るためのもので、実採取の代わりにはならない**
- `capabilities` の `introspection` を true にする（接続先が 1 つも設定されていなければ false）。
  フロントは `applyCapabilities()` に分岐を 1 つ足して `serverimport` ボタンを隠す
- **`tests/known-issues/` の #9**（PG18 の実出力が well-formed でなく index も出ない）は
  5-7 で**裏返る** —— `tests/known-issues/README.md` の運用3 に従い、
  「introspect → 設計 → DDL が入力スキーマを再現する」という主張へ書き換える

---

### 2026-08-23 HANDOVER §5「backend」段階5-7a —— Kotlin introspection（backend 先行）

**`?action=import` が動くようになった。** `docs/ARCHITECTURE.md` §4.6 が記録していた
**PG18 の 2 不具合を、実 PG18 に対して解けたことを確かめた。**

**フロントは 1 行も触っていない**（`serverimport` は今も XML を期待している）。JSON 化と
XML 経路の撤去は 5-7b —— 5-4 と同じ 2 段構成で、5-7a は既存 463 本を 1 本も壊さない。

#### 実 PG18 で確かめてから SQL を書いた

`docker run postgres:18` ＋ `docs/samples/introspection-sample-schema.sql` を投入し、
4 本のクエリを**実行して出力を見てから**実装した。

| | 実測 |
|---|---|
| **CHECK の件数** | **16 件**（すべて `<table>_<col>_not_null`）。§4.6-1 が再現した |
| **index** | 正しい除外条件なら `idx_articles_author_id` と `idx_articles_published_on_title`（2 列）が**全件出る**。§4.6-2 の `break` はここで 1 件も出せなかった |
| `numeric(12,2)` | `numeric_precision=12` / `numeric_scale=2` |
| `text[]` | `data_type=ARRAY` / `udt_name=_text` / `element_types.data_type=text` |
| `timestamptz` | `data_type=timestamp with time zone` —— **パレットの `aka` がこの綴りを持つ理由** |

**5-6 で手で書いた fixture が実測と一致していた**（`ARRAY`/`_text`、`numeric` の 12/2、
`timestamp with time zone`）。信念が当たっていたわけだが、**当たっていたことを確かめられる
のは実測だけ**というのが本段階の要点。

#### 決めたこと 1: CHECK は **allowlist** で外す（denylist にしない）

`constraint_type IN ('PRIMARY KEY','UNIQUE')` で引く。現行 PHP は `_not_null` サフィックスの
**denylist** で除外しようとして、`</key>` を余分に出し **XML が well-formed でなくなった**。

**denylist は必ず漏れる。** 設計モデル（`KeyModel.type`）に CHECK の概念が無い以上、
最初から読まないのが正しい —— 手続きの途中で「この行は飛ばす」を判断するより、
**集合として最初から入れない**ほうが壊れにくい。5-6 でフロント側に入れた `toKeys()` の
allowlist と同じ判断を、SQL の側にも置いた形。

#### 決めたこと 2: index の除外は `NOT EXISTS (pg_constraint.conindid)`

現行 PHP は `indisunique` / `indisprimary` のときに `continue` ではなく **`break`** しており、
PK の index に当たった時点でループごと抜けて **index が 1 つも出なかった**。

正しいのは「**制約が裏に持つ index を除外する**」で、その条件が `conindid`。
`break` は「PK の index を出したくない」の失敗形だった。

#### 決めたこと 3: 接続先は **env の名前付き表**（SSRF を不可能にする）

```yaml
grabado:
  introspect:
    sources:
      shop: { url: "${SHOP_JDBC_URL}", user: "${SHOP_DB_USER}", password: "${SHOP_DB_PASSWORD}" }
```

`?action=import&database=shop` の `shop` が選ぶのは**表のキーだけ**で、**ホスト名は
クライアントから 1 バイトも渡らない**。リクエストで JDBC URL を受ける形は完全な SSRF
プリミティブなので採らない。

- 表に無い名前 / 接続先 0 件 → **404**（「設定していない」と「その名前が無い」を外から区別させない）
- READONLY → **403**（`IntrospectionService` の Bean ごと存在しない ——
  **外部到達性を持つ唯一の経路をまるごと消す**のがいちばん確実）
- 接続や読み取りの失敗 → **503**（`check()` が文言を持つのは 501 / 503 だけ。502 は無反応になる）
- **例外の中身を body に出さない** —— JDBC の例外メッセージには URL や接続情報が入りうる
- `IntrospectSource.toString()` を上書きした —— data class の既定は**パスワードを全部出す**

#### 決めたこと 4: コネクションプールを持たない

introspection は人が押したときだけ走る低頻度・一発読み。プールは外部 DB への idle 接続を
抱え続けることになり、可用性と資格情報の露出時間の両方で損。

副次的に **`spring-boot-starter-jdbc` が要らない** → HikariCP が classpath に無い →
`spring.datasource.*` の auto-configuration が存在しない → **DB レス既定（制約5）が
構造で保証される**。同じ論法が 5-1b の「入れなかった依存」にもあり、ここで実際に効いた。

#### テストは 2 層（フィクスチャが作文に堕ちる経路を閉じる）

| テスト | 走る条件 | 見るもの |
|---|---|---|
| `IntrospectionMapperTest`（15 本） | **常に**（CI 込み） | フィクスチャ → 応答モデルの写し方 |
| `PostgresCatalogIntegrationTest`（10 本） | `GRABADO_IT_JDBC_URL` があるとき | **フィクスチャが実 DB と一致するか** ＋ SQL そのもの |

**フィクスチャは実 PG18 から採った**（`GRABADO_IT_WRITE_FIXTURE=1`。golden の
`UPDATE_GOLDEN=1` と同じイディオム）。手で書くと「PG18 はこう返すはずだ」という信念を
符号化しただけになり、**信念が間違っていても緑になる** —— §4.6 の 2 不具合が 10 年以上
残っていたのはその形。**採り直し以外の方法でフィクスチャが生まれない。**

Testcontainers は入れない。`ARCHITECTURE.md` §4.1 に `docker run … postgres:18` のレシピが
既にあり、CI では GitHub Actions の `services:` が**追加依存ゼロ**で同じ JDBC URL を供給できる。

**env が無ければ丸ごと skip**（`assumeTrue`）—— 「たまたま走らなかった」と「意図して
走らせていない」を混ぜない。実行結果に skipped=10 として出る。

#### 契約表が 2 ケース動いた

| | 5-6 まで | 5-7a |
|---|---|---|
| `import`（接続先なし） | 501（実装が無い） | **404** |
| `import`（READONLY） | 501 | **403** |

**実装が入ったので期待値が変わった**という素直な変化。仮想 backend も「接続先が 1 つも
設定されていないサーバ」として 404 を返すよう揃えた（外部 DB に繋がないので、それが正確）。

#### 検証

| | 5-6 | 5-7a |
|---|---|---|
| `npm test` | 463 passed | 463 passed（**フロント 0 行**） |
| `npm run test:browser` | 189 passed | 189 passed |
| `npm run known-issues` | 2 passed | 2 passed |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |
| `cd server && ./gradlew test` | 103 passed | **118 passed ＋ 10 skipped** |
| 実 PG18 あり | — | **128 passed**（統合テスト 10 本が走る） |

golden 114 本は無差分。Kotlin の増分: `IntrospectionMapperTest` 15 ＋
`PostgresCatalogIntegrationTest` 10。

#### 次段階への入力

- **5-7b: フロントの JSON 化。** `serverimport` の `xml: true` を外し、`importresponse` を
  `introspectionToModel()`（5-6 の純関数）→ `applyDesignModel()` へ繋ぎ、**XML 経路を撤去**する。
  `tests/node/io-ui.test.ts` の「introspection は XML のまま」が**意図的に赤くなる**ので、
  それが完了判定になる
- **落ちた型を UI に出す。** `introspectionToModel()` は `TypeLoss` を返す。6-10b の
  型マッピング表と同じ見せ方で textarea に出す（**黙って落とさない**）
- **`tests/known-issues/` の #9 は 5-7b で裏返る** —— `README.md` の運用3 に従い、
  「PG18 の実出力が well-formed でなく index も出ない」から「introspect → 設計 → DDL が
  入力スキーマを再現する」へ書き換える
- **CI に統合テストを足すかは §5-9 の判断。** org 規約では「時間で変わる層」と「1 分を
  大きく超える検査」は週次 `schedule` へ。`services: postgres:18` は追加依存ゼロで置ける

---

### 2026-08-23 HANDOVER §5「backend」段階5-7b —— introspection を JSON 化し、known-issue #9 を閉じる

**`serverimport` が JSON を受けるようになり、XML 経路が消えた。**
**known-issues が 2 本から 1 本になった** —— #9（PG18 の実出力が well-formed でなく
index も出ない）が §5 で直った。

#### XML を受ける経路は「保存された設計の読み込み」1 つだけになった

段階6-5a で XML の**書き出し**が 1 つ残らず消え、ここで introspection の**読み込み**も
JSON になった。残る XML は「4-3b 以前に保存した設計を読む」互換経路だけ。

`importresponse` の流れは **parse → 設計モデルへ写す → 適用 → 並べ直す → 落ちた型を伝える**。
型解決は 5-6 で置いた `introspectionToModel()` が引き受ける —— **backend はパレットを知らない**。

`alignTables()` を呼ぶのは XML 経路と同じ。introspection の応答は座標を持たないので、
**ブラウザ実測の幅で並べ直すのはここでしかできない**。

#### 落ちた型を textarea で伝える（黙って捨てない）

`importNotice()` を足した。DDL の変換注記（6-10a の `conversionNotice`）と同じ立場で、
**1 列 1 行**にまとめる（同じ列に理由が 2 つ付きうるので、素直に並べると読みにくい）。

```
grabado: 1 列の型がそのままでは写せなかった。
流す前に型を確かめること（既定型に落としてある）。

  users.status: USER-DEFINED -> TEXT（パレットに無いので既定型に落とした）
```

落ちた列が無ければ「すべて写っている」と書く —— **沈黙は「落ちなかった」の証明にならない**。

#### known-issue #9 は「直したもの」へ移した

README の運用3（**黙って消さない**）に従った。2 つの原因はどちらも**構造的に起こらない形**に
置き換わっている:

| 原因 | 現行 PHP | Kotlin |
|---|---|---|
| 余分な `</key>` | NOT NULL の CHECK を **denylist** で除外しようとしていた | `constraint_type IN (...)` の **allowlist**。CHECK がそもそも集合に入らない |
| index が出ない | `continue` ではなく **`break`** | `NOT EXISTS (pg_constraint.conindid)` で**制約の index だけ**除外 |

「直った後の挙動」のアサートは `IntrospectionMapperTest`・`introspect-parser.test.ts`・
`PostgresCatalogIntegrationTest`（実 PG18 で CHECK が 16 件出るが 1 件も読まない）にある。

**残る known-issue は #15（Oracle の制約）1 本だけ**になった。

#### capabilities に introspection の分岐を足した（5-5 の予告どおり 1 行）

接続先が env に列挙されていなければ押しても 404 なので、**押せなくする**。

★ **明示的に false のときだけ隠す。** キーが無い応答（古いサーバ・壊れた JSON）は
「分からなかった」であって「できない」ではない —— capabilities を引けなかったときに何も
隠さないのと同じ理屈で、**分からないものを勝手に閉じない**。

#### そのほか

- `database` を **URL エンコード**するようにした。5-7a まで素の連結で、`ARCHITECTURE.md` §4.2 が
  「`keyword` と違って未エンコード」と記録していた箇所（実害は接続名に記号を使ったときだけ）
- `locale` 21 本に `importerror` を足した（読み取りに失敗したときの alert）
- 仮想 backend に `setIntrospection()` を足し、**フロント側の往復**（parse → 型解決 → 適用 →
  並べ直し）を Node から試せるようにした。実際のカタログ読み取りは Kotlin の統合テストが見る

#### 検証

| | 5-7a | 5-7b |
|---|---|---|
| `npm test` | 463 passed | **472 passed** |
| `npm run test:browser` | 189 passed | 189 passed |
| `npm run known-issues` | 2 passed | **1 passed**（#9 が閉じた） |
| `npm run test:dist` | 3 passed | 3 passed |
| `npm run typecheck` | 緑 | 緑 |
| `cd server && ./gradlew test` | 118 passed ＋ 10 skipped | 同じ（**backend 0 行**） |

golden 114 本は無差分。

#### 次段階への入力

- **5-8: introspection を MySQL / MariaDB / H2 へ広げる。** `JdbcCatalogReader` が
  PostgreSQL 専用なので、方言ごとにカタログの引き方を分ける（`information_schema` の
  共通部分は多いが、index と FK の引き方が違う）。**ドライバを 1 本足すごとに
  イメージサイズと CVE 面積が増える**ので、根拠を台帳に残すこと
- **`docs/samples/introspection-postgresql.xml` は旧 PHP の実出力**として残してある
  （§4.5 が参照する歴史的資料）。**現在の実装は JSON を返す**ので、読むときは §7.2 を見ること
- **5-9 で E2E を張るとき、introspection は実 PG18 が要る。** CI に置くなら
  `services: postgres:18`（追加依存ゼロ）で、org 規約に従って**週次**へ

---

### 2026-08-23 HANDOVER §5「backend」段階5-8a —— introspection を MySQL / MariaDB へ広げる

**対応 DB 8 本のうち 3 本（postgresql / mysql / mariadb）が introspection で読めるようになった。**

**フロントは 1 行も触っていない**（方言差は backend の Reader に閉じている）。

#### 実 MySQL 8.4 で確かめた。PG との差は 4 つだけだった

| | PostgreSQL 18 | MySQL 8.4 |
|---|---|---|
| **NOT NULL の CHECK** | **16 件出る** | **0 件** —— §4.6-1 は**PG 固有の挙動**だった |
| index | `pg_index` ＋ `pg_constraint.conindid` で除外 | `information_schema.statistics`。**PK / UNIQUE も出る**ので制約名で除外 |
| FK | `pg_constraint` の `conkey` / `confkey` | `key_column_usage.referenced_table_name` |
| 配列の要素型 | `information_schema.element_types` | **配列型が無い** |

**構造は同じまま広がった** —— どちらも「allowlist で制約を引き、制約が持つ index を除外する」。
5-7a で `break` を捨てて**集合として扱う**形にしたのが、方言が増えても効いている。

`CatalogReader` を interface にし、`JdbcCatalogReader` → `PostgresCatalogReader` に改名して
`MySqlCatalogReader` を足した。JDBC の共通処理（接続・タイムアウト・`getInt` の NULL 潰し）は
`JdbcSupport` に切り出した。**`IntrospectionMapper` から先は方言を知らない。**

#### 決めたこと: MariaDB に**専用のドライバも実装も足さない**

MariaDB は MySQL のプロトコルとカタログに互換で、`information_schema` の該当ビューは
どちらも同じ形。**MySQL Connector/J で繋がる**ので、`supports()` が `jdbc:mariadb:` も
受けるようにしただけ。

**ドライバを 2 本にしない**のは、1 本足すごとに**イメージサイズと CVE 面積が増える**から
（5-0 で「introspection の本数は運用側の話」として切り分けた判断の実行）。
MariaDB 固有の挙動で不都合が出たら、そのとき初めて分ける。

#### 踏んだこと: `docker exec` の既定文字セットでコメントが化ける

`docker exec -i mysql ... < schema.sql` で流すと、**クライアントの既定文字セットが
utf8mb4 でないため日本語コメントが化けて DB に入る**（テストが「ユーザー」を期待して
`ãƒ¦ãƒ¼ã‚¶ãƒ¼` を受け取って発覚）。

接続側ではなく**投入側**の問題だったので、`--default-character-set=utf8mb4` を付けて
DB ごと作り直した。**`docs/TESTING.md` の手順にこの注意を書いた** —— 同じ罠を次に踏まない
ようにするのは、実測を記録するのと同じ理由。

#### テストは PG と同じ 2 層

| テスト | 走る条件 | 見るもの |
|---|---|---|
| `MySqlMapperTest`（8 本） | **常に**（CI 込み） | フィクスチャ → 応答モデル。**方言差が Reader に閉じていること** |
| `MySqlCatalogIntegrationTest`（11 本） | `GRABADO_IT_MYSQL_URL` があるとき | **フィクスチャが実 DB と一致するか** ＋ SQL そのもの |

`CatalogSnapshotFixture` を方言ごとに 1 本持てるようにした（既定は PostgreSQL）。

#### 検証

| | 5-7b | 5-8a |
|---|---|---|
| `npm test` | 472 passed | 472 passed（**フロント 0 行**） |
| `npm run test:browser` | 189 passed | 189 passed |
| `npm run known-issues` | 1 passed | 1 passed |
| `cd server && ./gradlew test` | 118 ＋ 10 skip | **126 passed ＋ 21 skipped** |
| 実 PG18 ＋ 実 MySQL あり | — | **147 passed** |

golden 114 本は無差分。

#### 次段階への入力

- **H2 は 5-8b で判断する。** 組み込み DB なので「サーバモードで動いているものを読む」形に
  なり、**利用場面が PG / MySQL とは違う**。ドライバを足す前に「誰がいつ使うか」を
  台帳に書くこと（1 本足すごとに根拠を残す方針）
- **mssql / oracle は JDBC ドライバのライセンスと再配布可否を確認してから**（5-0 の決定）。
  `sqlite` はサーバ接続の概念が無いので対象外
- **5-9 で E2E と §5 のクローズ。** CI に統合テストを置くなら
  `services: postgres:18` / `services: mysql:8.4`（追加依存ゼロ）で、org 規約に従って**週次**へ

---

### 2026-08-23 HANDOVER §5「backend」段階5-8b —— introspection を H2 へ広げる

**introspection の対応が 4 本になった**（postgresql / mysql / mariadb / h2）。
5-0 でユーザーが選んだ「PG → MySQL/MariaDB/H2 と段階的に」が揃った。

**フロントは 1 行も触っていない。**

#### 決めたこと 1: **`IS_GENERATED` で除外する**（名前で弾かない）

H2 は PK / UNIQUE の裏 index に加えて **FK にも自動で index を作る**
（`FK_ARTICLES_AUTHOR_ID_INDEX_E` のような名前）。MySQL のように「制約名と index 名が
一致する」前提は使えない —— H2 は `PRIMARY_KEY_E` / `USERS_EMAIL_KEY_INDEX_4` のような
**自動名**を付けるため。

**名前で弾こうとすると denylist になって必ず漏れる**（§4.6-1 で PHP が踏んだのと同じ形）。
探索したら `information_schema.indexes` に **`IS_GENERATED` 列**があったので、それを使った ——
**H2 自身が「生成したもの」と印を付けてくれる**のがいちばん確実。

| | 除外の条件 |
|---|---|
| PostgreSQL | `NOT EXISTS (pg_constraint.conindid)` |
| MySQL | 制約名と index 名の一致 |
| **H2** | **`is_generated = FALSE`** |

方言ごとに条件は違うが、**「制約や DB が作ったものを除き、人が作ったものだけを出す」**という
意図は 3 本とも同じ。

#### 決めたこと 2: H2 の統合テストは **opt-in にしない**（常に走る）

PG / MySQL は `docker run` が要るので `assumeTrue` で skip しているが、**H2 は組み込みで
起こせる**（`jdbc:h2:mem:`）。つまり **「実 DB に対して確かめる」を CI に載せられる
唯一の方言**で、フィクスチャと実 DB の一致を毎回検証できる。

探索も `docker exec ... psql` ではなく**テストの中で完結した**（一時的な `H2ExplorationTest` を
書いて `information_schema` を覗き、実装が固まった時点で消した）。

#### 実測で分かったこと: **識別子の大小で並びが逆転する**

H2 は引用符なしの識別子を**大文字化**する。並びは `String.compareTo`（UTF-16 コード単位）
なので:

- 小文字（PG / MySQL）: `_`(0x5F) < `s`(0x73) なので **`article_tags` < `articles`**
- 大文字（H2）: `S`(0x53) < `_`(0x5F) なので **`ARTICLES` < `ARTICLE_TAGS`**

**決定論であることに変わりはない**（同じ DB からは必ず同じ並び）が、方言をまたぐと
順序が変わる。`Collator` を使わない判断（ロケール依存＝非決定論）は変えていない。

#### ドライバを足す根拠（1 本ごとに残す方針）

| | 判断 |
|---|---|
| ライセンス | Apache 2.0 / EPL 1.0 のデュアル。**再配布可** |
| サイズ | 約 2.5MB |
| CVE 面積 | H2 の既知の RCE（CVE-2021-42392 など）は**すべて H2 Console（Web UI）経由**。
grabado は **JDBC ドライバとしてしか使わない**ので到達しない。判断を `build.gradle.kts` の
コメントにも書いた（誰かが Console を有効にする経路を先に塞ぐ） |
| 利用場面 | H2 は既に **DDL 出力の対象**（6-7b で追加）。サーバモードで動いている H2 の
スキーマを読んで ER 図にする経路が揃う |

#### 検証

| | 5-8a | 5-8b |
|---|---|---|
| `npm test` | 472 passed | 472 passed（**フロント 0 行**） |
| `npm run test:browser` | 189 passed | 189 passed |
| `cd server && ./gradlew test` | 126 ＋ 21 skip | **135 passed ＋ 21 skipped** |
| 実 PG18 ＋ 実 MySQL あり | 147 passed | **156 passed** |

golden 114 本は無差分。増えた 9 本は**すべて実 H2 に対する検証**（組み込みなので常に走る）。

#### 次段階への入力

- **mssql / oracle は JDBC ドライバのライセンスと再配布可否を確認してから**（5-0 の決定）。
  `sqlite` はサーバ接続の概念が無いので対象外。**対応 4 本で §5 の introspection は閉じる**
- **5-9: 実 HTTP の E2E と §5 のクローズ。** `playwright.server.config.ts` を新設して
  Kotlin サーバを起こし、save / load / list を通す。CI に統合テストを置くなら
  `services: postgres:18` / `services: mysql:8.4` で**週次**へ（org 規約）
- **§5 完了時に分類の見直しを org に上げる**（5-0 の申し送り）。§3.1 / §3.3 / §3.11 が
  効くようになったので、`security-baseline.md` §6 の更新契機に該当する

---

### 2026-08-23 HANDOVER §5「backend」段階5-9 —— 実 HTTP の E2E を張り、§5 を閉じる

**§5 が完了した。** upstream の PHP backend 15 本が Kotlin/Spring Boot 1 本に置き換わり、
save / load / list / import / capabilities のすべてが動いている。

#### 実 HTTP の E2E（これが最終証明）

5-1b 以降は契約表と仮想 backend で契約を押さえてきたが、**どちらも実際の HTTP を 1 バイトも
流していない**。ここで初めて**ブラウザ（実 XHR）→ Vite dev proxy → Kotlin →
ファイルシステム**を通しで動かした。

見るのは**経路が通っていること**だけで 5 本に絞ってある —— status やヘッダの網羅は契約表が
持つ。実サーバを起こすぶん高価なので、同じことを二度やらない。

| テスト | 何の証明か |
|---|---|
| 保存すると実ファイルが書かれる | **バイト一致**（backend は body を解釈しない） |
| 読み戻せる | 往復が実 HTTP で通る |
| 一覧に出る | 昇順・末尾にも改行（5-1b の契約） |
| **412 を受けて confirm を出す** | **段階5-4 の TOCTOU 対策が実 HTTP で効いている** |
| 設計以外は一覧に出ない | 5-2 の `*.json` 限定 |

**既存 4 系統に混ぜない**（`playwright.server.config.ts` を新設）。これだけ **Java 21 と
bootJar** を要求するので、`npm test` / `test:browser` の前提（Node だけで回る）を壊さない。

#### 踏んだこと 1: Vite の proxy が **POST を転送していなかった**

`proxy: { "/backend": "http://127.0.0.1:8080" }`（文字列の短縮形）だと **GET は通るのに
POST が 404**になる。backend を直接叩くと 201 なので proxy 側の問題と切り分けられた。

`{ target: ..., changeOrigin: true }` の形に書き直したら通った。
**5-1b から dev proxy を置いていたが、GET しか試していなかった**ので気づいていなかった ——
E2E を張って初めて出た種類の不具合。

#### 踏んだこと 2: `globalSetup` は **webServer より後**に走る

正本ディレクトリを `globalSetup` で作ろうとしたら、**backend が先に起動して fail-fast で
落ちた**（存在しないディレクトリを指しているため。段階5-1b で入れた検証が正しく働いた）。

Playwright は **webServer を globalSetup より先に起動する**ので、config の評価時に作るよう
変えた。**fail-fast が意図どおり効いていることの確認**にもなっている。

#### 踏んだこと 3: Windows の `cmd` では**カレントディレクトリが PATH に入らない**

`cd server && gradlew bootJar` が「見つからない」で落ちる。npm script の 1 行に押し込まず
`scripts/build-server.mjs` にして**絶対パスで呼ぶ**ようにした（`scripts/vitest.mjs` と同じ流儀 ——
OS 差を 1 か所に閉じる）。

#### §5 の到達点

| | §5 開始前 | §5 完了時 |
|---|---|---|
| backend | **PHP 15 実装**（標準の実行経路から到達不能） | **Kotlin/Spring Boot 1 本**（`server/`） |
| 保存の往復 | 2（プリフライト → save）。**TOCTOU の窓あり** | **1**（`If-Match`）。**窓は閉じた** |
| introspection | XML。**PG18 相手には読み込めない**（§4.6 の 2 不具合） | **JSON**。4 方言（pg / mysql / mariadb / h2）で 2 不具合とも構造的に起こらない |
| 副作用の停止 | 無し | `READONLY` で保存・introspection を止める（**公開デモが成立する条件**） |
| CI | **無し** | frontend / server の 2 本（paths で振り分け） |
| known-issues | 2 本 | **1 本**（#9 が §5 で直った） |
| テスト | フロント 407 | フロント **472** ＋ Kotlin **135**（実 DB ありで 156）＋ E2E **5** |

**golden 114 本は §5 の全段階で 1 バイトも動いていない。** backend を丸ごと置き換え、
保存の往復数を変え、introspection の形式を変えても、**設計 → DDL / ORM / JSON の出力は
1 ビットも動かなかった** —— §7 特性化テストが「挙動不変を保証してから内部を作り替える」
という制約1 の実体として働いた。

#### 段階の分け方（振り返り）

**「フロント 0 行の帯」を作ったのが効いた。** 5-1b / 5-2 / 5-6 / 5-7a / 5-8a / 5-8b は
フロントを 1 行も触っておらず、**既存テストが 1 本も動かないこと**がそのまま
「backend が契約を満たした」証明になった。

**契約表（5-1b）と `check()` の網羅テスト（5-1c）が 3 回効いた** —— 5-3（403）・
5-4a（412）・5-7a（404/403）で、status を足すたびに「フロント側を広げ忘れた」と
機械が言ってきた。散文の申し送りだけでは、どれか 1 回は落としていた。

#### 次への申し送り

- **§5 完了に伴い、org の security-baseline の分類見直しを上げる**（5-0 の申し送り）。
  grabado は分類 B（ブラウザで完結）と名指しされているが、§5 で
  **§3.1（introspection がカタログ名を組み立てる）/ §3.3（`keyword` のパス）/
  §3.11（READONLY）** が効くようになった。同 §6 の更新契機
  「新しいリポジトリが分類 A/B/C/L に入った」に該当する
- **CI に統合テスト（実 PG / 実 MySQL）を置くかは未決。** org 規約では「1 分を大きく超える
  検査」は週次 `schedule` へ。`services: postgres:18` / `services: mysql:8.4` は追加依存ゼロ
- **E2E も CI に置いていない**（Java 21 ＋ bootJar が要る）。置くなら server 側の
  ワークフローに足すか週次へ
- **HANDOVER §5 に「実装済み」の注記を入れた。** 本体の要件はそのままで、
  到達点との差分は `ARCHITECTURE.md` §7 が持つ（**HANDOVER = 入口 / CUSTOMIZATIONS = 正**
  という役割分担は 5-0 の決定どおり維持）
- **§5 の次は HANDOVER §9 の順序では §11（AI）→ §2（Docker）。** §6 には 6-9f（Drizzle）と
  §6.4 の仕上げが残っている

### 2026-08-23 HANDOVER §11「AI」段階11-0 —— 契約を確定し、§11 を分割する

§5 は 5-9 で閉じ、HANDOVER §9 の順序では次が §11。着手の前提（特性化テストが緑・
golden 114 本が動いていない）は満たしている。

**本段階は文書だけで、実装は 0 行**（6-0 が §6 を、5-0 が §5 を分割したのと同じ位置づけ）。
§11 は**これまでの 3 節と性質が違う** —— 出力が決定論でなく、実行に外部への送信と
自社負担の費用が伴う。だからこそ「どこまでを非決定に許すか」を先に線引きしないと、
後段の PR の形が段ごとに揺れる。

**契約の正は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §8**（§7 が Kotlin backend の
到達点を持つのと同じ形で、**§8「AI proxy の契約」の枠を予約**した）。中身は 11-2 以降が埋める。

#### 決めたこと 1: 構造化出力は **structured outputs** に寄せる（CLAUDE.md 制約7 の文言を更新）

HANDOVER §11.3 と CLAUDE.md 制約7 は「**tool use（function calling）で提案スキーマを強制**」と
書いている。これを **`output_config.format` の `json_schema`（structured outputs）**に替える。

- **制約7 の意図は「自由テキストをパースしない」**こと。tool use はそれを実現する当時の手段で、
  目的そのものではない。**文言を「構造化出力を強制する（自由テキストをパースしない）」に更新**し、
  手段を固定しない形にした（CLAUDE.md を同じ PR で直してある）
- **ここでモデルにツールを実行させるわけではない。** 返させるのは提案リスト 1 個で、往復が無い。
  tool use はツール実行の往復を模した形なので、`tool_use` ブロックを content から取り出す段が
  1 つ増えるだけになる
- **レスポンス本体がスキーマに拘束され、検証が SDK 側で終わる。** 「AI 出力は自動適用しない」
  （制約7）の手前に、**そもそも形が違うものは受け取らない**層が 1 枚増える

代償を 2 つ引き受ける。

- **JSON Schema に制約がある** —— 再帰不可・`additionalProperties: false` 必須・数値制約
  （`minimum` / `maximum`）と文字列長制約は非対応。**提案スキーマはこの内側で設計する**
  （列挙は `enum` で、件数の上限はスキーマではなくサーバ側で切る）
- **初回リクエストにスキーマのコンパイル費用が乗る**（以後 24 時間キャッシュ）。
  **スキーマを動的に組み立てない**理由になる —— 11-2 では定数として持つ

#### 決めたこと 2: AI に送るのは **設計 JSON ではない**

5-0 の決めたこと 3（introspection は設計 JSON を返さない）の裏返しで、**`aiRequestVersion: 1`**
を新しい形式として宣言する。

```json
{
  "aiRequestVersion": 1,
  "dialect": "postgresql",
  "tables": [{
    "name": "employee",
    "comment": "従業員",
    "columns": [
      { "name": "id", "sqlType": "INTEGER", "nullable": false, "default": "" },
      { "name": "manager_id", "sqlType": "INTEGER", "nullable": true,
        "references": [{ "table": "employee", "column": "id" }] }
    ],
    "keys": [{ "type": "PRIMARY", "name": "employee_pkey", "columns": ["id"] }]
  }]
}
```

根拠 3 つ。

1. **`x` / `y` は判定に無関係で、トークンだけ食う。** 座標は描画の都合で、house 規約のどの項目
   （複数形・uuidv7・監査列・命名）にも掛からない。テーブル 1 つあたり 2 フィールドを毎回
   送るのは**費用が自社負担**の機能では素通しできない
2. **型は id ではなく SQL 名で送る。** 設計 JSON v2 の `type` は型パレットの安定 id（4-2b）で、
   `"5"` を渡されてもモデルには何の意味も無い。解決はフロントの `TypePalette` が持っている
   ので**フロントで済ませる** —— backend にパレットを持たせない（5-0 の決めたこと 3 と同じ理屈で、
   持たせた瞬間に `db/<db>/datatypes.xml` の写しが Kotlin 側にできる）
3. **`formatVersion` / `db` を送らない。** ルーブリックの選択はサーバが `dialect` で行い、
   設計ファイルの版はモデルに関係ない。**「AI に送るものは設計ファイルではない」ことを形式で表す**

#### 決めたこと 3: プライバシーは **素のまま送る**。ただし送信は明示の 1 アクション＋プレビュー

HANDOVER §11.5 が「既定挙動は着手時に確定」としていた点（ユーザー判断）。

**匿名化を既定にしない。** 判定基準の中心（複数形・snake_case・`fk_<table>_<ref>` /
`idx_<table>_<cols>`・監査列名 `created_at` / `updated_at`）が**名前そのもの**なので、仮名化すると
§6.3 由来の指摘がまるごと死ぬ。残るのは PK 欠落・FK 欠落・型の 3 つだけで、**「機能はあるが
ほとんど何も言わない AI」**になる。それは費用に見合わない。

代わりに 3 つで担保する。

- **実質オプトイン。** キーとモデル名が env に無ければ `capabilities.ai` が false で、
  ボタンが出ない（5-7a の「実装があっても使えないなら false」と同じ）。**env にキーを入れる行為が
  オプトインそのもの**で、別途のフラグは足さない
- **送信前プレビュー。** 実際に送るバイト列（決めたこと 2 の JSON）をそのまま見せてから送る。
  見せ方は 6-10b / 5-7b と同じ textarea 経路に載せる（新しい UI 語彙を増やさない）
- **公開デモには機能ごと無い。** `READONLY=true` 一択（2026-08-15 の決定）で、AI は落ちる 3 つの
  副作用の 1 つ

**匿名化オプション自体は将来の余地として残す**が、11-x では作らない。作るなら「命名系の指摘が
落ちる」ことを UI に明示するのが条件。

#### 決めたこと 4: ルーブリックは **PG だけが house 規約**、他 7 本は DB 非依存の指摘

§6.2 / §6.3 の規約（`uuidv7()` 既定・`timestamptz` 固定・`jsonb`・`numeric`・`text` 優先・
`serial` / `char(n)` / `money` / `json` を避ける）は **PostgreSQL の型体系そのもの**で、
`sqlite` や `oracle` に当てても意味を成さない。

- **`postgresql` はフル判定**（house 規約のルーブリック）
- **他 7 本は DB 非依存の指摘に絞る** —— PK 欠落 / FK になっていそうで宣言が無い列 /
  テーブル名の単複 / 監査列の欠落 / 参照列に index が無い / 命名の一貫性
- **1 本ずつ広げる余地は残す**（5-8 で introspection を 1 本ずつ広げたのと同じ進め方。
  **広げるときは根拠を残す**）

**CLAUDE.md「対応 DB を絞る判断はしない」との関係**: あれは**出力品質**に掛かる規約で、
5-0 で「同梱ドライバ＝運用側の話」と切り分けた線引きをここでも使う。**DDL / ORM 出力は
8 本とも同格のまま 1 ビットも動かない。** 動くのは「自社標準との突き合わせ」で、
自社標準が PG のものである以上、PG 以外に同じ深さの判定は原理的に存在しない。

#### 決めたこと 5: URL は **`POST /api/ai/review`**

5-0 で「REST 化は §5 ではやらない。**`/api/` は §11 の AI proxy が始める**」と決めてある。
`/backend/<name>/?action=` は upstream の語彙なので、新機能は新しい形で始める。

HANDOVER §11.2 の `POST /api/refactor/suggest` から名前を変える。理由は 2 つ ——
**`/api/ai/` という名前空間を切っておけば将来の AI 機能が同じ下に入る**こと、そして
§11.1 の位置づけ（自社標準からの逸脱を指摘する）は refactor というより **review** だからだ。

status は §5 で作った語彙をそのまま使う。

| | status | 理由 |
|---|---|---|
| READONLY / キー未設定 / モデル名未設定 | **403** | 5-3 と同じ。「壊れている」と「禁止されている」を混ぜない |
| 入力が大きすぎる・壊れている | **400** | `check()` は 413 を持たない（5-1c で足した 400 に寄せる） |
| 自分のレート制限に当たった | **429** | 上流の 429 も写す。**503 に倒さない** —— 5-3 と同じ理由で、待てば通るものを故障に見せない。`locale` に `http429` を足し `check()` に `case 429` を足す |
| 上流の失敗・タイムアウト | **503** | 5-0 の決めたこと 4 と同じ（`check()` が文言を持つのは 501 / 503） |

#### 決めたこと 6: patch の `op` は **閉じた集合**で、破壊的な op を作らない

制約7「適用は §4 の決定論パスに合流」の実体。適用は
**`js/io/ai/apply-patch.ts` の純関数（`DesignModel` → `DesignModel`）**で、
ライブツリーは触らない（触るのは既存の `applyDesignModel()` = 4-1b の経路）。

```
rename-table / rename-column / change-type / add-column / add-key
set-nullable / set-default / add-comment
```

**`drop-table` / `drop-column` は作らない。** 「AI の提案を承認したら設計が消えた」は事故の形が
悪く、承認 UI の誤操作 1 回で復旧不能になる。**消したいものは人間が消す。** AI は
「この列は使われていないのでは」と `rationale` に書くだけで、`patch` を持たない提案を許す
（`patch` は optional）。

`op` を閉じた列挙にすると **structured outputs のスキーマがそのまま執行される**（決めたこと 1）
—— モデルは列挙の外を書けない。**「AI が任意の変更を書ける」状態を、実行時の検査ではなく
形式で潰す。**

#### 決めたこと 7: モデル名は env で**必須**（既定を焼き込まない）

制約7「特定モデル名を焼き込まず env＋docs 参照」。

- `GRABADO_AI_MODEL` が**未設定なら AI は無効**（`capabilities.ai` が false）。既定値を
  `application.yaml` に置くと、それが事実上の焼き込みになる
- `ANTHROPIC_API_KEY` と**両方そろって初めて有効**
- 選び方は docs から引く（<https://platform.claude.com/docs/en/about-claude/models/overview>）。
  **モデル名を台帳やコードに書き写さない** —— 書いた瞬間に古くなる

#### 決めたこと 8: キャッシュは **2 段**（片方は §4 の決定論が効く）

- **(a) prompt caching（API 側）** —— ルーブリックは固定なので system の最後のブロックに
  `cache_control` を置く。**プレフィックス一致なので、ルーブリックを動的に組み立てない**
  （1 バイト変わると以降が全部無効）。最小キャッシュ長がモデル依存なので、届かなければ
  効かないだけ —— 実装が壊れる種類の話ではない
- **(b) 結果キャッシュ（自前・HANDOVER §11.2 の「スキーマハッシュ」）** —— 送るバイト列の
  SHA-256 → 提案 JSON。**プロセス内メモリのみ**（制約5 の DB レス既定。再起動で消えてよい）。
  上限件数と TTL を持つ

**(b) が成立するのは serializer が決定論だから**（制約3）。同一モデル → 同一バイト列なので
**ハッシュが安定する**。§4 の決定論が効く 2 つ目の場所（1 つ目は 5-4 の ETag）。

#### 決めたこと 9: 上限は**サーバが持つ**（費用が自社負担だから）

- **タイムアウトを明示する。** SDK 既定は 10 分で、公開プロダクトのリクエストとしては長すぎる。
  秒数は env で調整可
- **入力サイズの上限**（テーブル数・バイト数）。超えたら 400
- **レート制限**（同時実行数・単位時間あたり）。超えたら 429
- `effort` / thinking も env で調整可にする（**コストの主要な変数**）。既定値は 11-2 で実測して決める

#### 決めたこと 10: READONLY は **Bean を登録しない**（5-3 と同じ）

`@ConditionalOnProperty` で AI サービスを**そもそも登録しない**。フィルタや各ハンドラの `if` に
しないのは 5-3 と同じ理由 —— **禁止を「禁止したいもの」の直上に置く**。
副産物として **HTTP なしでテストが書ける**のも同じ。

`capabilities.ai` は「キー設定済み ∧ モデル設定済み ∧ `!READONLY`」。
DesignController の `ai = false` リテラル（「それまで嘘をつかない」）は 11-2 で外れる。

#### §11 の分割

5-x で効いた「**フロント 0 行の帯**」を作る分け方にした（既存テストが 1 本も動かないことが、
そのまま「契約を満たした」証明になる）。

| 段階 | 内容 | フロント |
|---|---|---|
| **11-1** | **patch 適用の決定論パス（TS 純関数だけ）** —— 提案 / patch の型と `apply-patch.ts`。固定 JSON → 適用 → モデル差分をテストで固める | 触らない（`js/io/ai/` の新設のみ） |
| **11-2** | **Kotlin AI proxy（backend 先行）** —— `/api/ai/review`・structured outputs・env・キャッシュ・上限・READONLY・`capabilities.ai`。**LLM はモック**。契約表に追加 | **0 行** |
| **11-3** | **送信と受け取り（フロント配線）** —— 送信前プレビュー・提案の取得と一覧。**まだ適用しない** | 配線 |
| **11-4** | **review-first の適用 UI** —— 1 件ずつ承認 → 11-1 の決定論パスへ。差分の見せ方 | 適用 UI |
| **11-5** | **実 API の E2E と §11 を閉じる** —— 5-9 と同じ形。実キーが要るので**既定では走らせない** | — |

**11-1 を先に置く理由**は 5-6（introspection の変換層だけを先に足した）と同じ。
**適用ロジックは LLM が 1 バイトも関わらない純関数**なので、AI を呼ぶ前に完成させられる。
先に backend を作ると「提案は来るが適用できない」半端な状態が develop に載る。

**11-2 が大きければ 11-2a（契約・スタブ）/ 11-2b（実 SDK 呼び出し）に割る** —— 5-1b / 5-1c と
同じ判断で、実測が要る部分と契約だけの部分を混ぜない。

#### 申し送り

- **org の security-baseline の分類見直しに根拠が 1 本増えた。** 5-9 で「§3.1 / §3.3 / §3.11 が
  効くようになった」と上げた件に、**§11 は「外部ホストへの送信」と「秘密（API キー）の保持」を
  足す**。分類 B（ブラウザで完結）からの距離がさらに開く
- **HANDOVER §11.2 / §11.3 との差分**は本記録が正（5-0 で決めた **HANDOVER = 入口 /
  CUSTOMIZATIONS = 正**の役割分担どおり）。差分は 3 つ —— **URL 名**（決めたこと 5）・
  **構造化出力の手段**（決めたこと 1）・**プライバシー既定**（決めたこと 3）
- **`js/io/ai/` は §4 の 2×2 格子（4-1a）の外**。設計モデルを入力に取り、設計モデルを返す
  第 3 の軸なので、`extract` / `apply` / `parser` / `serializer` のどれにも同居させない
- **費用の実測は 11-2 で取る。** 1 リクエストあたりのトークンと概算費用を台帳に残す
  （公開デモを READONLY 一択にした判断の裏付けになる）

### 2026-08-23 HANDOVER §11「AI」段階11-1 —— patch 適用の決定論パス

11-0 の分割表の先頭。**AI を呼ぶ前に、承認した提案を設計へ当てる側だけを完成させる。**
5-6（introspection の変換層だけを先に足した）と同じ形で、先に backend を作ると
「提案は来るが適用できない」半端な状態が develop に載る。

入ったのは 2 本 —— [`frontend/js/io/ai/suggestion.ts`](frontend/js/io/ai/suggestion.ts)（提案と patch の型。
型だけで emit 空）と [`frontend/js/io/ai/apply-patch.ts`](frontend/js/io/ai/apply-patch.ts)（`DesignModel` →
`DesignModel` の純関数）。**LLM も HTTP も 1 バイトも関わらない。**

**フロントは 0 行**（`src/app.ts` にも `js/io.ts` にも `locale/` にも触っていない）。
既存テスト 472 本と golden 114 本が **1 本も動いていない**ことが、そのまま
「まだ何も配線していない」の証明になる（5-x で効いた「フロント 0 行の帯」）。
新規は `tests/node/apply-patch.test.ts` の 57 本。

#### 決めたこと 1: 失敗は**例外ではなく Result 型**

`js/io/` のエラー処理は性質で 2 つに割れている —— **正本を読む側は throw**
（`json-parser.ts` の「壊れた JSON は部分的に読み込まない」）、**1 件の失敗で全体を落とせない
側は Result ＋ 理由の一覧**（`convert.ts` の `losses` / `introspect-parser.ts` /
`ddl/naming.ts` の `identifierIssue`）。**AI patch は後者。**

1. **入力が正本ではない。** LLM の出力で、しかも提案が返ってから承認までの間に人が設計を
   編集しうる。**「対象のテーブルがもう無い」は異常ではなく通常の帰結**
2. **11-4 は 1 件ずつ承認する UI。** 例外だと「何件目がなぜ落ちたか」が message 文字列に
   潰れ、呼び手は patch ごとに try/catch を書くことになる
3. **理由をユーザーに見せる必要がある。** `js/io/` は locale を通せない（ARCHITECTURE §5.6
   規約3）ので、**訳す側が使えるキーを返すしかない** —— `PatchRejection.kind` がそのまま
   locale のキーで、6-9b の `IdentifierIssue` が同じ問題を同じ形で解いた前例に揃えた

結果として **well-typed な入力に対して 1 つも例外を投げない**。落ちたときはモデルを
**入力と同一参照で返す**（部分適用を作らない。`convert.ts` が同じ db を恒等で返すのと同じ）。

#### 決めたこと 2: `add-key` は **FK も運ぶ**（ユーザー判断）

§8.3 は op 名を閉じた 8 種で決めているが、**`add-key` の中身は規定していない**。
モデルは通常キーを `TableModel.keys`、FK を `RowModel.relations` と**別の場所**に持つので、
どちらを運ぶのかは実装が決めるしかなかった。

**両方運ぶ**（`keyType: PRIMARY | UNIQUE | INDEX | FOREIGN`）。`category` の 7 語に
`fk_gap` がある以上、**閉じた 8 op のうち FK を表現できるのは `add-key` だけ**で、
運ばせないと「AI の指摘のうち 1 カテゴリだけが承認 UI に乗らない」ことになる。

代償は `add-key` だけが 2 つの書き込み先を持つこと。**`FULLTEXT` は入れない** ——
PG では btree の `CREATE INDEX` に落ちるだけで、AI が提案する意味が無い（UI は 4 種類
作れるが、ここは「AI に作らせてよいもの」の集合で UI の写しではない）。

#### 決めたこと 3: 型は **SQL 名で受ける**。パレットは 1 つだけ見る

§8.2 が「型は id ではなく解決済みの SQL 名で送る」と決めているので、返ってくる patch も
SQL 名。解決は既存の `TypePalette.indexOfTypeName()`（`introspect-parser.ts` と同じ扉）。

**一致が無ければ落とす。先頭型には落とさない。** `introspect-parser.ts` が既定型へ倒すのは
「1 列のせいで import が全滅する」のを避けるためで、こちらは 1 件の提案なので落とせばよい
（known-issue #4 の「一致が無ければ添字 0」をこの層に持ち込まない）。

サイズは**寄せ先の `length` に従う** —— `CHAR(10)` が `TEXT` に寄ったときに `TEXT(10)` を
出さない既存の規則で、`xml-parser.ts` / `ddl/shared.ts` / `convert.ts` に続く **4 人目の読み手**。

#### 決めたこと 4: キーと FK の**名前を焼き込まない**

`add-key` が書く `KeyModel.name` は**必ず空**。`docs/FORMAT.md` の「空のときだけ生成器が
§6.3 の規約で名前を組む」という契約がそのまま効き、`<table>_pkey` / `idx_<table>_<cols>` /
`fk_<table>_<column>` は `ddl/naming.ts` が組む。**ここで組むと規約が 2 か所に分かれ、
introspection で読み直しても名前が動かないという 6-5b の保証が壊れる。**

同じ理屈で **UI 経路の副作用を再現しない**。`Table.setTitle()` の関連行リネーム
（`js/table.ts`）も `rowManager` の FK 型寄せ（`js/rowmanager.ts`）も、読み込み経路
（`apply.ts`）では 1 度も発火しない UI だけの挙動で、持ち込むと**読み込み経路と patch 経路で
結果が違う**状態ができる。patch は読み込み経路に揃える。

#### 決めたこと 5: **ランタイムの検証を持たない**

`suggestion.ts` は型だけ（`introspect-model.ts` と同じ立場）。「形が違うものは受け取らない」
層は backend 側の structured outputs が持つ（11-0 の決めたこと 1）ので、**ここに二重に置くと
11-2 が持つべき契約が 11-1 に漏れる**。`drop-table` / `drop-column` が無いことも、実行時の
検査ではなく **`AiPatch` の union に枝が無いこと**で保証される（決めたこと 6 の形式版）。

#### 決めたこと 6: 触っていない枝は**同一参照**で返す（構造共有）

変更が届かなかった `TableModel` / `RowModel` / `KeyModel` はそのまま返す。効用は 2 つ ——
決定論の証明が「触った枝だけ見ればよい」に縮むこと、**テストが `toBe` で「この patch は
このテーブルしか触っていない」を機械的に押さえられる**こと（`convert.test.ts` の恒等テストと
同じ形）。追加はすべて**末尾 append** で、挿入位置を推測しない。

**ここだけオブジェクトの spread を使う。** `convert.ts` / `introspect-parser.ts` が全フィールドを
明示で書き写しているのは「写し漏らしがそのまま欠落になる」層だからで、**patch は逆** ——
意味論が「指定した 1 つを変えて残りはそのまま」なので、モデルに将来フィールドが増えても
「持ち越す」が常に正しい。

#### 決めたこと 7: 破壊は形式で潰す（`add-comment` の空文字を拒む）

`drop-*` を作らないだけでは足りない —— **`add-comment` に `""` を通すと実質の削除になる**。
op 名が `add-` である以上これは §8.3 の趣旨に反するので `patchemptyvalue` で拒む（上書きは
許す。コメントは設計そのものではない）。副次的に、`""` を入れると `title=""` 属性が生えて
状態 golden が動く問題（`apply.ts` の `if (model.comment)`）も同じ判断で避けられる。

`set-default` の `""` は逆に**「既定を外す」として通す** —— モデルに null は無い（4-5）ので
これが唯一の表現で、既定値は消しても設計は壊れない。**`"NULL"` → `""` の正規化はしない**
（正規化は `Row.update()` の 1 箇所に置いたままにするのが 4-1b の決めたこと 3。同じ規則を
2 か所に分けると片方だけ直す事故の余地が残る）。

#### テスト —— 57 本、golden は 0 本

**golden を足さないこと自体が完了判定。** 返るのはバイト列ではなくモデルなので `convert` /
`introspect-parser` と同じ素のアサーションで書き、`tests/browser/` に spec を 1 本も足さない。

主戦場は `tests/fixtures/postgresql/relations.xml` —— **rename の巻き込みすぎと取りこぼしが
両方出る**唯一の fixture（自己参照 FK・1 テーブルに複数 FK・多対多）。`employees` を改名すると
3 テーブル 4 本の参照が追随し、`teams` への参照は 1 バイトも動かない。`employees.id` を改名すると
`employees_pkey` の part も動くが、**`projects.id` / `teams.id` は同名でも巻き込まない**。

新しい fixture を 1 つ足した ——
[`tests/fixtures/ai/review-response.json`](tests/fixtures/ai/review-response.json)。
8 op すべてと **`patch` を持たない提案**を含む 11 件で、**11-2 のモック LLM 応答を兼ねる**。
`tests/fixtures/` 直下は `db/` と 1 対 1 であることを `fixture-set.test.ts` が見ているので、
`ai` は `NON_PROFILE_FIXTURE_DIRS` に宣言して外した（5-6 の introspection と同じ扱い）。

**§4 の決定論パスへ合流していることを実測で押さえた** —— 適用後のモデルを
`serializeDesignJson()` に通して往復バイト一致、`generateDdl()` に通して
`idx_projects_owner_id` と `fk_employees_team_id` が出ること。**AI が触ったあとのモデルは
ただの `DesignModel`** で、既存の出力側が何も知らないまま受ける。

#### 申し送り

- **11-2 は `op` の enum 8 語と `keyType` の enum 4 語を `suggestion.ts` と一致させること。**
  structured outputs のスキーマとこの union が割れると、通る提案が適用できなくなる
- **`PatchRejection.kind` の locale 追加は 11-4。** `js/io/` は locale を通せないので、
  訳語は承認 UI 側が持つ。**11 語ある**（`patchnopatch` / `patchtablemissing` /
  `patchcolumnmissing` / `patchtargetcolumn` / `patchnametaken` / `patchunknowntype` /
  `patchkeyexists` / `patchrefmissing` / `patchrefexists` / `patchemptyvalue` / `patchmalformed`）
- **`aiRequestVersion: 1` の構築器（§8.2）は 11-3。** `DesignModel` → 送信 JSON の純関数で、
  型を SQL 名へ解決するので `palette` を取る。置き場所は `js/io/ai/request.ts` が自然
- **提案に安定 id を振るかは 11-3 の判断。** structured outputs で一意性を強制できないので、
  振るならフロント側の採番になる。11-1 の承認単位は配列の添字
- **`add-column` は autoincrement を受け取らない。** identity 列が要る局面が出たら
  op を増やすのではなく、まず「house 既定の PK は `uuid DEFAULT uuidv7()`」で足りるかを見る

### 2026-08-23 HANDOVER §11「AI」段階11-2a —— AI proxy の契約とスタブ

11-0 の分割表の 2 つ目。**`POST /api/ai/review` が立ち、その周りの契約が全部そろった**
—— URL・status 語彙・env・結果キャッシュ・入力上限・レート制限・READONLY・`capabilities.ai`。
**上流を実際に叩く部分だけが無い。**

**フロントは 0 行**（`js/` / `src/` / `locale/` / `index.html` / `tests/golden/` に 1 バイトも
触っていない）。`npm test` 529 と golden 114 本が**本数ごと不変**であることが、そのまま
「まだ配線していない」の証明になる。server 側は 135 → **166 passed**（+31）。

**本段階は issue で起票してから着手した最初の PR。** org の `work-conventions.md` §1
（プランは起票で止める）への導線が #65 で `CLAUDE.md` に入った直後で、正本は
[issue #72](https://github.com/propagandist/grabado/issues/72)。

#### 決めたこと 1: 11-2 を **11-2a / 11-2b** に割る

11-0 が「大きければ割る」と予約していた分割を実行した。境目は
**「実測が要るか」** —— タイムアウトの既定値・`effort`・1 リクエストあたりの費用・
prompt caching が実際に効くかは、上流を叩かないと決められない。5-1b / 5-1c と同じ判断で、
**決めたことと測ったことを 1 つの PR に混ぜない**。

11-2b が持つのは 4 つ —— `anthropic-java` の導入・structured outputs のスキーマ（定数）・
prompt caching・タイムアウトと `effort` の既定値。**費用の実測もそこ。**

#### 決めたこと 2: **DTO を 1 つも作らない**（JsonNode のまま扱う）

入力（`aiRequestVersion: 1`）も出力（提案）も data class に写さず、`JsonNode` で受けて
`JsonNode` で返す。理由は 2 つで、どちらも 5-0 の決めたこと 3（backend に型パレットを
持たせない）と同じ構造 —— **持たせた瞬間に写しができる**。

- **入力**: backend はこの JSON を解釈しない（11-2b が上流へ渡すだけ）。型に写すと
  `aiRequestVersion: 1` の形が Kotlin とフロントの構築器（11-3）の 2 か所に生まれる
- **出力**: 適用は `js/io/ai/apply-patch.ts` が持つ。写すと **patch の 8 op の union が
  Kotlin と TypeScript の 2 か所に**生まれ、片方だけ動かす事故ができる

見るのは 4 つだけ —— JSON として読めるか / 版が 1 か / `dialect` があるか /
`tables` が配列で件数が上限内か。**`dialect` を 8 本に限定しない**（プロファイル名の一覧を
backend に持たせない。知らない dialect は 11-2b で「DB 非依存の指摘」に落ちる ——
決めたこと 4 と整合する）。

**副産物として依存が 1 本も増えなかった。** issue #72 は `jackson-module-kotlin` を足す
前提で書いていたが、data class に写さないので要らない（`build.gradle.kts` の
「data class へのデシリアライズが要る日に足す」は**まだその日ではない**）。

#### 決めたこと 3: **main に `SuggestionSource` の実装を置かない**

上流を呼ぶ側は `fun interface SuggestionSource` 1 本にし、**実装は main に 1 つも置かない**。
固定応答を返すスタブを本番のコードに置くと、消し忘れたときに「**AI が動いているように見えて
実は固定**」が載る —— 外から見て壊れていることが分からない種類の事故で、いちばん避けたい形。

スタブはテスト側にだけ置く。実装が無ければ Bean が組めず `capabilities.ai` は false のまま
になり、**「実装が無いなら使えない」が構造で保証される**（5-7a の「実装があっても使えないなら
false」の裏返し）。11-2a を動かしても**実運用の挙動は 1 ビットも変わらない**。

#### 決めたこと 4: **429 を先に足し、`check()` は 11-3 で対にする**

`ApiExceptionHandler` の KDoc は「status を増やす PR では `js/io.ts` の `check()` と `locale` を
同じ PR で広げること」と書いている（5-1c / 5-3 / 5-4a で 3 回効いた規律）。**本段階はこれを
意図的に外した。**

理由は 5-1b で 400 を足したときと同じ —— **フロントが `/api/ai/review` を 1 度も呼ばないので、
429 が `check()` に届く経路が存在しない**。到達しない status は無言で成功扱いにならない。
配線と同時に広げるのが 11-3 で、そこが `case 429` と `http429` を持つ。

**規律を外したことを 3 か所に書いた**（`ApiExceptionHandler` / `AiController` の KDoc と
`ARCHITECTURE.md` §8.1）—— 外した理由が読めない場所に残ると、次に status を足す人が
「前もやっていた」を根拠にできてしまう。

#### 決めたこと 5: 契約表に **`request.path`** を足す（`contractVersion` は上げない）

`/api/ai/review` は `/backend/<name>/?action=` の形を取らないので、表の側に URL の
組み立て方が 2 通りできた。**`path` があればそちらを使う** —— どちらなのかが文書ではなく
データで分かる（`virtual` の宣言と同じ流儀）。

**版は 1 のまま。** `path` は既存ケースに 1 バイトも影響しない optional な追加で、
TypeScript 側（`virtual: false` を流さない）は `path` を知る必要が無い。**版を上げると
読み手を直すことになり、フロント 0 行の帯が濁る** —— 版が意味を持つのは「読み手が形の
変化に気づかないと壊れる」ときだけ。

AI のケースは 6 件（`ai-disabled` / `ai-readonly` / `ai-review-ok` / `ai-bad-version` /
`ai-not-json` / `ai-too-many-tables`）で、全部 `virtual: false`。**起動条件ごとに流す側が
3 つになった**（通常 / `readonly` / `ai`）。

#### 決めたこと 6: 上限の既定値は **判断であって実測ではない**

`maxTables` 100 / `maxRequestBytes` 256 KiB / `ratePerMinute` 10 / `maxConcurrent` 2 /
キャッシュ 64 件・TTL 1 時間。**どれも実測していない**ので、そう書いた上で根拠を
`AiProperties` の KDoc に 1 つずつ残した（100 は house の実運用を大きく超える値、
10 は「人が画面から押す」速度の上限、2 は単一コンテナのローカル運用が前提、など）。

**実測が要る 2 つ（タイムアウトと `effort`）はここに置かない** —— 既定値を置いた時点で
それが焼き込みになる（決めたこと 7 のモデル名と同じ）。

#### 決めたこと 7: キャッシュの鍵を**正規化しない**。ヒットは**レート制限を消費しない**

- **鍵は送られてきた生バイトの SHA-256。** 「同じ意味だがバイト列が違う入力」は当たらない。
  正規化すると当たる範囲は広がるが、**その規則がフロントの構築器（11-3）とずれた瞬間に
  別の設計へ別の提案を返す** —— キャッシュの誤ヒットは、外から見て AI が壊れたのと
  区別がつかない。**当たらない方に倒す**
- **キャッシュに当たった呼び出しはレート制限を消費しない。** 費用が発生しない呼び出しを
  費用の上限で止める理由が無い
- **壊れた入力・失敗した呼び出しはキャッシュに入らない**（次も同じ 400 / 503 になる）

順序も契約のうち —— **サイズ検査 → ハッシュ → キャッシュ引き → 形の検査 → レート制限 → 上流**。
サイズが先なのは拒むための計算をいちばん安く済ませるため、キャッシュが形の検査より先なのは
一度通った入力を必ず通すため。

#### テスト —— +31 本

- **`AiContractTest`（9 本）** —— 契約表の `serverMode: "ai"` 6 件を実 HTTP で流す ＋
  `capabilities.ai` が true になること・**同じ入力の 2 回目が上流を呼ばないこと**・
  1 文字違えば当たらないこと・上流の失敗が 503 になること
- **`AiReviewServiceTest`（20 本）** —— HTTP なし。使えるかの判定・入力の 8 通りの壊れ方・
  キャッシュ（TTL / LRU / 鍵）・レート制限（ウィンドウ / 同時実行）・**11-1 の fixture
  （`tests/fixtures/ai/review-response.json` の 11 件）がそのまま通ること**
- 既存の 2 つが 1 件ずつ増えた（`ai-disabled` が通常起動、`ai-readonly` が READONLY 側）

**時間に依存するものは `Clock` を渡してその場で進める。** `Thread.sleep` で待つ形にすると、
遅くなるうえに落ちる日が来る。

#### 却下した案

- **`jackson-module-kotlin` を足して DTO で受ける** —— 決めたこと 2。**依存が 1 本増えるうえに、
  形の写しが 2 か所になる**
- **提案を Kotlin の sealed class で表す** —— patch の 8 op の union が 2 言語に生まれる。
  形の保証は 11-2b の structured outputs が持つ
- **`contractVersion` を 2 に上げる** —— 決めたこと 5
- **スタブを main に置く** —— 決めたこと 3
- **429 を返す前にリトライを待たせる** —— 待たせると上流のタイムアウトと「自分が詰まっている」が
  呼び手から区別できなくなる。**429 は待てば通るという意味**で、503（故障）に倒さない
- **`dialect` を 8 プロファイルに限定する** —— `db/<db>/` の写しが Kotlin 側にできる

#### 申し送り

- **11-2b の入口は `SuggestionSource` の実装 1 本。** それが入った瞬間に `capabilities.ai` が
  env 次第で true になり、AI が実際に動きはじめる。**`op` の enum 8 語と `keyType` の 4 語が
  `js/io/ai/suggestion.ts` と一致していること**をスキーマ側で確かめること
- **タイムアウトと `effort` の既定値、費用の実測**は 11-2b。`AiProperties` に足す
- **`js/io.ts` の `check()` に `case 429`、`locale` に `http429`** は 11-3（配線と同じ PR）
- **上流の 429 を自分の 429 に写す**のも 11-2b（`AiRateLimitedException` の受け皿は既にある）
- **`AiContractTest` の `CountingStub` は 11-2b でも使える** —— 実装が入っても
  「上流を叩かないテスト」は要る（CI で実キーを使わない）

### 2026-08-24 HANDOVER §11「AI」段階11-2b —— 上流を実際に叩く

**§11 で初めて AI が動いた。** `SuggestionSource` の実装（`AnthropicSuggestionSource`）が入り、
env にキーとモデル名を置けば `POST /api/ai/review` が**実際の提案**を返す。
`docs/ARCHITECTURE.md` §8 はこれで全部実装済みになり、**残るのはフロントの配線だけ**（11-3 以降）。

正本は [issue #75](https://github.com/propagandist/grabado/issues/75)。フロントは 0 行。
server は 177 passed / 24 skipped（166 → 177。+11 はスキーマ検査）。

#### 決めたこと 1: スキーマは**手動の JSON Schema 定数**（クラスから導出しない）

Java SDK は POJO から schema を導出する口（`.outputConfig(Foo::class.java)`）も持つが、
使うと**提案の型が Kotlin に生まれる** —— 11-2a が避けた「patch の 8 op の union が
Kotlin と TypeScript の 2 か所に」が復活する。`OutputConfig.builder().format(JsonOutputFormat…)`
に定数を渡す形にした（決めたこと 1「スキーマを動的に組み立てない」とも一致）。

**Claude の JSON Schema サブセットは `anyOf` を受け付ける**ので、patch の 8 枝は
`op` の `const` で判別する形に書けた。`$defs` は使っていない（参照が 1 か所ずつしか無く、
1 枚読めば全部分かるほうが読みやすい大きさだった）。

**スキーマ自身の制約はテストで見る。** 全オブジェクトの `additionalProperties: false`・
数値/文字列長の制約を使っていないこと・再帰していないこと —— **違反は上流に投げるまで
分からない**ので、`ReviewSchemaTest` がスキーマを歩いて確かめる。

#### 決めたこと 2: **system は 1 つ固定**、`dialect` は user message に入れる

ルーブリックは 2 つある（`postgresql` はフル判定、他 7 本は DB 非依存）。**dialect ごとに
system を切り替えるとプレフィックスが割れて prompt caching が 1 度も効かない**（決めたこと 8）。
system に両方を置き、**どちらを当てるかは user message の `dialect` が決める**形にした。

**実測でこの判断が正しかったことが確かめられた** —— 下の台帳のとおり 4741 トークンが
キャッシュに乗り、2 回目以降は毎回それが効いている。

#### 決めたこと 3: 上流の 429 は**自分の 429 に写す**。例外の中身は 1 バイトも出さない

`RateLimitException` だけを捕まえて `AiRateLimitedException`（429）にし、それ以外と
タイムアウトは `AiUpstreamException`（503）。**待てば通るものを故障に見せない**（5-3 から続く
status の使い分け）。

**SDK の例外 message を body にもログにも出さない。** URL・ヘッダ・リクエストの断片を含みうる
（org security-baseline §5.2「エラー応答に鍵の一部を含める」）。出すのは**例外の型名だけ**。

#### 決めたこと 4: `effort` の既定は**空のまま**（上流に任せる）

実測（下の台帳）で `effort` 未指定のまま十分な質の指摘が返ったので、**既定値を置かない**。
モデル名と同じ理由 —— 置いた瞬間にそれが焼き込みになる。env（`GRABADO_AI_EFFORT`）で
差せる形だけ用意し、**値が不正なら起動時に落とす**（黙って別の深さで走らせると費用が
理由なく動く）。

`timeout` は **120 秒**にした。実測の応答時間が 18〜35 秒で、**4 倍の余裕**がある。
SDK 既定の 10 分は公開プロダクトのリクエストとしては長すぎる（決めたこと 9）。

#### 費用の実測（2026-08-24 / `claude-opus-5` / `effort` 未指定 / 2 テーブルの設計）

**単価は $5 / $25 per MTok**（cache write = 入力の 1.25 倍、cache read = 0.1 倍）。

| | input | output | cacheWrite | cacheRead | 概算 |
|---|---|---|---|---|---|
| 初回 | 327 | 1808 | 4741 | 0 | **$0.076** |
| 2 回目以降 | 327 | 1600〜2200 | 0 | 4741 | **$0.049** |
| 小さい設計（1 テーブル） | 114 | 1211 | 0 | 4741 | $0.033 |

- **prompt caching は効いた。** レンダリング順が `tools` → `system` → `messages` なので、
  **system（ルーブリック）だけでなく structured outputs のスキーマも同じ prefix に入る**
  —— 4741 トークンはその合計。system だけなら 1024 トークンの最小長に届かなかった可能性がある
- **入力側の費用は 84% 減**（$0.0253 → $0.0040）。**ただし全体では 30% 減にとどまる** ——
  **費用の 92% は出力側**。決めたこと 9 の「`effort` がコストの主要な変数」が数字で裏づいた
- **1 リクエスト ≈ $0.05（約 7.5 円）。** 公開デモを READONLY 一択にした判断（2026-08-15）の
  裏づけ —— 1 日 1,000 リクエストで $50/日、月 $1,500 になる
- 応答時間は **18〜35 秒**（4 回の実測）。`timeout` 120 秒はここから決めた
- 5 回叩いて**合計 $0.26**（約 40 円）

#### 提案の質（同じ実測から）

house 既定から外れた 2 テーブルの設計（単数形・INTEGER の PK・監査列なし・`MONEY`・`JSON`・
PK 無しのテーブル・宣言の無い FK・`VARCHAR(50)`）に **16 件**（error 4 / warn 10 / info 2）。
**仕込んだ逸脱を過不足なく指摘した**うえ、`patch` はすべて 8 op の内側だった ——
**スキーマが効いていることの実測**。

気づいたことが 2 つ。

- **日本語の出力に他言語の語が 1 度だけ混じった**（「JSON 型は текст をそのまま保持する」）。
  16 件中 1 件で、指摘の中身は正しい。**表示は 11-4 の責任**で、
  security-baseline §5.2 の「モデルの出力を HTML としてレンダリングしない」がここに掛かる
- **`missing_audit` が `created_at` と `updated_at` で 2 件に割れた**（同じテーブルに対して）。
  ルーブリックは「同じことを 2 度書かない」と書いているが割れる。一覧では隣り合うので実害は
  小さく、**プロンプトを足して抑えにいかない**（1 バイト動かすとキャッシュが無効になる）

#### テスト —— +11 本、実 API は opt-in

- **`ReviewSchemaTest`（11 本・既定で走る）** —— スキーマの語彙が `js/io/ai/suggestion.ts` と
  一致すること（`op` 8 / `keyType` 4 / `category` 7 / `severity` 3）・**`drop-table` が
  スキーマに存在しないこと**・スキーマ自身が Claude のサブセットに収まっていること
- **`AnthropicIntegrationTest`（3 本・opt-in）** —— `ANTHROPIC_API_KEY` と
  `GRABADO_IT_AI_MODEL` が無ければ丸ごと skip（`PostgresCatalogIntegrationTest` と同じ形）。
  **返ってきた提案を `--info` で人が読める**ようにしてある —— 形はアサーションで見られるが、
  中身が意味のある指摘かは読むしかない

**`AiContractTest` のスタブに `@Primary` が要るようになった** —— main に実装が入って
`SuggestionSource` の Bean が 2 つになったため。**本物を除外する形は採らない**
（除外すると「本物が居ても契約が保たれる」ことが試されなくなる）。

#### 却下した案

- **POJO から schema を導出する** —— 決めたこと 1
- **dialect ごとに system を切り替える** —— prompt caching が死ぬ
- **実 API を CI で叩く** —— 実キーと課金が要る（PR ごとに $0.05 が出る）
- **`effort` に既定値を置く** —— モデル名と同じ焼き込み。実測で未指定のまま十分だった
- **モデル出力を検証する層を自前で足す** —— 形の保証は structured outputs が持つ。
  二重に置くと「スキーマが効いていない」ことに気づけなくなる
- **プロンプトを足して重複指摘を抑える** —— 1 バイト動かすとキャッシュが無効になる。
  実害の小さい揺れのためにそれをやらない

#### 申し送り

- **11-3（送信と受け取り）へ。** `aiRequestVersion: 1` の構築器（`js/io/ai/request.ts`）と
  送信前プレビュー、`check()` の `case 429`、`locale` の `http429`
- **11-4 は「モデルの出力を HTML として描画しない」** —— security-baseline §5.2。
  `rationale` は AI が書いた自由文で、実測でも他言語の語が混じった
- **`GRABADO_IT_AI_EFFORT` で `effort` を差して測り直せる。** 費用の 92% が出力側なので、
  ここを下げるのが効く。**測ったら台帳に追記する**（元の行は消さない）
- **スキーマを 1 バイトでも動かすと上流のキャッシュ（24 時間）が無効になる。** 語彙を足す
  ときは 11-1 の `suggestion.ts` と同じ PR で動かすこと（`ReviewSchemaTest` が赤くなる）

### 2026-08-24 HANDOVER §11「AI」段階11-3 —— 送信と受け取り

**画面から AI レビューが実行できるようになった。** ボタンを押すと**送るバイト列がそのまま
textarea に出て**、承諾すると `POST /api/ai/review` が飛び、返った提案が一覧になる。
**まだ 1 件も適用しない**（review-first ＝ CLAUDE.md 制約7。承認して当てるのは 11-4）。

正本は [issue #77](https://github.com/propagandist/grabado/issues/77)。
`npm test` 529 → **551**、`test:browser` 189 → **191**、**golden 114 本は無差分**。

#### 決めたこと 1: **整形した JSON をそのまま送る**（プレビューと 1 バイトも違わせない）

11-0 の決めたこと 3 は「匿名化を既定にしない」代わりの担保として**送信前プレビュー**を挙げていた。
その担保が成り立つのは「**見せているものと送るものが同じ**」ときだけなので、compact を送って
整形版を見せる形は採らない。**textarea に出した文字列がそのまま body になる。**

代償は入力トークンが 1.5 倍ほどになること。11-2b の実測で**入力側は費用の 8%**（出力が 92%）と
分かっているので、読めることのほうが価値が高い。

#### 決めたこと 2: 送信 JSON に **`size`** を足した（§8.2 の更新）

11-2b の実測で `VARCHAR(50)` に対する指摘（「業務上の長さ制約が読み取れない」）が返り、
**サイズが判定に効く**ことが分かった。型名に括弧を含める形は採らない —— モデルが `size` を
別に持つので、写像が素直なほうを選んだ。

**空のものは送らない**（コメント・サイズ・既定値・参照）。費用が自社負担なので、意味を持たない
バイトを毎回運ばない。**`nullable` だけは false も情報**なので常に送る。

#### 決めたこと 3: **429 の受け皿をこの PR で入れた**

11-2a が「フロントが呼ばないので到達経路が無い」として意図的に先送りした分。**配線と同じ PR で
`check()` の `case 429` と `locale` の `http429` を足す**のが 5-1c / 5-3 / 5-4a で 3 回効いた
規律で、ここが**その回収**にあたる。

#### 決めたこと 4: 翻訳は**足すが訳さない**（`http429` は 21 言語とも英語）

`http429` は**全 21 言語で `Too Many Requests`**。既存の `http*` は `ja.xml` でも英語のままで、
ここだけ訳すと不揃いになる（まとめた翻訳は §6.4 の仕上げ）。一方、新しいボタン系
（`aireview` / `aireviewconfirm` / `aireviewbroken`）は **en と ja を訳し、残る 19 言語は英語** ——
`outputdblabel`（6-10b）や `clientorm`（6-9d）が既にその形。

#### 決めたこと 5: 見せ方は **textarea 経路**、AI の出力を HTML にしない

新しい UI 語彙を増やさない（11-0 の決めたこと 3）。6-10b の変換注記・5-7b の import 注記に続く
**3 つ目の注記**で、整形は `js/io/ai/notice.ts` の純関数。

★ **`rationale` はモデルが書いた自由文**なので、**HTML として描画しない**
（org security-baseline §5.2 が「崩れる変更」として名指ししている）。11-2b の実測で
日本語の出力に他言語の語が混じった例もある。**同じ制約が 11-4 の適用 UI にも掛かる。**

提案は**重い順**に並べる（安定ソート）。設計の順に並べると error が info に埋もれる。

#### テスト —— +22 本、golden は 0 本

- **`tests/node/ai-request.test.ts`（15 本）** —— 送る形と見せ方の純関数。**座標・`formatVersion`・
  `db` を送らない**こと・型が SQL 名に解決されること・**同じモデルから同じバイト列**が出ること
  （§8.5 の結果キャッシュの鍵が安定する条件）
- **`tests/node/io-ui.test.ts` の AI の describe（7 本）** —— **断ったら 1 バイトも送らない**こと・
  **送った body が見せたものと一致する**こと・429 の文言・`capabilities.ai` の反映（冪等）
- **`tests/browser/io-ui.spec.ts`（2 本）** —— ボタンが実在しラベルが locale から入ること・
  `capabilities.ai` で押せる押せないが切り替わること

仮想 backend に `setAiReview(body, status)` を足した。**既定は 403**（キーもモデル名も無い
デプロイが既定の姿）。**パスの先頭が `api/` なら backend 側**として振り分ける ——
`/api/ai/review` は `?action=` の形を取らないので、`backend/` の判定だけでは fs 読みに落ちる
（実装中に踏んだ）。

#### 却下した案

- **提案をその場で適用する** —— 11-4 の担当。review-first は「見てから当てる」ことそのもの
- **compact を送って整形版をプレビューする** —— 決めたこと 1
- **プレビューを新しいダイアログにする** —— textarea には既に 3 つの出力が通っている
- **`http429` を 21 言語ぶん訳す** —— 既存の `http*` が ja でも英語で、ここだけ訳すと不揃いになる
- **`capabilities.ai` が引けないときボタンを隠す** —— 5-5 の「引けなければ全部できるに倒す」に反する

#### 申し送り

- **11-4（review-first の適用 UI）へ。** 1 件ずつ承認して 11-1 の `applyPatch` に渡す。
  差分の見せ方と、**`rationale` を HTML にしない**こと（§5.2）
- **`PatchRejection.kind` の locale（11 語）は 11-4** —— 適用が始めて初めて文言が要る
- **`aireviewconfirm` の文面は 2 言語だけ訳してある。** 残り 19 言語と `http*` の未訳は §6.4
- **送信 JSON に何を足すかは費用に直結する。** 入力は費用の 8% だが、足すほど prompt caching の
  外側が増える（キャッシュされるのは system ＋ スキーマで、user message は毎回全額）

### 2026-08-24 HANDOVER §11「AI」段階11-4 —— review-first の適用 UI

**一覧と適用が繋がった。** 提案に 1 始まりの番号が振られ、`all` か `1,3,5` を打つと
11-1 の決定論パスに合流する。**§11 で「AI の提案が設計に反映される」のはこれが初めて。**

正本は [issue #79](https://github.com/propagandist/grabado/issues/79)。
`npm test` 551 → **566**、`test:browser` 191（本数は不変）、**golden 114 本は無差分**。

#### 決めたこと 1: **textarea 一本**（新しい画面を作らない）

11-0 が「見せ方は新しい UI 語彙を増やさない」と決めており、textarea には既に 4 つの出力が
通っている（DDL / ORM の変換注記・import 注記・提案一覧）。**5 つ目**として適用結果を載せた。

却下したのはチェックボックスのダイアログ（新しい画面が 1 枚増える）と 1 件ずつの `confirm`
（**提案は 16 件規模** —— 11-2b の実測 —— なので 16 回聞かれる）。

#### 決めたこと 2: **undo を作らない。「保存していない」と毎回書く**

**grabado に undo は無い**（実測）。だが正本は git 管理のファイルで、**`save` するまで
1 バイトも変わらない** —— 気に入らなければ保存せず読み直せば戻る。**それが undo の代わり**に
なっていることを、適用結果の 1 枚が毎回書く。

**自動保存は採らない。** 保存は人が決める（制約2）。undo の無い設計で自動保存は最も危ない。

#### 決めたこと 3: 当てる順は **一覧の順**（打った順ではない）

`applyPatches` は配列順の畳み込みで**後の patch は前の結果を見る**（11-1）。`3,1` と打っても
一覧の順（severity の重い順）に当てる —— **打った順で結果が変わるのは説明できない**。
`parseSelection` は範囲外と重複を黙って捨て、何が当たったかは結果の 1 枚が 1 件ずつ出す。

#### 決めたこと 4: 落ちた理由は **locale の 11 語**。整形は翻訳関数を引数に取る

`js/io/` は locale を通せない（§5.6 規約3）ので、`applyNotice` は `translate` を引数で受ける
—— `ddl/naming.ts` の `IdentifierIssue` を `js/row.ts` が `_()` に通すのと同じ形で、
**純関数のままテストできる**（恒等関数を渡す）。11 語は en / ja を訳し、残り 19 言語は英語。

#### 実装中に踏んだこと

**ハーネスに `setPrompt` を足したら既存テストと衝突した。** `io-ui.test.ts` は 7 箇所で
`h.window.prompt = () => "shop"` と**直接上書き**しており、後から差し替えた側が勝つ。
harness の口を増やすのをやめ、**既存の流儀（直接上書き）に揃えた** ——
新しい口を作る前に、同じことをしている場所を探すほうが先だった。

#### テスト —— +15 本

- **`ai-request.test.ts`（+9）** —— 番号の選択（`all` / 区切り / 範囲外 / 重複 /
  **入力順ではなく一覧の順**）、適用結果の整形（当てた・見送った・**保存していないと書く**）、
  一覧の番号が重い順に振られること
- **`io-ui.test.ts` の適用 describe（+6）** —— **設計が実際に変わる**こと・**save が 1 度も
  飛ばない**こと・落ちた理由が locale の語で出ること・番号で選べること・断ったら触らないこと

#### 却下した案

- **チェックボックスのダイアログ** / **1 件ずつ `confirm`** —— 決めたこと 1
- **適用前に差分をプレビューする** —— review は 11-3 の一覧で済んでいる。二重に見せると
  「どちらを読めばいいか」が増える
- **適用したら自動で保存する** —— 決めたこと 2
- **`rationale` を HTML で装飾する** —— モデルが書いた自由文（org security-baseline §5.2）

#### 申し送り

- **§11 は 11-5 で閉じる** —— 実 API の E2E（5-9 と同じ形。実キーが要るので既定では走らせない）
- **`aiapplyprompt` などの文面は en / ja だけ。** 残り 19 言語と `http*` の未訳は §6.4
- **適用したあとに再レビューすると番号が変わる。** 一覧は毎回振り直すので、**古い一覧の番号で
  当てない**こと（`aiSuggestions` は表示のたびに上書きしている）

### 2026-08-24 HANDOVER §11「AI」段階11-5 —— 実 API の E2E と §11 を閉じる

**§11 が閉じた。** ブラウザ（実 XHR）→ Vite dev proxy → Kotlin → Anthropic が通しで動き、
`HANDOVER.md` §11 に到達点の注記が入った（5-9 が §5 でやったのと同じ形）。

正本は [issue #81](https://github.com/propagandist/grabado/issues/81)。

#### この 1 本が**欠陥を 2 つ捕まえた**

5-9 が「契約表も仮想 backend も実 HTTP を 1 バイトも流していない」と書いた隙間に、
**単体テストが全部緑のまま 2 つ落ちていた**。

1. **Vite の proxy が `/api` を転送していなかった**（11-3 の漏れ）。`npm run dev` 経由では
   `/api/ai/review` が backend に届かない —— **仮想 backend は proxy を通らない**ので、
   `io-ui.test.ts` の 7 本は緑のままだった
2. **`@RequestBody ByteArray` がブラウザの `Content-Type: application/json` に 415 を返した**。
   契約表のケースは Content-Type を送っておらず（JDK `HttpClient` の既定）、`AiContractTest` は
   通っていた。**実ブラウザだけが送るヘッダ**で落ちる形

2 つとも「宣言した契約（生バイトをそのまま受ける）と実装がずれていた」もので、
**E2E でしか出ない種類**。1 を直し、2 は `HttpServletRequest` から直に読む形にして、
**契約表に `contentType` つきのケース**（`ai-review-json-content-type`）を足した。

#### 決めたこと: env はコマンド行に書かない

backend の起動に `--grabado.ai.api-key=` を渡すと**プロセス一覧に鍵が出る**
（org security-baseline §5.2）。`playwright.server.config.ts` の `webServer.env` で透過する。

E2E は **`ANTHROPIC_API_KEY` ＋ `GRABADO_IT_AI_MODEL` が無ければ skip**（11-2b と同じ形）。
既定の `npm run test:server` は 5 本が走り、AI の 1 本は skipped と出る ——
**「たまたま走らなかった」ではなく「意図して走らせていない」がテスト結果に出る**。

#### §11 の振り返り（11-0 〜 11-5）

**6 段階・PR 6 本・約 1 日。** 出力が決定論でなく、外部への送信と自社負担の費用を伴う節を、
**フロント 0 行の帯**（5-x の型）で刻んだ。

| 段階 | 入ったもの | フロント |
|---|---|---|
| 11-0 | 契約の確定と分割（**実装 0 行**） | — |
| 11-1 | `js/io/ai/` の適用の純関数（57 本） | 触らない |
| 11-2a | `POST /api/ai/review` の契約とスタブ | 0 行 |
| 11-2b | 上流を叩く実装・structured outputs・**費用の実測** | 0 行 |
| 11-3 | 送信と受け取り（プレビュー・429） | 配線 |
| 11-4 | review-first の適用 UI | 適用 UI |
| 11-5 | 実 HTTP の E2E と §11 を閉じる | — |

**効いた判断を 4 つ。**

- **「実装が無いなら使えない」を構造で保証した**（11-2a）。main に `SuggestionSource` の実装を
  置かなかったので、11-2b が入るまで `capabilities.ai` は false のままだった ——
  **固定応答が本番に載る事故が原理的に起きない**
- **形式で潰す**（11-0 の決めたこと 6 → 11-2b のスキーマ）。`op` を 8 語の `enum` に閉じたので
  **`drop-table` は生成できない**。プロンプトインジェクション（設計のコメントは introspection
  経由で外部 DB から来うる）の受け皿もここ
- **型の写しを 2 言語に作らなかった**（11-2a の決めたこと 2）。提案も送信 JSON も backend では
  `JsonNode` のまま扱い、patch の union は TypeScript 側だけが持つ。**依存も 1 本増えなかった**
- **決定論が 3 か所で効いた**（制約3）。ETag（5-4）・結果キャッシュ（11-2b）・送信バイト列
  （11-3）—— どれも「同じモデルから同じバイト列」に乗っている

**golden 114 本は §11 の全段階で 1 バイトも動いていない。** AI を足しても DDL / ORM / JSON の
出力は 1 ビットも変わらない —— §7 の特性化テストが制約1 の実体として働いた。

**実測値**（2026-08-24 / `claude-opus-5`）: 1 リクエスト ≒ **$0.05**、応答 18〜35 秒、
prompt caching で入力側 84% 減（全体では 30% 減。**費用の 92% は出力側**）。
house 既定から外れた 2 テーブルに 16 件の指摘。

#### 申し送り

- **§11 の次は HANDOVER §9 の順序で §2（Docker）** —— マルチステージ Docker と
  READONLY の公開デモ。**AI は公開デモで落ちる 3 つの副作用の 1 つ**（2026-08-15 の決定）
- **§6 には 6-9f（Drizzle）と §6.4 の仕上げが残っている**（locale の未訳もそこ）
- **org の security-baseline の分類見直しは 3 本目の根拠が増えた** —— §11 は「外部ホストへの
  送信」「秘密（API キー）の保持」に加え、**§5.2「AI を組み込むとき」が分類にかかわらず
  掛かる**節を丸ごと引き込んでいる
- **費用の監視は入れていない。** 上限（レート制限・入力サイズ）はサーバが持つが、
  **使った総額を数える仕組みは無い**。自社のローカル運用では env にキーを置く人が
  API コンソールで見るのが実際的だが、**公開する形が変われば要る**

### 2026-08-24 HANDOVER §2「配布」段階2-0 —— 契約を確定し、§2 を分割する

§11 は 11-5 で閉じ、HANDOVER §9 の順序では残りが **§2（Docker）と §6.4 の 2 つ**。§2 が先で、
着手の前提（特性化テストが緑・golden 114 本が動いていない）は満たしている。

**本段階は文書だけで、実装は 0 行**（6-0 が §6 を、5-0 が §5 を、11-0 が §11 を分割したのと
同じ位置づけ）。正本は [issue #83](https://github.com/propagandist/grabado/issues/83)。

**契約の正は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §9「配布とイメージ」**（§7 が
Kotlin backend の、§8 が AI proxy の到達点を持つのと同じ形で、**枠を予約**した）。中身は
2-1 以降が埋める。

#### §2 は 1 行も進んでいない（2026-08-24 実測）

- `Dockerfile` は upstream 由来の **busybox httpd 11 行**（`COPY . .` でリポジトリをそのまま配る）
- `.dockerignore` は **4 行**（`Dockerfile` / `.dockerignore` / `.gitignore` / `.git`）
- `compose.yaml` も `.env.example` も**無い**（`.gitignore` は `!.env.example` を予約済み）
- `server/src/main/resources/static/` が無く、**フロント dist が jar に入る経路が 1 本も無い**
- `.github/dependabot.yml` に `docker` の entry が**無い**

**制約5「配布は Docker・DB レス既定」だけが、まだ実体を持っていない。** §4（IO）・§5（backend）・
§6（機能）・§11（AI）はすべて動くものになったが、**それを配る形が upstream のまま止まっている**。
具体的に困るのは 3 つ。

1. **イメージが起動しない。** `index.html` は `/src/main.ts` を読むので、素の静的サーバで
   ルートを配るだけでは動かない（`README.md` の「Docker Installation」に「現在このイメージは
   動かない」と書いてある）
2. **`.env` がイメージに焼かれる。** `.dockerignore` が除外していないので、`COPY . .` すれば
   手元の `.env`（Anthropic の実キーが平文で入っている）がそのまま層に残る。制約5「秘密は
   イメージに焼かず env 注入」と org security-baseline §2.1 に正面から反する。**git には
   入っていない**（`.gitignore` 済み）が、イメージには入る
3. **CSP の宿題が返せない。** `SecurityHeadersFilter.kt` が「`index.html` にインライン
   スクリプトがあり、Vite ビルド後の inline 資産を棚卸ししないと `unsafe-inline` 付きの
   見せかけの CSP になる。**フロント dist を同梱する §2 の仕事**」と書き残している

#### なぜ先に文書だけの段階を置くのか

**§2 は「配信を変える」節で、org の 2 正本が同時に掛かる** —— security-baseline（§2.1 秘密 /
§3.5 XSS / §3.9 クリックジャッキング / §4.1 ウェブサーバ / §5.1 供給網）と ci-strategy
（枠は org 全体で共有）。**先に線引きしないと、後段 6 本の PR の形が段ごとに揺れる。**

#### 決めたこと 1: 配置は**ルート維持**のまま Docker 化し、`frontend/` 集約は §2 の最後に置く

`js/` の `frontend/` への集約は **4 か所で §2 に予約されている**（段階3-1 / 4-0a / 4-1a / 5-0）。
**予約は守るが、Docker と同じ diff に混ぜない。**

- **マルチステージに集約は要らない** —— COPY のパスを合わせれば済む
- 動くのは vite root・`tests/support/fixtures.ts` のパス定数・`playwright.config.ts`・
  `.gitattributes` の glob。**大移動と新規作成を同じ diff に混ぜない**のは、5-0 が `server/` を
  新設したときに下したのと同じ判断
- 集約段階（2-6）の成功判定は **golden 114 本が 1 バイトも動かないこと**。Docker が動いたあとなら、
  これを単独で賭けられる

#### 決めたこと 2: dist を static へ入れるのは **Dockerfile の COPY**。Gradle タスクにしない

- Gradle タスクにすると、手元の `./gradlew bootJar` が **Node のビルドを要求する**。開発時の
  2 プロセス（`npm run dev` の proxy ＋ `bootRun`）と `npm run test:server` が壊れる
- `build.gradle.kts` の `archiveFileName = "grabado.jar"` は「Dockerfile の COPY をワイルドカードに
  しないため」と書いてあり、**既にこの形のために置かれている**
- 代償: **手元の jar には static が入らない。** だから**イメージの検証はイメージでやる**（2-4）

#### 決めたこと 3: ベースイメージは **digest でピン**し、Dependabot に `docker` を足す

タグだけでは同じ Dockerfile から違うものが入る（org security-baseline §5.1）。**ピンは
Dependabot とセットで初めて安全**で、凍結したまま放置すると浮動タグより悪い ——
`.github/dependabot.yml` の entry を 2-1 の同じ PR で足す。

#### 決めたこと 4: `.dockerignore` は**許可リスト**にする（全部を無視してから `!` で戻す）

上の「困ること 2」を、除外漏れではなく**構造で**潰す。**11-0 の「形式で潰す」と同型**
（`op` を 8 語の enum に閉じたので `drop-table` は生成できない、という形）。

拒否リストのままだと、**秘密を持つファイルが増えるたびに `.dockerignore` を直す義務が生まれる**
——直し忘れは静かに起き、イメージの層に残ってから気づく。許可リストなら、**足し忘れは
「ビルドが落ちる」という気づける失敗**になる。

**記法そのものは 2-1 が実測して決める** —— `*` と `**` ではマッチする範囲が違い、
**親ディレクトリを除外したままだと配下の `!` が効かない**。方針を 2-0 が決め、実体は 2-1。

#### 決めたこと 5: **イメージはレジストリで配らない**

ユーザー判断。Dockerfile を置くだけで、**イメージは各自が build する**。
`docker run ghcr.io/…` は提供しない。

- **分類は B のまま**（org security-baseline §1）。publish した日に**分類 P（実行物を配る）**へ
  載り、§5.3.2 の責務 —— チェックサムを配る・ドラフトを経て公開する・**焼き込んだものの版が
  成果物の側から読める**・配った後に直して届ける経路がある —— を引き受けることになる
- **§2 の完了がレジストリ設定に依存しなくなる。** 公開デモの外側を #84 に外したのと同じ理由で、
  リポジトリの外側の状態に完了条件を持たせない
- **したくなった時点で別 issue。** 「まだ決めていない」ではなく「**決めて外した**」として
  ここに記録する（org security-baseline §4.2 の CAA と同じ扱い）

#### 決めたこと 6: 公開デモは「**READONLY イメージが正しく動くこと**」まで

同じイメージが `READONLY=true` で保存 403・introspection と AI が無効になることを E2E で
固めるところまでが §2。**ドメイン取得・TLS・CAA・HSTS・課金は別軸**なので §2 から外し、
[issue #84](https://github.com/propagandist/grabado/issues/84) に判断ごと預けた。

#### 決めたこと 7: CI は **ci-heavy 型の別ワークフロー**（paths 絞り）＋ 週次 cron

`ci-frontend.yml` が「1 分を大きく超える検査（**§2 の Docker ビルド**）が入るのは後段なので、
そのときに ci-heavy 型の別ワークフローへ出す」と予告している。ベースイメージの CVE は
**コード変更なしで状況が変わる層**なので週次 `schedule`。判断規約は org の ci-strategy
（**中身をここへ写さない**）。

#### §2 の分割

5-x / 11-x で効いた「**フロント 0 行の帯**」を作る分け方にした。

| 段階 | 内容 | フロント |
|---|---|---|
| **2-0** | 契約を確定し、§2 を分割する（**実装 0 行**）＝ 本段階 | — |
| **2-1** | **マルチステージ Dockerfile と `.dockerignore`** —— 3 ステージ・digest ピン・非 root・Dependabot の `docker` entry。イメージが起動し、**1 プロセスで static と API を配る** | 0 行 |
| **2-2** | **CSP と配信ヘッダ** —— dist の inline を棚卸しし、`SecurityHeadersFilter` の宿題を返す | `style` 属性 2 か所のみ |
| **2-3** | **compose と env** —— `compose.yaml`・`.env.example`・mount・READONLY・README の起動手順を実物に合わせる | 0 行 |
| **2-4** | **イメージの E2E** —— コンテナを起こして通しで叩く（5-9 / 11-5 と同じ形）＋ READONLY の確認 | 0 行 |
| **2-5** | **CI** —— ci-heavy 型の Docker ビルド検査（paths 絞り）と週次 CVE cron | 0 行 |
| **2-6** | **`frontend/` 集約と §2 を閉じる** —— golden 114 本の無差分が成功判定 | 大移動（挙動不変） |

**2-1 が大きければ 2-1a（ビルドが通る）/ 2-1b（起動して配る）に割る** —— 5-1b / 5-1c・
11-2a / 11-2b と同じ判断で、**実測が要る部分と骨格を混ぜない**。

**2-4 を 2-5 より先に置く理由**は 11-1 を 11-2 の前に置いたのと同じ。**CI に載せる前に手元で
通ることを確かめる** —— 載せてから直すと、**org 共有の枠を使いながらデバッグする**ことになる。

#### CSP の棚卸しは軽い（2-2 の前倒し実測）

- `index.html` のインラインスクリプトは **0 本**（`<script type="module" src="/src/main.ts">` の
  1 行だけ）。`SecurityHeadersFilter.kt` のコメントが言う「インラインスクリプトがある」は、
  **段階3 段階1 で Vite に載せた時点で解消していた**
- 残るのは `style="width: 60%"` / `"width: 40%"` の **2 か所**。CSS へ移せば
  `style-src 'unsafe-inline'` を外せる（描画エンジンが触るのは CSSOM で、CSP に掛からない）
- **Vite ビルド後の inline 資産だけが未実測**で、そこは 2-2 が測る

#### 却下した案

- **2-0 を飛ばして 2-1 から始める** —— §2 は配信を変える節で org の 2 正本が同時に掛かる。
  6-0 / 5-0 / 11-0 が置かれたのと同じ理由
- **`frontend/` 集約を Docker と同じ段階でやる**（HANDOVER §2.2 の骨格どおりのパスにしてから
  Dockerfile を書く）—— 大移動と新規作成が同じ diff に混ざり、「挙動不変」を証明できなくなる
- **`frontend/` 集約をやめ、ルート維持を確定させる** —— 4 か所の予約を撤回することになる。
  Docker が動いたあとなら単独 PR で golden 無差分を成功判定にできるので、撤回する理由が無い
- **dist の同梱を Gradle タスクにする** —— 手元の `bootJar` が Node のビルドを要求し、
  開発時の 2 プロセスと `npm run test:server` が壊れる
- **公開デモの実配備まで §2 に入れる** —— ドメイン・TLS・CAA・課金は別軸。「イメージが
  READONLY で正しいこと」と「それをどこに置くか」は分けられる
- **CI を足さない／週次 cron だけ置く** —— 壊れたイメージが develop に載る期間ができる
- **CSP を 2-1 に含める** —— 「イメージが起動すること」と「何を配ってよいか」は別の問題

#### 申し送り

- **★ リポジトリはまだ private**（2026-08-24 実測 `gh repo view`）。**目的は無料 OSS 公開**
  （CLAUDE.md の冒頭）なのに、**public 化の判断はどこにも記録されていない**。決めたこと 7 にも
  効く —— org ci-strategy §1 で **public の標準ランナーは org の枠を消費しない**ので、public に
  した日に **2-5 の判断（paths 絞り・週次 cron）の前提が変わる**
- **`.env` に Anthropic の実キーが平文で入っている**（git 管理外）。2-1 の `.dockerignore` が
  構造で塞ぐまで、**`COPY . .` を書けばイメージに残る**
- **§6 には 6-9f（Drizzle）と §6.4 の仕上げが残っている**（locale の未訳もそこ）。§9 の順序では §2 の次
- **公開デモの外側は #84**（置き場所・TLS・CAA・HSTS・費用）。§2 の完了後に着手する。
  **#84 は `grabado.dev` を「取得済みかどうか確認していない」と書いているが、HANDOVER の冒頭は
  「取得済み」としている**（2026-08-09 の記述）—— **確かめ先が 1 つある**
- **busybox `Dockerfile` は upstream 資産の表にまだ行が無い。** 実際に置き換える 2-1 で、
  他の行と同じ「撤去済み」の形で足す

### 2026-08-25 HANDOVER §2「配布」段階2-1 —— マルチステージ Dockerfile と `.dockerignore`

正本は [issue #86](https://github.com/propagandist/grabado/issues/86)。**フロントは 0 行**
（2-0 の分割表どおり）。契約は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §9 で、
**2-0 が予約した枠を実測で埋めた**。

#### イメージが動くようになった（2026-08-25 実測）

`docker build` が通り、**単一プロセスが 8080 で static と API の両方を配る**。

- 起動ログに `Adding welcome page: class path resource [static/index.html]`
  —— **フロント dist が jar の classpath に入った**
- **284MB / 8 層。** runtime に残るのは `grabado.jar` 1 本で、Node も Gradle も JDK も入らない
- `/` が 200（`text/html`）、`/db/postgresql/datatypes.xml` が 200、`/locale/en.xml` が 200
  —— `viteStaticCopy` の 3 ディレクトリが dist ごと届いている
- `?action=list` が JSON、`?action=capabilities` が
  `{"readonly":false,"introspection":false,"ai":false}`、save が **mount 先に実ファイルを書いた**
- `READONLY=true` では save / import が **403**、`list` は生きている（読み取りビューアが成立する）
- **非 root**（`uid=100(grabado)`）

#### 決めたこと 1: ランタイムを **Java 25 LTS** へ上げる（ユーザー判断）

HANDOVER §2.2 が「**版は着手時に最新 LTS 確認**」と書いており、その着手時が今日だった。
**手元（`jvmToolchain`）/ CI（`setup-java`）/ イメージ（`eclipse-temurin:25-*`）の 3 つを同時に
動かす** —— イメージだけ動かすと、同じソースから 3 種類のビルドが出る。

- **Kotlin 2.4.10 / Gradle 9.7.1 / Spring Boot 4.1.1 は `allWarningsAsErrors = true` のまま通った。**
  実装は 1 行も直していない
- **foojay-resolver は入れない** —— ビルド時に外部から取得するものを増やすのは org
  security-baseline §5.1 の崩れる変更。手元の Gradle は `~/.gradle/jdks` にあった JDK 25 を
  auto-detection で拾った

#### 決めたこと 2: `.dockerignore` は**許可リスト**（2-0 の決めたこと 4 の実体）

記法の実測 —— **`*` で全部を無視してから `!` で戻す**。`*` は**ドット始まりにもマッチする**ので
`.env` も `.git` も落ちる。**`server/` を丸ごと戻すとビルド出力（`build` / `.gradle` / `.kotlin` /
`bin`）まで入る**ので、後段で削り直す（**後勝ち**）。

効果は層のサイズに出た —— **`COPY . .` が運ぶのは 1.6MB**（`docker history`）。`npm ci` が作る
`node_modules` の 175MB は**ステージの中で生まれるだけ**でビルド文脈には無い。

**★ 2-0 の記述を訂正する（元の記述は消さない）。** 2-0 は「`COPY . .` すれば手元の `.env` が
**そのまま層に残る**」と書いたが、**マルチステージでは中間ステージが最終イメージに含まれない**
ので、配るイメージには残らない。実際に残るのは**ビルド文脈・ビルドキャッシュ・中間層**で、
漏れるのは `docker save` やキャッシュのエクスポート、あるいは **web ステージから最終へ COPY を
足した日**。**許可リストが要る理由は変わらないが、理由の書き方が不正確だった。**

#### 決めたこと 3: `RUN sh ./gradlew` と書く

**実行ビットはホストの OS 次第**（git 上は 100755 だが、Windows のチェックアウトでは落ちる）。
`sh` 経由なら**同じ Dockerfile がどこでビルドされても同じように動く**。

#### 決めたこと 4: 非 root で走らせる

`/data/schema` は **save が書く先**なので、`RUN` で先に作って所有権を渡す。
**Docker Desktop for Windows の bind mount では書けた**（実測）。**Linux ホストの uid 合わせは
2-3 の README** —— ここで書くと起動手順の正本が 2 か所になる。

#### 決めたこと 5: `cooldown` を **4 entry すべて**に付けた（ユーザー判断）

2-0 は `docker` entry を足すことしか見ていなかったが、**既存 3 entry（`github-actions` /
`gradle` / `npm`）が `cooldown` を 1 つも持っていなかった**（2026-08-25 実測）。org
security-baseline §5.1 は「Dependabot の `cooldown` を外す」を**崩れる変更**に挙げている。
`default-days: 7` を 4 本とも。**差分は数行**で、`docker` を足す PR の中で閉じられる。

#### ★ 実測で分かったこと: Java を上げると E2E が PATH の java で落ちる

**`npm run test:server` が `UnsupportedClassVersionError`（class file version 69.0 に対して
65.0 まで）で落ちた。** `playwright.server.config.ts` が `java -jar` を **PATH の java** で
起こしていて、それが JDK 21 だったため。**Gradle は toolchain 25 を自分で見つけるのに、E2E だけ
PATH に頼っていた** —— この非対称が、版を上げた日に初めて牙を剥いた。

直し方は**構造で潰す側**を選んだ。`bootJar` の `finalizedBy` で
`server/build/java-launcher.txt` に**ビルドに使った launcher の絶対パス**を書き、config が
それを読む（無ければ PATH の `java` に倒す）。**開発機の `JAVA_HOME` が何であれ jar が起きる。**

**手元の全系統を回していなければ気づかなかった** —— `./gradlew build` は緑、フロントの 4 系統も
緑で、落ちたのは 5 番目（実 HTTP の E2E）だけだった。

#### 却下した案

- **Java 21 のままにする** —— HANDOVER §2.2 が「着手時に最新 LTS 確認」と書いており、確認した
  結果 25 が LTS。ここで見送ると、次に版を触る契機が §2 の外まで来ない
- **`jvmToolchain` は 21 のままイメージだけ 25 で走らせる** —— 同じソースから 3 種類のビルドが出る
- **バイトコードだけ 21 に落として toolchain を 25 にする** —— 「手元・CI・イメージを同じ版に
  揃える」という理屈と合わない
- **`JAVA_HOME` を切り替えるよう開発者に求める（文書だけで直す）** —— 踏むたびに時間を溶かす。
  このリポジトリは**構造で潰す**側を選んできた（許可リスト・8 語の enum・SSRF 不可能化）
- **foojay-resolver で JDK を自動取得する** —— ビルド時に外部から取得するものを増やす（§5.1）
- **`COPY` を明示列挙して `.dockerignore` を軽くする** —— **配るものの正本が 2 か所になる**
- **`.dockerignore` を拒否リストのまま増やす** —— 秘密を持つファイルが増えるたびに直す義務が
  生まれ、直し忘れは静かに起きる
- **`cooldown` を `docker` だけに付ける / 4 本まとめて別 issue にする** —— 前者は設定が不揃いの
  まま残り、後者は §5.1 への追随が先送りになる
- **HEALTHCHECK・イメージの E2E・`compose.yaml` を入れる** —— 2-4 / 2-3 の担当。**CI に載せる
  前に手元で通ることを確かめる**順序を崩さない
- **レジストリへ publish する** —— 2-0 で**決めて外した**（分類 P に載ると §5.3.2 の責務を
  引き受ける）

#### 申し送り

- **★ 手元に JDK 25 が要るようになった。** `docs/TESTING.md` の「要 JDK」3 か所を 25 にした。
  **JDK が無い環境では Gradle が落ちる**（auto-download は有効だが、解決プラグインが無いので
  実際には落とせない）
- **`server/build/java-launcher.txt` は `build/` の中**なので `.gitignore` 済み。
  **`bootJar` を走らせない限り生まれない**
- **CSP はまだ無い**（2-2）。`SecurityHeadersFilter` の宿題は返っていない
- **`compose.yaml` / `.env.example` / mount と env の説明は 2-3。** README には build と run の
  3 行だけ入れた
- **イメージの E2E は 2-4。** いま緑にしたのは**手で叩いた結果**で、自動化されていない ——
  **この段階のあいだ、イメージが壊れても誰も気づかない**
- **CI で Docker ビルドは回っていない**（2-5）。`ci-server.yml` の `setup-java` は 25 にしたので、
  **本 PR の CI が Java 25 の初回実走**になる
- **Linux ホストの bind mount は未実測**（uid の合わせ方は 2-3）
- **jar と最終イメージの digest は再現した**（`build.gradle.kts` にタスクを 1 本足しただけの
  再ビルドで `sha256:9a63bc…` が一致した）。**Spring Boot の `bootJar` がエントリの timestamp を
  固定している**ためと見られるが、**確かめたのは「一致した」ことまで**。イメージの再現性を
  当てにするなら 2-4 / 2-5 で測り直すこと
- **`cooldown` が Dependabot に受理されるかは未実測。** 設定の構文検証は GitHub 側でしか
  走らない —— マージ後に Insights → Dependency graph → Dependabot でエラーが出ていないか見る
- **リポジトリはまだ private**（2-0 の申し送りのまま。public 化の判断はどこにも記録されていない）

---

### 2026-08-25 HANDOVER §2「配布」段階2-2 —— CSP と配信ヘッダ

正本は [issue #89](https://github.com/propagandist/grabado/issues/89)。契約は
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §9.4 で、**2-0 が予約し 2-1 が残した最後の枠**を
実測で埋めた。**フロントも動いた**（2-0 の分割表は「`style` 属性 2 か所のみ」と見込んでいたが、
着手前の実測で `eval` が 1 か所見つかった。下の★）。

#### CSP が付いた（2026-08-25 実測）

イメージに `curl -sSI` を向け、**4 経路すべてに 5 本そろっていた** —— `/`（200 `text/html`）、
存在しないパス（**404**）、`/backend/file/?action=list`（200）、`/assets/index-*.js`（200）。

- **`script-src` を 1 つも緩めていない。** `'unsafe-inline'` も `'unsafe-eval'` も無い
- **404 の本文に内部情報が無い** —— `timestamp` / `status` / `error` / `path` だけで、
  stacktrace も message も出ない（Spring Boot の既定。org security-baseline §4.1）
- **エラー応答でも落ちない**ことを Kotlin 側のテストにも入れた（org security-verification
  §1.2 の★「ヘッダが落ちるのは、たいてい正常系ではない経路」）
- **golden 114 本は 1 バイトも動いていない**

#### 決めたこと 1: `eval` は JSON へ移して撤去する（ユーザー判断）

`setCookie` は `encodeURIComponent(JSON.stringify(obj))` で書き、`getCookie` は
**`JSON.parse` を試し、失敗したら旧 `{k:'v'}` パーサに倒す**。呼び出し側（`getOption` /
`setOption`）は 1 行も触っていない。

- **既存の cookie を読める。** 旧書式パーサは**読むだけ**で、次の保存で JSON になる
- **値のエスケープの弱さが同時に消える** —— 旧書式は `p + ":'" + v + "'"` の生連結で、
  `pattern` オプション（ユーザーがテキスト入力できる）に `'` や `,` を入れると読み戻しが
  壊れていた。**eval を消すだけの置き換えでは、この弱さは残る**

#### 決めたこと 2: cookie に `SameSite=Lax` を付けた（ユーザー判断）

**#89 の対象範囲には無かった** —— 書き換える同じ 1 行で済み、org security-baseline §3.6 /
§4.3 の観点に沿う。認証には使っていない cookie なので**挙動は変わらない**。

#### 決めたこと 3: CSP の骨格は `default-src 'none'` から開ける（ユーザー判断）

org の実測例（cartera）は `default-src 'self'` だが、こちらは**使う先だけを明示で開ける**形にした。

- **worker / manifest / media / frame は 1 つも使っていない。** 増えた日に「違反として
  気づける失敗」になる —— **11-0 の「形式で潰す」・2-1 の許可リストと同型**
- 開けたのは `script-src` / `style-src` / `img-src` / `connect-src` の 4 つと、`default-src` に
  落ちない 3 つ（`base-uri` / `form-action` / `frame-ancestors`）

#### 決めたこと 4: CSP の正本は Kotlin、`vite preview` はその写し

`vite.config.ts` の `preview.headers` が同じ値を持ち、`tests/node/csp.test.ts` が Kotlin ソースを
読んで**ずれを赤くする**（既存イディオムは `type-mapping.test.ts` と `workarounds.test.ts`）。

**写しを許す理由**は、Spring だけが出す形にすると CSP 下の動作をブラウザで確かめる手段が
**イメージ E2E（2-4）まで無い**こと —— 2-1 の申し送りが挙げた「壊れても誰も気づかない期間」が
そのまま空く。**dev server には出さない**（HMR が inline script を使う）。

#### 決めたこと 5: `img-src` の `data:` は許可し、`style-src` の `data:` は構造で潰す

`assetsInlineLimit: 0` で `styles/print.css` の inline 化（`data:text/css` の `<link>`）を止めた。
残る `data:` は `img-src` だけ —— throbber（`index.html` にベタ書き）と material-inspired の svg
（CSS ソースに元からある）で、**外すには upstream 資産を 2 つ作り替える**ことになる。
**奪取の経路は大半が `script-src` 側**（org security-baseline §3.5）なので防御は成立する。

#### ★ 実測で分かったこと 1: 2-0 の見込みが 1 つ外れていた（`eval` が残っていた）

`js/wwwsqldesigner.ts` の cookie 読み取りに `eval` が 1 か所。コメントは
「**§4 の IO 移植で消える**」と書いていたが、**§4 は 4-6 まで終わったのに消えなかった** ——
設計データの経路ではなく**設定の永続化**だったので、IO の移植では通らなかった。

**「あとで消える」と書いたものは、消える段階の担当範囲に入っていない限り消えない。**

#### ★ 実測で分かったこと 2: CSP 違反の検出が本物か確かめた

`tests/dist/smoke.spec.ts` の console 監視は「**常に緑**」でも同じ見た目になる。
`img-src` から `data:` を一時的に外して回したところ、**6 本中 5 本が赤くなった**
（material-inspired の svg が違反になり、`afterEach` が拾った）。**戻して緑に戻ることも確認した。**

#### ★ 実測で分かったこと 3: 目視の受け入れ基準 2 つを機械に落とせた

#89 は「DevTools を開いたまま主要画面を一巡」「旧形式の cookie を仕込んで開く」を
**目視でしか確かめられないもの**として挙げていたが、どちらも書けた。

- `tests/dist/smoke.spec.ts` に**一巡**（テーブル追加 → 行 → キー → テーマ切り替え → DDL 出力 →
  ダウンロード → localStorage の保存/読込）。経路の入口は既存テストから借りている
- `tests/node/options-cookie.test.ts` に**旧書式の読み取り**と、記号を含む値の往復

**残る目視は「人の目で見て壊れていないか」だけ**になった（機械は違反の有無しか見ない）。

#### ★ 実測で分かったこと 4: 「書いてはいけない形」はコメントにも書けない

`tests/node/forbidden-api.test.ts` は**コメントの中も数える**。除外規則（コメントを剥がす）を
持たないほうが壊れないと判断したので、`js/wwwsqldesigner.ts` の説明コメントのほうを
**その形を書かずに説明する**書き方へ直した。**縛りが文章の書き方に及ぶ**のは想定内。

#### 却下した案

- **`eval` を残し `script-src 'unsafe-eval'` を付ける** —— org security-baseline §3.5 が
  名指しする「実質的な無効化」。入れる意味が無い
- **`eval` を旧書式パーサへ置き換えるだけ（書式は不変）** —— 差分は最小だが、**値の
  エスケープの弱さが残る**
- **cookie をやめて localStorage へ移す** —— 編集ストアの話（制約2 の DB レス）とは別軸で、
  2-2 が背負う理由が無い
- **CSP の正本を中立ファイル（`server/src/main/resources/security-headers.json`）にする**
  —— 正本は 1 つになるが、`vite.config.ts` が `server/` の中を読む越境と、Kotlin 側に
  起動時読み込みの失敗モードが増える。突き合わせは既存イディオムで書ける
- **Spring だけが CSP を出す（`vite preview` には出さない）** —— 手元のブラウザで確かめられず、
  2-2〜2-4 のあいだ CSP 下で壊れても誰も気づかない
- **`img-src` から `data:` を外す** —— upstream 資産の作り替えが CSP の PR に混ざる
- **dev server にも CSP を出す** —— HMR が inline script を使うので `'unsafe-inline'` が要り、
  「本番と同じヘッダ」でなくなる
- **`innerHTML` の棚卸しまで含める** —— 24 か所前後あり、CSP の PR が膨らむ
- **`forbidden-api.test.ts` でコメントを除外する** —— 除外規則を持った瞬間、**規則の穴が
  縛りの穴**になる。書かずに説明するほうが安い
- **`Cache-Control` を 2-2 に入れる** —— 「配信ヘッダ」ではあるが**守る値の話ではない**。
  2-4 でヘッダを E2E に固定するときに比較対象が増えるだけ（下の申し送り）
- **HSTS を入れる** —— 公開デモの外側（#84）。ローカルは `http://localhost:8080` で動く
- **イメージ E2E の自動化をここでやる** —— 2-4 の担当。**CI に載せる前に手元で通ることを
  確かめる**順序を崩さない

#### 申し送り

- **★ `innerHTML` は 24 か所残っている**（2026-08-25 実測）。多くは locale の `_()` 展開だが、
  **テーブル名・行名・キー名を通す経路がある**（`js/keymanager.ts` / `js/row.ts`）。
  CSP はこれを直接は防がない（inline event handler の実行は止まる）。棚卸しは別段階
- **`Cache-Control` は 1 つも出していない**（2026-08-25 実測）。ハッシュ付き `assets/` は
  immutable、`index.html` は no-cache が素直だが、**ローカルのコンテナでは実害が薄い**ので
  入れていない。入れるなら 2-4 のイメージ E2E と同じ PR が自然
- **イメージのヘッダを見たのは手で叩いた `curl` だけ。** 自動化は 2-4 ——
  **この段階のあいだ、イメージのヘッダが落ちても誰も気づかない**（機械が見ているのは
  `vite preview` と Spring のテストまで）
- **`SameSite` は機械で見ていない。** `document.cookie` から属性は読めず、jsdom でも同じ
  （org security-verification §2.2 が `Secure` について書いているのと同じ型の穴）
- **リポジトリはまだ private**（2-0 / 2-1 の申し送りのまま。public 化の判断はどこにも
  記録されていない）
- **`throbber.gif` と `print.css` が dist で実ファイルになった**（`assetsInlineLimit: 0` の
  副作用）。**リクエストが 2 本増える**が、同一プロセスが配るので影響は測っていない

### 2026-08-26 HANDOVER §2「配布」段階2-3 —— compose と env

正本は [issue #91](https://github.com/propagandist/grabado/issues/91)。契約は
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §9.3 / §9.5 で、**2-0 が予約した最後の 2 枠**を
実測で埋めた。**フロントは 0 行**（分割表どおり）。

#### compose で起きた（2026-08-26 実測）

`docker compose up -d --build` の 1 行で起き、healthcheck が **51 秒で `healthy`**。

| 確かめたこと | 結果 |
|---|---|
| `/` | 200 ＋ **ヘッダ 5 本**（2-2 の回帰） |
| `?action=list` / `?action=capabilities` | 200 ／ `{"readonly":false,"introspection":false,"ai":false}` |
| `?action=save` | **201。ホストの `schema/` に実ファイルが出た** |
| `GRABADO_READONLY=true` | `save` / `import` が **403**、`list` / `load` は 200。**この条件でも `healthy`** |
| コンテナに渡った env | **`.env` が持つ 1 本だけ**（未設定の 11 本は渡らない） |

**READONLY でも healthy** なのは判定先に `capabilities` を選んだから —— **副作用が無く、
止めている条件でも 200 が返る唯一の口**。公開デモは READONLY 一択なので、ここを取り違えると
**公開デモだけが unhealthy になる**。

#### ★ 実測 1: 空文字の env は既定に倒れず、起動を落とす

`-e GRABADO_READONLY=` で **`APPLICATION FAILED TO START`** ——
`Failed to bind properties under 'grabado.readonly' to boolean` /
`A null value cannot be assigned to a primitive type`。

**これが起票時の判断を 1 つ差し替えた。** #91 は「**空が既定の env だけ**を `${VAR:-}` で
列挙する（4 本）」と書いていたが、**その 4 本に `GRABADO_READONLY` が入っていた** ——
書いたとおりに作れば、**素の `docker compose up` が起動しない**ものができていた。

#### 決めたこと 1: env は「キーだけ」のリスト形式で渡す（実測 1 を受けて）

`environment:` に `- GRABADO_READONLY` と**名前だけ**書く。**未設定なら `null` ＝
コンテナに渡らず**、`.env` に値があればその値が渡る（`docker compose config` と実起動の
両方で確認）。

- **空文字の事故が構造的に消える** —— 渡さないものは渡らない
- **既定値を compose へ写さずに済む** —— 正本は `application.yaml` の 1 か所のまま
- **12 本すべてを列挙できる** —— `${VAR:-}` だと Int / Duration の 8 本が空文字で落ちるので
  4 本しか書けなかった。**「`.env` に書けば効く」が全部の env で成り立つ**ようになった

#### 決めたこと 2: `env_file:` を使わない

手元の `.env` が持つキーは 3 本で、**2 本は grabado と無関係**（`GEMINI_API_KEY` /
`FONTAWESOME_NPM_AUTH_TOKEN`。2026-08-26 実測。値は見ていない）。`env_file` は
**ファイルの中身を丸ごとコンテナへ入れる**ので、無関係な秘密が同居する。

`.env` は **compose の変数展開にだけ**使われる —— この区別を `compose.yaml`・`.env.example`・
README の 3 か所に書いた。**「`.env` に書いたのに効かない」も「余計なものが入る」も、
どちらも起きない形**が要る。

#### 決めたこと 3: `schema/` をリポジトリに実在させる（ユーザー判断）

`.gitkeep` を置き、compose の既定 mount を `./schema:/data/schema` にした。
**無いと compose が root 所有で作り、非 root（uid=100）のコンテナが書けない。**
`README.md` と `Dockerfile` のコメントは前から `$PWD/schema` と書いていたので、
**書いてあるとおりに動く**ようになった。

#### 決めたこと 4: healthcheck は compose にだけ置く（ユーザー判断）

判定は busybox の `wget`（**イメージに `curl` は無い**。2026-08-26 実測）。
`start_period` は 60s —— **起動に 18 秒かかった**（同日実測・Docker Desktop for Windows）ので、
その 3 倍強を猶予にした。**actuator は入れない**（1 つの判定のために依存を増やさない）。

**Dockerfile の `HEALTHCHECK` は置いていない** —— 2-4 が E2E の待ち合わせに使うときに、
判定間隔と猶予を実測して決める。

#### 決めたこと 5: introspection の接続先は `.env.example` に載せない

**env の名前そのものが表のキーを持つ** —— `GRABADO_INTROSPECT_SOURCES_<名前>_URL` /
`_USER` / `_PASSWORD` / `_SCHEMA`。**relaxed binding が効くことを実測した**（`…_SHOP_URL` などを
渡すと `?action=capabilities` の `introspection` が `true` になった）。

**キーが設計ごとに違う**ので一覧には載せられない（載せれば env-contract テストが
「`application.yaml` に無い」と正しく赤くなる）。書式と例は `ARCHITECTURE.md` §7.3 に置き、
`.env.example` はそこを指すだけにした。

#### 3 つのファイルのずれをテストが赤くする

[`tests/node/env-contract.test.ts`](tests/node/env-contract.test.ts)（8 本）。正本は
`application.yaml`、写しは `.env.example` と `compose.yaml`。**見るのは名前の集合だけで、
値は見ない**（値の正本は `application.yaml` と docs）。

**検出が本物か確かめた**（2-2 で CSP にやったのと同じ手順）—— **4 通りにずらしてすべて赤くなり**、
戻して緑に戻った: `.env.example` から 1 行消す ／ compose の `environment` から 1 本消す ／
mount の右辺を変える ／ `${VAR:-}` 形式に戻す。

**CI の `paths` に 3 つ足した**（`application.yaml` / `compose.yaml` / `.env.example`）——
`ci-frontend.yml` の冒頭が「**テストが読む repo ルートのファイルを増やしたら、ここに足す
こと**」と書いているとおり。**足さなければ「`compose.yaml` だけを直した PR」で 1 本も
走らない** —— 「入力が変わらなければ出力も変わらない」で絞るには、**入力を漏らさない**ことが
要る（org `ci-strategy.md` §3 ①）。2-2 が `SecurityHeadersFilter.kt` を足したのと同じ判断。

#### ★ 実測 2: `curl` の `save` は `Content-Type` が要る

付けずに叩くと curl は `application/x-www-form-urlencoded` を送り、**Tomcat が
パラメータ解析で body を読み尽くす** —— **201 が返るのに 0 バイトのファイルが書かれた。**
フロントは [`frontend/js/io.ts`](frontend/js/io.ts) が `application/json` を明示しているので実運用では起きない。
**2-4 の E2E はこれを踏む。**

#### 申し送り

- **★ リポジトリはまだ private**（2-0 / 2-1 / 2-2 から続く）。**public 化は 2-4 の後・2-5 の前に
  独立の issue で決める**（ユーザー判断）—— public の標準ランナーは org の枠を消費しないので、
  **2-5 の CI 設計の前提が変わる**
- **Linux ホストの bind mount は 2-3 でも実測していない。** 手元が Docker Desktop for Windows の
  まま。README には**条件つきの予約**として書き、`ARCHITECTURE.md` §9.1 の「合わせ方は 2-3」には
  **訂正を追記した**（元の記述は消していない）
- **compose の起動を機械が見ていない。** 上の実測はすべて手で叩いたもので、**この段階のあいだ、
  compose が起動しなくなっても誰も気づかない**（2-4）
- **`Cache-Control` はまだ 1 つも出していない**（2-2 の申し送りのまま。入れるなら 2-4）
- **確かめたのは Docker 29.5.3 / Docker Compose v5.1.4**（2026-08-26 実測）。
  **古い `docker-compose` v1 では試していない**

### 2026-08-26 HANDOVER §2「配布」段階2-4 —— イメージの E2E と `Cache-Control`

正本は [issue #93](https://github.com/propagandist/grabado/issues/93)。契約は
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §9.4（`Cache-Control`）と §9.5（走らせ方と実測）。
**2-1 でイメージが動き、2-2 で CSP が付き、2-3 で compose が入ったが、どれも人が手で 1 回
叩いただけだった** —— それを機械が見るようになった段階。

#### 通った（2026-08-26 実測）

`npm run test:image` の 1 コマンドで **13 本が緑**（通常 8 ＋ READONLY 5）。

| 確かめたこと | 結果 |
|---|---|
| 所要 | **3.0 分**（フロントか backend を変えた場合）／ **35 秒**（変えていない場合） |
| READONLY への入れ替え | `up -d --wait` の再実行で **12.2 秒**（`Recreated` → `Healthy`） |
| 後片付け | `down` でコンテナもネットワークも残らない |

**35 秒で回る**のは `tests/` が `.dockerignore` の許可リストに入っていないから ——
**テストを直しただけならイメージは作り直されない。**

#### ★ 実測 1: **保存のたびに CSP 違反が 2 件出ていた**（この段階の最大の収穫）

最初の実行が「保存」のテストで赤くなった。`Applying inline style violates … 'style-src 'self''`。
**機能は壊れていない**（保存はできていた）が、**CSP 下で操作するたびに console にエラーが出続けていた。**

追い方も記録しておく（**推測では 3 回外した**）:

1. `console` の `location()` は **`:0:0`** で役に立たない
2. ブラウザ側の `securitypolicyviolation` イベントで `style-src-attr` / `sample` は空 と判明
3. `Element.prototype.setAttribute` と `innerHTML` の setter にフックを仕掛けたが **1 度も通らない**
4. **CDP の `Log.entryAdded`** が `stackTrace` を持っていて、`Request.a.onreadystatechange` の
   1 フレームだけを指した —— そこは `r.xml ? a.responseXML : a.responseText`

**原因は [`frontend/js/io.ts`](frontend/js/io.ts) の `sendSave` が応答を `xml: true` で受けていたこと。**
save が返すのは **201 ＋ 空 body で `Content-Type` も付かない**ので、`responseXML` は
**null にしかならない** —— にもかかわらず、**読むだけで Chrome が空の応答に HTML パーサを当て**、
違反が 2 件出る。同じ XHR で `responseText` を読めば **0 件**（切り分けを実測で確認）。

`saveresponse()` は第 1 引数を使っていないので、**`xml: true` を外して失われる情報は無い**。
段階4-3b が load から、5-7b が import から外したのと同じ整理で、**XML を実際に読むのは
locale と datatypes だけ**になった。

**なぜ 2-2 で見つからなかったか** —— `vite preview` には backend が無く（save の経路が動かない）、
2-2 がイメージに向けたのは `curl` だけで、**CSP はブラウザにしか出ない**
（org security-verification §1.2）。**既存のどの系統からも見えない位置**にあった。
11-5 が `vite.config.ts` の proxy の漏れを捕まえたのと同じ形で、**通しでしか出ないもの**。

#### ★ 実測 2: `docker compose up --wait` は healthy まで待つ

`Container … Waiting` → `Healthy` が出る（Compose v5.1.4）。**これで 2-3 が預けた宿題に
答えが出た** —— 下の決めたこと 2。

#### 決めたこと 1: `Cache-Control` は**経路別**にし、共通の 5 本には入れない（ユーザー判断）

2-2 の申し送り「入れるなら 2-4 のイメージ E2E と同じ PR が自然」を回収した。値は 3 通りで、
**規則の正本は `SecurityHeadersFilter.cacheControlFor`**（表は `ARCHITECTURE.md` §9.4）。

- **`HEADERS`（全応答共通）に入れない** —— 経路別を表せないうえ、入れると
  `vite.config.ts` の `preview.headers` へ写す義務が生まれる（`csp.test.ts` が突き合わせている）。
  **静的サーバの固定ヘッダでは経路別を表現できない**ので、**写しを増やさない側**を選んだ
- **知らない経路は `no-cache` へ倒す** —— 前綴りに 1 文字でも足りなければ落ちる側へ寄せる。
  黙って `immutable` になると**1 年間ブラウザに焼き付く**
- **★ 段階2-3 まで 1 本も出していなかった**（実測）。Spring Boot は
  `spring.web.resources.cache` を設定しない限り静的資源にも何も付けない
- **★ `no-cache` は 304 で返る** —— 静的資産は `Last-Modified` を持つ（`ETag` は無い。実測）

#### 決めたこと 2: `Dockerfile` の `HEALTHCHECK` は**置かない**（ユーザー判断。**決めて外す**）

待ち合わせは `--wait` ＝ compose の healthcheck で足りる（実測 2）。
**判定間隔と猶予の正本を 2 か所に増やさない。** 2-0 が「レジストリで配らない」を
**決めて外した**のと同じ扱いで、必要になった時点で別 issue。

#### 決めたこと 3: READONLY は**同じ compose を env 違いで起こし直す**（ユーザー判断）

Playwright の project 依存で `image` → `readonly-setup` → `image-readonly` と直列にした。

- **ビルドは 1 回**のまま、**両方の条件で compose 経路を機械が通る**（2-3 の申し送りを塞ぐ）
- **READONLY でも healthy** であることが `--wait` の成功として同時に証明される ——
  判定先が `?action=capabilities`（**副作用が無く、止めている条件でも 200 が返る唯一の口**）
  であることの裏づけでもある。ここを取り違えると**公開デモだけが unhealthy になる**

#### 決めたこと 4: 正本ディレクトリ `schema/` にテストを書かせない

mount 左辺だけを差し替える override（`compose.e2e.yaml`）を足し、
`tests/tmp-image-schema/` へ逃がした（`tests/tmp-schema/` と同じ形）。
**`compose.yaml` は 1 行も触らない** —— 配布の形をテストの都合で曲げないため。

**★ override の `volumes` は同じ target で置換される**（2026-08-26 実測。
`docker compose config` で確認。2 本にはならない）。

#### 決めたこと 5: 手元の `.env` を E2E から切り離す

`--env-file tests/image/e2e.env`（空のファイル）を渡し、`compose.ts` が
`GRABADO_READONLY` / `ANTHROPIC_API_KEY` など 5 本を**プロセス env から落としてから**起こす。

**理由は 2-3 の実測そのもの** —— compose の `environment:` は「キーだけ」形式なので
**シェルや `.env` に値があれば渡る**。手元の `.env` に鍵があるだけで
`?action=capabilities` の期待値が人によって変わり、`GRABADO_READONLY` が残っていれば
**通常モードの一巡が丸ごと readonly になる**。

#### 決めたこと 6: Playwright の `webServer` を使わない

`webServer` は終了時にプロセスを木ごと kill するので、**Windows ではコンテナが残りうる**。
`globalSetup` / `globalTeardown` で `up` / `down` を呼ぶ形にして、
**docker のライフサイクルは docker のコマンドで閉じる**。

#### 検出が本物か確かめた（#89 / #91 と同じ手順）

**3 通りに壊して、狙ったテストだけが赤くなり、戻して緑に戻った。**

| 壊し方 | 赤くなったもの |
|---|---|
| `Referrer-Policy` を 1 本落とす | 「セキュリティヘッダ 5 本が 4 経路すべてに付く」だけ |
| `/assets/` の `Cache-Control` を `no-cache` にする | 「`Cache-Control` が経路別に出る」だけ |
| `GRABADO_READONLY` を渡さない | READONLY の 3 本（capabilities / 403 / ボタン） |

`xml: true` に戻すと `tests/node/io-ui.test.ts` が赤くなることも確認した（**安いほうの受け皿**。
実際に違反が出ないことを見るのはブラウザだけ）。

**★ この確認そのものが 1 本のテストの欠陥を暴いた。** 「403 のあともファイルは 1 バイトも
変わらない」を独立したテストにしていたが、**READONLY を渡さずに回しても緑のまま**だった ——
直前のテストが失敗すると **Playwright が worker を作り直し、`beforeAll` が種ファイルを復元する**。
**順序に意味があるアサーションは、順序が保証される場所（同じテストの中）に置く。**

#### 却下した案

- **`Dockerfile` に `HEALTHCHECK` を置く** —— 判定間隔と猶予の正本が 2 か所になる
- **READONLY を別ポートで同時に起こす** —— 速いが、**READONLY 側だけ compose を通らない**
- **`schema/` に直接書く** —— 正本ディレクトリをテストが汚す。消し忘れがコミットされる芽
- **`compose.yaml` の mount 左辺を変数化する** —— 配布の形をテスト都合で曲げ、
  `env-contract` の mount 検査（`split(":")[1]`）も壊れる
- **`Cache-Control` を `HEADERS` に入れる** —— 決めたこと 1
- **Playwright の `webServer` で `docker compose up`** —— 決めたこと 6
- **`xml: true` を残して CSP 側を緩める** —— `style-src` に `'unsafe-inline'` を足すのは
  org security-baseline §3.5 が名指しする実質的な無効化。**読んでいない値のために防御を捨てる**
- **CI に載せる** —— 2-5 の担当。**org 共有の枠を使いながらデバッグしない**
- **細かい契約をイメージ E2E で試す** —— 網羅は契約表と Kotlin 側が持つ（#69 / #81 と同じ方針）

#### 申し送り

- **★ リポジトリはまだ private**（2-0 / 2-1 / 2-2 / 2-3 から続く。**5 段階連続**）。
  **public 化は次の issue で決める** —— public の標準ランナーは org の枠を消費しないので、
  **2-5 の CI 設計の前提が変わる**
- **CI にはまだ載っていない**（2-5）。**この段階のあいだ、イメージが壊れても
  「手で `npm run test:image` を回した人」しか気づかない**
- **`innerHTML` は 24 か所残っている**（2-2 の申し送りのまま）。今回のフックで
  **保存の経路では 1 度も通らない**ことは分かったが、棚卸しはしていない
- **Linux ホストの bind mount は 2-4 でも実測していない**（2-1 / 2-3 から続く）。
  手元が Docker Desktop for Windows のまま。**E2E は uid が合っていることを見ているので、
  Linux で落ちるならこのテストが落ちる**
- **`--no-cache` のビルド時間は測っていない。** 上の 3.0 分はキャッシュが部分的に効いた値で、
  **CI（毎回まっさらな runner）の見積もりには使えない** —— 2-5 が測る

### 2026-08-26 リポジトリを public にする —— 公開面の棚卸しと README の書き換え

正本は [issue #95](https://github.com/propagandist/grabado/issues/95)。**段階に属さない**
（§2 の分割表 #83 に行が無い）。直前は 2-4（#93）、次は 2-5（CI）。**アプリのコードは 0 行**
——動いたのは README 2 本と文書 3 本、それと**リポジトリ設定**。

#### なぜここで止めたか

**「★ リポジトリはまだ private」は 2-0 / 2-1 / 2-2 / 2-3 / 2-4 の申し送りに 5 段階連続で書かれていた。**
`CLAUDE.md` の冒頭は「**目的 = 会社のブランディングとして無料公開する OSS**」と言うのに、
**public 化の判断はどこにも記録が無い**。しかも 2-5（CI）は**可視性で前提が変わる** ——
private なら Docker ビルド検査は org の枠を食い、**枠は既に超過して課金されている**
（2026-08 の org 実測: net $9.36）。**どちらの前提で設計するかが決まらない限り、2-5 が宙に浮く。**

#### ★ 実測 1: 履歴に秘密は無い（gitleaks 実走）

org `security-verification.md` §1.1 の 2 モードをそのまま回した。**手元に gitleaks は無いので
docker で走らせた**（`.env` を読ませないために `-v` はリポジトリだけに絞っている）:

```bash
docker run --rm -v "d:/projects/grabado:/repo" zricethezav/gitleaks:latest git /repo --no-banner --redact
docker run --rm -v "d:/projects/grabado:/repo" zricethezav/gitleaks:latest dir /repo --no-banner --redact
```

| モード | 検出 | 中身 |
|---|---:|---|
| **`git`（本命）** | **0 件** | `331 commits scanned` / `5.55 MB` / **52.2 秒** / `no leaks found` |
| `dir`（作業ツリー） | **3 件** | **3 件とも `/repo/.env`** —— `anthropic-api-key` 1 / `generic-api-key` 2（`GEMINI_API_KEY` と `FONTAWESOME_NPM_AUTH_TOKEN`）。**すべて git 管理外**（`git ls-files .env` も `git log --all -- .env` も空）で、`.dockerignore` の許可リストにも入っていない |

**★ `dir` の 3 件を「漏洩 3 件」と読まない。** `.gitignore` を無視してファイルシステムを走査するので、
**手元の `.env` を拾うのは設計どおり**（org の実走記録も同じ形）。**読み方を間違えると、本当の混入に
気づけなくなる。** 本命は `git` のほうで、そこが 0 だったので public 化の前提が立った。

#### 実測 2: 公開面の棚卸し（2026-08-26）

| 確かめたこと | 値 |
|---|---|
| 可視性 / 既定ブランチ | **`PRIVATE`** / **`main`**（実施前） |
| `develop` と `main` | develop が **83 コミット先行**。**main だけのコミットは 0**（`main` は `develop` の祖先） |
| 追跡ファイル | **442 本**。`dist` / `server/build` / `node_modules` は **0 本** |
| `npm audit`（**dev 込み**。分類 B なので `--omit=dev` は使わない） | **0 件**（critical〜info すべて 0） |
| `propagandist/.github` を指す箇所 | **10 箇所 / 5 ファイル**（`CLAUDE.md` 4・workflows 4・`dependabot.yml` 1・本書 1） |
| 「自社 / 社内 / 弊社 / 当社」 | **57 箇所 / 14 ファイル**。大半は本書（30）と `CLAUDE.md`（6）。コードは 8 箇所（すべてコメント） |
| メールアドレス・社内ドメイン | **0 件**。`Railway` は HANDOVER §2.3 と本書の決定ログだけ |
| 既存 issue #72〜#95 | **12 本。公開して困る記述は無い**（すべて設計判断の記録） |
| README のリンク | **相対リンク 40 本すべて実在**（機械確認） |

#### 決めたこと 1: README は英語 `README.md` ＋ 日本語 `README.ja.md`（ユーザー判断）

**公開の顔は英語**にし、**日本語版を併置**した。upstream の残骸 —— WWW SQL Designer の紹介文・
PayPal 寄付ボタン・**2012 年からの News 10 本**・`/js/*.js` を指す Code Style 表（**`js/` に `.js` は
1 本も無い**。段階3-3b で尽きた）—— は 2 本とも落ちている。

- **`CLAUDE.md` の「文章の値」に例外として記録した** ——「常体・日本語」の原則は変えず、
  **`README.md` だけが英語**。**2 本は同じ構成を保つ**（片方だけ直さない）
- **英語 README に「他の文書はすべて日本語」と明記**した。書いていなければ、`docs/` を開いた人が
  「訳が抜けている」と読む

#### 決めたこと 2: `docs/` の社内前提はそのまま公開する（ユーザー判断）

`HANDOVER.md` は §2.3 Railway・§6.2 / §6.3 の house 規約・§8 が**社内版前提のまま**で、
`CLAUDE.md` の冒頭がその齟齬を宣言している。**1 行も触らなかった。**

- **house 標準（Kotlin/Spring Boot・PG18・命名規約）は機密ではない**
- **HANDOVER は当時の判断の記録**でもあり、書き換えると「**なぜ変えたか**」が失われる
  （段階5-0 で「誤りの訂正と方針の改訂は別物」と決めたのと同じ扱い）

#### 決めたこと 3: 既定ブランチを `develop` にする（ユーザー判断）

**`main` を節目ごとに fast-forward で追う運用は、忘れた日に同じ問題が再発する。**
`main` は `develop` の祖先で **main だけのコミットは 0** なので、履歴を書き換えずに切り替えられる。

**★ 順序を `--default-branch develop` → `--visibility public` に固定した** ——
逆にすると、**83 コミット遅れた `main`（イメージが起動しない頃の状態）が公開トップに出る時間**ができる。

#### 決めたこと 4: 既定ブランチの変更を、この PR の**マージより前**に置く

#73 で分かった「`Closes` / `Fixes` が発火しない」は、**GitHub がキーワードで閉じるのは既定ブランチへの
マージのときだけ**という仕様の帰結だった。**既定を `develop` にしてからこの PR をマージすれば、
その場で観測できる。** #95 は「次の PR で確かめる」と予約していたが、**1 本早められる。**

**観測の結果は `CLAUDE.md` へ訂正として書く**（本記録の時点では**条件つきの予約**のまま）。

#### 決めたこと 5: ブランチ保護と GHAS は張らない。記述だけ訂正する

**可視性を変えることと、何を回すかは別。** ここで CI やスキャンを触ると、**2-5 の判断材料が先に
固まってしまう**（#95 の判断 5）。

- `docs/BRANCHING.md` の「**GitHub 側のブランチ保護は現行プラン（private リポ）で使えない**」は
  **public にした日に嘘になる**ので、**可視性で分かれるという事実に書き換えた**。
  **保護を実際に張るかは別 issue**、**hook は張ったあとも残す**（止める層が違う）
- 「Team 以上へのアップグレードが要る」も**誤りになる**ので同時に訂正した

#### 却下した案

- **public 化を延期する** —— 申し送りが 6 段階目に伸びるだけで、**2-5 が private 前提で固まり、
  public にした日に設計を見直す**ことになる
- **README を公開後に直す** —— **目的と食い違う状態が、公開の瞬間に必ず一度は表に出る**
- **棚卸しと実施を 2 本の issue に割る** —— 棚卸しの結論は「公開してよい／だめ」で、
  **実施と切り離すと合意が会話の中にしか無い時間ができる**
- **`main` を ff して既定を `main` のままにする** / **`main` 一本に統合して `develop` を畳む** ——
  決めたこと 3
- **org 規約の中身を README や `docs/` へ写す**（public 化で `propagandist/.github` を指す 10 箇所が
  外部から読めない URL になる）—— **写せばその日から正本が 2 つになる**
- **`index.html` の `<title>` を直す** —— 下の申し送り。**README の書き換えと同じ diff に混ぜない**
- **GHAS の有効化や CI ワークフローをここでやる** —— 決めたこと 5

#### ★ 実測 3: 実施の結果（2026-08-26。上の予約に対する追記）

**順序どおりに実行し、状態で確かめた**（この環境では git / gh の出力が混線するので、
成否はコマンドの出力ではなく `--json` の値で見る）。

| 手順 | 結果 |
|---|---|
| 1. `gh repo edit --default-branch develop`（**#96 のマージ前**） | `defaultBranchRef` = **`develop`**、可視性は `PRIVATE` のまま |
| 2. #96 を squash merge（**`--subject` を触らない**） | `develop` の先頭が **`docs: … (#96)`**。`(#N)` が付いた |
| 3. **`Closes` の観測**（決めたこと 4） | **★ 発火した。** #95 が **マージの 2 秒後に自動で CLOSED**（merged `12:22:54Z` → closed `12:22:56Z`） |
| 4. `gh repo edit --visibility public` | `visibility` = **`PUBLIC`** |
| 5. About 欄 | description 1 本 ＋ **topics 12 本**。**website は空のまま**（#84） |

**★ #73 の「`Closes` / `Fixes` は発火しない」は、既定が `main` だった頃の実測だった。**
**既定を `develop` にした日に解消した** —— `CLAUDE.md` の該当行を**元の実測を消さずに**訂正した。
**これで issue を手で閉じる運用が要らなくなる。**

#### 申し送り

- **`Closes` の観測は済んだ**（実測 3）。**`CLAUDE.md` の該当行は訂正済み** ——
  **以後は issue を手で閉じない**（PR 本文に `Closes` を書く）
- **★ `index.html` が upstream のまま** —— `<title>WWW SQL Designer</title>` と
  冒頭コメント（`(C) 2005-2015 Ondrej Zara` / `Version: 2.7`）。**ブラウザのタブに出る**ので
  公開の顔の一部だが、**#95 の対象範囲は README だった**。触ると golden にも当たるので**別 issue**
- **★ 週次 CVE cron は「置かない」側に倒れる見込み**（2-5 へ）—— org `security-verification.md` §0 は
  **分類 B に ③ 層を持ち込むな**と言う。#83 の決めたこと 5（**レジストリで配らない**）により
  **grabado は分類 B のまま**なので、P の条件つき例外には載らない。**2-5 で明示的に見直す**
- **public の標準ランナーは org の枠を消費しない** —— **2-5 の CI 設計はこの前提で組める**
- **`--no-cache` の Docker ビルド時間は未測定**（2-4 から続く）。**CI の見積もりに要る**
- **About 欄の website は空のまま** —— `grabado.dev` の取得状況が未確認（#84）

### 2026-08-26 HANDOVER §2「配布」段階2-5 —— CI に載せ、検査を 3 層へ割り当てる

正本は [issue #98](https://github.com/propagandist/grabado/issues/98)。契約は
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §9.6。**フロントと backend の実装は 0 行**
（動いたのはワークフロー 3 本・テスト基盤・リポジトリ設定・文書）。

**2-4 で 13 本になったイメージ E2E を機械の目に載せ**、2-0 から宙に浮いていた
**「週次 CVE cron を置くか」を決め切った**段階。

#### 通った（2026-08-26 実測。ubuntu-latest）

| ワークフロー | 所要 | 内訳 |
|---|---:|---|
| `ci-frontend` | **69〜85 秒** | **Chromium の取得 39（46%）** / vitest 11 / 実ブラウザ 12 / dist 5 / typecheck 3 / known-issues 3 / npm ci 3 |
| `ci-server` | **92〜107 秒** | `./gradlew build` 93 |
| `ci-image`（新設） | **131〜147 秒** | **イメージ build 78** / Chromium 24〜39 / 起動 6 / 13 本 11 |

**3 本は並列に走る**ので、**PR の待ち時間は最長の 131〜147 秒**（合計ではない）。

**★ 幅は 2 run の実測**（同じ内容で回した）。**ぶれているのは Chromium の取得だけ**（24 → 39 秒）で、
**イメージ build 78 秒・13 本 11 秒・E2E ステップ 96〜97 秒は 2 run とも動かない**。
**遅さの原因も、ぶれの原因も、同じダウンロード**にある —— 実測 2 の「キャッシュを足すなら
キーの設計から」は、**速度だけでなく再現性の話でもある**。

**★ `--no-cache` のビルド時間に答えが出た**（2-4 の申し送り）—— **78 秒**。runner は毎回まっさらで
レイヤキャッシュを持たないので、**この数字がそのまま `--no-cache` 相当**になる。**手元の 3.0 分より
速い**（Docker Desktop for Windows を通していないため）。起動も **6 秒**（手元は 18 秒。
`compose.yaml` の `start_period: 60s` は遅いほうに合わせてある）。

#### ★ 実測 1: **Linux ホストでは配布物が動かない**（この段階の最大の収穫）

**申し送りに 3 段階連続（2-1 / 2-3 / 2-4）で書かれていた「Linux ホストの bind mount は未実測」が、
CI に載せた初回の run で出た。** しかも**壊れ方が 2 方向ある**。

| # | 症状 | 原因 |
|---|---|---|
| 1 | **コンテナが起動しない** | イメージは非 root（uid 100）。mount 先は clone / テストを回した人の uid。`FileDesignStore` の起動時 fail-fast が `正本ディレクトリに書けない: /data/schema` で止める（**段階5-3 の設計が正しく働いた形**） |
| 2 | **書けたものをホストが読めない** | 原子的置換の `Files.createTempFile` が **POSIX 0600** で作る（umask ではなく明示的に）。`ATOMIC_MOVE` のあとも **600・uid 100 所有**のまま。ホスト側は `EACCES` |

**★ 2 のほうが重い。** 1 は fail-fast が止めてくれるが、**2 は 201 が返り、ファイルもできる** ——
**Linux ホストで保存した設計 JSON を、そのホストのユーザーが `git add` できない。**
**「正本は git 管理のファイル」（`CLAUDE.md` 制約2）を直接壊す。**

**Docker Desktop for Windows / macOS は所有権を偽装する**ので、**2-1 から 2-4 まで手元では
一度も踏まなかった**。**CI に載せたその日に出た**のが、この段階の値そのもの。

**追い方も記録しておく**（**CI の run を 3 回使った**）:

1. 初回の run が残したのは **`container … exited (1)` の 1 行だけ**。`--wait` は
   「healthy にならなかった」としか言わない
2. **`compose.ts` の `up()` に「落ちたらコンテナのログを出す」を足した** —— 次の run で
   `IllegalStateException: 正本ディレクトリに書けない` が出て、**1 往復で原因が確定**した。
   **落ちたときにしか走らない**ので、緑のときの出力は 1 行も増えない
3. mount 先を `chmod 0777` にしたら**起動はした**が、今度は **7 本目が `EACCES`** で落ちた
   （症状 2）。**片方を直すと、もう片方が出る形**だった

**配布物の側は [#103](https://github.com/propagandist/grabado/issues/103) に切り出した**
（下の決めたこと 5）。**README 2 本の「Linux ホストは未実測」は、実測されたので書き換えた** ——
「既知の不具合」として**症状 2 つと回避策**を書いてある。

#### ★ 実測 2: `ci-frontend` の 46% は Chromium の取得

`ci-frontend.yml` が「**ブラウザのキャッシュはまだ足さない。内訳は jobs API の `steps[]` で採る**」と
予告していた数字を採った —— **85 秒のうち 39 秒**。`ci-image` も同じものを 24〜39 秒払っている。
**2 run のあいだで動いたのはこのステップだけ**（build もテストも動かない）ので、
**ジョブ全体のぶれもここが作っている**。

**それでも足さない。** キャッシュのキーを Playwright の版に結び付け損ねると、
**古いブラウザのまま緑になる** —— **検査が静かに嘘をつく側の失敗**で、遅いよりも悪い。
**足すならキーの設計を先に決める別 issue で**（org `ci-strategy.md` §3③「高速化は最後」）。

#### ★ 実測 3: 有効化したその日に Dependabot が 3 本出した

**設定を入れた直後に `Dependabot Updates` が 3 回走り、#99 / #100 / #101 が開いた。**

| PR | 中身 | すぐ分かったこと |
|---|---|---|
| #99 | `node` 24-alpine → **26-alpine**（`Dockerfile`） | **`Dockerfile` 自身が「版は `ci-frontend.yml` の `node-version: 24` に揃える」と書いている** —— **そのままマージすると版がずれる** |
| #100 | frontend group 3 本 | **`ci-frontend` が赤**（この段階では中身を見ていない） |
| #101 | `com.anthropic:anthropic-java` 2.34.0 → 2.55.0 | —— |

**どれも 2-5 の対象外**（別 PR）だが、**「有効化すると何が起きるか」がその日に分かった**ので残す。

#### 決めたこと 1: ③ 層（週次 cron）は**置かない**。**ただし根拠を置き直す**

org `security-verification.md` §0 は「**分類 B/C/D/L に ③ を持ち込むな。① を導入時に 1 回 ＋
② で足りる**」と言い、grabado は **#83 の決めたこと 5（レジストリで配らない）により分類 B のまま**
なので、**P の条件つき例外には載らない**。

**★ ただし public 化で「枠」の根拠は消えた**（public の標準ランナーは org の 2,000 分を
消費しない）。**同じ結論を、別の根拠で立て直した** —— **cron でスキャンしても Dependabot
以上のことができない**（同 §3★★「develop 側の依存を週次で見ると Dependabot と二重になる」と同型）。

**根拠が消えたのに結論だけ残すと、次に読む人が判断に使えない。**

#### 決めたこと 2: 代わりに **GitHub 側の 0 分の層を 3 本**そろえる

**いずれも Actions を 1 分も使わない**（リポジトリ設定と、push 1 回につき 1 度のグラフ提出）。

| 時間で変わる層 | 何が見るか | 実施 |
|---|---|---|
| ベースイメージ | Dependabot `docker` entry（weekly。digest を書き換える） | **2-1 で入っていた** |
| 依存の CVE | version updates 4 entry ＋ **security updates** | **有効化した** |
| 秘密の混入 | **secret scanning ＋ push protection** | **有効化した** |

**実施前後**（状態で確認。この環境では `gh` の出力が混線するので値で見る。
確かめ方は `gh api repos/propagandist/grabado --jq .security_and_analysis`）

| 項目 | 前 | 後 |
|---|---|---|
| `dependabot_security_updates` | `disabled` | **`enabled`** |
| `secret_scanning` | `disabled` | **`enabled`** |
| `secret_scanning_push_protection` | `disabled` | **`enabled`** |
| `secret_scanning_non_provider_patterns` | `disabled` | **`disabled`（決めて外した）** |
| `secret_scanning_validity_checks` | `disabled` | **`disabled`（決めて外した）** |

- **★ Dependabot alerts は既に有効だった**（`GET /vulnerability-alerts` が **204**。
  `dependabot/alerts` は **0 件**）。**無効だったのは security updates だけ**で、
  **alerts があっても修正 PR は 1 本も出ない**状態だった。**「alerts が有効＝直る」ではない。**
- **★ `validity_checks` を外したのは軸が違うから** —— **検出した秘密をプロバイダへ送って
  有効性を確かめる**機能で、**外部へ出る先が増える**（org `legal-baseline.md` の軸）
- **★ `server/` には `deps-submit.yml` が要る。** **GitHub は `gradle.lockfile` を読めない**ので、
  解決済みグラフを渡さないと **CVE の修正 PR が `server/` には出ない**。
  `ci-server.yml` が「必要になったら置き換えること」と予告していた形をそのまま実装した ——
  **既定ブランチへの push かつ Gradle のファイルが変わったときだけ**（GitHub の
  「Automatic dependency submission」は**全ブランチの全 push で走る**ので使わない）

#### 決めたこと 3: CodeQL default setup は「**決めて外す**」

**public なので技術的には入る**（実測: `not-configured` / `runner_type: standard` / 言語 5 種を認識）。
それでも入れないのは、**§0 が分類 B に置く層は ① ＋ ② までだから**であって、枠の話ではない。
**「気づいても動く仕組みが無い検査」は org §4 の「守れていないのに緑が出る」に近づく。**

2-0 の決めたこと 5（レジストリ）・#93 の判断 2（`HEALTHCHECK`）と同じ扱いで、
**「まだ決めていない」ではなく「決めて外した」**として残す。
**再考の条件**: アラートを見る人と、出たときに何をするかが決まったとき。

#### 決めたこと 4: `ci-image` は **1 ジョブ**。paths の正本は `.dockerignore`

- **1 ジョブ** —— build → 起動 → 13 本は**直列依存**で、分けても切り分けやすくならない。
  課金はジョブ単位で 1 分未満切り上げなので、分けた本数ぶん損をするだけ
- **paths は `.dockerignore` の許可リスト**（＝ イメージに入るもの）＋ E2E 側の入力。
  **文書をまるごと入れない**／**config を一括で入れない**（この検査の入力は
  `vite.config.ts` と `playwright.image.config.ts` の 2 本だけ）
- **キャッシュを入れない**（実測 2）

#### 決めたこと 5: Linux の逃がし方は**テスト側に閉じ**、配布物は #103

`compose.e2e.linux.yaml` を足し、**Linux でだけコンテナをホストと同じ uid で走らせる**
（`compose.ts` が `process.platform` を見て 3 枚目に重ね、`TEST_UID` / `TEST_GID` を渡す）。
**実測 1 の 2 症状が同時に消える。**

- **`compose.yaml` も `compose.e2e.yaml` も 1 行も触らない** —— 配布の形をテストの都合で
  曲げない（#93 の判断 4）。**プラットフォーム差はプラットフォーム差の側に閉じる**
- **★ これはテストを通すための細工で、利用者の条件とは違う。この細工がある限り、E2E は
  その欠陥を捕まえない。** ファイルの冒頭・`compose.ts`・`TESTING.md` の 3 か所に書いた
- **#103 の案 B（compose で `user:` を指定）をテストだけで先行適用した形**なので、
  **その案が効くことの実測にもなっている**。残るのは「利用者に `export UID GID` を
  要求してよいか」の判断
- **CI を緑にすることと配布物の設計変更を同じ diff に混ぜない** —— 2-0 が
  「大移動と新規作成を同じ diff に混ぜない」と決めたのと同じ判断（ユーザー判断）

#### 決めたこと 6: 既存 2 本は **`on:` も steps も動かさず、訂正を追記**する

public 化で根拠が効かなくなった記述が 2 か所あった。**元の記述は判断の履歴なので消さない**
（org の作法。`CLAUDE.md` の `Closes` の行と同じ形）。

- `ci-frontend.yml`「**枠は org 全体で共有（2,000 分/月）で、枯らすと他リポジトリの本番
  デプロイまで止まる**」→ **public の標準ランナーは枠を消費しない**。**`paths` と
  `pull_request` 限定は維持する**（根拠が「入力が変わらなければ出力も変わらない」と
  待ち時間へ置き換わっただけ）
- `ci-server.yml`「Automatic dependency submission を有効にしない」→ **枠の根拠は消えたが
  結論は変わらない**。**予告が実体になった**ので、その行から `deps-submit.yml` を指す

#### 検出が本物か確かめた

**手元で完結する検査（① 層）は、壊して拾うことを確かめた。**

| 壊し方 | 拾ったもの |
|---|---|
| `deps-submit.yml` の `timeout-minutes` を `abc` にする | **actionlint 1.7.12** が `syntax-check` で拾い、戻すと 0 件（作業ツリーも無差分） |

**★ actionlint を手元で回したのは、`deps-submit.yml` が `develop` に入るまで一度も走らないから。**
org `ci-strategy.md` が「**workflow が invalid だと起動しないが、それは『枠が枯れて起動しない』と
区別がつかない**」と警告している位置にあたる。**① 層で塞ぐ**（**CI には足さない** —— 分類 B に
③ を持ち込まないのと同じ理由で、`zizmor` / `trivy` の類は cartera（分類 A）の話）。

**★ `ci-image` の中身は 2-4 が既に 3 通りの壊し方で確かめている**（`Referrer-Policy` を落とす /
`Cache-Control` を変える / `GRABADO_READONLY` を渡さない）ので、ここでは繰り返さない。

**★ paths が効くこと（起動契機の検出試験）は、この PR では確かめられない。**
**その理由自体を実測した**（2026-08-26）—— **`CLAUDE.md` だけを変えた push でも 3 本とも起動した**
（`CLAUDE.md` は 3 本のどの `paths` にも無い）。**`pull_request` の `paths` は「その push の差分」
ではなく「PR 全体の差分」で評価される** —— だから**ワークフロー自身を足した PR は、以後どの
コミットを積んでも常に起動する**。

**これは `paths` の効き方そのもの**なので、覚えておく価値がある —— **「文書だけのコミットを
足せば CI が走らない」は成り立たない。** 起動契機を確かめるには、**別の PR を立てる**しかない
（下の申し送り）。

**★★ 回収した（2026-08-26。#104）。** **文書 3 本だけの PR**（`CUSTOMIZATIONS.md` /
`CLAUDE.md` / `docs/ARCHITECTURE.md`）を立てたら、**2 分待っても 1 本も起動しなかった**。
**同じ内容を #102 にコミットとして足したときは 3 本とも起動している** —— 対にすると、
`paths` の評価単位が **PR 全体の差分**であることがはっきり出る。

| 何をしたか | 変更 | 起動 |
|---|---|---|
| #102 にコミットを足す | `CLAUDE.md` だけ | **3 本** |
| **#104 を新しく立てる** | 文書 3 本だけ | **0 本** |

**★ ここでも「空を『無い』と読まない」を通した** —— `gh run list` が空だったのを
**即断せず 2 分待って再確認**し、**比較対象（#102 のブランチに 3 本ある）と並べて**判定した。

**★ その確認で `gh pr checks` に危うく騙された。** 起動の有無を見ようとしたら
**`no checks reported on the branch`** が返り、**「1 本も起動しなかった」と読みかけた** ——
実際は **run が登録される前に問い合わせただけ**で、`gh run list` を見ると 3 本とも走っていた。
**空の応答を「無い」と読まない** —— #95 の「gitleaks の `dir` モードの 3 件を漏洩 3 件と
読まない」と同じ型で、**取り違えると、本当に起動しなかった日に気づけなくなる。**
**起動の有無は `gh run list --json headSha` で、その SHA の run を数えて見る。**

#### 却下した案

- **週次 CVE cron を置く** —— 決めたこと 1
- **CodeQL default setup を入れる** —— 決めたこと 3
- **CI で回すのを `docker build` ＋ 起動確認までにする** —— 速いが、**2-2〜2-4 が固めたもの
  （CSP・`Cache-Control`・READONLY の 403・保存の書き込み）が CI から見えないまま残る**。
  **実際、緑になった run が見ているのはその 13 本**である
- **buildx / GHA のキャッシュを最初から入れる** —— 実測 2
- **`push` でも回す** —— `pull_request` は**マージ結果**に対して走るので二重払い
- **`ci-frontend` / `ci-server` に相乗りさせる** —— `paths` は `on:` にしか書けない。
  Docker を要求する検査を混ぜると、**フロント 1 行の PR でも待たされる**
- **既存 2 本の paths を public 前提で緩める** —— 枠が根拠でなくなっても
  「入力が変わらなければ出力も変わらない」は残る。**待ち時間も理由になる**
- **`compose.yaml` / `Dockerfile` を CI 都合で触る** —— 決めたこと 5
- **`chmod 0777` だけで通す** —— **起動はするが、書かれたファイルを読めない**（実測 1 の症状 2）。
  **片方しか塞がらない**
- **Linux の問題を 2-5 で直す** —— 決めたこと 5（ユーザー判断）
- **2-5 を 2 本の issue に割る**（ci-image ／ 検査層の割り当て）—— 「cron を置かない」と
  「代わりに何が見るか」は**同じ判断**で、割ると**片方だけ載った時間**ができる
- **`ci-budget.md` の台帳に行を足す** —— **public は枠を食わないので要らない**
  （org §3 の 2026-08-23 の判断。**理由が枠なので、別掲側にも行を作らない**）

#### ★ 実測 4: マージした直後に `deps-submit` が赤くなった（2026-08-26。上の申し送りへの追記）

**申し送りの「マージするまで 1 度も走らない」は当たった。そして、その直後に走って落ちた。**

- **走った理由**は paths に**自分自身**（`.github/workflows/deps-submit.yml`）を入れてあるから。
  新規追加そのものがマッチする。**次に走るのは Gradle のファイルを触ったとき**
- **落ちた場所**は最後の 1 手 —— **グラフの生成もアップロードも成功**している
  （`BUILD SUCCESSFUL in 45s` → `Uploaded bytes 5203` → `Artifact … successfully finalized`）。
  そのうえで提出が `HttpError` になった:

```
The Dependency graph is disabled for this repository.
Please enable it before submitting snapshots.
```

##### ★★ **SBOM の 404 は「未生成」ではなかった。グラフ自体が無効だった**

**申し送りに「SBOM が未生成なだけと見ている —— 確かめていない」と推測で書いた部分が、実測で覆った。**
**確かめていないものを「見ている」と書いておいたおかげで、覆ったことが分かる形になっている。**

| 実測（2026-08-26） | 値 |
|---|---|
| `GET /dependency-graph/sbom` | **404**（`security_and_analysis` に `dependency_graph` の項目は**そもそも無い**） |
| `GET /vulnerability-alerts` | **204**（＝ Dependabot alerts は有効） |
| `GET /dependabot/alerts` | **200 で 0 件** |
| org の `dependency_graph_enabled_for_new_repositories` | **`false`**（**新規リポジトリの既定**であって、既存の現在値ではない） |

**private のあいだ無効だったものが、public にしても自動では有効にならなかった**と見ている
（#95 で可視性だけを変えた）。**★ ここは断定できない** —— 有効化の履歴を読む口を見つけていない。

##### ★★ **API では有効化できない**

`PATCH /repos/{owner}/{repo}` に `security_and_analysis.dependency_graph` を渡すと
**200 が返るが、応答に項目は現れず、SBOM は 404 のまま** —— **黙って無視される。**
**「200 が返った＝効いた」と読まないこと。** 扱えるのは
`secret_scanning` / `..._push_protection` / `dependabot_security_updates` /
`..._non_provider_patterns` / `..._validity_checks` / `advanced_security` だけで、
**Dependency graph はどの API にも無い**（Web UI の Settings → Code security のみ。**ユーザー操作**）。

##### ★★ これは決めたこと 1 の**前提**に当たる

**③ 層（週次 cron）を置かない根拠は「代わりに Dependabot が見るから」だった。** ところが:

| Dependabot の口 | 動くか | 依存するもの |
|---|---|---|
| **version updates**（`dependabot.yml`。weekly） | **動いている**（実測 3 の #99 / #100 / #101 が証拠） | **マニフェストを直接読む。グラフに依存しない** |
| **security updates**（CVE 公開時に修正 PR） | **グラフが無いあいだは成立しない** | **alerts ＝ 依存グラフ** |

**つまり「置かない」判断そのものは変えないが、その根拠は Dependency graph が有効になって初めて立つ。**
`dependabot/alerts` の **0 件**も、**「脆弱性が無い」なのか「グラフが無くて見ていない」なのか
切り分けられていない** —— **空の応答を「無い」と読まない**（この段階で 2 度目の同じ型）。

**有効化と、そのあとの確認（SBOM に Gradle の依存が入る／`deps-submit` の再実行が緑／alerts の
0 件の意味）は、この記録の次に続く。**


##### ★ 有効化したあと（2026-08-26。ユーザーが Settings で Enable した）

**API に口が無いので、ここだけは人の操作で進んだ。** そのうえで機械が確かめられたことは 4 つ。

| 確かめたこと | 結果 |
|---|---|
| `GET /dependency-graph/sbom` | **404 → 200**（**146 パッケージ**。npm だけ。`package-lock.json` から自動検出されたぶん） |
| `deps-submit` の再実行 | **success**（落ちていたのは提出の 1 手だけだったので、再実行で通った） |
| 提出後の SBOM | **146 → 315**（**Gradle 側が 169 本入った**。`org.springframework.boot:*` / `org.jetbrains.kotlin:*` など） |
| `dependabot/alerts` | **0 件 → 2 件** |

##### ★★ **「0 件」は「脆弱性が無い」ではなかった**

**切り分けが付いた。** 上の申し送りで 2 度「空の応答を『無い』と読まない」と書いたが、
**この 0 件がまさにそれだった** —— **グラフが無いあいだ、Dependabot は何も見ていなかった。**

| 出た alert | 重大度 | 影響 → 修正 |
|---|---|---|
| `org.jetbrains.kotlin:kotlin-gradle-plugin`（CVE-2026-53914） | medium | `< 2.4.20-Beta1` → **2.4.20-Beta1**。Kotlin Build Cache の unsafe deserialization で**ビルド時のコード実行** |
| `org.apache.commons:commons-lang3`（CVE-2025-48924） | medium | `>= 3.0, < 3.18.0` → **3.18.0**。長い入力での uncontrolled recursion |

**手元の `npm audit` は 0 件**（dev 込み。分類 B なので `--omit=dev` は使わない）—— **npm 側は本当に 0** で、
**Gradle 側だけが見えていなかった**という形。

##### ★★ **配布イメージには入らない**（切り分け）

**2 件とも manifest が `server/settings.gradle.kts` ＝ Gradle プラグインの classpath。**
`deps-submit` が全 configuration を解決するので拾えたもので、**実行時の依存ではない**:

- **`server/gradle.lockfile`（実行時・142 行）に 2 件とも無い**
- `server/settings-gradle.lockfile`（5 行）にも無い
- ＝ **runtime ステージの jar には入らない**（マルチステージなので、ビルド時の classpath は残らない）

**影響するのはビルド環境**であって、**配る成果物ではない**。

##### ★★★ **拾えたが、直せなかった** —— `security_update_dependency_not_found`

**alert が出た直後に `Dependabot Updates` が 2 本走り、2 本とも failure。**

```
| security_update_dependency_not_found | {} |
Error: The updater encountered one or more errors.
```

**理由は上の切り分けと同じところにある** —— **提出したグラフからは検出できるが、Dependabot が
書き換えられる manifest には載っていない**（`kotlin-gradle-plugin` は `plugins {}` の解決結果、
`commons-lang3` はその推移的依存）。**書き換え先が無いので PR を作れない。**

**★ これは決めたこと 2 の根拠を、さらに 1 段細かくする。**

| 依存の位置 | 拾えるか | **直せるか** |
|---|---|---|
| `gradle.lockfile` / `package-lock.json` にある依存 | **拾える** | **直せる**（Dependabot が PR を出す） |
| **提出したグラフにしか無い依存**（ビルドスクリプトの classpath） | **拾える** | **★ 直せない**（`security_update_dependency_not_found`） |

**「Dependabot が見る」は「拾える」までで、「直せる」は manifest にある依存に限られる。**
**③ 層を置かない判断は変えない**（cron を足しても「拾う」が二重になるだけで、**直せない側は同じ**）が、
**根拠の書き方はこの粒度でないと、次に読む人が判断に使えない。**

##### この 2 件をどうするか（**未決**）

- **修正版が Beta しかない**（`kotlin-gradle-plugin` は 2.4.20-Beta1）。**安定版を待つのが既定**
- **`commons-lang3` は推移的**なので、プラグイン側が上がれば一緒に直る
- **配布物に入らない**ので、利用者に届くリスクではない
- **★ 決めるのは別の場**（org `security-verification.md` §0 の 3 条件目「**CVE が出たときに
  何をするかまで決まっていること**」が、ここで実地に問われている）

#### 申し送り

- **★ Linux ホストでは配布物が動かない**（実測 1）—— **[#103](https://github.com/propagandist/grabado/issues/103)**。
  **README 2 本には「既知の不具合」として書いた**。**`compose.e2e.linux.yaml` を消せることが
  #103 の受け入れ基準**で、**それがある限り E2E はこの欠陥を捕まえない**
- **★ paths の検出試験は済んだ**（**#104 で回収**。上の実測）—— **文書だけの PR は 0 本起動**、
  **同じ内容を既存 PR に足すと 3 本起動**
- **★ `deps-submit.yml` は `develop` への push でしか走らない** —— **マージするまで 1 度も
  走らない**。actionlint は通したが、**実際にグラフが入ったかはマージ後に確認する**:
  `gh api repos/propagandist/grabado/dependency-graph/sbom`。
  **★ この API は 2026-08-26 時点で 404**（`dependabot/alerts` は 200 で 0 件なので、
  **依存グラフ自体はある**。SBOM が未生成なだけと見ている —— **確かめていない**）
  - **★★ 訂正（同日。実測 4）** —— **この見立ては外れた。Dependency graph 自体が無効だった。**
    マージ直後に `deps-submit` が走り、**提出だけが `The Dependency graph is disabled` で落ちた**。
    **`dependabot/alerts` が 200 で 0 件でも、グラフがあることの証拠にはならない。**
    **元の記述は消さない** —— 「確かめていない」と書いておいたから、覆ったことが分かる
- **★ Dependency graph の有効化が要る**（実測 4）—— **API では不可。Web UI のみ**。
  **有効化するまで、決めたこと 1 の根拠（security updates が CVE を拾う）は成立しない**
  - **★★ 済んだ（2026-08-26。ユーザーが Settings で Enable）。** SBOM が 200 になり、
    `deps-submit` の再実行が緑、**Gradle の依存 169 本がグラフに入った**。
    **alert は 0 → 2 件**（実測 4 の追記）
- **★ 出た alert 2 件が未決** —— どちらも **medium・ビルド時のみ・配布イメージには入らない**。
  **修正版が Beta しかない**（`kotlin-gradle-plugin` 2.4.20-Beta1）ので、**安定版を待つのが既定**。
  **決めるのは別の場**
- **★★ グラフにしか無い依存は「拾えるが直せない」**（`security_update_dependency_not_found`）。
  **cron を足しても直せない側は変わらない**ので ③ を置かない判断は動かないが、
  **「Dependabot が見る」を根拠に書くときは、拾う／直すを分けて書く**
- **Dependabot の 3 本が開いている**（実測 3）—— **#99 は `Dockerfile` の Node を 26 に上げるが、
  `ci-frontend.yml` は 24 のまま**。**版がずれる**ので、マージするなら揃えること
- **Chromium の取得（`ci-frontend` 39 秒 ＋ `ci-image` 24 秒）はキャッシュしていない**（実測 2）。
  **キーの設計を決める別 issue**
- **`ci-image` の 13 本は Linux では「ホストと同じ uid」で走っている** —— **イメージが
  用意した uid 100 で動くことは、CI では検証していない**（#103 が直したら戻る）
- **残るのは 2-6**（`frontend/` 集約。golden 114 本の無差分が成功判定）と **§6.4 の仕上げ**、
  **公開デモの外側 #84**

### 2026-08-27 HANDOVER §2「配布」段階2-6 —— `frontend/` へ集約し、§2 を閉じた

正本は [issue #107](https://github.com/propagandist/grabado/issues/107)。契約は
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §9。**4 か所で予約されていた集約**
（段階3-1 / 4-0a / 4-1a / 5-0）を実行し、**§2 の分割表（#83）を閉じた**段階。

#### 通った（2026-08-27 実測）

| 検査 | 結果 |
|---|---|
| **★ golden 114 本** | **1 バイトも動いていない**（この段階の成功判定） |
| `npm run typecheck` | 緑 |
| `npm test` | **586 本** |
| `npm run test:browser`（特性化） | **191 本** |
| `npm run known-issues` | 1 本 |
| `npm run test:dist` | **6 本** |
| `npm run test:image` | **13 本** |

**差分は 110 rename ＋ 36 modified。** 実装（`frontend/js/` の中身）は**移動しただけで 1 行も
変わっていない**。

#### 決めたこと 1: **案 B（部分集約）** —— `package.json` と `tests/` は root に残す（ユーザー判断）

| 何 | どこへ |
|---|---|
| `index.html` / `src/` / `js/` / `styles/` / `db/` / `locale/` / `images/` | **`frontend/` へ**（110 ファイル） |
| `package.json` / `package-lock.json` / `tsconfig.json` / `*.config.ts` / `tests/` / `scripts/` / `tools/` | **root のまま** |

**HANDOVER §2.2 の骨格（`COPY frontend/package*.json`）にはならない。** それでも B にした理由:

- **`tests/` を割らない** —— `tests/contract/` は **backend と共有**（`ci-server.yml` の paths）、
  `tests/image/` は **root の `compose.yaml` を叩く**。骨格どおりに動かすと**この 2 つだけ root に
  残り、tests が 2 か所に割れる**
- **`npm test` の起動位置が変わらない** —— `package.json` が動くと、5 系統のテストの回し方・
  `scripts/vitest.mjs` の cwd 正規化・CI の `working-directory` が一斉に動く。
  **大移動に「テストの回し方の変更」を重ねない**
- **集約の利益は「骨格との一致」と「`server/` との対称」で、機能上の改善は無い。**
  **利益が薄いぶん、コストを最小の形に寄せる**

#### 決めたこと 2: **URL 空間は 1 バイトも変えない**

**これが golden 114 本の無差分を成立させている。** vite の `root` を `frontend` にすると、
**ファイルシステム上の位置だけが動き、`/index.html` も `db/<db>/datatypes.xml` もそのまま**。

その事実を**コードの形でも表した** —— `tests/node/harness.ts` の `readRepoFile()` は
**URL パス → ファイルシステム**の写像なので、**呼び出し側は URL のまま**にして、
**base を関数の中で 1 か所だけ `frontend/` にした**（呼び出し 3 箇所を書き換える形にしない）。

#### ★ 実測 1: `viteStaticCopy` の `src` は **vite の root 基準**（cwd 基準ではない）

**推測が外れた。** 「`src` はプロセスの cwd から解決される」と読んでいたので
`{ src: "frontend/db" }` と書いたら、ビルドがこう落ちた:

```
[plugin vite-plugin-static-copy:build]
Error: No file was found to copy on frontend/db src.
```

**root 基準なので、集約後も `{ src: "db" }` のままでよかった** —— **3 行は動いていない**。
**推測で書いた行が、ビルド 1 回で否定された形。** コメントを実測に置き換えてある。

#### ★ 実測 2: 機械置換から漏れる形が **2 つ**あった

`../../js/` → `../../frontend/js/` の一括置換で 49 行が片付いたが、**2 つの形が漏れた**。
**どちらもテストが赤くなって気づいた**（typecheck は通っていた）。

| 漏れた形 | どこ | なぜ漏れたか |
|---|---|---|
| **変数経由の組み立て** | `tests/node/forbidden-api.test.ts`<br>`["js", "src"].flatMap((dir) => collectSources(join(REPO_ROOT, dir)))` | パスが**リテラルとして存在しない**。`join(REPO_ROOT, "js"` の形を探す grep に掛からない |
| **URL → FS の写像** | `tests/node/harness.ts` の `readRepoFile("index.html")` | 引数は**URL パス**で、`js/` も `db/` も現れない。**呼び出し側を見ても分からない** |

**★ 「パス文字列を grep して置換する」だけでは足りない。** 動かしたあとに**全系統を回す**ことが、
この 2 つを見つける唯一の経路だった（`npm test` の 7 スイートが赤くなった）。

#### 決めたこと 3: `dist` は **`frontend/dist/`**（root の外に出さない）

vite の `outDir` は root 基準なので、`root: "frontend"` にした時点で自然に `frontend/dist` になる。
**`../dist` で root の外へ出す案は採らない** —— `emptyOutDir` が root 外を消すことになり、
**「出力先が root の外」という形そのものが事故のもと**。

追随したのは 3 か所だけ: `.gitignore`（`/dist/` → `/frontend/dist/`）・`Dockerfile` の
`COPY --from=web /web/frontend/dist`・`.dockerignore` の削り直し（`frontend/dist`）。
**`playwright.dist.config.ts` は `vite preview` を使うので 1 行も変わらない。**

#### 決めたこと 4: `.dockerignore` は **`!frontend` の 1 行に畳む**

**親を除外したままだと配下の `!` が効かない**（2-0 の決めたこと 4 の記法）。
`!index.html` `!src` `!js` `!styles` `!db` `!locale` `!images` の 7 行が **`!frontend` 1 行**になり、
**ビルド出力だけを後勝ちで削る**（`frontend/dist`）—— **`server/` とまったく同じ形**に揃った。

**CI の paths も同じく畳んだ**（`ci-frontend.yml` / `ci-image.yml` とも `frontend/**` の 1 行）。

#### 検出が本物か確かめた

**この段階の検出は「golden 114 本の無差分」そのもの。** 移動でどこかがずれていれば、
**特性化テスト 191 本のどれかが赤くなる**（実際、途中で 7 スイートが赤くなり、実測 2 の
2 つを見つけた）。**別途壊して確かめる必要が無い**のは、**成功判定が検出そのものだから**。

#### 却下した案

- **案 A（骨格どおり。`package.json` と `tests/` も `frontend/` へ）** —— 決めたこと 1。
  **tests が 2 か所に割れる**
- **案 C（予約を撤回してルート維持を確定）** —— 4 か所の予約を撤回することになる。
  **2-0 が「Docker が動いたあとなら単独 PR で golden 無差分を成功判定にできる」と置いた条件が、
  いま満たされていた**
- **`dist` を `../dist`（root）へ出す** —— 決めたこと 3。`emptyOutDir` が root 外を消す形になる
- **`.dockerignore` を 7 行のまま `!frontend/index.html` … と並べる** —— **親を除外したままだと
  配下の `!` が効かない**。`!frontend` 1 行のほうが**記法の罠を踏まない**
- **文書のリンク修正を別 PR にする** —— **移動と同じ diff でないと、途中のコミットで文書が壊れる**
- **`CUSTOMIZATIONS.md` の本文表記（`js/` など）も一括で `frontend/js/` に直す** ——
  **過去の記録は当時の記述**なので**本文は触らない**。**リンクとそのラベルだけ**直した
  （リンクは実体を指すものなので、壊れたままにできない）
- **`git mv` を使わずコピー＋削除** —— 履歴が切れる。**110 ファイルすべてが `R`（rename）**として
  記録されている

#### 申し送り

- **★ §2 が閉じた。** 分割表（#83）の 2-0 〜 2-6 がすべて済んだ。**HANDOVER §9 の順序で残るのは
  §6.4 の仕上げ**（locale の未訳もそこ）
- **★ HANDOVER §2.2 の骨格とは、まだ 1 点違う** —— 骨格は `COPY frontend/package*.json` だが、
  **実在は root の `package.json`**（決めたこと 1）。**注記は実在に合わせて直した**が、
  **骨格そのものは当時の記録なので書き換えていない**
- **★ この PR は CI を通していない** —— **GitHub Actions が major outage**（2026-08-26 15:11 UTC〜、
  「issue with a database primary」）で、**#101 / #106 / 本 PR とも run が起動しないか失敗した**。
  **手元で 7 系統すべてを回して緑**（上の表）。**障害の回復後に CI を確認すること**
- **`ci-frontend.yml` / `ci-image.yml` の paths が `frontend/**` に畳まれた** ——
  **フロントに何を足しても paths を直す必要が無くなった**。逆に言えば、
  **`frontend/` の外にフロントの入力を置くと、静かに検査から漏れる**
- **`tests/golden/README.md` と `tests/known-issues/README.md` のリンクも動いた**
  （golden 本体 114 本は無差分）

### 2026-08-27 ルートパッケージを `io.propagandist.grabado` にする

正本は [issue #109](https://github.com/propagandist/grabado/issues/109)。**段階に属さない**
（#83 の分割表にも §5 にも行が無い。#95 と同じ扱い）。**挙動は 1 バイトも変えていない** ——
動いているものを動いているまま**座標だけ付け替えた**。

#### なぜ

**公開物の名前空間が、会社ではなく製品ドメインを名乗っていた。** `dev.grabado` は段階5-1b で
骨格を入れたときのもので、**ドメイン `grabado.dev` の逆順**。リポジトリは 2026-08-26 に public に
なり（#95）、**jar の中身も `deps-submit.yml` が提出する座標も外から見える**。

**壊れてはいなかった。** だから「直す」のではなく「揃える」作業になる。

#### 通った（2026-08-27 実測）

| 確かめたこと | 結果 |
|---|---|
| **`server/gradlew -p server clean build`** | **BUILD SUCCESSFUL**（**本命**。component scan の解決・`@SpringBootTest` 4 本・実コード FQN の取り残しがここで落ちる） |
| `git grep -E 'dev\.grabado|dev/grabado'` | **0 件**（実施前は **106 行 / 55 ファイル**） |
| `git status` の rename | **47 本**（main 31 ＋ test 16。**すべて `RM`** ＝ 移動＋中身の書き換え） |
| `gradle.lockfile` / `settings-gradle.lockfile` | **1 バイトも動いていない**（自プロジェクトの `group` はロックに書かれない） |
| `npm run typecheck` / `npm test` / `test:browser` / `known-issues` / `test:server` / `test:image` | 緑（下の申し送り） |

#### 決めたこと 1: `io.propagandist` 直下ではなく **`io.propagandist.grabado`**（ユーザー判断）

`io.propagandist.api` のような形は **1 リポジトリ 1 プロダクトを前提**にしている。org の他プロダクトと
同じ classpath に載った瞬間に `api` / `config` が衝突する。**製品名の階層は削らない。**

#### 決めたこと 2: `group` も同じ値に揃える（ユーザー判断）

片方だけ変えると、`deps-submit.yml` が提出する座標と `.kt` の `package` 行で**違う会社名**が出る。
**次に読む人がどちらが正かを判断できない。正本は 1 つ。**

#### 決めたこと 3: **grabado 固有の識別子は動かさない**（ユーザー判断）

`grabado.jar` ／ `GRABADO_*` env ／ `rootProject.name` ／ `@ConfigurationProperties("grabado")` ／
`GrabadoApplication`・`GrabadoProperties` は**据え置き**。

- `GRABADO_*` は `application.yaml` / `compose.yaml` / `.env.example` の 3 か所を
  `env-contract.test.ts` が突き合わせている**外向きの契約**
- `grabado.jar` は `Dockerfile` の `COPY` が**ワイルドカードを避けるため**に依存している
- **同じ PR で外向きの契約を動かすと、落ちたときにパッケージのせいか契約のせいか切り分けられない**

#### 決めたこと 4: ディレクトリは **1 回で動かす**

`GrabadoApplication` の `@SpringBootApplication` ＋ `@ConfigurationPropertiesScan` は
**そのクラスのパッケージを起点に走査する**（`scanBasePackages` の明示は 0 件）。
**サブパッケージを 1 つでも旧位置に取り残すと、その bean だけが静かに消える**
——**アプリは起動し、当該 URL だけ 404 になる**。だからファイル単位ではなく
**パッケージルートごと `git mv`** し、rename が 47 本であることを数えた。

#### ★ ついでに直した: `ARCHITECTURE.md` のツリーは **3 世代ぶん古かった**

#109 は「`ai/` と `introspect/` が抜けている（実体は 5 つ）」と指摘していたが、**開いてみると
古さはそれだけではなかった**。

| 古かった箇所 | いつから |
|---|---|
| `server/…/` の下が **3 つ**（`api` / `design` / `config`。`ai` と `introspect` が無い） | §11 と 5-7a から |
| **`index.html` / `src/` / `js/` / `styles/` / `locale/` / `db/` が root のまま** | **段階2-6 から**（集約の取りこぼし） |
| `Dockerfile` が「**upstream の busybox httpd。house 版で置換予定**」 | **段階2-1 から**（置換済み） |
| `package.json` / `tests/` が**そもそも載っていない** | 最初から |

**ツリーは「1 か所」に見えて、実際には各段階が触るべき場所だった。** 段階ごとに自分の行だけを
直していると、**誰も全体を見ないまま古くなる**。まとめて現在の姿へ直した。

**★ 2-6 の取りこぼしはこれで 2 件目**（1 件目は `ReviewSchemaTest` の
`repoRoot.resolve("js")`。#110）。**どちらも「フロントを動かしたとき、フロント以外に波及する面」**
で、**2-6 の検証が `frontend/` の中しか見ていなかった**ことを示している。

#### 却下した案

| 案 | 却下理由 |
|---|---|
| **`io.propagandist` 直下** | 決めたこと 1。製品名の階層は削らない |
| **パッケージだけ変えて `group` は据え置く** | 決めたこと 2。座標とパッケージで違う会社名が出る |
| **固有識別子（jar 名・env・クラス名）も寄せる** | 決めたこと 3。外向きの契約を同じ PR で動かすと切り分けができない |
| **移動と置換を 2 コミットに割る** | merge は squash なので develop に載るのは 1 本。**「移動したがコンパイルが通らない」中間状態を作るだけ** |
| **IDE のリファクタ機能を使う** | `server/bin/` を巻き込む。KDoc の FQN を拾うかが版依存。**diff で全量が読めない**。`sed` は決定論 |
| **#107（2-6）と同じ PR に混ぜる** | 2-6 は 140 本を動かしている。合わせると **190 本超**になり、**「挙動を変えていない」ことが読めなくなる** |

#### 申し送り

- **★ マージ後に依存グラフを確かめること** —— `gh api repos/propagandist/grabado/dependency-graph/sbom`。
  **古い座標 `dev.grabado:grabado-server` が残って二重になっていないか**。**未検証**で、
  `deps-submit.yml` が走るまで確かめられない（`server/build.gradle.kts` を触ったので**走る**）
  - **★★ 済んだ（2026-08-27。マージ直後）** —— `deps-submit` が **success**、
    **`dev.grabado` は 0 件**、`propagandist` が 1 件、`total` は **314 で変わらず**。
    **二重になっていない** —— **提出は置き換えであって追加ではない**（この形は初めて確かめた）
- **`docs/` の相対リンク 10 本が動いた** —— #109 は「**機械の検査は無い。目で踏むしかない**」と
  書いていたが、**実在の確認だけは機械でできた**（各リンクを `dirname` からの相対で解決して
  `[ -e ]` で見る。**全 `docs/*.md` で MISSING 0**）。
  **確かめられないのは「リンク先が意図した箇所か」**であって、**実在は確かめられる** ——
  この 2 つを混ぜない
- **`.claude/settings.local.json` に古い `sed` の許可エントリが残っている**（git 管理外）。
  パスが変われば**一致しなくなるだけ**なので触っていない
- **ツリーのような「全体を書いた図」は、段階ごとの検証から漏れる。** 上の★のとおり
  **3 世代ぶん古くなっていた** —— **図を持つ文書は、節を触るたびに図も見ること**

### 2026-08-27 Linux の bind mount で起動できるようにする（#103）

正本は [issue #103](https://github.com/propagandist/grabado/issues/103)。**段階に属さない**
（段階2-5 が実測で見つけ、**配布物の設計変更なので #103 へ切り出した**もの）。

#### 何が壊れていたか（2 方向）

**bind mount はホスト側の所有権をそのまま通す。** 固定の uid で走るイメージは、Linux ホストで
**2 方向に壊れていた**。

| # | 症状 | 原因 |
|---|---|---|
| 1 | **コンテナが起動しない** | mount 先は clone した人の uid。`FileDesignStore` の起動時 fail-fast が `正本ディレクトリに書けない` で止める（段階5-3 の設計どおり） |
| 2 | **書けたものをホストが読めない** | `Files.createTempFile` が **POSIX 0600** で作ったものを `ATOMIC_MOVE` するので、保存された JSON は **600・コンテナ uid 所有**。**自分の設計を `git add` できない** |

**2 のほうが重い** —— 1 は fail-fast が止めるが、**2 は 201 が返り、ファイルもできる**。

#### 決めたこと: **mount 先の所有者へ降りる**（案 A'。ユーザー判断）

[`docker-entrypoint.sh`](docker-entrypoint.sh) が `stat` で mount 先の所有者を読み、
**`su-exec` でそこへ降りる**。**両方の症状が同時に消える。**

#### ★ #103 が書いた案 A には欠陥があった

issue の案 A は「root で起動 → **`/data/schema` を `chown`** → `su-exec` で非 root へ降りる」
と書いていた。**この形では症状 2 が残る** —— **bind mount を `chown` すると、ホスト側の
ファイルの所有者が変わる**。**直すどころか悪化する。**

**動かすのはコンテナ側の uid だけ。ホスト側は 1 バイトも触らない。**
**「合わせる」方向を逆にすると、片方しか直らない。**

#### 決めたこと: uid 0 のときは既定の `grabado` へ降りる

**Docker Desktop for Windows / macOS は所有権を偽装して `uid=0 gid=0 mode=777` を返す**
（2026-08-27 実測）。**mount していないときも 0**。**どちらも「ホストの uid が分からない」場合**
なので、イメージが用意した非 root ユーザーへ降りる（従来どおりの挙動）。

#### 決めたこと: `USER grabado` を置かない

entrypoint が所有者を読むために **root で始まる**。**アプリは必ず `su-exec` で降りた先で動く**
—— root のまま走ることは無い。`su-exec` も `exec` するので **PID 1 は java** のままで、
SIGTERM が直接届く（graceful shutdown が効く）。

**`su-exec` は「runtime に残るのは jar 1 本だけ」を崩す唯一の例外。** 段階2-1 の原則を
曲げてまで入れたのは、**利用者が `docker compose up` 以外に何もしなくてよい**形が
#103 の目指す状態だったから（案 B は `export UID GID` を要求する）。

#### ★ 実測: **実行ビットで 1 回落ちた**

初回の CI が `exec: "/usr/local/bin/docker-entrypoint.sh": permission denied` で落ちた。
**Windows のチェックアウトでは実行ビットが立たず、`COPY` はホストのモードをそのまま持ち込む**
——**手元で `chmod +x` しても git がモードを記録しない**ので効かない。

**同じ罠を Dockerfile 自身が既に踏んでいた** —— api ステージの `sh ./gradlew` は
「**実行ビットがホストの OS 次第**だから」と書いてある。**同じ理由・同じ対処**で、
`RUN … && chmod +x` をイメージ側に置いた（`COPY` を先に動かしたのでレイヤは増えていない）。

#### 通った（2026-08-27 実測）

| 確かめたこと | 結果 |
|---|---|
| **ci-image（Linux）** | **13 本が緑** —— **`compose.e2e.linux.yaml` の細工なしで** |
| うち「保存がホストの mount に実ファイルを書き、読み戻せる」 | **緑**（前回はここが `EACCES` だった＝**症状 2 が直った証明**） |
| READONLY の 5 本 | 緑（降りた先でも読める） |
| 手元（Windows。uid 0 の経路） | **13 本が緑** |

#### 段階2-5 の細工を消した

`compose.e2e.linux.yaml` と `compose.ts` の `IS_LINUX` 分岐が**消えた**（#103 の受け入れ基準）。
**テストが条件を細工しなくてよくなり、いま E2E が起こすのは利用者とまったく同じ 2 枚**である。

#### 却下した案

- **案 A（`chown` する）** —— 上の★。**症状 2 を悪化させる**
- **案 B（compose で `user:` 指定）** —— 2-5 でテストに先行適用して**効くことは実測済み**だが、
  **利用者に `export UID GID` を要求する**。README の `docker run` の行にも `--user` が要る。
  **「動かないものを注記で埋める」形**に近い
- **案 C（uid 1000 固定）** —— **当たれば動き、外れれば落ちる**。CI runner は 1001 なので
  **細工を消せない**
- **`ENTRYPOINT ["sh", "…"]` で実行ビットを回避** —— `gradlew` と同じ形にはなるが、
  **shebang を無視することになる**。`chmod +x` のほうが意図が明確

#### 申し送り

- **★ `su-exec` が runtime に入った。** 「jar 1 本だけ」ではなくなったので、
  **ベースイメージの CVE を見る面が 1 つ増えた**（`docker` entry の Dependabot が拾う）
- **★ ベースイメージに脆弱性の警告が出ている**（2026-08-27。IDE の Docker 拡張）——
  `node:24-alpine` に **critical 1 ＋ high 14**、`temurin:25-jdk-alpine` に high 10、
  `25-jre-alpine` に high 7。**#105（Gradle プラグインの classpath）とは別**で、
  **こちらは配布物に入る**。**digest ピンと Dependabot の `docker` entry が対処する設計**
  （段階2-1）だが、**中身は棚卸ししていない**

### 2026-08-27 ベースイメージの CVE を棚卸しした（① 層）

**段階2-1 で digest ピンと Dependabot の `docker` entry を入れて以来、中身を 1 度も見ていなかった。**
#103 の作業中に IDE の Docker 拡張が警告を出したのが発端で、**org `security-verification.md`
§1.3 の ① 層**として `trivy image` を回した。

#### 実測（2026-08-27。trivy `--severity CRITICAL,HIGH`）

| 対象 | ステージ | CRITICAL | HIGH | 配布物に入るか |
|---|---|---:|---:|---|
| `node:24-alpine` | web | **1** | 9 | **入らない** |
| `eclipse-temurin:25-jdk-alpine` | api | 0 | （未計測） | **入らない** |
| `eclipse-temurin:25-jre-alpine` | runtime | **0** | **3** | **入る** |
| **実イメージ**（`grabado-image-e2e-app`） | — | **0** | **3** | ＝ 上と同じ |
| うち **`app/grabado.jar`** | — | **0** | **0** | **Kotlin / Spring Boot の依存は 0 件** |

#### ★ 切り分け 1: **CRITICAL は配布物に入らない**

`node:24-alpine` の CRITICAL 1 件は **npm が同梱する `tar` 7.5.16**（`CVE-2026-59873`。
crafted gzip bomb による DoS）。**web ステージにしか無く、マルチステージなので runtime に残らない**
——**実イメージを走査して 0 件であることを確かめた**（表の 4 行目）。

**「Dockerfile に CRITICAL がある」と「配る物に CRITICAL がある」は別**。
**IDE の警告は前者**で、**行番号ごとに出る**ぶん**後者と読み違えやすい**。

#### ★ 切り分け 2: 配布物の HIGH 3 件は**同一 CVE**

`CVE-2026-14456`（openssl の QUIC サーバにおける unbounded memory growth ＝ DoS）が
`libcrypto3` / `libssl3` / `openssl` の **3 パッケージに出ているだけ**で、**実質 1 件**。

**grabado は QUIC サーバではない**（Spring Boot / Tomcat は HTTP/1.1）ので、**到達しない**。
**ただし「入っていない」ではなく「使っていない」**なので、直せるなら直す側。

#### ★★ 上げ先が無い（2026-08-27 実測）

**修正版 `3.5.8-r0` は存在する**が、**3 つのベースイメージとも Dockerfile のピンが上流の最新と
一致していた**（`docker buildx imagetools inspect` で確認）。**上流のイメージがまだ 3.5.7-r0 を
含んでいる**ということで、**digest を上げても直らない**。

**Dependabot が PR を出さないのは正しい動作。** **上流が新しい digest を出せば追随する。**

#### ★★★ ただし **Dependabot はベースイメージの中身を見ていない**

これが今回いちばん重要な発見。

```
$ gh api 'repos/propagandist/grabado/dependabot/alerts?state=open'
maven  org.jetbrains.kotlin:kotlin-gradle-plugin
maven  org.apache.commons:commons-lang3
```

**alpine のパッケージ（openssl）は 1 件も出ない。** `docker` entry がするのは
**「上流のタグが指す digest が動いたら書き換える」だけ**で、**中に何件の CVE があるかは見ていない**。

**段階2-5 の「ベースイメージ ← Dependabot の `docker` entry」は、この粒度で読む必要がある:**

| 何を | Dependabot は |
|---|---|
| 上流が**直したこと**に追随する | **する**（digest が動けば PR） |
| **いま何件あるか**を教える | **しない** |
| 上流が**直さない**あいだ気づかせる | **しない** |

**つまり「拾えるが直せない」（#105）とは別の形で、こちらは「そもそも拾っていない」。**

#### 決めたこと: ③ 層（週次 trivy）は**置かない**。**① を「ベースを動かすとき」に紐づける**

org §0 の「**分類 B は ① を導入時に 1 回 ＋ ② で足りる**」は変えない。**ただし「導入時に 1 回」は
今回が初回**で、**次にいつ回すかが決まっていなかった** —— そこを決める:

**Dependabot の `docker` entry が PR を出したら、マージ前に `trivy image` を回す。**
上流が digest を動かすのは**たいてい中身を直したとき**なので、**そこが自然な棚卸しの契機**になる。
**時間で回すのではなく、変更に紐づける**（②「変更のたび」に近い形）。

#### 却下した案

- **週次 cron で `trivy image` を回す** —— 分類 B に ③ を持ち込まない（org §0）。
  **public なので枠は食わないが、根拠は枠ではない**（段階2-5 の決めたこと 1 と同じ形）
- **`node:24-alpine` の CRITICAL を理由にベースを変える** —— **配布物に入らない**。
  **入らないものを理由に配る形を変えない**
- **digest を手で上げる** —— **上げ先が無い**（上流のピンが最新）
- **openssl の HIGH を dismiss する** —— **GitHub の alert には出ていない**ので、dismiss する対象が
  そもそも無い。**trivy でしか見えないものを GitHub 側で消すことはできない**

#### 申し送り

- **★ `CVE-2026-14456`（openssl）は上流待ち。** **修正版 3.5.8-r0 はある**が、
  **ベースイメージがまだ含んでいない**。**Dependabot の docker entry が digest を動かしたら、
  そこで解消しているはず** —— **そのときに `trivy image` で確かめる**（上の決めたこと）
- **`eclipse-temurin:25-jdk-alpine` の HIGH は数えていない**（api ステージ＝配布物に入らないので、
  切り分けだけして中身は見ていない）
- **`trivy` の `-` は「未走査」であって「0 件」ではない**（org §1.3 の★）。
  **今回は `app/grabado.jar` が `0`** と出ているので、**走査したうえで 0 件**である

### 2026-08-27 HANDOVER §6「機能」段階6-9f —— ORM 出力に Drizzle を足す

正本は [issue #114](https://github.com/propagandist/grabado/issues/114)。ORM の 3 本目。
**既存の JPA / Prisma の golden 28 本は 1 バイトも動いていない。**

#### 通った（2026-08-27 実測）

| 確かめたこと | 結果 |
|---|---|
| `npm test` | **605 本**（586 → 605。Drizzle の golden 14 本ぶん） |
| `npm run test:browser` | **205 本**（191 → 205） |
| **既存 ORM golden（JPA / Prisma 28 本）** | **無差分** |
| ORM golden の総数 | **42 本**（14 × 3 ターゲット） |
| `npm run typecheck` / `known-issues` | 緑 |

#### ★ 6-9e の見立てが外れた —— **型の表は core ごとに要る**

段階6-9e は次段階への入力にこう書いていた:

> **Prisma / Drizzle / SQLAlchemy は「正規型 → 言語型」の表 1 つで書ける**

**Drizzle には当たらなかった。** 公式ドキュメントを読むと**型関数そのものが DB ごとに違う**:

| core | 整数 | 真偽 | 日時 | UUID |
|---|---|---|---|---|
| `pg-core` | `integer` | `boolean` | `timestamp`（`withTimezone`） | **`uuid()` あり** |
| `mysql-core` | `int` | `boolean`（TINYINT(1)） | `datetime` | **無い** |
| `sqlite-core` | `integer`（**mode で真偽と日時を表す**） | `integer({mode:"boolean"})` | `integer({mode:"timestamp"})` | **無い** |
| `mssql-core` | `int` | `bit` | `datetime2` / `datetimeoffset` | 明記なし |

**Prisma のスカラーは 9 つで DB 非依存**（provider は `datasource` ブロックだけ）だったが、
**Drizzle は型そのものが DB 依存**。**表は 1 本では足りず、4 本持っている。**

**着手前に分かったのが大きい** —— 書き始めてから気づくと、1 本の表を 4 本に割る作り直しになった。

#### 決めたこと 1: **逆参照を出さない**（JPA と同じ側へ戻る）

Drizzle は `references(() => users.id)` の**片側だけでスキーマが成立する**。
**両側を要求した Prisma のほうが例外**だった（6-9e が `collectBackRelations` を書いたのはそのため）。

`relations()` ヘルパは**クエリ層の宣言**であってスキーマ定義ではないので出さない ——
**grabado が出すのはテーブル定義**である。

#### 決めたこと 2: **sqlite の `mode` は書く**

`integer({ mode: "boolean" })` の mode を落とすと**真偽が数値になる**。
**Prisma で `@db.*` を出さないと決めたのとは事情が違う** —— あちらは
「provider ごとに別の表が要るうえ、無くてもスキーマは正しい」だったが、
**こちらは無いと意味が変わる**。

#### 決めたこと 3: 既定値は **`sql` テンプレート**で出す

grabado が持っているのは DDL の既定値（`now()` のような式を含む）で、
**リテラルとして書き直すと意味が変わりうる**。`.default(sql\`…\`)` の 1 つの形に揃えたので、
**写したものがそのまま DB へ渡る**。`sql` の import は**使ったときだけ**出す。

#### 決めたこと 4: core が無い 3 本は **pg-core の形で出し、理由を書く**

`h2` / `oracle` / `sql-standard` に core は無い。**例外にせず、先頭のコメントで
「対応する core は無い。pg-core の形で出しているので読み替えること」と言う** ——
Prisma が provider 無しでモデルだけ出しているのと同じ立場で、**形が読めれば移せる**。

#### ★ 実測: **型が表の網羅を保証した**

`Record<TypeKind, DrizzleType | null>` にしてあるので、**表に余分なキーを書いた瞬間に
typecheck が落ちた**（実際 1 回落ちた）。**21 種を書き漏らしてもコンパイルが通らない。**

#### ★ 実測: **Drizzle が初めて `.ts` の golden を作った**

`tsconfig.json` の `include` が `tests/**/*.ts` なので、**golden が型検査に巻き込まれた**
（`Cannot find module 'drizzle-orm/pg-core'`）。**JPA は `.kt`、Prisma は `.prisma`
だったので当たらなかった。**

`exclude: ["tests/golden/**"]` を足した。**golden は成果物であってソースではない** ——
固定したいのは**バイト列**であって型ではないし、通すには `drizzle-orm` を依存に入れることになる。

#### 却下した案

- **型の表を 1 本に括る** —— 上の★。**どの DB でもない型名になる**
- **`relations()` も出す** —— スキーマ定義ではない
- **`sqlite` の `mode` を省く** —— **型の意味が変わる**
- **既定値をリテラルで書き直す** —— 式を含むので意味が変わりうる
- **`uniqueNames` を `naming.ts` へ括る** —— prisma.ts と同じ形だが、
  6-9e の「言語ごとの識別子の規則は各生成器が持つ」に沿って**各自に持たせた**。
  **括ると、片方を直したときにもう片方の golden が動く**
- **`drizzle-orm` を devDependency に入れて golden を型検査する** —— **固定したいのは
  バイト列**。依存を増やしても、出力が Drizzle として通ることの証明にはならない（下の申し送り）

#### 申し送り

- **★ 出力が実際に Drizzle として通るかは検証していない。** golden はバイト列を固定するだけで、
  **`drizzle-kit` に食わせる検査は無い**。**型関数名と import パスが正しいかは目で見た**だけ
- **`docs/TYPE-MAPPING.md` に ORM の節は無い**（#114 の対象範囲に挙げたが、開いたら
  DDL の型マッピングしか無かった）。**触っていない**
- **`sqlite` の `boolean` / `timestamp` の mode は、この母集団には現れない** ——
  sqlite の fixture は sqlite の実型で書かれている（6-6b）ので、型パレットに boolean 型が無い。
  **mode が出るのは `bigint` の 1 件**で、他は**下敷きを変換したとき**（6-10a）に出る
- **残るは SQLAlchemy**（6-0 が挙げた 4 本の最後）。**言語も生態系も違う**ので別段階
- **`ARCHITECTURE.md` のファイル表に `orm/` の行が無かった**（格子の説明にはあった）。
  **6-9d 以来の欠落**で、この段階で足した

### 2026-08-28 ORM ターゲットを 3 本で確定する —— SQLAlchemy は決めて外す

正本は [issue #116](https://github.com/propagandist/grabado/issues/116)。**段階に属さない**
（6-9f の直後で、§6 の分割表に行が無い）。**実装は 0 行** —— `ORM_TARGETS` も型の表も
1 バイトも動いていない。

#### これは新しい判断ではない

**段階6-9e が既にユーザー判断として「保留」を記録していた**（決めたこと 1）。理由 3 つは
あちらにある —— **ここに写さない**。要点だけ引く:

1. **「復活」の中身が元から動いていなかった**（classic mapping は 2.0 で削除済み／存在しない綴り／
   import を出さない／NOT NULL が黙って消える／27 列中 25 列が先頭型に落ちる）
2. 目的と合わない（自社は JPA、ブランディングは TS 圏）
3. 制約に反しない（「対応 DB を絞らない」は**対応 DB 8 本**の話。ORM は 6-9a が足した別の軸）

あちらは「**やらないと決めたのではなく後回し**。優先度は Prisma > Drizzle > SQLAlchemy」と
書いていた。**その 2 本が入り終わった**（6-9e / 6-9f）ので、**後回しを確定させる**のが本記録。

#### 決めたこと: **決めて外す**（再考の条件つき。ユーザー判断）

**#83 の決めたこと 5（レジストリで配らない）・#93 の判断 2（`HEALTHCHECK`）・段階2-5 の
CodeQL と同じ形。** 「まだ決めていない」ではなく「**決めて外した**」として残す。

**理由はいま強まっている** —— 6-9e（Prisma）と 6-9f（Drizzle）で **TS 圏が 2 本になった**。
6-9e が「grabado 自身の利用者層と重なる」と書いた層がそれで、**JPA と合わせて JVM 圏も埋まっている**。
**4 本目が埋めるのは Python 圏だけ**で、そこは自社利用にもブランディングにも当たらない。

##### ★★ 再考の条件

**Python 圏への訴求が実際に必要になったとき**（利用者の要望・自社での必要）に**別 issue で見直す**。

**★ そのときは「復活」ではなく新規開発である。** 上の理由 1 のとおり、**撤去した実装は
そのままでは走らない** —— **戻せばよいと読まないこと**。見直すなら
`jpa.ts` / `prisma.ts` / `drizzle.ts` と同じく**新しく書く**ことになる。

#### 「作り直す」という約束を訂正した

**`upstream 資産の表`に残っていた** ——「撤去した `sqlalchemy` は 6-9 で ORM 出力として
作り直す」。**元の記述は消さず、訂正を並べた**（org の作法）。

**6-0 の記録（2477 / 2480 / 2609 行あたり）は触っていない** —— **当時の判断**であり、
本記録が訂正の本体を持つ。

#### ★ ついでに直した: `generate.ts` のコメントが **3 か所とも古かった**

`ORM_TARGETS` の上の説明が、**6-9f で更新し忘れていた**:

| 書いてあったこと | 実際 |
|---|---|
| 「4 本のうち **2 本**」 | **3 本**（6-9f で Drizzle が入っていた） |
| 「**SQLAlchemy は保留**」 | 本記録で**決めて外した** |
| 「**どれも**『正規型 → 言語型』の表 1 つで書ける」 | **Drizzle には当たらない**（6-9f の実測で外れた見立て） |

**3 つ目がとくに悪い** —— **6-9f が否定した見立てが、入口のコメントに残っていた**。
**3 本の性質が揃っていないこと**（Prisma は逆参照を要求し、Drizzle は表が core ごとに要る）を
書き直した。

**段階ごとに自分の触った行だけを直していると、こうして入口が古くなる** ——
`ARCHITECTURE.md` のツリーが 3 世代ぶん古かったのと同じ形（#109）。

#### これで 6-9 が完了した

| §6 の段階 | 状態 |
|---|---|
| 6-0 〜 6-8d | 完了（撤去・型解決・PG18 パレット・テンプレート・TS 生成器・8 本の現代化） |
| 6-9a 〜 6-9f | **完了**（積み残し・識別子の警告・正規型・ORM 3 本） |
| 6-10a / 6-10b | 完了（プロファイル変換・出力先の UI） |
| **§6.4** | **残り**（日本語ロケール微調整・初期ズーム／スナップ・ロゴ差し替え） |

**§6 で残るのは §6.4 だけ。**

#### 却下した案

- **条件を書かず「やらない」と決め切る** —— 迷いは消えるが、**状況が変わったときに
  見直しの契機が無い**（ユーザー判断で「条件を書く」を選択）
- **「PR が来たら受ける」と書く** —— public な OSS なので自然だが、**受け入れ基準
  （golden の本数・型の表の網羅）を先に決めておかないと、来たときに判断できない**。
  **決めるならそれ自体が別の作業**
- **`isOrmTarget("sqlalchemy")` が throw するテストも消す** —— **外すと決めた以上、
  この例はむしろ適切**になる（「知らないターゲット」の実例として残る）
- **6-0 の記録を書き換える** —— 当時の判断。**誤りの訂正と方針の改訂は別物**（5-0 の立場）
- **`ORM_TARGETS` に `sqlalchemy` を「未対応」として足す** —— **出せないものを型に入れない**
  （6-9a が「ORM は db プロファイルではない」と決めたのと同じ立場）

---

### 2026-08-28 HANDOVER §6.4「その他」—— 公開の顔に名前を付け、`ja` の欠落を埋める

正本は [issue #118](https://github.com/propagandist/grabado/issues/118)。**§6.4 は段階6-4（初期テーブル
テンプレート）とは別物**で、HANDOVER の節番号のほう。**これで HANDOVER §9 の 9 項目が全部閉じる。**

#### ★ 実測 1: 公開の顔に upstream の名前が出ていた（2026-08-28）

**起票のために §6.4 の 4 項目を実測したら、2 つが想定と違っていた。**

| §6.4 の項目 | 想定 | 実測 |
|---|---|---|
| ロゴ差し替え | ロゴ画像を置き換える | **★ `<title>` が `WWW SQL Designer` のまま**。**`dist` にも同じ文字列**が出ており、**イメージがそれを配っていた**。**favicon の宣言は 0 本** |
| 初期ズーム | 既定値を変える | **★ 実装が 1 行も無い**（`frontend/js/` に `zoom` は 0 件）。**変える既定が存在しない** |
| 初期スナップ | 同上 | **実装済み**。既定は `wwwsqldesigner.ts` の `case "snap": return 0` ＝ 無効 |
| 日本語ロケール | 訳の調整 | **`ja.xml` に 5 キー欠落**（en 122 / ja 117）。**全 5 キーが実使用中** |

**★ 「ロゴ差し替え」は仕上げではなかった。** 2026-08-26 に public にし（#95）、README 2 本は英語で
書き換えたのに、**タブに出る名前は upstream のまま**だった。**#84 で `grabado.dev` に置けば、そこにも出る。**

**★ もう 1 か所あった** —— `index.html` の docs ボタンが
**`https://github.com/ondras/wwwsqldesigner/wiki`** を指していた。**#118 の対象範囲に挙げていなかった**が、
**同じ「公開の顔に upstream が出ている」**なので同じ PR で直した（→ 決めたこと 5）。

#### ★ 実測 2: `ja` の未訳は 5 キーだけではなかった。他言語が判断を分けた

キーを埋めたあと、**値が ASCII のみのもの**を洗ったら 14 件出た。**全部訳すのは誤り**で、
**`de` / `fr` を引いたら 2 群に割れた**:

| キー | en | de | fr | 判断 |
|---|---|---|---|---|
| `quicksave` | Quicksave | **Schnellspeichern** | **Enregistrer rapidement** | **訳す**（ja だけ落ちていた） |
| `http201` | Saved | **gespeichert** | **Sauvegardé** | **訳す**（同上） |
| `http400` 他 8 件 | Bad Request | Bad Request | Bad Request | **訳さない** |
| `importerror` | Could not read… | 英語のまま | 英語のまま | **訳す**（下記） |

**★ `http4xx` / `5xx` を原語で残すのは、upstream 全体の扱いに合わせたから** ——
**HTTP の reason phrase は番号とセットで意味を持つ**ので、報告や検索で原語のほうが通じる。
**「英語が残っている」と「訳していない」を、この 2 群が分けている。**

**`importerror` は de / fr も英語のまま**だが、**明確な文**（`Could not read the database structure`）で、
**日本語 UI に英文が 1 つ出る**。**訳し漏れであって判断ではない**と読んで訳した。

`notnull` / `null`（SQL キーワード）と `windowok`（OK）は触っていない。

#### 決めたこと 1: ★ upstream の著作権表示は 1 バイトも触らない

ライセンスは **BSD-3-Clause**（`license.txt`）で、**第 1 条がソース配布での著作権表示の保持を求めている**。
`index.html` 冒頭のコメントは**義務**で、消せば違反になる。**変えたのは `<title>` とアイコンだけ。**

**第 3 条も同じ向きに効く** —— 「Ondrej Zara の名を派生物の宣伝に使ってはならない」。
**`WWW SQL Designer` を掲げたまま公開しないほうが、条項の趣旨に沿う。**

**★ grabado の由来を説明する行も足していない** —— 足すなら英語（隣が英語）だが、
`CLAUDE.md` の文章の値は「**`README.md` だけ英語**」。**義務の表示に手を入れず、範囲も広げない**を採った。

#### 決めたこと 2: 初期ズームは「**決めて外す**」（再考の条件つき）

**実装が 1 行も無いので、やるなら新規機能**になる。§6.4 は仕上げの枠なので、
#83 の決めたこと 5（レジストリ）・段階2-5 の CodeQL・#117 の SQLAlchemy と同じ形で残す。

**再考の条件**: 大きな設計で全体を見渡せないという要望が実際に出たとき。**そのときは新規開発。**

#### 決めたこと 3: snap の既定は **`0` のまま**（ユーザー判断）

変えると**新規テーブルの配置と、既存設計を動かしたときの座標が変わる**。
**§6.4 は仕上げの枠で、挙動を変える判断には根拠が要る。**

#### 決めたこと 4: favicon は **SVG 1 枚**。色は既存 UI から採る

- **色は `styles/material-inspired.css` のアクセント `#de2665`** —— **新しいブランド色を作らない**
  （作れば UI と favicon で色の正本が 2 つになる）
- **図柄は 2 つの実体とリレーション線**（ユーザー判断）。**寸法は 16px から逆算した**（下の実測 3）
- **script を持たない** —— CSP は `img-src 'self' data:` のままで足りる（`SecurityHeadersFilter` 不変）
- **★ `dist` に 2 つ出る**（`assets/favicon-<hash>.svg` と `images/favicon.svg`）。
  `viteStaticCopy` が `images/` ごと写し、Vite が `index.html` の参照を別に処理するため。
  **既存の `throbber.gif` と同じ性質**なので、この段階では触っていない

#### ★ 実測 3: favicon は 4 度作り直した —— **16px から逆算する**

**最初の案は 16px で「ピンクの四角」にしかならなかった。** 実サイズで並べて初めて分かった
（**それまで 32px の 1 枚しか見ていなかった**）。作り直しのたびに規則が 1 つずつ出たので、
**案そのものより規則を残す。**

| # | 何が起きたか | 出た規則 |
|---|---|---|
| 1 | **見出し帯が消えた** —— 帯を 1.6 単位で描いていた | **viewBox 32 で 16px 表示なら 2 単位 = 1px。面・帯・隙間の下限は 3 単位（1.5px）** |
| 2 | **縦積みが「工」「三」に見えた** —— 左右対称に整えたため | **ER らしさは非対称から来る。** 対称形は図ではなく**記号**として読まれる |
| 3 | **線が箱と融合して「ジグザグの塊」になった** —— 規則 1 を線にも当てて 4 単位にした | **下限の規則を線に当てない。** 線は箱と同じ白なので、**太らせると面と融合する**。太さは**箱の高さとの比**（10 : 2.2 ≒ 4.5 : 1）で決める |
| 4 | **斜め線の端が箱からはみ出した** —— 端点は辺の中央に乗っていた | **butt cap は線に垂直に切られる。** 接線が辺に対して斜めなら**角が飛び出す**。曲線にすれば端点の接線が辺に垂直になり、**原理的に起きない** |

**★ 「16px で消えないこと」と「線に見えること」は別の要求だった**（規則 3）。
最初に立てた下限の規則を全要素へ機械的に当てたのが誤りで、**面には効くが線には効かない**。

**★ 曲線は `frontend/js/relation.ts` の `redrawNormal` と同じ式にした** ——
`M p1 C (p1+half) … (p2-half) … p2`（両端から軸方向へ出て中間で S 字。half = 距離の半分）。
**アプリが実際に描いている線と同じ形**であり、**規則 4 の破綻も同時に消える**
（食い込ませる細工が要らなくなった）。**ユーザーの「曲線のほうが雰囲気が出る」から入って、
実装を読んだら根拠が出てきた形。**

**★ 目視の確かめ方も残す** —— **16 / 32 / 64 / 128px を 1 枚に並べ、タブに置いた状態
（ライト・ダーク）も作る**。`<symbol>` ＋ `<use>` なら定義 1 回で全サイズを出せる。
**32px を 1 枚見るだけでは、16px で消えるものが見えない。**
#### 決めたこと 5: docs ボタンは直す。`docs/TYPE-MAPPING.md` の ORM 節は**外す**

- **docs ボタン**は #118 の対象範囲外だったが、**同じ「公開の顔」**なので直した
  （`https://github.com/propagandist/grabado#readme`）。`target="_blank"` に **`rel="noopener noreferrer"`** も足した
- **★ ORM の型マッピング表は外した** —— 6-9f の申し送りで #118 の対象範囲に入れていたが、
  **6-10b が「型マッピング表は手で書かない」と決めている**（`tests/node/type-mapping.test.ts` が
  docs の表を読んで実際の出力と 1 セルずつ比べる）。**同じ形にするには ORM 生成器を読む
  ハーネスが要り、仕上げの枠を超える。** **手書きの表を足すのは、その判断に反する**ので
  **別 issue**。#118 にも記録した

#### 検証（2026-08-28 実測）

| | 結果 |
|---|---|
| `npm run typecheck` | 緑 |
| `npm test` | **605 passed**（24 ファイル） |
| `npm run test:browser` | **205 passed** |
| `npm run test:dist` | 6 passed |
| `npm run known-issues` | 1 passed |
| `npm run test:image` | **手元では回せなかった**（下記） |
| **golden** | **114 本が 1 バイトも動いていない**（`git status tests/golden/` が空） |
| `dist` の `<title>` | **`grabado`**（favicon は `/assets/favicon-<hash>.svg`） |
| `ja` / `en` のキー集合 | **122 = 122 で完全一致**（`comm` が両方向 0 行） |

**変更は 3 ファイルだけ** —— `frontend/index.html` / `frontend/locale/ja.xml` / `frontend/images/favicon.svg`（新規）。

**★ `test:image` は手元の 8080 が塞がっていて回せなかった**（2026-08-28）——
listen していたのは**別プロジェクト（`D:\projects\recibir`）の Spring Boot**。
**他プロジェクトの動作中プロセスは止めない**ので、**判定は `ci-image` に渡した**（PR で走る）。

**★ もっとも、手元の image E2E は `ci-image` の代わりにならない。** #103 で分かったとおり
**Docker Desktop for Windows は所有権を偽装する**ので、**ubuntu で出る欠陥をここでは踏まない**。
**この段階の変更は静的資産（`<title>` / favicon / locale）**なので、
**イメージが配るものは `dist` テスト（6 本・緑）が既に見ている。**

**★ 2-4 が入れた案内がそのまま効いた** —— `compose.ts` の
「8080 を別のコンテナが掴んでいないか確認する（`docker ps …`）」。
**ただし掴んでいたのはコンテナではなくホストのプロセス**で、**`docker ps` には出なかった**
（`Get-NetTCPConnection -LocalPort 8080` で特定）。**案内の文面が「コンテナ」に閉じている。**

#### 却下した案

- **`index.html` 冒頭の著作権コメントを消す／版表記を書き換える** —— **BSD-3-Clause 第 1 条**（決めたこと 1）
- **19 言語を機械翻訳で埋める** —— **間違いに気づけない文字列がプロダクトに載る**。
  6-9b / 6-10b の判断を維持する
- **`http4xx` / `5xx` も訳す** —— 実測 2。**de / fr が原語で残している**
- **favicon を `.ico` で置く** —— 32×32 の SVG 1 枚で足りる。**ラスタを 4 サイズ持つと更新点が増える**
- **`<title>` を `grabado - ER design tool` にする** —— **タブに出るのは名前で、説明ではない**
- **snap の既定を変える** —— 決めたこと 3（ユーザー判断）
- **`frontend/favicon.svg`（root 直下）に置いて dist の二重を避ける** —— **画像は `images/` という
  既存の置き方を崩す**ほうが高くつく。二重は `throbber.gif` から続く既存の性質（決めたこと 4）

#### 申し送り

- **★ HANDOVER §9 の 9 項目がこれで全部閉じた。** 残る作業はリポジトリの外側
  （**#84** 公開デモ）と、**#105**（Dependabot alert 2 件）、**未起票の宿題 2 つ**
  （Drizzle を `drizzle-kit` に通す検証 ／ Chromium キャッシュのキー設計）、
  **本段階で外した ORM の型マッピング表**
- **★ favicon の見え方は目でしか確かめられない。** 16px の実表示・ダークタブでの視認は
  **自動テストが 1 本も見ていない**（`dist` テストが見るのは配られることだけ）
  **★ 実際、4 度作り直すまで気づけなかった**（実測 3）。**確かめ方は実測 3 に書いた** ——
  **16 / 32 / 64 / 128px とタブの状態を 1 枚に並べる**
- **`ja` 以外の 19 言語は英語のまま**（6-9b / 6-10b の判断を維持）。**`ja` だけが完全になった**
- **`index.html` に残る upstream 参照は著作権コメントの 1 行だけ**になった（実測。義務のぶん）

### 2026-08-28 ORM 出力 3 本を実物の道具に通す —— 通す一覧を先に決める

正本は [issue #120](https://github.com/propagandist/grabado/issues/120)。**段階に属さない**
（6-9f の後で、§6 の分割表に行が無い。#117 / #118 と同じ）。**HANDOVER §9 が全部閉じた後の
最初の作業**で、選んだ理由は「成果物の正しさに直結する未検査がここだけ残っていた」。

#### ★ 実測 1: 42 本のうち 9 本が、実物の道具に受け付けられなかった（2026-08-28）

**使い捨てコンテナで 3 本とも走らせた。** issue 本文は「golden は 24 本」と書いていたが
**実際は 42 本**（14 本 × 3 ターゲット）。

| 道具 | 版 | イメージ | PASS | FAIL | SKIP |
|---|---|---|---|---|---|
| JPA | kotlinc 2.4.10 ＋ jakarta.persistence-api 3.2.0 | `eclipse-temurin:25-jdk` | **13** | 0 | 1 |
| Prisma | prisma 6.19.1 | `node:24` | 12 | **1** | 1 |
| Drizzle | drizzle-orm 0.45.2 ＋ typescript 5.9.3 | `node:24` | 5 | **8** | 1 |

SKIP はいずれも `postgresql/empty`（**3 本とも 0 バイト**＝道具に渡すものが無い）。

**Drizzle が落ちた 8 本は 4 種類:**

| エラー | 本数 | 何が起きていたか |
|---|---|---|
| `TS2305 ... 'drizzle-orm/pg-core' has no exported member 'bytea'` | 4 | **pg-core に `bytea` は無い。** binary 系の export は `bit` と `customType` だけ |
| `TS2305 ... 'drizzle-orm/mysql-core' has no exported member 'blob'` | 2 | **mysql-core に `blob` は無い。** あるのは `binary` / `varbinary` |
| `TS2307: Cannot find module 'drizzle-orm/mssql-core'` | 1 | **★ Drizzle に mssql core は存在しない。** 実在するのは pg / mysql / sqlite / singlestore / gel |
| `TS7022` / `TS7024` | 1 | 自己参照 FK。**戻り型の注釈が無いと循環推論で落ちる** |

**Prisma は `postgresql/minimal.prisma` の 1 本**（`P1012`。`model Thing` に `@id` も
`@unique` も無い）。**JPA は 0 本** —— `quotes-i18n.kt` のバッククォート識別子内の `"`
（``var `say "hi"` ``）も通った。

**6-9f の申し送り「型関数名と import パスが正しいかは目で見ただけ」が、そのまま当たった。**
6-8a の `DEFAULT (UUID())` と同じ形で、**実物に流さなければ golden は緑のまま
壊れた出力を固定していた**。

#### ★ 実測 2: 検証環境の不備を 2 度、欠陥と読み違えかけた

1 度目 —— golden を `/golden` に、`node_modules` を `/work` に置いたので、**全 13 本が
`TS2307 Cannot find module 'drizzle-orm'` で落ちた**。`drizzle-orm` 自体が見つかっていない
のだから道具の問題ではない。**golden を作業領域へ写してから検査する**のが正しい。

2 度目 —— `jar xf` で Kotlin コンパイラを展開したら**実行ビットが落ち**、全 13 本が
`Permission denied` で落ちた（`chmod +x` が要る。`unzip` は temurin に入っていない）。

**どちらも「13 本中 13 本が落ちる」という形**だった。**一様に落ちたら、まず検証側を疑う** ——
本当の欠陥は 8 / 13 のように偏る。

#### 決めたこと 1: 粒度は**構文・型検査どまり**（ユーザー判断）

Drizzle=`tsc --strict --skipLibCheck`／Prisma=`prisma validate`／JPA=`kotlinc`。
**`drizzle-kit generate` / `prisma migrate diff` はやらない** —— 設定ファイルと接続情報が要り、
**使い捨てで完結しなくなる**。issue 本文の「検証の粒度も未決」への回答。

**`--strict` は必須。** off にすると自己参照 FK が暗黙 `any` に落ちて **TS7022 が出ず、
検査が素通りする** —— いちばん見つけたい類の欠陥が見えなくなる。

#### 決めたこと 2: 「通す一覧」を先に決める（issue 本文の候補 a。ユーザー判断）

**known-issue には落とさない** —— あそこは「**直すべき不具合**」の置き場所で、
「その組み合わせが存在しない」を混ぜると「直る予定」の列が書けなくなる。
候補 (c)（生成器の出力を減らす）は採らない。

**★ ただし実測の結果、「対応する概念が無いから通らない」は 1 件も無かった。**
issue 本文が例に挙げた h2 × Drizzle は、**pg-core の形で出している以上、pg-core の
TypeScript としては妥当であるべき**で、落ちた理由は `bytea` という**存在しない名前**だった。
**「core が無い」は型検査の合否と無関係。** `EXCLUSIONS` は **0 件**で始まる。

#### 決めたこと 3: 除外は**理由が型で必須**。0 バイトは計算で出す

[`tests/orm-tools/cases.ts`](tests/orm-tools/cases.ts) の `Exclusion` が `reason` を要求する。
**0 バイトの golden は除外リストに書かない** ——「空なら道具に渡すものが無い」は**規則であって
一覧ではない**。`empty` の出力規則が変わった日に、書いた一覧は黙って腐る。
[`fixtures.ts`](tests/support/fixtures.ts) の「リストは人が書き写すもので実体とずれうる」と同じ立場。

#### 決めたこと 4: 落ちた 9 本は**全部直した**

| 落ちたもの | どう直したか |
|---|---|
| pg-core の `bytea` | **`customType` で定義して出す**（Drizzle 公式の方法）。丸めると bytea という実型の情報が落ちる |
| mysql-core の `blob` | **`customType` で `longblob`。** `varbinary` に落とすと**上限が 4GB から 64KB に狭まる** —— パレットの `bytea` は LONGBLOB で、DDL 側も「上限が広がる（安全側）」で選んでいる |
| `drizzle-orm/mssql-core` | **`DRIZZLE_CORES` から `mssql` を外した。** h2 / oracle / sql-standard と同じ「対応する core が無い」扱いになり、**理由が先頭コメントに出る**。**出力自体はやめない**（`CLAUDE.md` の「対応 DB を絞る判断はしない」） |
| 自己参照 FK の TS7022 | **自己参照のときだけ** `.references((): AnyPgColumn => ...)` の戻り型を注釈する。他テーブルへの参照では推論できるので付けない |
| Prisma の P1012 | **Prisma 自身に倣って `@@ignore`。** introspection が同じ状況で出すのがこれで、**道具自身が持っている逃げ道には grabado も乗る** |

**★ 基準は「組み込みで正規型の意味を表せるか」。** 表せるなら組み込みを使う ——
`customType` は出力が膨らむので、避けられるなら避ける（sqlite の `blob` は組み込みのまま）。

#### 決めたこと 5: `devDependencies` は増やさない・**CI にも載せない**

検証は [`tests/orm-tools/`](tests/orm-tools/) に置き、`npm run test:orm-tools` で手元から回す。
**`test:all` にも足さない**（`test:image` も入っていない＝「Docker が要る層は入れない」が既に効いている）。

**ただし「通す一覧」の整合検算は `npm test` に載せた**（ユーザー判断）——
[`tests/node/orm-tools.test.ts`](tests/node/orm-tools.test.ts)。**Docker を 1 秒も使わず
ファイルを読むだけ**で、`fixture-set.test.ts` と同じ役割。issue 本文が禁じているのは
**道具を走らせること**なので、射程の外と読んだ。**回さない日が続けば除外の表は黙って腐る。**

#### 決めたこと 6: Prisma の provider 無し 3 本は**検証時だけ prelude を足す**（ユーザー判断）

h2 / oracle / sql-standard は `datasource` も `generator` も持たない（golden のヘッダが
「使うときは自分で足すこと」と言っている）。**golden は 1 バイトも変えず**、検証時に
`datasource` を**末尾へ連結**する。**末尾にするのは、エラーの行番号が golden の行番号のまま
読めるから**（先頭に足すとずれる）。

**provider は `postgresql` 固定でよい** —— 6-9c が native type 属性を出さないと決めているので
**Prisma のスカラーは provider 非依存**。**実測でも 3 本とも PASS した。**

#### 決めたこと 7: `server/` の Gradle は使わない・repo に golden 用 tsconfig を置かない

**Gradle に載せると golden が `./gradlew build` の入力になり、`ci-server.yml` がそれを回す**
＝「CI に載せない」に自動的に違反する。加えて `TypeSample` が 8 ファイルで重複し、
`dependencyLocking` が配布物のビルド入力を動かす。**独立した使い捨てコンテナにした。**

**golden 用の `tsconfig.json` も repo に置かない** —— 置いた瞬間 `npm run typecheck` が
`drizzle-orm` への依存を要求する。[`tsconfig.json`](tsconfig.json) の
`exclude: ["tests/golden/**"]`（「golden は成果物であってソースではない」）を崩さない。
**検証用の設定はコンテナ内の CLI フラグとしてしか存在しない。**

**イメージはタグ止め・道具の版はピン止め・digest は毎回印字。** `Dockerfile` が digest ピン
なのは**配布物を作るから**（org `security-baseline.md` §5.1）で、このコンテナは何も生み出さない。

#### ★ この検査が捕まえないもの —— 別 issue [#123](https://github.com/propagandist/grabado/issues/123)

構文・型検査どまりなので、**「情報が落ちている」は 1 つも捕まらない**。実測で 1 件見つかった ——
**Drizzle が複合 PK を出していない**（`house-defaults` の `article_tags` は
`(article_id, tag)` の複合 PK を持つが `primaryKey()` が出ていない。生成器の `primaryKeyOf`
が単一列 PK にしか触れていない）。**Prisma は `@@id([...])`、JPA は `@IdClass` を出している
のに、Drizzle だけが落としていた。**

**型検査は通る**（複合 PK が無くても TypeScript としては妥当）ので、**#120 の検査では
原理的に捕まらない**。粒度が違うので別 issue に切った。**書き残さないと
「3 本とも検証済み」が実態より強く読まれる。**

#### ★ ついでに直した: 文書のずれ 3 件

**どれも #120 の作業中に実物を読んで気づいたもの**で、#117 の「入口が古くなる」と同じ形:

- [`tests/golden/README.md`](tests/golden/README.md) の一覧が **`jpa=.kt / prisma=.prisma`
  のままで drizzle が無かった**（6-9f の更新漏れ）。本数も「28 本」のままだった
- [`docs/TESTING.md`](docs/TESTING.md) が known-issue の収録を「**2 本**」と書いていたが、
  [`tests/known-issues/README.md`](tests/known-issues/README.md) は「**残るのは 1 本**」
  （#9 は直って移設済み）。**訂正を追記し、元の記述は消していない**
- [`CLAUDE.md`](CLAUDE.md) のラベルが「12 種」だったが**実測 13 種**（`java` が増えていた。
  `dependencies` / `docker` / `javascript` に続く 4 本目の bot 産）。
  **数を書いた時点で、bot が足した日に古くなる** —— 選ぶ前に `gh label list` を見る

#### 検証（2026-08-28 実測）

| 何を | 結果 |
|---|---|
| `npm run typecheck` | 緑（新スクリプト 2 本が strict を通る） |
| `npm test` | **611 本**（605 ＋ 検算 6 本）が緑 |
| 検算が効くか | `EXCLUSIONS` にでたらめな 1 行を足すと**名指しで赤くなる**ことを手で確認し、戻した |
| `npm run test:orm-tools` | **3 道具とも OK。39 本走らせて 0 FAIL、3 本 SKIP**（`empty`） |
| golden の差分 | **14 ファイル**（Drizzle 13 ＋ Prisma 1）。**JPA は 0 件**＝触っていないことの裏取り |
| `devDependencies` | **増えていない**（`package.json` の差分は script 1 行だけ） |

#### 却下した案

- **`drizzle-kit` / `prisma` を devDependencies に足す** ／ **CI に載せる** ／
  **golden を目で読む**（issue 本文の 4 つ。**6-9f がそれをやって「目で見ただけ」と書いた**）
- **Prisma の provider 無し 3 本を「除外」にする** —— **型写像の軸が 8 プロファイル中 3 つ
  未検査になる**。prelude を足せば通ることが実測で分かった
- **prelude をファイルの先頭に足す** —— 行番号がずれてエラーが読めなくなる
- **mysql の binary を `varbinary` に落とす** —— 組み込みがあるので楽だが、
  **上限が 4GB から 64KB に狭まる**（意味が変わる）
- **mssql の Drizzle 出力をやめる** —— 出力自体を減らすことになる。
  h2 / oracle / sql-standard と同じ「読み替え前提」に揃えた

#### 申し送り

- **`EXCLUSIONS` が 0 件であることに意味がある** —— 落ちたものを除外で黙らせていない
- **この検査は手元でしか回らない**（要 Docker ＋ ネットワーク）。**回さない日が続いても
  整合検算だけは `npm test` が見る**が、**道具の版が上がって落ちるようになったかは分からない**
- **道具の版はピン止めしてある。** 上げるときは `cases.ts` の `versions` を動かし、
  **落ちたものが「版差」か「grabado の欠陥」か**を切り分けること（README の判定木 ①）
- **複合 PK の脱落（#123）は未着手。** 型検査では捕まらない軸なので、
  **`tests/node/orm.test.ts` に 3 ターゲット横断の検査を 1 本**入れるのが本題

### 2026-08-28 Drizzle 出力からキーが落ちていた —— 検査を 3 ターゲット横断で書く

正本は [issue #123](https://github.com/propagandist/grabado/issues/123)。**段階に属さない**
（#117 / #118 / #120 と同じ）。**#120 の申し送りが「本題」と名指ししていた 1 本**で、
見つけたのも #120 の実測中だった。

#### ★ 実測 1: 落ちていたのは複合 PK だけではなかった（着手前に読み直して分かった）

| キー | JPA | Prisma | **Drizzle** |
|---|---|---|---|
| 複合 PK | `@IdClass` | `@@id([...])` | **無し** |
| UNIQUE | `@Table(uniqueConstraints = [...])` | `@@unique([...], map: ...)` | **無し** |
| INDEX | `@Table(indexes = [...])` | `@@index([...], map: ...)` | **無し** |

[`drizzle.ts`](frontend/js/io/orm/drizzle.ts) が `table.keys` を読むのは `primaryKeyOf` の
**ただ 1 か所**で、そこも単一列 PK にしか触れていない ——**キーを扱う経路そのものが無かった**。
issue 本文は複合 PK だけを挙げていたが、**同じ形の脱落が 3 種あった**（記録は同 issue のコメント）。

#### 決めたこと 1: キー 3 種すべてを直す（ユーザー判断）

**#123 を #120 から分けたのとは向きが逆になる。** 分けない理由:

- **実装箇所が同じ** —— 3 種とも `pgTable` の第 3 引数（テーブル設定）に出る
- **動く golden も同じ 2 本** —— ORM golden 14 本のうち複合 PK を含むのは 2 件、UNIQUE を
  含むのは 1 件（どちらも postgresql）。**UNIQUE を足しても動くファイルは増えない**
- **本題が半分にならない** —— 検査を複合 PK だけに絞ると、**UNIQUE の脱落は緑のまま残る**

#### 決めたこと 2: 単一列 PK は 1 バイトも動かさない

複合 PK のときだけ第 3 引数に `primaryKey({ columns: [...] })` を出し、**単一列は列修飾子
`.primaryKey()` のまま**。**キーが 1 つも無ければ第 3 引数ごと出さない** —— 空の配列を渡す形は
無意味で、キーを持たないテーブルの出力が動く理由も無い（実際 **41 本が 0 バイト差**）。

#### 決めたこと 3: PK の制約名は出さない（**3 本共通の脱落**として残す）

Drizzle は `primaryKey({ name, columns })` を許すが、**JPA も Prisma も PK 名を落としている**
（`pk_article_tags` はどの出力にも残らない）。**Drizzle だけ出すと非対称になる。**
UNIQUE / INDEX の名前は 3 本とも出しているので出す。**#123 の射程外**（申し送り）。

#### 決めたこと 4: 検査は**ターゲットを跨ぐ 1 本**

[`tests/node/orm.test.ts`](tests/node/orm.test.ts) に `KEY_MARKERS`（ターゲット × キー種別の表）を
置き、`ORM_TARGETS` を回す。**Drizzle だけの検査にしない** —— 4 本目の ORM を足した日に
**足し忘れても緑のまま**になる。`Record<OrmTarget, ...>` なので、**ターゲットが増えると表を
埋めるまで型検査が通らない**。

**両方向で見る** —— fixture が該当キーを持つ ⇔ golden に印が出ている。持たない設計に印が
出ていないことも見る（偽陽性を防ぐ）。**母集団が空でないことも主張する**（0 件だと黙って
緑になる）が、**数は焼き込まない**。

**★ 単一列 PK と混ざらない印を選ぶ** —— Drizzle の複合の印は `primaryKey({`。
単一列は `.primaryKey()` なので一致しない。

#### ★ 実測 2: 3 core とも実在した —— **golden に出ない 2 core は手で確かめた**

`npm run test:orm-tools` は **39 本走って 0 FAIL・3 SKIP**（#120 の基準線のまま）。
**ただしそれで通ったのは pg-core だけ** —— ORM golden の構造ケースは postgresql しか無く、
**mysql-core / sqlite-core のキー出力は 1 本も golden に現れない**。

そこで **mysql / mariadb / sqlite の `house-defaults` を一時的に出力し**（fixture は 8 本とも
複合 PK と UNIQUE を持つ）、**INDEX を手で足した版**と合わせて 7 本を同じ使い捨てコンテナの
`tsc --strict` に通した。**7 本とも PASS** —— `primaryKey` / `unique` / `index` は
**pg / mysql / sqlite の 3 core とも実在し**、**コールバックが配列を返す形も 0.45.2 で通る**
（オブジェクトを返す形は deprecated）。

**#120 の「目で見ただけ」を繰り返さないための実測。** INDEX は fixture に 1 件も無いので
golden では守れず、**ここでしか確かめられない**。

#### 検証（2026-08-28 実測）

| 何を | 結果 |
|---|---|
| `npm run typecheck` | 緑 |
| `npm test` | **612 本**（611 ＋ 横断検査 1 本）が緑 |
| 検査が効くか | `KEY_MARKERS.drizzle.compositePk` を壊すと **2 件を名指しで**赤くなることを確認し、戻した |
| `npm run test:browser` | **205 本**が緑（golden の権威側） |
| `npm run test:orm-tools` | **3 道具とも OK。39 本走って 0 FAIL、3 SKIP** |
| golden の差分 | **Drizzle の 2 本だけ**（`house-defaults.ts` / `relations.ts`）。**他 41 本は 0 バイト差** |

#### 却下した案

- **複合 PK だけ直す**（issue 本文の範囲）—— 決めたこと 1
- **Drizzle だけの検査にする** —— 4 本目の ORM で足し忘れる（issue 本文も却下している）
- **型検査を強めて捕まえる** —— **原理的に無理**。複合 PK が無くても TypeScript としては妥当で、
  #120 の検査は実際に PASS していた
- **ORM golden の母集団に mysql / sqlite の `house-defaults` を足す**（キー出力を golden で守る）
  —— 母集団の切り方（「**構造の側はプロファイルに依らない**」。[`fixtures.ts`](tests/support/fixtures.ts)）を
  変えることになり **6 本増える**。**Drizzle だけは構造も core に依る**ので理はあるが、
  今回は実測 2 で足りた ——**足すなら別に決める**（申し送り）

#### 申し送り

- **PK の制約名は 3 本とも落ちている**（決めたこと 3）。直すなら **3 本同時**で、別の判断
- **mysql-core / sqlite-core のキー出力は、いま golden が 1 本も持っていない。**
  実測 2 は**手で 1 回やっただけ**で、**回り続ける検査ではない** —— core の版が上がって
  `unique` / `index` の形が変わっても、**気づくのは誰かが同じことを手でやったとき**
- **INDEX を持つ fixture は 1 件も無い**（キー種別は **PRIMARY 80 / UNIQUE 8**）。
  横断検査はキー種別を回すので、**INDEX の fixture が入った日に自動で効く**
- **import する名前が 3 つ増えた**（`primaryKey` / `unique` / `index`）。**テーブル変数名が
  これらと同じだと二重宣言になる** —— ただしこれは型関数名（`text` など）で**元からある形**で、
  増えたのは語数だけ。**未実測**（確かめるにはその名前のテーブルを持つ fixture が要る）

### 2026-08-29 ORM の型マッピング表を出す —— 3 度目で入った

正本は [issue #122](https://github.com/propagandist/grabado/issues/122)。**段階に属さない**
（#117 / #118 / #120 / #123 と同じ）。**2 度先送りされていた** —— 6-9f が対象範囲に挙げて
「開いたら DDL の型マッピングしか無かった。触っていない」と申し送り、#118（§6.4）でも
対象範囲に入れて着手時に外している。**難所が 2 つあったから**で、issue 本文がそれを
書き留めていたので 3 度目で入った。

#### 決めたこと 1: 表は **1 枚（8 型 × 5 列）＋ core 対応の小表**（ユーザー判断）

難所 1（Drizzle は core ごとに型が違う）の回答。**JPA と Prisma は 1 列で足りる** ——
どちらも kind から型が決まり**下敷きの DB に依らない**（Prisma の provider は `datasource`
ブロックにしか現れない）。**Drizzle だけ 3 列**（pg / mysql / sqlite）。合わせて 5 列。

**別ファイル（`TYPE-MAPPING-ORM.md`）にはしない** —— 5 列に収まるので、**利用者が 2 か所を
見る**理由が無い（issue 本文が候補として残していたもの）。

#### 決めたこと 2: セルは**列名を除いた型表現**（ユーザー判断）

難所 2（ORM の出力はコード）の回答。`timestamp({ withTimezone: true })` の形で書く ——
**第 1 引数（列名）は型ではない**ので落とし、**`mode` / `withTimezone` は残す**。

**残すのが要点** —— 型関数名だけにすると、6-9f の「**mode を落とすと真偽が数値になる**」
という判断が**表から見えなくなる**。表は「何が落ちるか」を示すためにある。

#### 決めたこと 3: 突き合わせる相手は**出荷されるバイト列**

`KOTLIN_TYPES` / `PRISMA_TYPES` / `DRIZZLE_TYPES` を export して照合する案は採らない ——
**表と実際の出力の間に 1 段挟まる**。生成器を実際に呼び、出力の列行から型を抜く
（[`type-mapping.test.ts`](tests/node/type-mapping.test.ts) の `typeCells`）。
**DDL 側が `convertDesign` の出力を見ているのと同じ立場**に揃えた。

**抜き出しが壊れたときは、表と比べる前に赤くする**（`型を 8 つ抜けていない`）。

#### 決めたこと 4: 節は**見出しで区切る**

**DDL の表と ORM の表は先頭セルが同じ**（house 既定の型名）なので、**文書全体を舐めると
後の表が前の表を黙って上書きする**。`sectionLines` が `## ` で区切り、**見出しが消えたら
例外**にしてある —— 表ごと消えたときに緑にしない。

#### 決めたこと 5: **core の対応表も手で書かない**

8 プロファイル × core の小表は、**出力の `import` 行から読む**（`drizzle-orm/pg-core`）。
対応が無いプロファイルは先頭コメントが「その core は無い」と言うので、それで判別する。
**手で書けるのは 8 行だが、書いた日から腐る**（6-10b の立場）。

#### ★ 実測 1: 表を作ったら食い違いが 1 件見つかった（[issue #126](https://github.com/propagandist/grabado/issues/126)）

**sqlite 向け Drizzle が INTEGER 列を `blob({ mode: "bigint" })` で出している。** 同じ設計から
出した DDL は `INTEGER`。sqlite パレットの `INTEGER` が `kind="int64"`（SQLite の INTEGER は
64 bit なので正しい）で、`DRIZZLE_TYPES.sqlite.int64` が `blob` を返すため。
**house 既定 8 型のうち 2 つ（`INTEGER` / `BOOLEAN`）が該当する** —— sqlite ではどちらも
`INTEGER` に写るので、**sqlite で設計する利用者はほぼ必ず踏む**。

**#122 には混ぜない**（ユーザー判断）—— **軸が違う**（表を出す作業と、型写像の是正）。
**表は実装を映すのが役目**で、**欠陥が見えたこと自体がこの表の価値**。散文から #126 を指した。

#### ★ 実測 2: **サイズは 3 本とも出さない**

`NUMERIC(12,2)` は `numeric()` / `Decimal` / `BigDecimal` になり、**桁数が落ちる**。
**Prisma だけ理由が記録されている**（6-9c の「native type 属性を出さない」）が、
**JPA と Drizzle には記録が無い** —— 実装は同じ扱いなので、**表と散文に書いて可視化した**。

#### 検証（2026-08-29 実測）

| 何を | 結果 |
|---|---|
| `npm run typecheck` | 緑 |
| `npm test` | **620 本**（612 ＋ ORM 表の 8 本）が緑 |
| **docs を壊すと赤くなるか** | `uuid()` を `zzzz()` にすると **`Drizzle pg-core / UUID` を名指しで**赤くなる。戻した |
| **実装を壊すと赤くなるか** | `KOTLIN_TYPES.uuid` を変えると **`JPA (Kotlin) / UUID`** が赤くなる。戻した（逆方向） |
| `npm run test:browser` | **205 本**が緑 |
| golden の差分 | **0 本**（表を足しただけで、生成器は 1 バイトも触っていない） |

#### 却下した案

- **手書きの表を足す** —— 6-10b の決定に反する。**腐る**
- **DDL の表に ORM の列を足す** —— **軸が違う**（DDL は「どの DB を下敷きにするか」、
  ORM は「どの言語で出すか」。6-10b が select を分けたのと同じ整理）
- **`docs/TYPE-MAPPING-ORM.md` を作る** —— 決めたこと 1
- **生成器の内部表を export する** —— 決めたこと 3
- **#126 を同じ PR で直す** —— 実測 1

#### 申し送り

- **冒頭のタイトルは触っていない**（ユーザー判断）。文書は DDL と ORM の両方を扱うが、
  見出しは「house 既定が各 DB で何になるか」のまま
- **JPA と Drizzle がサイズを出さないことに、決定の記録が無い**（Prisma だけ 6-9c にある）。
  3 本とも同じ扱いなので**意図と読めるが、記録されていない**
- **表は postgresql の設計を出発点にしている。** DDL 側の表と同じ切り方で、
  「8 プロファイル × 3 ORM」にはしていない（**出発点を 1 つに固定すれば写像の全体は覆える**
  という 6-10a の判断に乗っている）

### 2026-08-29 sqlite の Drizzle が INTEGER を blob で出していた —— 列型の一致を採る

正本は [issue #126](https://github.com/propagandist/grabado/issues/126)。**段階に属さない**。
**#122 の型マッピング表を作る途中で見つけた** —— **表が実装を映す形になった初日に、
その表が欠陥を 1 件出した**。

#### ★ 何が起きていたか

`frontend/db/sqlite/datatypes.xml` の `INTEGER` は **`kind="int64"`**（SQLite の INTEGER は
64 bit なので正しい）。[`drizzle.ts`](frontend/js/io/orm/drizzle.ts) の
`DRIZZLE_TYPES.sqlite.int64` が **`blob({ mode: "bigint" })`** を返していたので、
**house 既定の `INTEGER` も `BOOLEAN` も blob になり**、同じ設計から出した DDL の `INTEGER` と
**列型が食い違っていた**。**sqlite で設計する利用者はほぼ必ず踏む**。

**型検査では捕まらない**（#123 と同じ軸）—— blob でも TypeScript としては妥当で、
#120 の `test:orm-tools` は PASS していた。

#### 決めたこと 1: **列型の一致を採る**

| | 列型 | 値 |
|---|---|---|
| `blob({ mode: "bigint" })`（6-9f） | **BLOB。DDL と食い違う** | 64 bit を正確に持てる |
| `integer()`（採用） | **INTEGER。DDL と一致する** | **JS の number（53 bit）に丸まる** |

**drizzle-orm 0.45.2 の sqlite-core に integer の bigint モードは無い**（`mode` は
number / boolean / timestamp / timestamp_ms）。公式が BigInt の扱いとして案内するのが
`blob({ mode: "bigint" })` だが、**それは BLOB 列を作る**。

**grabado が出すのはテーブル定義**なので、**列型の一致を優先する**。値の表現はアプリ側で
決められるが、**列型が違えばスキーマそのものが違う**。

#### 決めたこと 2: 53 bit の注意は **docs に書き、生成物には出さない**

**列型は正しく、丸まるのは値の表現のほう** —— 型が落ちたわけではない。生成物のコメントは
「**その core に対応が無いので丸めた**」ときに出す仕組みなので、そこへ混ぜると
**丸めが起きたと読めてしまう**。[`docs/TYPE-MAPPING.md`](docs/TYPE-MAPPING.md) の ORM 節に
2 行足した（#122 が置いた「ORM 側で知っておくこと」）。

#### ★ 実測 1: **sqlite からは mode 付きの型に到達しない**

`frontend/db/sqlite/datatypes.xml` が持つ kind は **5 種だけ**
（`int64` / `float64` / `string` / `binary` / `other`）。**mode を使う型
（boolean / timestamp / json）への経路が無い。**

6-9f の「**sqlite の mode は書く。落とすと真偽が数値になる**」という判断は正しいが、
**sqlite プロファイルからは効いていない** —— 真偽も日時も**パレットの段階で
`INTEGER` / `TEXT` に写っており**、その時点で kind が落ちている。

**そして [`orm.test.ts`](tests/node/orm.test.ts) の「sqlite の mode が落ちていない」は、
今回直した欠陥そのものを固定していた** —— `{ mode: "bigint" }` を探しており、
**それは blob の引数だった**。**pg 側で mode を見る形に書き直し**、sqlite 側は
「**到達しない**」ことを主張する検査にした。

**`DRIZZLE_TYPES.sqlite` の該当エントリは消していない** —— パレットに boolean kind が
入った日に効く。**消すと、その日に黙って text へ落ちる**。

#### ★ 実測 2: #122 の仕組みが効いた

生成器を直した瞬間に、**docs の 2 セルが名指しで赤くなった**:

```
Drizzle sqlite-core / INTEGER: expected 'blob({ mode: "bigint" })' to be 'integer()'
```

**手で直す前に、どこが古いかを機械が言った。** 6-10b の「手で書いた表は必ず腐る」に対する
回答が、**入れた翌日に 1 度目の仕事をした**。

#### 検証（2026-08-29 実測）

| 何を | 結果 |
|---|---|
| `npm run typecheck` | 緑 |
| `npm test` | **620 本**が緑（本数は変わらない。1 本を書き直しただけ） |
| `npm run test:browser` / `known-issues` | 205 本 / 1 本が緑 |
| **`npm run test:orm-tools`** | **3 道具とも OK。39 本走って 0 FAIL、3 SKIP** —— `integer("c_integer").primaryKey()` が実物の `tsc --strict` を通った |
| golden の差分 | **1 本だけ**（`drizzle/sqlite/types-matrix.ts`）。**他 41 本は 0 バイト差** |
| docs の差分 | 表の **2 セル**（`INTEGER` / `BOOLEAN` の sqlite 列）と散文 2 項目 |

#### 却下した案

- **`blob` のままにする** —— DDL と食い違ったまま残る
- **`sqlite/datatypes.xml` の `INTEGER` を `kind="int32"` にする** —— **SQLite の INTEGER は
  64 bit** なので嘘になる。他 DB の `BIGINT` を sqlite へ写す経路も同時に壊れる
- **`integer({ mode: "number" })` と明示する** —— `mode` の既定が `number` なので**同じ意味**。
  出力が長くなるだけ
- **生成物にコメントを出す** —— 決めたこと 2

#### 申し送り

- **sqlite では `BOOLEAN` も `integer()` になる**（`{ mode: "boolean" }` は付かない）。
  **真偽という情報はパレット変換の時点で消えている。** Drizzle の boolean mode を活かすには
  **sqlite パレットに boolean kind の型が要る** —— そこは 6-8d が「**STRICT が受け付ける
  型名だけ**」と決めたところなので、**パレット側の判断**になる
- **`DRIZZLE_TYPES.sqlite` の boolean / date / time / time_tz / timestamp / timestamp_tz / json は
  いま到達不能**（実測 1）。**消していない**が、**golden では 1 バイトも守られていない**

### 2026-08-29 Dependabot alert 2 件は**安定版を待つ** —— 待ち方を決めて放置と分ける

正本は [issue #105](https://github.com/propagandist/grabado/issues/105)。**段階に属さない**。
段階2-5（#98）で Dependency graph を有効化した日に 0 件 → 2 件になったもので、
**#98 は「拾える状態にする」までで閉じ、出てきた CVE をどうするかは別の判断**として残していた。

#### ★ 実測 1: RC2 が既に出ており、**過去 2 回は RC2 から 7 日で stable**

`gh api repos/JetBrains/kotlin/releases` の実測（2026-08-29）:

| 版 | RC2 | stable | 間隔 |
|---|---|---|---|
| 2.4.0 | 2026-05-27 | 2026-06-03 | **7 日** |
| 2.4.10 | 2026-07-07 | 2026-07-14 | **7 日** |
| **2.4.20** | **2026-08-26** | **未** | —— |

**2.4.20-RC2 は issue の起票と同じ日に出ていた**（起票時点では Beta1 しか無かった）。
同じ周期なら **stable は 2026-09-02 前後**。現在は `kotlin = "2.4.10"`。

#### ★ 実測 2: **待つことは仕組みで担保されている**

[`.github/dependabot.yml`](.github/dependabot.yml) の gradle entry が **`/server` を
weekly ＋ cooldown 7 日**で見ており、[`libs.versions.toml`](server/gradle/libs.versions.toml) の
冒頭が「**Dependabot の gradle ecosystem がこのファイルを読む**」と書いている。
**2.4.20 stable が出れば、cooldown 7 日の後に更新 PR が自動で来る**（09-09 前後）。

**これが「待つ」と「放置」の差** —— issue 本文が「**いつまで待つかを決めないと放置と
区別が付かない**」と書いていた点への回答で、**人が思い出す必要が無い**形になっている。

#### 決めたこと: **案 A（安定版を待つ）**（ユーザー判断）

**B（RC2 へ即上げ）を採らない理由**:

- **配布物のビルド入力を 2 回動かすことになる** —— いま上げても 1 週間後に stable へ上げ直す
- **CVE の影響はビルド環境に限定**（#105 の実測: 2 件とも `gradle.lockfile` に無く、
  マルチステージの runtime に残らない）。**数日の待ちに見合う危険が無い**
- **配布物を作る道具を RC にする**ことになる

**C（dismiss）を採らない理由**: **数日待てば直るものを受容する**ことになる。dismiss の記録は
GitHub 側にしか残らず、**受容したのか忘れたのかが後から分からない**。

**D（`commons-lang3` だけ constraint で上書き）を採らない理由**: 1 件しか閉じないうえ、
**Gradle の解決に手を入れる**。Kotlin を上げれば推移的に直る見込みのものに、恒久の細工を残さない。

#### ★ 見直しの契機は **issue が持つ**（ここには書かない）

**これからやることの backlog は GitHub Issues が唯一**（org `work-conventions.md` §0 / §2）。
**期限（2026-09-20）と、PR が来たときの手順**は [#105 のコメント](https://github.com/propagandist/grabado/issues/105#issuecomment-5461906970)に置いた。
**ここに書くと、やった日に嘘になる。**

#### 検証（2026-08-29 実測）

| 何を | 結果 |
|---|---|
| open な alert | **2 件のまま**（`kotlin-gradle-plugin` / `commons-lang3`。どちらも medium） |
| 触ったファイル | **`CUSTOMIZATIONS.md` だけ** —— 依存も設定も 1 バイトも動かしていない |
| Kotlin の版 | `2.4.10` のまま（`libs.versions.toml`） |

#### 申し送り

- **この判断は 2026-09-20 で期限が切れる。** それまでに更新 PR が来なければ、
  **見込みが外れている**（RC が長引いたか、Dependabot が拾わなかったか）
- **更新 PR は CI で落ちる** —— `gradle.lockfile` を Dependabot が更新できないため。
  手元で `./gradlew dependencies --write-locks` を回して push する
  （`dependabot.yml` の★。**落ちること自体がロックを更新し忘れていない証拠**）
  - **★ 訂正（2026-08-30 実測。#134）—— 落ちない。Dependabot は `gradle.lockfile` を更新する。**
    #101（`d928a55`）も #132（`7fa30eb`）も**dependabot のコミット 1 本**で
    `libs.versions.toml` と `gradle.lockfile` の両方が動き、`git diff --exit-code` は緑だった。
    **手元で `--write-locks` を回す必要は無い。元の記述は消さない**（`dependabot.yml` の★を
    そのまま引き写したもので、訂正は両方に足してある）
- **`commons-lang3` が Kotlin 2.4.20 で直るかは未確認。** 推移的依存なので一緒に上がる見込みだが、
  **確かめるのは PR が来たとき**（`gh api .../dependabot/alerts` が 0 件になるかで見る）

---

### 2026-08-30 表側の棚卸し —— README の正本を日本語へ、ライセンスを 1 本へ

org に **9 本目の正本 `docs/repo-surface-baseline.md`**（リポジトリの表側の基準）が置かれ、
**その §5 の 1 回目の棚卸し**で public 3 本を実測したのが propagandist/.github#89。
**grabado で §3 を満たしていなかったのは 5 つ** —— README の正本が英語 ／ ライセンスが
`license.txt` のみ ／ description が英語 157 字 ／ topics が 12 個 ／ マージ済みブランチが 31 本。

**表側だけの棚卸しで、`js/` も `server/` も `tests/` も 1 行も動いていない。**

#### 決めたこと 1: ★ README の正本を日本語にする（2026-08-26 の判断を覆す）

`README.md` を `README.en.md` へ、`README.ja.md` を `README.md` へ入れ替えた。
**本文は 1 行も動かしていない** —— 変えたのはファイル名と、2 本の冒頭にある相互リンクだけ。

- **2026-08-26（#95）は「公開の顔は英語」だった。** 当時 org に表側の基準が無く、
  **リポジトリ側で決めるしかなかった**。9 本目が置かれて **値が org 側へ移った**
- **§3.6 が「正本は日本語の `README.md`、英語版は任意で `README.en.md`」**と決めている。
  根拠は同 §1 —— **想定読者は日本語話者の採用候補者・取引先**なので、
  **英語を正本にすると正本が読者の側と食い違う**
- **`CLAUDE.md` の「文章の値」は、既存の「訂正の元」と同じ形で書き換えた** ——
  2026-08-26 の判断を消していない。**覆した理由が読めないと、次に同じ議論をやり直す**

#### 決めたこと 2: ★ ライセンスは `LICENSE` 1 本。upstream 本文は 1 バイトも触らない

`license.txt` を `LICENSE` へ移し、**区切り線の後ろに自社改変部分の権利表記を足した**。

- **§3.5** —— fork では 1 本にまとめ、追記部分の著作権表示を入れる。
  **2 本並ぶと、どちらが効くのかが読む側で決まらない**
- **2026-08-09 の決定**「自社改変部分の権利表記は**今後の配布形態確定時に追記**」の実行でもある。
  **無料公開の確定がその時だった**（2026-08-15 の記録が既にそう読んでいる）
- **BSD-3-Clause 第 1 条が求める 3 つ**（著作権表示・条件のリスト・免責事項）は
  **1〜25 行にそのまま残っている**。追記は 27 行目以降で、**上流本文が verbatim である旨を明記した**
  —— 書かなければ、**追記が上流の一部だと読まれる**

##### ★★ 訂正・追記（2026-08-30 実測）—— 末尾へ散文で追記する形は、GitHub の検出を壊した

**元の記述は消さない。上の形で #135 をマージした直後に実測した。**

| いつ | `gh api repos/propagandist/grabado/license` |
|---|---|
| 追記の前（`license.txt`） | `BSD-3-Clause` |
| **追記の後（`LICENSE` 25 行 ＋ 追記 13 行）** | **`key: other` / `spdx: NOASSERTION`** |

**GitHub の licensee は本文との類似度で判定する**ので、**25 行に対する 13 行の追記で
標準ライセンスとして認識されなくなる**。**About 欄と org 一覧からライセンス表示が消えた** ——
**§3.5 は表側の基準**なので、**1 本にまとめたのに表側が弱くなる**という逆の結果になっている。

**直した形**: 末尾の追記ブロックを外し、**上流の Copyright 行の直後へ自社の 1 行を挿した**。

```
Copyright (c) 2005-2012, Ondrej Zara
Copyright (c) 2026, PROPAGANDIST CORPORATION
All rights reserved.
```

- **licensee は Copyright 行を除いて比較する**ので、**検出が戻る**。
  **fork で最も一般的な作法でもある**
- **★ 「1 バイトも触らない」の範囲が、ここでもう一度動いた。**
  **既存の行は 1 文字も変えていないが、著作権表示のブロックに行を足している。**
  **第 1 条が求めるのは「上記の著作権表示を保持すること」**で、
  **保持したうえで自社の行を並べることは条項に反しない**。
  **分かれ目は「既存の表示が消えるか」** —— 消さずに足すのは保持である
- **★ fork の説明は README の「由来とライセンス」が持つ。**
  **§3.5 の「由来が読める」は、LICENSE の中で読める必要はない** ——
  **LICENSE に散文を置くと検出が壊れる**ので、置き場所は README になる
- **★ この訂正は、決めたこと 3（`index.html` のファイル名参照）を動かさない。**
  あちらは**義務そのものか、義務への導線か**の分かれ目で、こちらは**保持か置換か**の分かれ目

#### 決めたこと 3: ★ `index.html` のファイル名参照は直す —— 「1 バイトも触らない」の範囲

`frontend/index.html` 冒頭の `See license.txt for licencing information.` を
`See LICENSE for licencing information.` にした。**著作権表示の行とバージョン行は 1 文字も動かしていない。**

**2026-08-28（§6.4）の「★ upstream の著作権表示は 1 バイトも触らない」と衝突して見えるが、
触らない対象は第 1 条が名指す 3 つ**であって、**ファイル名の参照はそのどれでもない**。
**実在しない名を指したまま残すほうが、ライセンス情報への到達性を損ない、第 1 条の趣旨に反する。**

**★ 判断の分かれ目は「義務そのものか、義務への導線か」。** 導線が切れているのを放置するのは、
**表示を保持したことにならない。**

#### 決めたこと 4: 既定ブランチは `develop` のまま

**§2.4 が持つのは「既定ブランチが何を映すか」だけ**で、**名前は各リポジトリの値**
（org `work-conventions.md` §6）。`main` は upstream ＋ house docs のまま止まっており、
**`develop` が「今」を映している**。**org 側から `main` を押し付けると、履歴と保護設定に
既に埋まっているものを壊す。**

#### 決めたこと 5: topics は 6 個。**重なるタグを両方は入れない**

**§3.4 の内訳はドメイン 2 ／ スタック 3 ／ 形態 1。** 12 個から 6 個へ落とした。

| 落としたもの | 理由 |
|---|---|
| `ddl` / `sql` | **§3.4 が名指しで挙げている重なりの例**。ドメイン枠 2 は `er-diagram` / `database-design` で埋まる |
| `erd` | `er-diagram` と重なる（これも §3.4 の例） |
| `schema-design` | `database-design` と重なる |
| `postgresql` | **8 プロファイルのうちの 1 本にすぎない**。既定パレットではあるが、topics で名指すと対応 DB を誤らせる |
| `self-hosted` | **形態は 1 つ**（`docker` を採った） |

**★ 並び順で意味を作っていない** —— **GitHub は topics をアルファベット順で強制表示する**
（**2026-08-30 実測**。`PUT .../topics` の応答が `database-design, docker, er-diagram, kotlin,
spring-boot, typescript` の順で返った）。§3.4 の記述が実測で裏付いた。

##### ★★ 訂正（2026-08-30 実測）—— 上の「裏付いた」は成り立たない。**測ったものが違う**

**元の記述は消さない。** `pdfjig` の topics を **1 個だけ入れ替えた**ときに崩れた。

| 何を呼んだか | 返った順 |
|---|---|
| `PUT /repos/{o}/{r}/topics` の応答 | `desktop-app, document-processing, javafx, pdf, pdfbox, java` |
| `GET /repos/{o}/{r}/topics` の `.names` | **同じ**（差し替えた 1 個が末尾） |
| `GET /repos/{o}/{r}` の `.topics` | `desktop-app, document-processing, java, javafx, pdf, pdfbox`（**アルファベット順**） |

- **同じ時点で、2 つのエンドポイントが違う順を返す。** どちらか一方だけを見て
  「GitHub はソートする／しない」とは言えない
- **grabado で「アルファベット順で返った」ように見えたのは、6 個を全入れ替えしたから**であって、
  **API がソートしたからではない**
- **★ §3.4 が言っているのは画面での表示順**で、**API の応答からは分からない**。
  **裏付けたつもりで、別のものを測っていた**
- **★ この形の誤りは「数字と測り方を離さない」の裏返し**（`ci-strategy.md` §7）——
  **数字は正しく、測り方も書いたが、その測り方では主張を支えられなかった**

#### 検証（2026-08-30 実測。`gh api` のみで run は立てていない）

| 何を | 結果 |
|---|---|
| description | **日本語 71 字**（§3.3 の 60〜80 字。要素 2 つ） |
| topics | **6 個**（重なり 0） |
| 直下の README | `README.md`（日本語・正本）／ `README.en.md`（英語） |
| 直下のライセンス | **`LICENSE` 1 本**。`license.txt` は無い |
| GitHub のライセンス検出 | **1 回目は `NOASSERTION` に落ちた**（上の訂正）。**Copyright 行を 1 行足す形へ直して再測する** |
| `license.txt` を指す参照 | **過去の決定ログ 5 行だけ**（当時の記録なので文面は直さない）。**リンク形式だった 1 本だけコード表記へ落とした** —— 記述は 1 文字も変えていないが、**実在しないファイルへのリンクは 404 になる** |
| ブランチ | **36 本 → 5 本**（`develop` / `main` / dependabot の open 3 本） |
| 削除の判定 | **PR の状態で見た** —— **merge 方式が squash なので `git branch -r --merged` は 0 件に出る**（org §2.4） |
| upstream 本文 | `LICENSE` 1〜25 行が**変更前と同一**。`index.html` の著作権表示行も同一 |

#### 申し送り

- **tags は別 issue へ分けた。** grabado は Tags 0 のままで **§3.7 を満たしていない**。
  **版に何を含めるかは表側の棚卸しとは別の判断**なので、この記録では決めていない
- **`## 保持している upstream 資産` の表の 2 行を同時に直した** ——
  README の行（英語が顔だと書いてあった）と `index.html` の行（参照を直した旨を追記）。
  **表は現状を映すものなので、状態が変わったら直す。決定ログの側は消さない**

### 2026-08-30 依存の更新 3 本を捌く —— 版の一致を機械に見せ、メジャーを定例から外す

正本は [issue #134](https://github.com/propagandist/grabado/issues/134)。**段階に属さない**。
#129 が Dependabot alert の待ち方を決めた翌日に、**更新 PR が 3 本溜まっていた**ので捌いた。
**3 本を読んだら、CI が緑のまま通ってしまう問題が 2 つ出た。**

| PR | 中身 | 始末 |
|---|---|---|
| #130 | `node:24-alpine` → `26-alpine`（Dockerfile の web ステージのみ） | **close**（→ [#133](https://github.com/propagandist/grabado/issues/133)） |
| #131 | `typescript` 5.9.3 → **7.0.2** ／ `jsdom` 29 → 30 ／ `vite` 8.2.1 → 8.2.2 | **マージ**（`cf14e73`） |
| #132 | `anthropic-java` 2.55.0 → 2.57.0 | **マージ**（`7fa30eb`） |

#### ★ 何が起きていたか

[`Dockerfile`](Dockerfile) の web ステージは前から「**版は `ci-frontend.yml` の
`node-version: 24` に揃える。CI と違うもので配布物を作らない。**」と書いていた。
**それを確かめる機械が 1 つも無かった** —— #130 は Dockerfile の 1 行だけを 26 にするもので、
**ci-image しか起動せず、全ジョブ緑**だった。走った検査は「node 26 でイメージが build できる」
であって、「**CI と同じ版か**」ではない。

**Java も同型**で、`jvmToolchain(25)` ／ `ci-server.yml` の `java-version: 25` ／
`eclipse-temurin:25-jdk-alpine`（api）／ 同 `-jre-alpine`（runtime）の **4 か所が手で揃っていた**。

もう 1 つ、#131 のタイトルは「Bump the frontend group with 3 updates」で、**dev 依存の定例更新に
見える**。中身は `typescript` の **5 → 7**（native port）で、`npm run typecheck` は主要ゲートである。

#### 決めたこと 1: #130 は **安定版（LTS）を待つ**（ユーザー判断）

`nodejs/Release` の `schedule.json` 実測（2026-08-30）:

| 版 | start | lts | maintenance | end |
|---|---|---|---|---|
| v24 | 2025-05-06 | 2025-10-28 | 2026-10-20 | 2028-04-30 |
| v26 | 2026-05-05 | **2026-10-28** | 2027-10-20 | 2029-04-30 |

**v26 が LTS に入るのは約 2 か月後**で、いまは Current 系列。`HANDOVER.md` §2.2 は
「版は着手時に**最新 LTS** 確認」。**いま入れると Current 版で配布物を作る**ことになり、
**2 か月後に上げ直す**（配布物のビルド入力を 2 回動かす）。#105 と同じ「**待ち方を決めて
放置と分ける**」形だが、**担保のされ方が違う** —— #105 は cooldown が自動で PR を連れてくるが、
**close した PR が戻ってくる保証は無い**。だから **#133 を open のまま残した**。

#### 決めたこと 2: 版の一致を **機械に見せる**（node ＋ java）

[`tests/node/toolchain.test.ts`](tests/node/toolchain.test.ts)（新規 4 本）。イディオムは
[`csp.test.ts`](tests/node/csp.test.ts) / [`env-contract.test.ts`](tests/node/env-contract.test.ts)
と同じ（**正本を読んで、写しのずれを赤くする**）。

| | 正本 | 写し |
|---|---|---|
| Node | `ci-frontend.yml` の `node-version` | Dockerfile の web ステージ |
| Java | `build.gradle.kts` の `jvmToolchain`（**実際にコンパイルするのがそこ**） | `ci-server.yml` の `java-version` ／ Dockerfile の api（jdk）／ 同 runtime（jre） |

- **版の数字はテストに書かない** —— 書けば正本が 2 つになる（`env-contract.test.ts` の
  「値そのものは見ない」と同じ理由）。**確かめるのは一致だけ**
- **空振りを緑にしない** —— 書式が変わって読めなくなったら「一致している」ではなく
  「**読めなかった**」と言わせる。**正規表現は `@sha256:` を必須**にしてあるので、
  **digest ピンを外しても赤くなる**（org security-baseline §5.1 に副次的に機械が付いた）
- **`ci-frontend.yml` の `paths` が 3 ファイル広がった**（`Dockerfile` /
  `server/build.gradle.kts` / `ci-server.yml`）—— **一致検査は、正本と写しのどちらが動いても
  走らないと意味が無い**。**`server/**` とは書かない**（Kotlin を 1 行直しただけの PR で
  フロントの検査を回す理由は無い）

#### 決めたこと 3: Dependabot の group から **major を外す**

4 entry すべての group に `update-types: ['minor', 'patch']`。
**メジャーは個別 PR で来る**（グループから外れた更新は個別 PR になるので、落ちはしない）。
**今回の #130 / #131 が両方ともメジャーだったこと**が発端。

#### ★ 訂正（実測）: **Dependabot は `gradle.lockfile` を更新する**

[`.github/dependabot.yml`](.github/dependabot.yml) の★は「Dependabot はロックファイルを更新
できないので、**その PR は ci-server.yml の『追跡ファイルが動いていないこと』で落ちる**」と
書いていたが、**#101（`d928a55`）も #132（`7fa30eb`）も、dependabot のコミット 1 本で
`libs.versions.toml` と `gradle.lockfile` の両方が動いており**、`git diff --exit-code` は緑だった。
**手元で `--write-locks` を回す必要は無い。**

**元の記述は消していない**（判断の履歴）。**同じ誤りを #105 の申し送りにも書いていた**ので、
そちらにも★を足した。

**★ 別件と混ぜないこと** —— `security_update_dependency_not_found`（`deps-submit` が提出した
グラフにしか無い依存は**拾えるが直せない**。`CLAUDE.md` の「セキュリティ」）は**軸が違う**。
あちらは実測どおりで、訂正の対象ではない。

#### ★ 実測: **jsdom 30 が Node の下限を上げた**（手元が割っていた）

`npm ci` が `EBADENGINE` を 1 件出した:

```
package: 'jsdom@30.0.1'
required: { node: '^22.22.2 || ^24.15.0 || >=26.0.0' }
current:  { node: 'v24.14.0', npm: '11.9.0' }
```

**CI は `node-version: 24` が最新の 24.x を引くので緑**、**Dockerfile も `node:24-alpine` が
同じく最新を引く**。**割っていたのは手元だけ**で、**警告のまま 624 本すべて緑**だった。
**版を固定していないところは、下限が上がっても気付けない** —— 今回は警告が出たので分かった。

#### ★ 実測: **一致検査が、入った直後に本番で 1 件仕事をした**

#137 のマージ 46 秒後に出た [#138](https://github.com/propagandist/grabado/pull/138)
（node 24 → 26。group から外れて単独 PR になったもの）で、**ci-frontend が赤くなった**:

```
FAIL tests/node/toolchain.test.ts > Dockerfile の web ステージは、ci-frontend.yml の node-version に揃っている
AssertionError: Dockerfile の web ステージと ci-frontend.yml の node-version がずれている。
版を上げる判断そのものは docs/HANDOVER.md §2.2（着手時に最新 LTS 確認）。: expected 26 to be 24
```

**同じ PR の ci-image は緑**（2 分 4 秒）—— **イメージは node 26 で build でき、E2E 13 本も通る**。
**あちらでは永久に捕まらない**ことが実物で確かめられた形で、**#130 が「全ジョブ緑」で通れた
理由がそのまま再現している**。#122 の「手で書いた表は必ず腐る」に検査で答えたときと同じで、
**入れた当日に 1 度目の仕事をした**。

#### 検証（2026-08-30 実測）

| 何を | 結果 |
|---|---|
| `npm run typecheck` | **TypeScript 7.0.2 で緑**（native port での初回） |
| `npm test` | **624 本**（#131 の時点で 620 本 → 新規テスト 4 本ぶんだけ増えた） |
| `npm run test:browser` / `known-issues` / `test:dist` | 205 本 / 1 本 / 6 本が緑 |
| `npm run test:orm-tools` | **3 道具とも OK**（39 本走って 0 FAIL、3 SKIP） |
| `tests/golden/` の差分 | **0 バイト** |
| **新規テストが赤くなること** | 2 通りとも確かめた —— `node-version` を 25 に変えると `expected 24 to be 25`、Dockerfile の digest を外すと `expected +0 to be 1`（**読めなかった**と言う） |

#### 却下した案

- **版の一致を node だけにする** —— Dockerfile が明文で「揃える」と書いているのは node だけだが、
  **Java 26 は 2026-03 に出ている**ので temurin の同型 PR がいずれ来る。そのとき Java は 4 か所ある
- **`ci-image.yml` の `node-version` も一致の対象に入れる** —— 段階2-5 が
  「**揃える先を 3 か所に増やさない**」と決めている。**決定を黙って覆さない**
- **`tests/orm-tools/cases.ts` の `node:24` も対象に入れる** —— **使い捨てコンテナで tsc を
  回すだけ**で、配布物のビルド入力ではない
- **検査を `ci-image.yml` のステップとして書く** —— Dockerfile では起動するが、
  **`ci-frontend.yml` を触った PR では起動しない**。**正本の側を変えたときに赤くならない検査は、
  一致検査として成立しない**
- **`dependabot.yml` の★を書き換えて消す** —— 実測で外れた記述は**訂正を追記**する
- **#131 から typescript を手で外して 2 本だけ入れる** —— group PR を手で分解する手間に対し、
  **`update-types` を絞れば次回から構造的に起きない**
- **`ignore` で node のメジャーを止める** —— 止めたいのは「いまの 26」だけで、
  「node のメジャー全部」ではない。**解除を忘れると次のメジャーも黙って来なくなる**

#### 申し送り

- **`update-types` を絞った効きは、次の weekly（2026-09-05 前後）でしか確かめられない** ——
  **digest だけの docker 更新が落ちずに個別 PR で来るか**を見ること。
  **#130 が再生成されていないか**も同時に見る（close は「その版を作り直さない」だけで、
  `node:26-alpine` の digest が動けば新しい PR が来る可能性がある）
  - **★ 訂正（2026-08-30 実測）—— 待つ必要は無かった。同じ日に両方とも出た。**
    **#137 のマージ 46 秒後に [#138](https://github.com/propagandist/grabado/pull/138) が出た**
    （`dependabot/docker/node-26-alpine`。#130 とは**別ブランチ**）。**group から major を
    外したことで、node のメジャーが group を離れて単独 PR になった** —— `update-types` は
    狙いどおり効いている。**そして「閉じた PR が戻らない」のは同じ版・同じ grouping のときだけ**で、
    **grouping を変えれば close 済みでも作り直される**。#138 も #133 の判断で close した。
    **digest だけの更新がどう来るかは、まだ観測していない**（次の weekly に残る）
- **Node 26 への更新は #133 が持つ**（期限 2026-10-28）。**ここに書くと、やった日に嘘になる**
- **手元の Node が 24.14.0 で jsdom 30 の下限（24.15.0）を割っている。** 全検査は緑だが、
  **次に手元で踏むとしたらここ**

---

### 2026-08-30 マイルストーン運用を入れる —— 単位は到達点、版名にしない

正本は [issue #141](https://github.com/propagandist/grabado/issues/141)。**段階に属さない**。

#### 発端

**2026-08-28、[#118](https://github.com/propagandist/grabado/issues/118)（§6.4）のマージで
`docs/HANDOVER.md` §9 の実装順序 9 項目が全部閉じた。** §0 → §7 → §3 → §4 → §6 → §5 → §11 →
§2 → §6.4 が順に終わり、**`段階N-M` という作業の軸が尽きた。**

**その日から、GitHub 上に「次に何が終われば何が達成されるか」を表すものが 1 つも無い。**
2026-08-30 の open issue 4 本（#84 / #105 / #121 / #133）は**すべて段階に属さない** ——
インフラ 1・依存 2・CI 1。

**この台帳は終わったことしか持てない。** これからの束ねを書くと、org `work-conventions.md` §2
「**進捗を記録する文書は、起票先ではない**」に反する。かといって issue 単体では、
**複数の判断が集まって初めて成り立つ到達点**を表せない —— #84 の「置き場所・TLS・CAA・HSTS・費用」
がまさにそれ。

#### 決めたこと 1: **運用する。単位は到達点で、版名にしない**

org `work-conventions.md` §6 は「**マイルストーン運用の有無**」を**各リポジトリが決める値**と
定めている。`CLAUDE.md` はこれまで「運用していない」（2026-08-23 実測 / 08-26 に「引き続き」）
と書いてきた。**その値は、段階が尽きるまでは正しかった** —— 束ねる先が無く、作れば空になった。

**単位は到達点**（成果そのものの名前）。**版名（`v0.1.0`）にしない**。理由は 2026-08-30 の実測:

| 見たもの | 結果 |
|---|---|
| `git tag -l` / `gh release list` | **0 本 / 0 本** |
| `package.json` / `server/build.gradle.kts` の `version` | **どちらも `0.0.0`** |
| `git rev-list --left-right --count origin/main...origin/develop` | **`0  109`**（main 独自 0） |
| `gh api .../branches/develop` | `protected: false` |

**版を単位にすると、この止まった軸をマイルストーンが同時に動かすことになる** ——
**マイルストーンの成否がリリース運用の立ち上げに依存する**。到達点なら「閉じた＝その成果が
出た」で完結し、**版を切るかは閉じたあとに別途判断できる**。

#### 決めたこと 2: **何を入れないかを先に決める**

**入れない**: Dependabot の PR ／ **時間で来る保守**（依存・CI・脆弱性。#105 / #121 / #133）／
PR そのもの ／ **過去の closed issue**。**属さないなら付けないのが既定。**

**すべての issue に付けると、「到達点」という単位の意味が消える。** #105 / #121 / #133 は
到達点ではなく、時間が来たら判断するもの。**マイルストーンが腐る典型は「全部に付けようとする」**
ことなので、入れない側を値として書いた。

#### 決めたこと 3: **閾値も、逆算した期限も置かない**

- **同時 open の数に閾値を置かない**（「2 本まで」等）—— **閾値を置くと閾値を守る作業が発生する**。
  `CLAUDE.md` の「一文の長さの閾値は置いていない」と同じ判断
- **`due_on` は外から決まっている日付があるときだけ**置く。**作業量から逆算した締切は置かない**
  —— **守られない期限は overdue 表示を無視する習慣を作る**（org `writing-baseline.md` §8 の
  「守れているのに赤が出る検査は、無視する習慣を作る」と同じ形）

#### ★ 実測: **`gh` にマイルストーンの口が半分しか無い**

**`gh` 2.87.3 に `milestone` サブコマンドは無い**（`unknown command "milestone" for "gh"`）。
**作成・更新・close・削除は `gh api repos/propagandist/grabado/milestones` を叩く。**
一方で **`gh issue create/edit/list` の `-m, --milestone` は存在する**ので、
**付ける・引くだけは `gh` で済む。**

**★ 作成 API は issue を同時に入れられない。** `POST .../milestones` は `title` /
`description` / `due_on` / `state` しか受けず、**作った瞬間は必ず `open_issues: 0`** になる。
**だから規律は「0 本で作らない」ではなく「0 本のまま放置しない」**と書いた ——
**作ったら続けて `gh issue edit -m` する。**

#### ★ 実測: **付けた直後の `gh issue list -m` は空を返した**

`gh issue edit 84 -m '公開デモを立てる'` が成功した**直後**、
`gh issue list -m '公開デモを立てる'` は **0 件**を返した。**十数秒後に引き直すと、
番号（`-m 1`）・タイトル（`-m '公開デモを立てる'`）・`--search 'milestone:"..."'` の
3 通りとも 1 件を返した。**

**原因は特定していない**（再現を取ると #84 に不要な activity が残るため取らなかった）。
**書けるのは観測だけ** —— **空で焦って二重に付けない**。
**`gh api 'repos/{owner}/{repo}/issues?milestone=N'` は即答した。**

**★ 同じ形をこの作業でもう 1 度踏んだ。** `git push` の直後に
`gh pr view 142 --json commits` が **1 件**（push 前の数）を返し、十数秒後に **2 件**になった。
**`gh` の読み取り面は、書き込みの直後に古い値を返すことがある** ——
**2 例とも、返ってきた数で判断していたら間違えた。**

#### 最初の 1 本: **`公開デモを立てる`**（number=1）

- **`description`**: `grabado.dev が HTTPS のみで READONLY 応答し、置き場所・費用・CAA・HSTS の判断が CUSTOMIZATIONS.md に記録されている`
  —— **#84 の受け入れ基準を 1 文にしたもの**。**名前だけでは何が終わりか読めない**ので、
  `description` に閉じる条件を書くことを値にした
- **`due_on` は置かない** —— 外から決まっている日付が無い
- **入れたのは #84 だけ** —— **`main` の 109 遅れは #84 の受け入れ基準
  （「公開しているものが `main` 下流であり」）に既に入っている**ので、別起票するかは
  #84 の着手時に判断する。**ここでスコープを広げない**

#### 検証（2026-08-30 実測）

| 何を | 結果 |
|---|---|
| `gh api .../milestones` | **1 件**（`number: 1` / `state: open` / `due_on: null`） |
| 同 `open_issues` / `closed_issues` | **`1` / `0`** |
| `gh issue view 84 --json milestone` | `公開デモを立てる` |
| `gh issue list -m` （番号・タイトル・`--search` の 3 通り） | **1 件**（**付けた直後だけ 0 件だった**。上の実測） |
| 他の open 4 本（#141 / #133 / #121 / #105） | **すべて `none`**（到達点に属さないので付けない） |
| `gh label list` | **13 種のまま**（マイルストーンはラベルを増やさない） |
| `CLAUDE.md` の元の記述 | **2 か所とも残っている**（「マイルストーンは運用していない」／「引き続き運用していない」。**それぞれに指し先を追記**） |
| **CI 3 本** | **`CLAUDE.md` も `CUSTOMIZATIONS.md` も `ci-frontend` / `ci-server` / `ci-image` の `paths` のどれにも無く、[PR #142](https://github.com/propagandist/grabado/pull/142) で実際に 1 本も起動しなかった**（`commits/{sha}/check-runs` の `total_count` が **0**）—— **「全ジョブ緑」ではなく「起動しない」が正常** |

#### 却下した案

- **GitHub Projects を使う** —— ボードとビューは**台帳になりやすい**（org
  `work-conventions.md` §0「台帳は最も腐りやすく、腐った台帳は無い台帳より悪い」）。
  **マイルストーンは issue の属性 1 つ**で、**進捗を人が更新しない**
- **版名（`v0.1.0`）を単位にする** —— 決めたこと 1。**止まった軸に成否が依存する**
- **closed issue 約 70 本を § 単位で遡って埋める** —— **この台帳が既に持つ情報の 2 か所目**に
  なる（org §0「同じ内容を 2 か所に書かない」）。段階は `gh issue list --search "段階5-"` で
  引けるので、**検索性も失われない**
- **保守用の無期限マイルストーン（`Backlog` / `保守`）を作る** —— **閉じる条件が書けない
  マイルストーンは台帳の別名**で、「これからやること」を文書に書くのと同じ形で腐る（org §2）
- **同時 open の上限を数で決める** —— 決めたこと 3
- **`docs/` に運用文書を新設する** —— 値は `CLAUDE.md` が持つと org §6 が決めている。
  **新設すると、その日から値の正本が 2 つになる**
- **`CLAUDE.md` の「運用していない」を書き換える** —— 実測で外れた記述は**訂正を追記する**
  （元を消さない。`security-verification.md` §5）。**ラベルの行に同居している**ので
  行ごと置き換えられず、**マイルストーンを独立した箇条書きに出し、元の 2 か所から指した**
- **#84 を先に分割してからマイルストーンを作る** —— #84 は org §2 の 7 項目を満たしている。
  **分割は着手時の判断**で、マイルストーン設計に巻き込まない
- **`docs/BRANCHING.md` を触る** —— **軸が違う**。あれはブランチの運用

#### 申し送り

- **「全 issue が closed になってもマイルストーンは自動で閉じない」は未実測。**
  **#84 が閉じた日に確かめる** —— **`Closes #84` の squash merge で `closed_issues` が
  1 に増えるか**も同時に見る。確かめるまでは**条件つきの予約**のまま置く
- **`公開デモを立てる` を閉じるときに、版を切るかを判断する** —— タグ 0 本・`version` が
  `0.0.0` 2 か所・`main` が 109 遅れ・`protected: false` は**そのとき一緒に見る**。
  **ここに「これからやること」として書かない**（やった日に嘘になる）
- **2 本目のマイルストーンを作る契機は決めていない。** 次の到達点が見えた日に、
  **閉じる条件が 1 文で書けるか**で判断する

---

## 保持している upstream 資産（撤去予定を含む）

| 資産 | 現状 | 方針（HANDOVER 準拠） |
|---|---|---|
| ~~PHP backend（`backend/php-*` 他）~~ | **段階5-2 で撤去**（15 実装 31 ファイル）。§0 実測完了（契約は ARCHITECTURE §4）→ **段階5-1b で Kotlin が実測契約を満たしたことを確かめてから消した**。1 行も触らないまま役目を終えている（4-6 の外部変更検知はフロント側の read-before-write、6-1 の dangling も放置のまま撤去） | **完了。旧実装は commit `7b3bb3d`**（`git show 7b3bb3d:backend/php-file/index.php`）。凍結コピーは置かない ——それ自体が二重管理になる |
| ~~submodule `backend/php-s3/amazon-s3-php`~~ | **段階5-2 で削除**（`.gitmodules` ごと） | 完了 |
| ~~XML 永続化（`toXML()` / `save` の body）~~ | **段階4-3b でユーザーに見える保存経路から撤去**し、**段階6-5a で残る 1 か所（DDL 入力）ごと撤去した**。`js/io/ddl-xml.ts` と `tests/golden/ddl-input/` の 7 本も同時に消えている | **完了。grabado に XML の書き出しは 1 つも無い**（読み込みは互換で残す。形式は中身で判別） |
| ~~DDL 生成 `db/<db>/output.xsl`（XSLT 1.0）~~ | **§7 で golden 固定**（`tests/golden/ddl/`）→ **段階6-1 で 9 本 → 5 本**（`cubrid` / `vfp9` / `web2py` / `sqlalchemy` を撤去。golden も 63 → 35 本）→ **段階6-5a で 5 本とも撤去し、[`frontend/js/io/ddl/`](frontend/js/io/ddl/) へ逐語移植**（golden 35 本は 1 バイトも動いていない） | **完了。`db/` に残るのは `datatypes.xml` だけ**。**段階6-5b で `postgresql` を §6.3 の規約へ寄せた**（命名・識別子の引用・known-issue #6 / #11。golden 5 本 31 行が動き、未現代化 4 本の 28 本は 0 バイト差）。規則は [`frontend/js/io/ddl/naming.ts`](frontend/js/io/ddl/naming.ts) と [`keywords.ts`](frontend/js/io/ddl/keywords.ts) にあり、**6-8 は `IdentifierRules` を 4 つ足すだけ**。**新設 3 本は TS 生成器の上に載せた**（6-7）。**撤去した `sqlalchemy` は 6-9 で ORM 出力として作り直す**（**★ 訂正: 2026-08-28 に決めて外した。作り直さない** —— 理由と再考の条件は同日の記録。**元の記述は消さない**）。**段階6-8a 〜 6-8d で既存 4 本（mysql / mssql / oracle / sqlite）を現代化し、6-5a が逐語で持ち込んだ粗さ 9 件 ＋ 6-6b の 1 件が尽きた**（#12 / #14 は 6-8b、#13 は 6-8d）。骨格は **ansi 3 本 / mysql-style 2 本 / 独立 3 本**に落ち着き、8 本とも §6.3 の規約に載っている。**段階6-6b で非 PG の golden が初めて「その DB の DDL」になった**（入力が PG 用の型名でなくなったため。21 本が動き、6-8 の比較対象ができた） |
| 型パレット `db/<db>/datatypes.xml` | **段階6-7a〜6-7c で新設 3 本（`sql-standard` / `h2` / `mariadb`）が入り、対応 DB 8 本がそろった**（3 本とも strict ＝ 最初から現代化済み。予約語と型は SQL:2016 の一次資料 / H2 2.4.240 / MariaDB 11.8.8 の実物から採取）。保持。**段階4-2b で全 9 本の `<type>` に安定 `id` を付与**（設計 JSON の型キー。`label` / `sql` とは独立）。**段階6-1 で 5 本に**（撤去 4 本ぶんが消えただけで、残る 5 本は 1 バイトも動いていない）。**段階6-2 で `postgresql` の `fk` 2 行を label 参照から id 参照へ**（それ以外は不変） | PostgreSQL 18 型パレットへ差し替え（**6-3**。案と移行表は段階6-0 の記録）。**uuid が無く house 既定の PK が INTEGER に落ちる**（known-issues #4）。差し替え時は同じ PR で設計ファイルを移行する（`docs/FORMAT.md`）。他プロファイルの現代化と `re` の是正（known-issues #10）は 6-8。**段階6-4 で `postgresql` に `<template>`（§6.2 初期テーブル）と `newrowtype` が入り、6-7a 〜 6-8d で 8 本すべてが持つようになった** —— 型 id 参照なので同じ `palette-id.test.ts` が実在を見る。**段階6-8d で最後の `sqlite` が strict になり、未現代化が 0 本に**（`re` を読むコードと先頭型フォールバックがリポジトリから消えた） |
| 描画エンジン（`js/`, `styles/`） | 保持。§3 段階1 で Vite のバンドル配下に入れ、段階2 で `SQL.Visual` 階層を ES クラス化・`OZ.Class` と ES5 polyfill を撤去、段階3-1 で `oz` / `config` / `globals` を、段階3-2 で描画中核 7 本（`visual` / `row` / `table` / `relation` / `key` / `rubberband` / `map`）を `.ts` 化、段階3-3a で残る prototype 方式 7 本を class 化、**段階3-3b で残り 8 本を `.ts` 化して `js/` から `.js` が尽きた**（いずれも挙動は不変） | 温存し TS で巻く（Tier 2）。`window` 登録と `declare global` の撤去・`strict` の最終確認は段階3-4 |
| ~~`index.html` の Dropbox CDN 読み込み~~ | **段階4-3a で撤去**（連携ごと。`dropbox-oauth-receiver.html` / `CONFIG.DROPBOX_KEY` / ボタン 3 つ / locale 21 行を含む） | 完了。**これで外部依存は 0 本** |
| ~~`Dockerfile`（busybox httpd 11 行）~~ | **段階2-1 で置き換え**。`COPY . .` でリポジトリをそのまま配る作りで、`index.html` が `/src/main.ts` を読むので**起動しても動かなかった**（README にも「現在このイメージは動かない」と書いてあった）。`.dockerignore` の 4 行の拒否リストも同時に**許可リスト**へ | **完了。**3 ステージ（web / api / runtime）・digest ピン・非 root。契約は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §9、実測は段階2-1 の記録 |
| ~~`README.md`（upstream の紹介文・PayPal 寄付ボタン・**2012 年からの News 10 本**）~~ | **2026-08-26 に全面書き換え**（#95）。`/js/*.js` を指す Code Style 表も落ちた（**`js/` に `.js` は 1 本も無い**。段階3-3b で尽きた）。**「現在このイメージは動かない」の注記**も 2-1 で実体が消えていたので落ちている | **完了。**~~公開の顔は英語 `README.md`、日本語版は `README.ja.md`~~ → **2026-08-30 に入れ替えた**（org `repo-surface-baseline.md` §3.6。正本は日本語 [`README.md`](README.md)、英語版は [`README.en.md`](README.en.md)。判断は同日の記録）。**2 本は同じ構成を保つ**（片方だけ直さない。値は [`CLAUDE.md`](CLAUDE.md) の「文章の値」） |
| ~~`index.html` の upstream 名（`<title>WWW SQL Designer` ／ docs ボタンが `ondras/wwwsqldesigner/wiki`）~~ | **2026-08-28 に書き換え**（#118）。**public 化（#95）で README 2 本は英語にしたのに、タブに出る名前は upstream のままだった** —— `dist` にも同じ文字列が出ており、**イメージがそれを配っていた**。favicon は**宣言が 0 本**だった | **完了。**`<title>grabado`、favicon は [`frontend/images/favicon.svg`](frontend/images/favicon.svg)（色は UI のアクセントから採り、新しいブランド色を作らない）。docs ボタンは README へ。**★ 冒頭の著作権コメントは残す** —— **BSD-3-Clause 第 1 条の義務**（実測と判断は §6.4 の記録）。**★ 2026-08-30 に `See license.txt` → `See LICENSE` の 1 行だけ直した** —— ファイル名の参照であって第 1 条が名指す 3 つではない。著作権表示行とバージョン行は不変（判断は同日の記録） |

> 注: 旧版の本書と ARCHITECTURE には `config.xml.sample` を upstream 資産として挙げていたが、**このリポジトリに実在しない**。アプリ設定は [`frontend/js/config.js`](frontend/js/config.js)（`CONFIG.*`）。

（以降、実装が進むたびに差分を追記する）
