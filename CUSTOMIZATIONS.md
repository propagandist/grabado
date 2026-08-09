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

### 2026-08-09 `index.html` の CDN 依存（未処理）

- `index.html` は Dropbox 連携のため `//cdnjs.cloudflare.com/…/dropbox.min.js` を読み込む。**Docker でローカル完結**という HANDOVER §2 の方針と噛み合わない。
- Dropbox 機能の存廃とあわせて扱いを決める（現時点では未決）。

---

## 保持している upstream 資産（撤去予定を含む）

| 資産 | 現状 | 方針（HANDOVER 準拠） |
|---|---|---|
| PHP backend（`backend/php-*` 他） | 保持。**§0 実測完了**（契約は ARCHITECTURE §4） | Kotlin/Spring Boot へ移植し撤去 |
| submodule `backend/php-s3/amazon-s3-php` | 参照のみ（未初期化） | PHP 撤去時に削除 |
| XML 永続化（`toXML()` / `save` の body） | 保持。**§7 で golden 固定済み**（`tests/golden/xml/`） | JSON 統一。XML は読込専用に。書き出しは撤去（§4） |
| DDL 生成 `db/<db>/output.xsl`（XSLT 1.0） | 保持。**§7 で golden 固定済み**（`tests/golden/ddl/`・全 9 DB） | TS 実装へ置換（§6.3 の規約もここ） |
| 型パレット `db/<db>/datatypes.xml` | 保持 | PostgreSQL 18 型パレットへ差し替え（§6.1）。**uuid が無く house 既定の PK が INTEGER に落ちる**（known-issues #4） |
| 描画エンジン（`js/`, `styles/`） | 保持 | 温存し TS で巻く（Tier 2） |
| `index.html` の Dropbox CDN 読み込み | 保持（テストでは遮断） | 存廃を未決（上記決定ログ参照） |

> 注: 旧版の本書と ARCHITECTURE には `config.xml.sample` を upstream 資産として挙げていたが、**このリポジトリに実在しない**。アプリ設定は [`js/config.js`](js/config.js)（`CONFIG.*`）。

（以降、実装が進むたびに差分を追記する）
