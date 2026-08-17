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
| page（`test:browser` / `test:dist` / `known-issues`） | `window.SQL.designer` | [`src/main.ts`](src/main.ts) が置く **`window.d`**（upstream 由来のデバッグハンドルをテスト API に昇格） |

**node 側は「テスト専用エントリ」を 1 本足す形にした。** [`tests/node/app-entry.ts`](tests/node/app-entry.ts) は
`import "../../src/app.ts"` に続けてハンドルを載せるだけで、**読み込み順の定義は
[`src/app.ts`](src/app.ts) の 1 か所のまま**。ハーネスの変更は `lib.entry` の 1 行と参照の付け替えだけで、
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
文書化するほうが面が増えない（[`src/main.ts`](src/main.ts) のコメントが利用手順として機能している）。
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
| [`js/oz.ts`](js/oz.ts) `window.OZ` ＋ `declare global` | 削除（最後の消費者だった Node ハーネスは 3-4b で `window.__grabado` 経由に） |
| [`js/config.ts`](js/config.ts) `window.CONFIG` ＋ `declare global` | 削除（読み手 0・段階3-3b の時点でデッドだった） |
| [`js/globals.ts`](js/globals.ts) `window._` / `window.SQL` | 削除 |
| [`js/globals.ts`](js/globals.ts) `window.LOCALE` | `export const LOCALE` にモジュール化 |
| [`js/wwwsqldesigner.ts`](js/wwwsqldesigner.ts) `SQL.Designer = Designer` | 削除（`SqlNamespace` は `{ designer }` だけになった） |
| [`src/main.ts`](src/main.ts) `new window.SQL.Designer()` | 値 import して `new Designer()` |
| [`js/globals.ts`](js/globals.ts) `window.DATATYPES` ／ [`src/main.ts`](src/main.ts) `window.d` | **残す**（下記） |

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
  [`js/io.ts`](js/io.ts) → `src/` の逆向き辺が生え、それを避けるには IO ダイアログごと `src/` へ移す
  作業が §4 に乗ってしまう。§2 の `frontend/` 集約でどのみち丸ごと動かす。
- **Dropbox 連携は 4-3 で撤去する**（段階3-3b からの未決を解消）。[`js/io.ts`](js/io.ts) が 150 行以上
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
[`js/wwwsqldesigner.ts`](js/wwwsqldesigner.ts) の `toXML()` が埋め込むパレット全文と
`<!-- Active URL -->` は DDL に影響しない。4-4 で「決定論な DDL 入力 XML」に作り替えても
DDL golden 63 本が動かないはず、という予測の根拠。**4-4 の完了判定（`git diff tests/golden/ddl/` が空）が
そのままこの実測の検算になる。**

**本 PR の中身は 7 行の置換と名前空間の削除。**

| 箇所 | 旧 | 新 | 同値である理由 |
|---|---|---|---|
| [`js/row.ts:169`](js/row.ts#L169) | `var des = SQL.designer;` | `this.owner.owner` | コンストラクタは `this.owner` 代入の**後**に `update(data)` を呼ぶ |
| [`js/relation.ts:55`](js/relation.ts#L55) | `SQL.designer.getOption("style")` | `this.owner.…` | 直前の 4 行が同じ `this.owner` を前提に組み立てている |
| [`js/table.ts:311`](js/table.ts#L311) | `SQL.designer.getOption("snap")` | `this.owner.…` | — |
| [`js/table.ts:461`](js/table.ts#L461) | `SQL.designer.removeSelection()` | `this.owner.…` | `move` / `up` は `down()` が `this.move.bind(this)` で `document` に張る |
| [`js/table.ts:484`](js/table.ts#L484) | `var d = SQL.designer;` | `var d = this.owner;` | 同じメソッドの末尾が既に `this.owner.sync()` を呼んでいる |
| [`js/rowmanager.ts:124`](js/rowmanager.ts#L124) | `SQL.designer.getFKTypeFor(…)` | `this.owner.…` | 6 行上（`:118`）が同じ `this.owner` を読んでいる |
| [`js/wwwsqldesigner.ts:76`](js/wwwsqldesigner.ts#L76) | `SQL.designer = this;` | 削除 | 読み手が 0 になった |

読み手はすべて Designer に**所有される側**（Row / Table / Relation / RowManager）で、`owner` 鎖の終端は
唯一の Designer と同一実体。Designer のコンストラクタ実行中に Table / Row が生成される経路でも、
旧 `SQL.designer` は先頭で `this` を入れていたので参照先は変わらない（どちらも初期化途中の同じ `this`）。
併せて [`js/globals.ts`](js/globals.ts) から `interface SqlNamespace` と `export const SQL` を削除し、
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

**次段階（4-0b）への入力**。`window.DATATYPES` は読み 11（[`js/row.ts`](js/row.ts) ×4 /
[`js/wwwsqldesigner.ts`](js/wwwsqldesigner.ts) ×5 / [`js/io.ts`](js/io.ts) ×2）・書き 2
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

**決めたこと 2: スコープは要素アクセサのみの薄い抽出。** [`js/io/palette.ts`](js/io/palette.ts) の
`TypePalette` は `setRoot` / `isLoaded` / `element` / `db` / `types` / `typeAt` / `groups` の 7 メソッドで、
**キャッシュを一切持たない**。現行コードは参照のたびに `getElementsByTagName` を呼んでおり、
唯一のキャッシュは `Designer.typeIndex` / `fkTypeFor`。これを palette に寄せると
**「datatypes を差し替えても消えない」現行の寿命が変わる**（差し替え後も古い型 index を使い続ける
のは現行の癖だが、挙動不変が要件の §4 では温存する）。型解決そのものの再設計 —
`getTypeIndex` / `getFKTypeFor` / `Row.fromXML` の `sql`・`re` 照合 — は §6.1 の型パレット差し替えと
同時に行う。

**内部値は `Element | false` のまま**にした。`null` にすると
[`js/wwwsqldesigner.ts`](js/wwwsqldesigner.ts) `toXML()` の `XMLSerializer` フォールバック
（`DATATYPES.xml` を評価する死に分岐）が `undefined` から **TypeError** に変わる。この分岐は
§4 の XML 書き出し撤去で消えるので、そのとき `null` 化する。

**生成はコンストラクタの先頭寄り（`this.title = document.title;` の直後）。** `requestDB()` より前で
あることは必須だが、それより強い理由がある — 旧 `window.DATATYPES` は
[`js/globals.ts`](js/globals.ts) が `false` で初期化していたので**評価時点で必ず存在**し、未読込を
`false` で表していた。生成が読み手より後になると「未読込」が `undefined` になり TypeError で割れる。

**読み手の付け替えは owner 鎖**（4-0a と同じ）。[`js/row.ts`](js/row.ts) 4 箇所が
`this.owner.owner.palette`（Row → Table → Designer）、[`js/io.ts`](js/io.ts) 2 箇所が
`this.owner.palette`、[`js/wwwsqldesigner.ts`](js/wwwsqldesigner.ts) は `this.palette`（読み 3・書き 2）。
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
[`js/io/`](js/io/) の 3 本に移り、描画クラスから書き出しコードが 1 行も残らなくなった**。
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
[`js/io/model.ts`](js/io/model.ts) の `RowModel.type` は**型パレットの添字のまま**で、sql 名に
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
  [`Designer.addRelation`](js/wwwsqldesigner.ts#L282) の 1 箇所だけで、コンストラクタが
  [両 row に push](js/relation.ts#L79) した直後に designer 側にも push されるので、
  `row.relations` は `designer.relations` の順序を保つ部分列になる）。`row.relations` を
  そのまま読めば証明そのものが不要になる。
- 位置参照は `designer.tables.indexOf(row.owner)` が −1 を返す場合に現行と同値な出力を作れない
  （現行は名前を読むだけなので落ちない）。到達不能ではあるが、**バイト不変が要件の PR で
  「到達不能だから」を根拠にしたくない**。

XML は元々名前で参照する形式なので、名前で持つことは決定 1 とも整合する。同名テーブルで
リレーションが壊れる既知の不具合は名前解決に由来するが、**id 参照へ移すかは `formatVersion: 1` を
決める 4-2 の判断**（段階4-0a の申し送りどおり）。

**決めたこと 3: ファイル名は `serializer.ts` ではなく [`xml-serializer.ts`](js/io/xml-serializer.ts)。**
HANDOVER §4 の `io/serializer.ts` は「全入出力を JSON に統一。`serialize`/`deserialize` を集約」の
文脈にある名前なので JSON 用に取っておく。本ファイルは 4-3 で `js/io/ddl-xml.ts` に改名し、
`output.xsl`（DDL 生成）専用の内部モジュールになる。

**決めたこと 4: 基底 [`Visual.toXML()`](js/visual.ts) の空実装は残さず消した。**
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
| `function escape` の消滅 | [`js/globals.ts`](js/globals.ts) | −3 |
| `Visual.toXML(){}` の消滅 | [`js/visual.ts`](js/visual.ts) | −1 |
| `Row.toXML` の消滅 | [`js/row.ts`](js/row.ts) | −26 |
| `Key.toXML` の消滅 | [`js/key.ts`](js/key.ts) | −10 |
| `Table.toXML` の消滅 | [`js/table.ts`](js/table.ts) | −11 |
| `Designer.toXML` の 1 行化 | [`js/wwwsqldesigner.ts`](js/wwwsqldesigner.ts) | −12 / +1 |

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
[`js/io.ts`](js/io.ts) の 8 箇所のうち到達可能な 7 本すべてを踏んだ —— `#clientsave` /
`#clientcopy` / `#clientdownloadxml` / `#clientdownloadtxt` / `#clientlocalsave`（`#clientlocalload`
との往復）/ **`#clientsql`（＝`finish()`。XSLT の入力が壊れていないことの確認）** / `#quicksave`。
`#dropboxsave` は `CONFIG.DROPBOX_KEY` 未設定でボタンが hidden。この過程で確認した現行仕様:

- **`#foreigncreate` は「作成モードに入る」だけで、FK 行と relation は相手テーブルの
  クリックで生える**（[`RowManager.tableClick`](js/rowmanager.ts#L108)）。`#addtable` が
  `#area` のクリックで実体化するのと同じパターン。
- **Chromium のクリップボードは Windows で LF を CRLF に正規化する。** `#clientcopy` の結果を
  `#clientsave` とバイト比較するときは戻す必要がある（localStorage 経由は生のまま）。
- `#quicksave` は `serversave(e, this._name)` で、`_name` が空の初回は prompt が出る。

**次段階（4-1b: 読み込み方向）への入力**。`fromXML` 4 実装の DOM 走査規則は**微妙に不揃い**で、
逐語移設のときに揃えてはいけない。[`Table.fromXML`](js/table.ts#L392) の `<comment>` だけが
**直下の childNodes 走査で最後の一致が勝つ**（`getElementsByTagName("comment")[0]` にすると
row 内の comment を拾う）のに対し、[`Row.fromXML`](js/row.ts) は `getElementsByTagName(...)[0]` で
子孫の先頭が勝つ。relation は [`Designer.fromXML`](js/wwwsqldesigner.ts#L501) が
**document 順の第 2 パス**で回し、所属を `parentNode` / `parentNode.parentNode` の `name` 属性から
**引き直す** —— ここが同名テーブルのバグの本体で、「今パースしている row が子側」と書くと
バグが直ってしまい、テストが 1 本も落ちないまま挙動が変わる。順序依存（`clearTables()` →
`palette.setRoot()` → 行の型解決）も偶然ではない: `clearTables()` は `removeTable` →
`rowManager.select(false)` → `Row.deselect()` → `redraw()` → `getColor()` → `getDataType()` と
たどって**パレットを読む**ので、先に差し替えると古い添字で新パレットを引くことになる。

### 2026-08-15 HANDOVER §4「IO」段階4-1b — 読み込み方向を parser / apply に分けた

§4 の 4 本目。**`Designer` / `Table` / `Row` / `Key` に散っていた `fromXML()` 4 実装が
[`js/io/`](js/io/) の 2 本に移り、描画クラスから入出力コードが 1 行も残らなくなった**。
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
どちらも 4-4 / 4-5 で消す既知の逸脱として [`js/io/model.ts`](js/io/model.ts) に書いた。

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
ガードなしで読む。基底 [`Visual.fromXML()`](js/visual.ts) の空実装は 4-1a の `toXML()` と同じ論法で
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
| `Visual.fromXML(){}` の消滅 | [`js/visual.ts`](js/visual.ts) | −1 |
| `Row.fromXML` の消滅 | [`js/row.ts`](js/row.ts) | −37 |
| `Key.fromXML` の消滅 | [`js/key.ts`](js/key.ts) | −10 |
| `Table.fromXML` の消滅 | [`js/table.ts`](js/table.ts) | −21 |
| `findNamedTable` の JSDoc 1 行 | [`js/wwwsqldesigner.ts`](js/wwwsqldesigner.ts) | ±1 |
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
[`js/globals.ts`](js/globals.ts) の `export type SqlDesigner = Designer` は 3-2 の経緯コメントごと
消える。§4 の残り（4-2 以降）は形式側 2 本の追加なので、ライブ側 2 本は原則もう触らない。

---

### 2026-08-15 HANDOVER §4「IO」段階4-1c — `SqlDesigner` を `Designer` に一本化した

§4 の 5 本目で、4-1 の締め。**型の名前が 2 つあった状態を実体 1 本に寄せ、参照 13 本すべてが
[`js/wwwsqldesigner.ts`](js/wwwsqldesigner.ts) の `Designer` を直接見るようにした**。
出荷コードの挙動には一切触れないので、**主張は「バンドル出力が 1 バイトも変わらない」の 1 点**
（4-1a / 4-1b の「golden 無差分」より強い判定 —— テストが通る範囲ではなく emit そのものの同一性）。

**なぜ今か。** `SqlDesigner` は段階3-2 の産物で、当時 `js/wwwsqldesigner.js` がまだ `.js` だった
ため「`Designer` インスタンスの面」を [`js/globals.ts`](js/globals.ts) に構造的 interface として
書いていた。段階3-3b で実体が `.ts` になった時点で `export type SqlDesigner = Designer;` の
1 行に縮み、以後は**別名だけが残っていた**。§4 の残り（4-2 以降）はモデル層の型を増やす作業なので、
「どの型が描画エンジンの実体か」が 2 通りに読める状態を持ち込まないためにここで畳む。

**決めたこと 1: 必ずトップレベル `import type` で書く。** インライン形
（`import { type Designer } from "./wwwsqldesigner.ts"`）は `verbatimModuleSyntax` のもとで
**import 文自体が emit に残る**ため、副作用 import として Rollup の依存グラフに辺が生える。
`wwwsqldesigner` は [`src/app.ts`](src/app.ts) の読み込み順の**最後尾**なので、辺が生えた瞬間に
順序が壊れる（バイト一致の判定はこれを機械的に検出する）。この警告は 3-1 以来 `globals.ts` の
冒頭にあったが、置き場所ごと [`js/table.ts`](js/table.ts) の冒頭へ移した —— `src/app.ts` の順序で
`Designer` 型を最初に使うファイルで、他 9 本は「理由は js/table.ts の冒頭」の 1 行だけを持つ
（`js/oz.ts` / `js/visual.ts` と同じ「イディオムの正本は 1 か所」の形）。

**決めたこと 2: 型の循環参照はそのまま許容する。** `table.ts` → `wwwsqldesigner.ts` →
`table.ts` の循環が 10 本ぶん生まれるが、**型だけの辺なので emit には 1 本も出ない**。
先例は 4-1a / 4-1b で入れた [`js/io/extract.ts`](js/io/extract.ts) /
[`js/io/apply.ts`](js/io/apply.ts) の `import type { Designer } from "../wwwsqldesigner.ts"` で、
書き方をそれに揃えた。迂回のために `globals.ts` を経由させ続けるのは、**実体を隠す別名を
残すこと**と同義で得がない。副作用として `globals.ts` は js/ のどこにも依存しなくなった。

**見つけたこと: [`js/row.ts`](js/row.ts) の `SqlDesigner` は未使用 import だった。**
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
（[`js/io/model.ts`](js/io/model.ts)）は 4-1a の形のまま確定したので、4-2 は形式側に
`json-serializer` / `json-parser` を足す作業になる。判断が要るのは `formatVersion: 1` の内容で、
4-1b が申し送った **relation の両端を名前で持つか `id` 参照に移すか**（同名テーブルの既知不具合を
直すかどうか）がその中身。決定論出力（キー順・配列順・2 スペース・1 テーブル 1 ブロック）の
要件は CLAUDE.md 制約3 のとおり。

---

### 2026-08-15 HANDOVER §4「IO」段階4-2 — 設計 JSON（`formatVersion: 1`）を新設した

§4 の 6 本目。**形式側に `json-serializer` / `json-parser` の 2 本を足しただけ**で、4-1 で確定した
ライブ側（[`js/io/extract.ts`](js/io/extract.ts) / [`js/io/apply.ts`](js/io/apply.ts)）とモデル
（[`js/io/model.ts`](js/io/model.ts)）には 1 行も触っていない。UI にも配線していない（4-3）ので、
**既存 golden 78 本は 1 バイトも動かず、バンドル差分は削除 0 行の純粋な追加**。

4-0a から申し送られていた 3 つの未決（型を何で焼くか / relation を名前か id か / パレットを同梱するか）を
ここで決着させた。決定の内容は [`docs/FORMAT.md`](docs/FORMAT.md) に散文で、キー順の契約は
[`js/io/json-format.ts`](js/io/json-format.ts) に型として置いてある。**FORMAT.md は 4-0a の表では
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
読み戻しは `null` を入れ、[`Row.update()`](js/row.ts#L167) の既存規則（`!nll` かつ `def === null` なら `""`）が
そのまま正規化する。**XML 経路（＝ DDL 入力）の #2 撤去は予定どおり 4-5** で、そちらは DDL golden 16 本が動く。

**決めたこと 5: 壊れた入力は部分的に読み込まない。** parser は未知の型 label・`formatVersion` 違い・
必須キーの欠落・型違いをすべて例外にする（メッセージに `tables[0].columns[2].name` の形で位置が入る）。
現行 XML 経路の癖（未知の型は添字 0 ＝ known-issue #4、属性が無ければ実行時 null）は**逆に振った** ——
読む対象が git 管理の正本ファイルなので、黙って別の型で開くのが最悪の失敗だから。あわせて
[`Designer.fromJson()`](js/wwwsqldesigner.ts) は **parse を `clearTables()` より先**に置いた
（`fromXML()` は現行の挙動を保つ要件があるので clear が先のまま）。「例外が出ても今開いている設計が
消えない」ことはテストで固定してある。

**決めたこと 6: 内部関数に `Json` を冠する**（`serializeJsonTable` / `parseJsonKey` 等）。
素直に `serializeTable` と書くと [`js/io/xml-serializer.ts`](js/io/xml-serializer.ts) の同名関数と
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
型だけの [`js/io/json-format.ts`](js/io/json-format.ts) は emit が空なので
[`src/app.ts`](src/app.ts) に載せていない（`js/io/model.ts` と同じ扱い）。

**次段階（4-3）への入力**。UI 全経路を JSON に切り替える（[`js/io.ts`](js/io.ts) の 8 経路・Dropbox 撤去）。
ここで決めるのは 3 つ —— `db` が実行中のパレットと食い違うときの扱い、parser の例外をユーザーに
どう見せるか（locale を通すか）、そして [`js/io/xml-serializer.ts`](js/io/xml-serializer.ts) を
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
[`js/io.ts`](js/io.ts) の 6 メソッド ＋ 型宣言（約 215 行）、[`index.html`](index.html) の CDN
`<script>` とボタン 3 つ、`dropbox-oauth-receiver.html`（ファイルごと）、`CONFIG.DROPBOX_KEY`、
locale 7 言語 × 3 行。

役割が §2 と重複しているのが理由。「Docker で各自ローカル稼働・正本は git 管理ファイル・
共有は PR」という形では、クラウドストレージ経由の受け渡しは**正本を 2 つ作る導線**にしかならない
（制約2）。`CONFIG.DROPBOX_KEY` が未設定なら `dropBoxInit()` がボタンを `display: none` にする
実装だったので「既定では見えないから残しても無害」に見えるが、**CDN からの `dropbox.js` 読み込みは
キーの有無と無関係に毎回走る**。分類 B のリポジトリで出荷物に外部オリジンの実行コードを引く
価値がゼロなので、隠すのではなく消した。これで **index.html の外部依存は 0 本**になった。

#### 決めたこと 2: ファイルは改名するが、関数名は変えない

[`js/io/xml-serializer.ts`](js/io/xml-serializer.ts) → [`js/io/ddl-xml.ts`](js/io/ddl-xml.ts)。
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
採るので [`js/io.ts`](js/io.ts) を通らない。つまり **「UI が JSON に切り替わったこと」は
golden 不変と両立してしまう**。歴代の段階が「golden 無差分」を主たる完了判定にできたのは
変更対象が golden の経路上にあったからで、本段階はそこが構造的に違う。

そこで完了判定を 2 本立てにした —— 「golden 85 本が無差分」（＝**描画エンジンと形式側に
触っていない**ことの証明）＋ **UI 経路を固定する新規テスト 2 本**（＝切り替わったことの証明）。
この非対称は本段階でいちばん重要な設計判断で、[`docs/TESTING.md`](docs/TESTING.md) に節を足した。

#### 決めたこと 1: 形式の判別は先頭 1 文字。フォールバックは作らない

[`js/io/detect.ts`](js/io/detect.ts)（export 1 本）。BOM と先行空白を飛ばした最初の 1 文字が
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
[`js/io/model.ts`](js/io/model.ts) の型注釈もそこで直す。§4 の残りは 4-5 / 4-6
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
片方だけ直す事故の余地ができる（4-1b の決めたこと 3 と同じ立場）。[`js/io/model.ts`](js/io/model.ts)
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

[`js/io/conflict.ts`](js/io/conflict.ts) が `verdictForSave(baseline, name, server)` を返すだけの
純関数で（`absent` / `clean` / `exists` / `conflict`）、confirm を出すかどうかも、プリフライトを
投げるかどうかも知らない。文言は locale を通す必要があるので呼び手側 —— `js/io/` 配下は locale を
通さない規約（[`js/io/json-parser.ts`](js/io/json-parser.ts) の冒頭）に従った。

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
  [`js/io.ts`](js/io.ts) を通らない）
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
| 1 | 全入出力を JSON に統一（YAML 不採用） | 保存 5 経路すべてが [`js/io/json-serializer.ts`](js/io/json-serializer.ts)、読み込みは [`js/io/detect.ts`](js/io/detect.ts) が振り分け | `tests/node/io-ui.test.ts` / `tests/browser/io-ui.spec.ts` | 4-3b |
| 2 | `serialize` / `deserialize` を `io/` に集約 | `js/io/` 11 本。描画クラスに `toXML` / `fromXML` は 1 つも残っていない | 状態スナップショット golden 8 本 | 4-1a / 4-1b |
| 3 | 決定論出力（キー順・配列順・2 スペース・改行区切り） | キー順の契約は [`js/io/json-format.ts`](js/io/json-format.ts) の宣言順。**DDL 入力 XML も 4-4 で決定論になった**（`<!-- Active URL -->` と `<datatypes>` 全文の撤去） | 「同一モデル → 2 回の出力が一致」／「環境依存が出力に現れない」 | 4-2 / 4-4 |
| 4 | round-trip ＋「同じモデル → 同じ文字列」 | `toJson` / `fromJson` を 3 周させて 1・2・3 回目が一致 | `tests/node/json.test.ts` / `tests/browser/json.spec.ts` | 4-2 |
| 5 | diff フレンドリー（1 テーブル = 独立ブロック） | テーブル追加で既存部分が 1 バイトも動かない | `tests/browser/json.spec.ts` の diff テスト | 4-2 |
| 6 | 外部変更検知（古い編集状態で上書きしない） | server 経路の save が read-before-write。判定は [`js/io/conflict.ts`](js/io/conflict.ts) の純関数 | `tests/node/conflict.test.ts` ＋ 仮想 backend の往復 | 4-6 |
| 7 | XML は読込専用（書き出しは撤去） | ユーザーに見える保存経路から消え、[`js/io/ddl-xml.ts`](js/io/ddl-xml.ts) は `output.xsl` への中間表現としてだけ残る | DDL golden 63 本 ＋ DDL 入力 golden 7 本 | 4-3a / 4-3b |
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
  [`js/io/json-parser.ts`](js/io/json-parser.ts) はパレットに無い id を throw する。
  残るのは互換で読む XML 経路（[`js/io/xml-parser.ts`](js/io/xml-parser.ts)）だけで、そこは
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
| 1 | `docs/FORMAT.md` | `keys[].type` は `PRIMARY` / `UNIQUE` / `INDEX` の 3 つ | **UI が作るのは 4 つ**（`FULLTEXT` がある。[`js/keymanager.ts`](js/keymanager.ts)）。しかも parser も serializer も**値を検査しない**（文字列であることだけ見る） |
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
| §6.3（エクスポート規約） | `output.xsl` の TS 化。これで [`js/io/ddl-xml.ts`](js/io/ddl-xml.ts) が**モジュールごと消える**。known-issues #5 / #6 ＋ 上の key type の `KEY (` 落ち | 4-0a / 4-1a |
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
2. **[`license.txt`](license.txt) の権利表記**が upstream のみ（上表のとおり）

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
[`js/config.ts`](js/config.ts) の `AVAILABLE_DBS` 1 か所しかない。

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
（[`js/wwwsqldesigner.ts:335-346`](js/wwwsqldesigner.ts#L335-L346)）。実ブラウザで実測した:

| | cookie 無し（＝ `DEFAULT_DB` の `mysql`） | cookie `db=cubrid` |
|---|---|---|
| `d.palette.isLoaded()` | `true` | **`false`** |
| `d.palette.db()` | `"mysql"` | **`TypeError: this.element(...).getAttribute is not a function`**（[`js/io/palette.ts:54`](js/io/palette.ts#L54)） |
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

1. **パレットだけでは DDL が出ない。** [`js/io.ts`](js/io.ts) の `finish()` が
   `db/<db>/output.xsl` を読むので、UI の db セレクタに出るのに DDL 生成が 404 になる
   ＝ 半移行を UI に晒す（CLAUDE.md 制約1）
2. **`ddl.test.ts` が赤くなる。** `DB_PROFILES`（`db/` のディレクトリ実体）× `DDL_FIXTURES` で
   回るので、`output.xsl` を持たないプロファイルを置いた瞬間に落ちる。skip の仕掛けを足すと、
   6-1 の撤去で減らした複雑さが戻る
3. **パレットの TS 化は 1 段階に収まらない。** 影響は 15 箇所以上（`palette.ts` 全面・
   `requestDB()` の XHR・`getTypeIndex` / `getFKTypeFor`・`xml-parser`・`row.ts` の型セレクタ・
   両ハーネスの差し替え口・`migrate-design.mjs` の `readPalette()`・`smoke.spec.ts`）。しかも
   [`js/wwwsqldesigner.ts`](js/wwwsqldesigner.ts) の `fromXML()` が**古い XML に同梱された
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

`CHAR(10)` が `text` に寄ると size の "10" が残り、[`js/io/ddl-xml.ts`](js/io/ddl-xml.ts) が
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

## 保持している upstream 資産（撤去予定を含む）

| 資産 | 現状 | 方針（HANDOVER 準拠） |
|---|---|---|
| PHP backend（`backend/php-*` 他） | 保持。**§0 実測完了**（契約は ARCHITECTURE §4）。**段階4-6 でも 1 行も触っていない** —— 外部変更検知はフロント側の read-before-write で、条件付き更新（ETag / `If-Match`）は §5.1 の仕事。**6-1 でも触っていない**が、`backend/php-cubrid/index.php:37` が消えた `db/cubrid/datatypes.xml` を読む dangling ができた（段階6-1 の記録） | Kotlin/Spring Boot へ移植し撤去 |
| submodule `backend/php-s3/amazon-s3-php` | 参照のみ（未初期化） | PHP 撤去時に削除 |
| XML 永続化（`toXML()` / `save` の body） | **段階4-3b でユーザーに見える保存経路から撤去**。読み込みは互換で残す（形式は中身で判別）。`toXML()` の呼び手は DDL 生成の 1 か所だけ。**段階4-4 で `tests/golden/ddl-input/` に改名し、決定論・well-formed にした** | 完了。DDL 入力としての XML が消えるのは §6.3（`output.xsl` の TS 化） |
| DDL 生成 `db/<db>/output.xsl`（XSLT 1.0） | 保持。**§7 で golden 固定済み**（`tests/golden/ddl/`）。**段階6-1 で 9 本 → 5 本**（`cubrid` / `vfp9` / `web2py` / `sqlalchemy` を撤去。golden も 63 → 35 本） | 残る 5 本は 6-5 で TS 生成器へ置換（§6.3 の規約もここ）。**新設 3 本は TS 生成器の上に載せる**（6-7。いま XSLT で書くと直後に捨てることになる）。**撤去した `sqlalchemy` は 6-9 で ORM 出力として作り直す** |
| 型パレット `db/<db>/datatypes.xml` | 保持。**段階4-2b で全 9 本の `<type>` に安定 `id` を付与**（設計 JSON の型キー。`label` / `sql` とは独立）。**段階6-1 で 5 本に**（撤去 4 本ぶんが消えただけで、残る 5 本は 1 バイトも動いていない）。**段階6-2 で `postgresql` の `fk` 2 行を label 参照から id 参照へ**（それ以外は不変） | PostgreSQL 18 型パレットへ差し替え（**6-3**。案と移行表は段階6-0 の記録）。**uuid が無く house 既定の PK が INTEGER に落ちる**（known-issues #4）。差し替え時は同じ PR で設計ファイルを移行する（`docs/FORMAT.md`）。他プロファイルの現代化と `re` の是正（known-issues #10）は 6-8 |
| 描画エンジン（`js/`, `styles/`） | 保持。§3 段階1 で Vite のバンドル配下に入れ、段階2 で `SQL.Visual` 階層を ES クラス化・`OZ.Class` と ES5 polyfill を撤去、段階3-1 で `oz` / `config` / `globals` を、段階3-2 で描画中核 7 本（`visual` / `row` / `table` / `relation` / `key` / `rubberband` / `map`）を `.ts` 化、段階3-3a で残る prototype 方式 7 本を class 化、**段階3-3b で残り 8 本を `.ts` 化して `js/` から `.js` が尽きた**（いずれも挙動は不変） | 温存し TS で巻く（Tier 2）。`window` 登録と `declare global` の撤去・`strict` の最終確認は段階3-4 |
| ~~`index.html` の Dropbox CDN 読み込み~~ | **段階4-3a で撤去**（連携ごと。`dropbox-oauth-receiver.html` / `CONFIG.DROPBOX_KEY` / ボタン 3 つ / locale 21 行を含む） | 完了。**これで外部依存は 0 本** |

> 注: 旧版の本書と ARCHITECTURE には `config.xml.sample` を upstream 資産として挙げていたが、**このリポジトリに実在しない**。アプリ設定は [`js/config.js`](js/config.js)（`CONFIG.*`）。

（以降、実装が進むたびに差分を追記する）
