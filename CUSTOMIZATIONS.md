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

- `CONFIG.AVAILABLE_DBS` に `"web2py"` が**2 回**入っている（[`js/config.js`](js/config.js) 2-14 行）。DB セレクタに重複した選択肢が出る。
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
  スタイル切替は `<link>` の **`title` 属性**での照合（[`js/wwwsqldesigner.js:118-133`](js/wwwsqldesigner.js#L118-L133)）
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
  [`js/table.js`](js/table.js) の `_build()` が `this.owner.map.dom.container` を読むため、
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
（[`src/main.ts`](src/main.ts) / `tests/node/harness.ts` の `window.eval` / ブラウザ）、いずれも戻り値を
`SQL` に載せないため。DI 化は §4 の IO 分離と同時に行う。
**副作用**: `new SQL.Designer()` を 2 回呼べるようになった（現在は 2 回目が「クラスではない」で落ちる）。
呼ぶ箇所は無い。

**削除したもの**。

- `OZ.Class` / `implement` / `extend` / `dispatch`（参照 0・`arguments.callee` 依存）。
- ES5 polyfill 群（`js/oz.js` の `Function.prototype.bind` と `Array.prototype.*`、
  [`js/globals.js`](js/globals.js) の `endsWith` / `trim` / `Object.create`）。**すべて `if (!X)` ガード付きで、
  ネイティブがある実行系では本体が一度も評価されない**＝「微妙に違う実装で上書きしていた」ことは
  原理的に起こり得ない。jsdom と Chromium 151 の両方でネイティブ実在を実測した。
- 非標準の静的版（`Array.indexOf` ほか 7 本、`String.trim`）は**ネイティブに無いので実際に
  インストールされていた**が、リポジトリ全体で参照 0 件を確認して削除。
- `js/oz.js` 468 → 295 行、`js/globals.js` 88 → 63 行。

**挙動不変の例外として直した 2 件**（暗黙グローバル）。

- [`js/io.js`](js/io.js) の `req = r[1]`（`var` 抜け）、[`js/oz.js`](js/oz.js) の `var x = (y = 0)`（`y` が暗黙グローバル）。
- 根拠は **ESM が常に strict** であること。Vite の dev / build 経路では既に `ReferenceError` で落ちており、
  sloppy な `window.eval` で動く Node ハーネスとの間で「現行挙動」が割れている。再現すべき単一の挙動が
  存在しないので修正側を採った。**PG18 introspection の判断（well-formed でない XML を再現しない）と同じ論法**。
- 実測（Vite dev + Chromium、`?backend=php-file`）: 修正前は `pageerror: req is not defined` ×2 で
  `SQL.designer.io` が生えない＝**アプリが起動しない**。修正後は pageerror 0 件。
  `oz.js` 側の到達経路はミニマップの mousedown（`OZ.DOM.pos` の唯一の呼び出し元は [`js/map.js`](js/map.js)）で、
  同じく修正前は `ReferenceError: y is not defined` を実測した。
- どちらも golden の経路は通らないので `git diff tests/golden/` は空のまま。

**今回やらなかったこと（理由つき）**。

- **`DATATYPES = false` → `null` の是正を見送った**。`== false` / `!DATATYPES` は全 12 箇所中 0 件で、
  唯一の真偽評価が [`js/wwwsqldesigner.js:353`](js/wwwsqldesigner.js#L353) の `window.DATATYPES.xml`。
  `false` なら `undefined`（例外にならない）、`null` なら **TypeError**。`checkJs` を立てない段階2 では
  診断が 1 件も変わらず利益ゼロで、この分岐は §4 の XML 書き出し撤去で丸ごと消える。
  `typeIndex` / `fkTypeFor` も同じ扱いにした。
- **[`js/wwwsqldesigner.js:356`](js/wwwsqldesigner.js#L356) の未定義 `e` を触っていない**。代入ではなく読み取りなので
  strict / sloppy で挙動が割れておらず、到達不能（`XMLSerializer` が無い環境のみ）。直すには
  「何を表示すべきか」を発明することになる。段階3 の計測で `TS2304` が 1 件だけ残り、本物のバグを指す
  マーカーになる。
- **[`js/wwwsqldesigner.js:215`](js/wwwsqldesigner.js#L215) の `eval`（cookie）も据え置き**。形式が `{k:'v'}` で JSON ではなく
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
v5.0.0-beta.7 でも同じエラーが報告されている）。

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
[`js/wwwsqldesigner.js:215`](js/wwwsqldesigner.js#L215) の 1 件だけで、外側で `var` 宣言済みの `obj` に
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
本 PR は読み込み順の先頭 3 本 — [`js/oz.ts`](js/oz.ts) / [`js/config.ts`](js/config.ts) /
[`js/globals.ts`](js/globals.ts)（462 行・101 診断）— に絞り、**残り 15 本が従うイディオムを確定する**
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
[`src/app.ts`](src/app.ts) の順に前から `.ts` 化すれば、`.ts` 側が参照するシンボルは常に
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

これで [`js/oz.ts`](js/oz.ts) から消したもの: 参照 0 の `select` / `gecko` / `webkit` / `khtml`、
`Event.add` / `remove` の `attachEvent` / `detachEvent` 分岐、`Event.stop` / `prevent` / `target` の
IE フォールバック、`Style.get` の `currentStyle`、`Style.set` の opacity→filter と float→styleFloat、
`DOM.pos` の opera 分岐、`Request` の `ActiveXObject` 分岐。299 → 354 行（消したぶんより型注釈と根拠コメントのほうが多い）。

**`OZ.ie` / `OZ.opera` はプロパティだけ残した。** [`js/tablemanager.js:217`](js/tablemanager.js#L217)（IE6 で
`select()` が throw する回避）と [`js/io.js:689`](js/io.js#L689)（F2 の preventDefault）がまだ `.js` で読む。
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
結果 `window.SQL` の型は「[`js/globals.ts`](js/globals.ts) の `SqlNamespace` ∩ 合成型」になり、
まだ生えていないクラス 14 個を要求してくる。`as unknown as typeof window.SQL` で受けた。
段階3-3 で `.js` が尽きれば合成が止まり、素の代入に戻せる。

**`SqlNamespace` に `Designer` / `designer` を宣言し続けた**のは、段階2 で入れた
「`SQL.Designer` → `SQL.designer` の改名を `npm run typecheck` が検出する」安全網を維持するため。
実証もやり直した: [`tests/node/harness.ts`](tests/node/harness.ts) の `sql.designer.toXML()` を
`sql.Designer.toXML()` に戻すと、合成型と交差した後でも
`TS2339: Property 'toXML' does not exist on type 'new () => SqlDesigner'` で落ちる。

**`DATATYPES` と `LOCALE` はモジュールローカル変数にしなかった。**
[`js/wwwsqldesigner.js:110,370`](js/wwwsqldesigner.js#L110) と両ハーネスが `window.DATATYPES = …` で
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
> ことを確認済み）: **テーブルは Delete キーで消えない。** [`js/table.js`](js/table.js) の `click` が
> `#area` へのバブリングを止めるため [`js/tablemanager.js:158`](js/tablemanager.js#L158) の
> `rowManager.select(false)` が走らず、`TableManager.press` が「row 選択中」で早期 return する
> （同 :242）。`#removetable` ボタンなら消える。また **`#addtable` は追加モードに入るだけ**で、
> 実際の生成は `#area` のクリック（同 :142-161）、その直後に編集ダイアログが開いて `#background` が
> 全面を覆う。

### 2026-08-12 HANDOVER §3「フロント TS 化」段階3-2 — 描画中核 7 本を `.ts` 化し、`dom` バッグの型を決めた

段階3-1 で名指ししていた本丸（`dom` バッグの 3 形態）に着手した。対象は
[`js/visual.ts`](js/visual.ts) / [`row.ts`](js/row.ts) / [`table.ts`](js/table.ts) /
[`relation.ts`](js/relation.ts) / [`key.ts`](js/key.ts) / [`rubberband.ts`](js/rubberband.ts) /
[`map.ts`](js/map.ts) の 1,589 行で、`tsc --allowJs --checkJs --strict --noUncheckedIndexedAccess`
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
ならない。Vite/esbuild も同じフラグを見るため dist にも出る。逆に [`js/table.ts`](js/table.ts) の
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
収まり、[`js/visual.ts`](js/visual.ts) 56 行の中に閉じる。見返りに `this.dom.*` の読み出し
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

**`this.owner`（Designer）の型は [`js/globals.ts`](js/globals.ts) の `SqlDesigner` に集約した。**
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

[`js/globals.ts`](js/globals.ts) の `as unknown as typeof window.SQL` は**残る**。合成に寄与する
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
| [`js/relation.ts`](js/relation.ts) `redraw()` | `var t1` / `t2` が `HTMLElement` → `number` の再宣言で TS2403。`t1++` が lvalue なので `as` では回避不能 | 要素側を `e1` / `e2` に改名（宣言 2 ＋ 読み出し 6 ＝ 8 行）。`:201` 以降の t1 / t2 の読み出し 10 箇所は無変更 |
| [`js/table.ts`](js/table.ts) `down()` | `var t = OZ.Event.target(e)` と `var t = Table` が TS2403 | 前者を `el` に改名（2 行。読み出しは直後の 1 行のみ） |
| [`js/row.ts`](js/row.ts) `fromXML()` | `var re` が `string \| null` → `RegExp` の再宣言で TS2403 | 後者を `quoteRe` に改名（2 行） |
| [`js/table.ts`](js/table.ts) `addKey` | 仮引数名 `name` だが実引数は `Key` の第 2 引数＝`type` に渡っている | `addKey(type?: string)` に改名（1 語。`arguments` 不使用なので emit 上の意味は変わらない） |

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
  受ける [`js/key.ts`](js/key.ts) を `as Row` 1 キャストで通した。
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
> [`js/wwwsqldesigner.js`](js/wwwsqldesigner.js) の `fromXML` が `findNamedTable(tname)` で
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

**[`js/io.js`](js/io.js)（695 行・35 メソッド）は機械変換した。** 手で書き写すと差分の中に
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

段階3 の最後の実作業。[`js/toggle.ts`](js/toggle.ts) / [`io.ts`](js/io.ts) /
[`tablemanager.ts`](js/tablemanager.ts) / [`rowmanager.ts`](js/rowmanager.ts) /
[`keymanager.ts`](js/keymanager.ts) / [`window.ts`](js/window.ts) / [`options.ts`](js/options.ts) /
[`wwwsqldesigner.ts`](js/wwwsqldesigner.ts) の 8 本・2,132 行（診断 619 件）を `.ts` にした。
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
[`js/io.ts`](js/io.ts) の F2 `preventDefault` と [`js/tablemanager.ts`](js/tablemanager.ts) の
IE6 `select()` 回避の 2 箇所だけで、どちらも実測で false 固定。

**型のためのコード変更 3 件**（段階3-1 の 1 件、3-2 の 4 件に続く 6〜8 件目）。

| 箇所 | 症状 | 変更 |
|---|---|---|
| `io` / `tablemanager` / `keymanager` の 2 つ目の id ループ | 同名の `var elm` が「ボタン（`HTMLInputElement`）」と「ラベル」で再宣言され TS2403 | ラベル側を `labelElm` に改名（各 2 行。読み出しは直後の 1 行だけ） |
| [`js/tablemanager.ts`](js/tablemanager.ts) `click()` | `newtable.addKey("PRIMARY", "")` が 2 引数（TS2554） | 第 2 引数を落とした。`Table.addKey` は 1 引数しか読まず、[`js/table.ts`](js/table.ts) 側に「是正は段階3-3 で」と予告コメントが入っていた |
| [`js/table.ts`](js/table.ts) `findNamedRow` | 引数が `string` 固定だが、`Designer.fromXML` は属性欠落時に `null` を渡しうる | シグネチャを `string \| null` に広げた（型だけ） |

**逆に、型のために増やしかけた emit を 2 件戻した。** バンドル diff の副次判定（下記）が
説明のつかない差分として拾ったもの。(a) `removeSelection` で `var legacy = sel as …` と
ローカル変数を作っていたのを、キャストをインラインに畳んで変数ごと消した。(b) `getXhrHeaders` の
未使用仮引数 `value` を型付けのついでに落としていたのを戻した。**どちらも挙動同値だが、
「実行コードは変えない」を emit で担保するには差分ゼロのほうが強い。**

**本物のバグを型で隠さない（マーカーとして残したもの）。**

- [`js/wwwsqldesigner.ts`](js/wwwsqldesigner.ts) `toXML()` の**未定義 `e`**（段階2 が意図して
  残した TS2304 1 件）。`// @ts-expect-error` ＋ 根拠コメントで通した。`@ts-expect-error` は
  「エラーが消えたらそれ自体がエラーになる」ので、§4 の XML 書き出し撤去でこの分岐が消えたときに
  必ず気づける。到達不能（`XMLSerializer` が無い実行系のみ）なので撤去はしない。
- **`CONFIG.DEFAULT_BACKEND` が文字列ではなく配列 `["php-mysql"]`**（upstream の取り違え。
  `.js` のうちは `checkJs: false` で見えなかった）。`js/io.ts` の `bs[i] == be` が緩い比較で
  配列を文字列化するため現行は意図どおり動いており、値を直すのは実行コード変更になるので
  型で受けるだけにした（`string | string[]`）。是正は §5 の backend 移植で既定 backend の扱いごと。

**`.js` が尽きたことで回収したもの。**

- [`js/globals.ts`](js/globals.ts) の `window.SQL = SQL as unknown as typeof window.SQL` が
  **素の代入に戻った**（`.js` のトップレベル代入からグローバル型が合成される問題が消えたため。
  段階3-1 から予告していた回収）。
- `types/globals.d.ts` を**削除**。最後まで残っていた `window.d`（デバッグ用ハンドル）の宣言は
  [`src/main.ts`](src/main.ts) の `declare global` へ引き取った。
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
受ける形に統一された。[`js/map.ts`](js/map.ts) の「公開名 `SQL.Map` は現行のまま」という注釈は撤回。

**pub/sub は `this` 束縛が消えても同値。** `_subscribers` の参照は [`js/globals.ts`](js/globals.ts) 内だけ
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
（[`js/keymanager.ts`](js/keymanager.ts) の `left()` / `right()` はボタンの左右と逆の語感になっている）と、
`clientsql` は `output.xsl` を `OZ.Request` で取りに行くので **`#textarea` が埋まるまで待つ必要がある**
ことを確認している。一巡で出る console error 2 件（Dropbox CDN の遮断、F2 quicksave の 404）は
ネットワーク由来で JS 例外ではない。

---

## 保持している upstream 資産（撤去予定を含む）

| 資産 | 現状 | 方針（HANDOVER 準拠） |
|---|---|---|
| PHP backend（`backend/php-*` 他） | 保持。**§0 実測完了**（契約は ARCHITECTURE §4） | Kotlin/Spring Boot へ移植し撤去 |
| submodule `backend/php-s3/amazon-s3-php` | 参照のみ（未初期化） | PHP 撤去時に削除 |
| XML 永続化（`toXML()` / `save` の body） | 保持。**§7 で golden 固定済み**（`tests/golden/xml/`） | JSON 統一。XML は読込専用に。書き出しは撤去（§4） |
| DDL 生成 `db/<db>/output.xsl`（XSLT 1.0） | 保持。**§7 で golden 固定済み**（`tests/golden/ddl/`・全 9 DB） | TS 実装へ置換（§6.3 の規約もここ） |
| 型パレット `db/<db>/datatypes.xml` | 保持 | PostgreSQL 18 型パレットへ差し替え（§6.1）。**uuid が無く house 既定の PK が INTEGER に落ちる**（known-issues #4） |
| 描画エンジン（`js/`, `styles/`） | 保持。§3 段階1 で Vite のバンドル配下に入れ、段階2 で `SQL.Visual` 階層を ES クラス化・`OZ.Class` と ES5 polyfill を撤去、段階3-1 で `oz` / `config` / `globals` を、段階3-2 で描画中核 7 本（`visual` / `row` / `table` / `relation` / `key` / `rubberband` / `map`）を `.ts` 化、段階3-3a で残る prototype 方式 7 本を class 化、**段階3-3b で残り 8 本を `.ts` 化して `js/` から `.js` が尽きた**（いずれも挙動は不変） | 温存し TS で巻く（Tier 2）。`window` 登録と `declare global` の撤去・`strict` の最終確認は段階3-4 |
| `index.html` の Dropbox CDN 読み込み | 保持（テストでは遮断） | 存廃を未決（上記決定ログ参照） |

> 注: 旧版の本書と ARCHITECTURE には `config.xml.sample` を upstream 資産として挙げていたが、**このリポジトリに実在しない**。アプリ設定は [`js/config.js`](js/config.js)（`CONFIG.*`）。

（以降、実装が進むたびに差分を追記する）
