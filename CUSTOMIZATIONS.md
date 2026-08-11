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

---

## 保持している upstream 資産（撤去予定を含む）

| 資産 | 現状 | 方針（HANDOVER 準拠） |
|---|---|---|
| PHP backend（`backend/php-*` 他） | 保持。**§0 実測完了**（契約は ARCHITECTURE §4） | Kotlin/Spring Boot へ移植し撤去 |
| submodule `backend/php-s3/amazon-s3-php` | 参照のみ（未初期化） | PHP 撤去時に削除 |
| XML 永続化（`toXML()` / `save` の body） | 保持。**§7 で golden 固定済み**（`tests/golden/xml/`） | JSON 統一。XML は読込専用に。書き出しは撤去（§4） |
| DDL 生成 `db/<db>/output.xsl`（XSLT 1.0） | 保持。**§7 で golden 固定済み**（`tests/golden/ddl/`・全 9 DB） | TS 実装へ置換（§6.3 の規約もここ） |
| 型パレット `db/<db>/datatypes.xml` | 保持 | PostgreSQL 18 型パレットへ差し替え（§6.1）。**uuid が無く house 既定の PK が INTEGER に落ちる**（known-issues #4） |
| 描画エンジン（`js/`, `styles/`） | 保持。§3 段階1 で Vite のバンドル配下に入れ、**段階2 で `SQL.Visual` 階層を ES クラス化・`OZ.Class` と ES5 polyfill を撤去**（挙動は不変） | 温存し TS で巻く（Tier 2）。`.ts` 化 → `checkJs` → `strict` は後続 |
| `index.html` の Dropbox CDN 読み込み | 保持（テストでは遮断） | 存廃を未決（上記決定ログ参照） |

> 注: 旧版の本書と ARCHITECTURE には `config.xml.sample` を upstream 資産として挙げていたが、**このリポジトリに実在しない**。アプリ設定は [`js/config.js`](js/config.js)（`CONFIG.*`）。

（以降、実装が進むたびに差分を追記する）
