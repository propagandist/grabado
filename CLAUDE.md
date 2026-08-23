# CLAUDE.md — grabado 作業ルール

**grabado**（ER 設計ツール、ドメイン grabado.dev）。`ondras/wwwsqldesigner` 由来。

**目的 = 会社のブランディングとして無料公開する OSS**（収益化しない）＋ **自社でも使う**。
**社内ツールではない。** house 標準（Kotlin/Spring Boot + PostgreSQL 18 DDL）へ寄せ、**Docker で各自ローカル稼働**、**設計データは git 管理の JSON ファイルを正本**とする。
根拠は `HANDOVER.md`。ただし **HANDOVER は社内版前提のまま**（§2 配布・§2.3 Railway・§6.2/§6.3 の house 規約・§8 ドキュメント）。齟齬の一覧は `CUSTOMIZATIONS.md` の 2026-08-15「プロジェクトの目的を記録する」。

## プロジェクト概要
- frontend: 描画エンジンを温存しつつ**完全 TypeScript 化**（Vite / strict）。
- backend: PHP を廃し **Kotlin/Spring Boot**。save/load は**マウント済みファイルの I/O**、introspection は `information_schema`→JSON、AI proxy を提供。
- 正本: **git 管理の JSON ファイル**（`/data/schema` に mount）。共有は PR。編集ストアは **DB レス**（ブラウザ内 / IndexedDB）。
- 配布: マルチステージ Docker（フロント dist を Spring Boot static に同梱）。app 単一コンテナ＋mount。
- **対応 DB は 8 本**: `postgresql`（house 標準）/ `mysql` / `mariadb` / `mssql` / `oracle` / `sqlite` / `h2` / `sql-standard`。`cubrid` / `vfp9` / `web2py` / `sqlalchemy` は撤去（6-1）。決定は `CUSTOMIZATIONS.md` の段階6-0。
- 公開デモ（grabado.dev）は **`READONLY=true` 一択** — AI は API 費用が自社負担、introspection は SSRF の踏み台になるため。編集体験はブラウザ内ストアで成立する。

## 絶対に守る制約（Hard Constraints）
1. **特性化テストが緑であることが移植の前提**。DDL golden ＋ serializer round-trip/決定論テストを先に用意し、挙動不変を保証してから内部を作り替える。半移行を放置しない。
2. **正本は git 管理のファイル**。保存はファイルへ write-through（人手エクスポート禁止）。PG を正本にしない。時間駆動の一方向同期を作らない（pull 上書き事故を防ぐため、同期は load/save のイベント境界＋外部変更検知で行う）。
3. **serializer は決定論・diff フレンドリー**。同一モデル→同一バイト列（キー順・配列順安定、2スペース、改行区切り）。1テーブル=独立ブロック。
4. **フォーマットは JSON 固定**。全入出力は `io/serializer.ts` を通す。XML は読込専用（書き出し撤去）。JSON ルートに `formatVersion`。
5. **配布は Docker・DB レス既定**。ビルドはイメージ内に隠蔽、秘密は env 注入。既定で PG コンテナを持たない。
6. **backend は Spring Boot 一本**。PHP を残さない。save/load=ファイル I/O、introspection=information_schema→JSON。`READONLY` 時は副作用（保存・introspection）を無効化。
7. **AI 出力は自動適用しない**。提案は review-first、適用は §4 の決定論パスに合流、LLM はテストでモック。キーは各自コンテナ env（BYOK・localStorage 不使用）。**構造化出力を強制する（自由テキストをパースしない）** —— 手段は structured outputs（段階11-0）。特定モデル名を焼き込まず env＋docs 参照。
8. **フロント描画エンジンは今回作り直さない**（Tier 2）。UI framework 移行は将来判断・要確認。
9. **upstream 非追従**。自社差分は独立ファイルに分離し `CUSTOMIZATIONS.md` に必ず記録。

## 型・品質
- 型は TypeScript（最終 `strict`）。純粋ロジック（serializer / DDL 生成 / 型マッピング / introspection 変換 / AI patch 適用）は**テスト必須**。
- Prettier / ESLint 準拠。

## スキーマ既定（`HANDOVER.md` §6 準拠）
- PK: 既定 `id uuid DEFAULT uuidv7()`（外部露出=v4 / 完全内部=bigint identity）。
- テーブル名: snake_case・複数形。監査列 `created_at`/`updated_at` = `timestamptz NOT NULL DEFAULT now()`。
- 型: `text` 優先、`timestamptz` 固定、`jsonb`（not json）、`numeric`（not money）。`serial`/`char(n)`/`timestamp`/`money`/`json` はパレットから外す。enum=参照テーブル/CHECK 既定。
- 命名: `fk_<table>_<ref>` / `idx_<table>_<cols>`。

## 着手前の必須確認
- パス・action 名・レスポンス形式は未検証。現行 backend を `php -S localhost:8000` で起動し実通信を確認、差分を `CUSTOMIZATIONS.md` に記録してから実装。
- backend の契約は実測に一致させる（フロント無改修のため）。

## 実装順序
`HANDOVER.md` §9: 現物確認 → 特性化テスト → フロント TS 化 → IO(JSON+決定論) → 型/テンプレ/エクスポート → backend(ファイル I/O + introspection) → AI 機能 → Docker/Railway → 仕上げ。

## 迷ったら
- スキーマ既定や上記制約を覆す提案（単数形化・native enum・PG 正本化・時間駆動同期・UI framework 化・AI 自動適用等）は勝手に進めず確認し、決定を `CUSTOMIZATIONS.md` に記録する。
- 特性化テストを通らない変更、決定論出力を壊す変更はマージしない。
- **対応 DB を絞る・PG だけ整えて他を放置する判断はしない。** 公開プロダクトなので対応 DB の幅と出力品質が製品価値。
- **決定は必ず `CUSTOMIZATIONS.md` に記録する。** 目的・対応 DB のような**セッションをまたぐ前提はプロジェクトメモリにも**書く —— 記録されていない決定は次のセッションでは存在しないのと同じ（2026-08-15 に目的と対応 DB の 2 つが実際に失われ、誤った計画を組みかけた）。

## CI / ワークフロー

GitHub Actions の無料枠 2,000 分/月は **org 全体で共有**。枯らすと全リポジトリの CI と
デプロイが止まる。**ワークフローを増やす・トリガーを変える前に** org の判断規約を読むこと:

`gh api repos/propagandist/.github/contents/docs/ci-strategy.md --jq .content | base64 -d`

**作業の型**（プランを起票で止める／起票の作法／着手前／本文／マージ）は同
`docs/work-conventions.md`（**軸が違う。CI の有無と関係なく効く**）。
**文章の基準**（一貫性・明確さ・リズム・文体・正確さ・網羅性）は同 `docs/writing-baseline.md`
（**同じく軸が違う。人に読ませる文章を書き終えたら読む**）。
**値**（既定ブランチ・ブランチ名・コミット規約・ラベル・merge 方式・表記の対・定番語彙）は
**このリポジトリが持つ**——下の `## 作業の型` と `## 文章の値` に書く。
org 正本には値が 1 つも無い。

## セキュリティ

このリポジトリは**分類 B**（ブラウザで完結。ビルドして配る）。**出力・依存・配信を変える前に**
org の基準を読むこと。読むのは **§2 ／ §3 の [B] ／ §4.2〜4.3 ／ §5.1**:

`gh api repos/propagandist/.github/contents/docs/security-baseline.md --jq .content | base64 -d`

確かめ方は同 `docs/security-verification.md`（手元／既存ジョブ／週次の 3 層）。

## 作業の型

**規律の正本は org の `docs/work-conventions.md`**（起票で止める／起票の作法／着手前／本文／マージ）:

`gh api repos/propagandist/.github/contents/docs/work-conventions.md --jq .content | base64 -d`

**規約の中身をここへ写さない。** ここが持つのは**このリポジトリの値**だけ:

- **★ 作業は `develop`。GitHub 上の既定ブランチは `main` だが、実体は upstream ＋ house docs で、
  `develop` が 64 コミット先行している**（**2026-08-23 実測**）。**PR は `develop` へ出す**
- ブランチ名は `feature/` ＋ 内容（英小文字ケバブ。**issue 番号は入れない**）
- **コミットの subject は日本語で `段階N-M: 〜` 型**（`CUSTOMIZATIONS.md` の段階番号と対応させる。
  **2026-08-23 実測**）。org 由来の変更のように段階に属さないものは、その限りではない
- **merge 方式は squash**（`(#N)` が付く。**2026-08-23 実測**）
- **ラベルは既定の 9 種だけ。マイルストーンは運用していない。issue はまだ 1 本も無い**
  （**2026-08-23 実測**）——**決定の記録先は `CUSTOMIZATIONS.md`** で、issue とは別系統（上の `## 迷ったら`）

## 文章の値

**基準の正本は org の `docs/writing-baseline.md`**（観点・崩れる書き方・校正のコマンド）:

`gh api repos/propagandist/.github/contents/docs/writing-baseline.md --jq .content | base64 -d`

**規約の中身をここへ写さない。** ここが持つのは**このリポジトリの値**だけ（項目の一覧は同 §9）:

- **常体**（**2026-08-23 実測**: 常体 129 / 敬体 0）
- **長音は短形**——`サーバ` `ブラウザ` `コンテナ`（`ユーザー` だけ長形。**2026-08-23 実測**）
- **定番語彙は `HANDOVER.md` が正**（上の `## スキーマ既定`）。**ここに語の表を作らない**
- **基準時点の書式は決めていない**——`YYYY-MM-DD 実測` の形は、上の `## 作業の型` を
  足したときに持ち込んだものだけ
- **一文の長さの閾値は置いていない。校正の実装も無い**（`ci-*.yml` は `paths` で絞っている）
