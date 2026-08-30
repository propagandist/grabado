# HANDOVER.md — grabado（ER 設計ツール / wwwsqldesigner 由来 / Docker 提供 / file 正本 + git 共有）

> **プロジェクト名: grabado** — 版画／「彫る・刻む・記録する」(西 grabar) に由来。git 管理の JSON を版(正本)とし、そこから DDL を刷り出し、commit で履歴に刻む構造を名に持たせている。ドメイン **grabado.dev**（取得済み）。

> 設計判断の確定版。実装は `CLAUDE.md` の運用ルールに従い Claude Code が進める。
> 由来は `ondras/wwwsqldesigner`。house 標準（Kotlin/Spring Boot + PostgreSQL 18 の DDL 生成）へ寄せ、**Docker イメージで各自ローカル稼働**、**設計データは git 管理の JSON ファイルを正本**とする。旧版の「PHP 維持・非移行・ビルド不要・共有サーバ＋外部 PG」前提は**撤廃済み**。

---

## 0. 最初のタスク（他に優先・順序厳守）

本書のパス・backend の action 名・レスポンス形式は現行 `wwwsqldesigner` の典型構成に基づく**未検証の目安**。着手時に必ず以下を行う。

1. `ondras/wwwsqldesigner` を fork → clone。
2. `php -S localhost:8000` で現行 backend を起動し、DevTools で **save / load / list / import(introspection)** の実通信をキャプチャ（action 名・パラメータ・body・Content-Type・本文、特に introspection の構造）。
   → **実施済み。実在する action は `list` / `save` / `load` / `import` の 4 つだけで、未知の action は一律 501。`remove` は実在せず（フロントに削除 UI も無い）、introspection の action 名は `connect` ではなく `import` だった**（本書の初版はここを誤っていた）。**契約の正は [`ARCHITECTURE.md`](ARCHITECTURE.md) §4**（Kotlin 実装の到達点は同 §7）。
3. **特性化テスト（§7）を先に組む**。現行が吐く DDL・シリアライズ結果をスナップショット固定してから移植に入る。
4. 実測を `ARCHITECTURE.md` に、本書との差分を `CUSTOMIZATIONS.md` 冒頭に記録。

**特性化テストが緑になるまで、backend 移植（§5）に着手しない。**

---

## 1. 前提と方針（確定）

### 到達点
- **配布**: Docker イメージ。各エンジニアが手元で `docker run`（または compose）。共有サーバ常設は主経路ではない。
- **設計データの正本**: **git 管理の JSON ファイル**（例 `schema/<name>.json`）。共有・レビュー・履歴は PR / git log。
- **編集ストア**: **DB レス**。編集中状態はブラウザ内メモリ／IndexedDB。app 単一コンテナ＋mount で最軽量（既定で PG コンテナを持たない）。
- **backend**: Kotlin + Spring Boot。save/load をマウント済みファイルの I/O として実装。introspection と AI proxy を担う。
- **frontend**: 完全 TypeScript 化（Vite / strict）。描画エンジンは温存し model/IO/DDL 層を型付きで巻く（Tier 2）。UI framework 全面移行は今回スコープ外。
- **Railway**: 任意・従。同一イメージを読み取り専用ビューアとして立てられる（§2.3）。編集の正本にはしない。
  （**2026-08-30 に「任意」を外した** —— 置き場所として決まった。§2.3 の注記）
- **upstream**: 非追従。

### 保持する資産 / 捨てる負債
- 保持: 描画・リレーション接続の UX、型定義、DDL 生成、シリアライザ（ロジック核）。
- 捨てる: PHP backend、XML 永続化、`SQL.*` グローバル名前空間、共有 PG を正本とする発想、人手エクスポート。

---

## 2. 配布・トポロジ（Docker / file 正本 / git 共有）

### 2.1 基本形（各自ローカル・DB レス）
- 起動: `docker run -v <repo>/schema:/data/schema -e ANTHROPIC_API_KEY=... -p 8080:8080 grabado`（compose 可）。
- ホストのリポジトリ `schema/` を volume mount。app は**このファイルを直接読み書き**する。
- 正本はマウントされた JSON ファイル。編集 → 保存でファイルが即更新 → `git add/commit/push` → PR。
- **DB コンテナは既定で無し**。app 単一イメージ。

### 2.2 マルチステージ Dockerfile（骨格・版は着手時に最新 LTS 確認）

> **注記（2026-08-24 / 段階2-0）**: この骨格は `frontend/` / `backend/` を前提にしているが、
> **実在は `frontend/`（フロント。ただし `package.json` と `tests/` は root）と `server/`（backend）**なので読み替えが要る。
> 集約は §2 の最後（2-6）に独立段階で行う。**決定と §2 の分割は
> [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の段階2-0、契約は
> [`ARCHITECTURE.md`](ARCHITECTURE.md) §9**（HANDOVER = 入口 / CUSTOMIZATIONS = 正）。

```dockerfile
# 1) frontend (TS/Vite)
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build            # -> /web/dist

# 2) backend (Kotlin/Spring Boot)
FROM gradle:8-jdk21 AS api
WORKDIR /src
COPY backend/ ./
COPY --from=web /web/dist ./src/main/resources/static
RUN gradle bootJar --no-daemon

# 3) runtime (thin JRE)
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=api /src/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
```

### 2.3 Railway（任意・読み取り専用ビューア）

> **注記（2026-08-30 / issue #84）**: **「任意」ではなくなった。** 公開デモの置き場所は
> **Railway に決まり**（既に PRO 契約済み）、`grabado.dev` は **取得済み**であることを
> DNS で確かめた（Porkbun の NS 4 本）。**TLS は Let's Encrypt**（Railway のホストの
> 証明書を実際に見た）で、**CAA はそれに合わせて置く**。**HSTS はアプリが出す**
> （`GRABADO_HSTS=true`。`preload` は付けない）。
> **判断と実測の正は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の
> 「2026-08-30 公開デモの外側」**、契約は [`ARCHITECTURE.md`](ARCHITECTURE.md) §7.3 / §9.4
> （HANDOVER = 入口 / CUSTOMIZATIONS = 正）。**以下の 4 行は着手時の要件のまま。**
- 同一イメージを `READONLY=true` で起動し、git（main）下流の**共有ビューア**として最新スキーマを URL 閲覧に供する。
- 編集・保存・introspection の副作用は無効化。**正本は git のまま**、split-brain を作らない。
- 「Railway = ステートレス app + 外部 PG を編集主経路にする」旧案は不採用（正本二重化を招くため）。
- **`.dev` TLD は HSTS プリロード必須＝常時 HTTPS 強制**。Railway ビューアを `grabado.dev`（例 `view.grabado.dev` 等）で公開する場合は TLS 必須（Railway で証明書付与）。ローカル `http://localhost:8080` には影響しない。

### 2.4 env
- `ANTHROPIC_API_KEY`（各自注入・§11）、`READONLY`（既定 false）、mount パス等。秘密はイメージに焼かず env 注入。

---

## 3. 開発環境 / フロント現代化（Tier 2）

- ツールチェーン: `package.json` + npm scripts、Vite、Vitest、Prettier、ESLint、`tsconfig`（最終 `strict`）。ビルドはイメージ内に隠蔽。
- 段階移行（挙動保存）: Vite で既存 JS を束ねる（`allowJs`）→ `checkJs`+JSDoc → 依存の薄い順（型定義→DDL 生成→シリアライザ→描画中核）に `.ts` 化 → 全 `.ts` 後に `strict`。

---

## 4. IO — JSON 統一 ＋ git 前提の決定論出力

- 全入出力を JSON に統一（YAML 不採用）。`io/serializer.ts` に `serialize`/`deserialize` を集約。
- **git 正本のための必須要件（新規）**:
  - **決定論出力**: 同一モデルは必ず同一バイト列（キー順安定・配列順安定・2スペース整形・改行区切り）。
  - テスト: `deserialize(serialize(m))` の round-trip に加え、**「同じモデル→同じ文字列」** を検証。
  - diff フレンドリー: 1テーブル＝独立ブロックで、テーブル追加が最小差分として出る構造。
  - **外部変更検知**: ファイルが app 外で変化（＝`git pull`）した場合に検知し再読込を促す。古い編集状態でファイルを上書きしない。
- **XML は読み込み専用**の互換変換器 `deserializeXml()` として残す。**書き出しは撤去**。
- JSON ルートに `formatVersion` を付与し `docs/` に文書化。

---

## 5. backend（Kotlin / Spring Boot）— ファイル I/O 中心

> **実装済み（2026-08-23）。** 段階5-0 〜 5-9 で完了し、実体は [`../server/`](../server/)。
> **契約の正は [`ARCHITECTURE.md`](ARCHITECTURE.md) §7**（機械可読な表は
> [`../tests/contract/backend-cases.json`](../tests/contract/backend-cases.json)）で、
> 決定と根拠は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の段階5-0 以降にある。
> 以下は着手時の要件で、**到達点との差分は §7 の表**を見ること。

### 5.1 保存/読込/一覧（PG CRUD → ファイル I/O）
- `/data/schema` を正本ディレクトリとして扱う。
  - `list` → `schema/*.json` 列挙。
  - `load` → 指定ファイルの JSON を返す。
  - `save` → 決定論 JSON をファイルへ write-through（保存し忘れ・二重管理を排除）。
- **DB レス既定**。永続 PG は持たない（編集中状態はフロント側）。
- レスポンス形式は §0 実測に合わせ、フロント通信を最小変更に保つ。CSRF 除外等も実測で確認。

### 5.2 introspection（`import`）
- 既存 DB を読んでスキーマ化する機能は据え置き。`information_schema` を読む Kotlin 実装で **JSON を返す**（現行 XML から置換）。外部 DB への到達性が要る唯一の経路。
- `READONLY=true`（Railway ビューア）では無効化。

> **実装済み。対応は 4 本**（postgresql / mysql / mariadb / h2）。段階5-8b で閉じた ——
> mssql / oracle は JDBC ドライバのライセンス確認が要り、sqlite はサーバ接続の概念が無い。
> **接続先は env に列挙した名前だけ**が使える（ホスト名はクライアントから渡らないので
> SSRF が不可能）。§4.6 の 2 不具合は**再現しない**（構造的に起こらない形にしてある）。

---

## 6. 機能カスタマイズ（確定）

### 6.1 PostgreSQL 18 型パレット
追加・維持: `uuid`（既定 `uuidv7()`／露出用 `gen_random_uuid()`＝v4）、`bigint GENERATED ALWAYS AS IDENTITY`、`text`（原則。制約実在時のみ `varchar(n)`）、`timestamptz`/`date`/`time`/`interval`、`boolean`、`integer`/`smallint`/`bigint`、`numeric(p,s)`、`jsonb`、`type[]`、`bytea`、（必要時）`inet`/`cidr`、生成列。
外す・非推奨: `money`→`numeric`、`timestamp`→`timestamptz`、`char(n)`→`text`、`serial`/`bigserial`→identity、`json`→`jsonb`。
enum: 参照テーブル/CHECK 既定、native enum は例外。

### 6.2 初期テーブルテンプレート
- 既定 `id uuid PRIMARY KEY DEFAULT uuidv7()`（例外1: 外部露出=`gen_random_uuid()`／例外2: 完全内部=`bigint identity`）。
- `created_at`/`updated_at` = `timestamptz NOT NULL DEFAULT now()`。

### 6.3 SQL エクスポート規約
- snake_case、テーブル名は複数形（予約語回避／単数形化時は予約語ポリシーを台帳に明記）。
- FK `fk_<table>_<ref>`、index `idx_<table>_<cols>`、監査カラム込み。

### 6.4 その他
- 日本語ロケール微調整、初期ズーム／スナップ、ロゴ差し替え。

---

## 7. 特性化テスト（徹底改修の安全網・最初に組む）

- **DDL golden**: 既知スキーマ → 現行 SQL 出力をスナップショット固定。
- **serializer**: round-trip ＋ 決定論（同一モデル→同一文字列）。
- これらが緑であることがフロント TS 化・backend 移植・AI 機能の着手前提。

---

## 8. 自社差分の分離とドキュメント台帳

- カスタマイズは core に埋め込まず独立ファイルへ（`db/*.custom.xml`、`io/serializer.ts`、export 規約、AI モジュール等）。
- `ARCHITECTURE.md`（現行の作り＋新アーキテクチャ対応図）と `CUSTOMIZATIONS.md`（差分台帳）をフォーク直後に配置。

---

## 9. 実装順序

1. §0 現物確認 → `ARCHITECTURE.md`/`CUSTOMIZATIONS.md` 初版。
2. §7 特性化テストを緑化。
3. §3 フロント TS 化（Vite→checkJs→段階 .ts→strict）。
4. §4 IO: serializer 分離 → JSON 化 → **決定論出力＋外部変更検知** → XML 読込互換。
5. §6 機能: 型パレット → テンプレ → エクスポート規約。
6. §5 backend: ファイル I/O（list/load/save の write-through）→ introspection の JSON 化。
7. §11 AI リファクタ提案機能。
8. §2 Docker/compose/env → Railway 読み取り専用ビューア。
9. §6.4 仕上げ。

---

## 10. 確定事項

- [x] 配布=Docker、各自ローカル稼働、**DB レス既定**（app 単一コンテナ＋mount）
- [x] 設計データ正本=**git 管理の JSON ファイル**、共有=PR
- [x] 保存=ファイルへ write-through（人手エクスポート廃止）、serializer は**決定論・diff フレンドリー**、pull 上書き防止に外部変更検知
- [x] backend=Kotlin/Spring Boot（save/load=ファイル I/O、introspection=information_schema→JSON）
- [x] frontend=完全 TS（Tier 2、描画エンジン温存）
- [x] Railway=任意・`READONLY` 共有ビューア（正本にしない）
- [x] IO=JSON（XML 読込専用・書き出し撤去・`formatVersion`）
- [x] id=`uuidv7` 既定 / テーブル名複数形 / enum=参照テーブル・CHECK / 型パレット=§6.1
- [x] AI リファクタ=backend proxy・env BYOK・tool use・レビュー必須・適用は決定論パス（§11）
- [x] 特性化テストを移植の着手前提

### 根拠メモ
- PG18（2025-09）は拡張なしで `uuidv7()` 提供。時刻順で v4 の局所性劣化を回避。v7 は生成時刻が漏れるため外部露出時のみ v4。PG 方針が変われば見直す。

---

## 11. AI リファクタ提案機能

> **実装済み**（段階11-0 〜 11-5。2026-08-24）。**到達点は [`ARCHITECTURE.md`](ARCHITECTURE.md) §8**、
> 決定と根拠は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の段階11-x が持つ。
> 本節は**着手時の要件**のまま残してある（§5 と同じ形で、**HANDOVER = 入口 /
> CUSTOMIZATIONS = 正**）。実装との差分は 4 つ:
>
> - **URL は `POST /api/ai/review`**（§11.2 の `/api/refactor/suggest` から改名。11-0）
> - **構造化出力は structured outputs**（§11.3 の tool use から。手段であって目的ではない）
> - **プライバシーは素のまま送る＋送信前プレビュー**（§11.5 が「着手時に確定」としていた点。
>   匿名化すると判定基準の中心＝名前そのものが死ぬ）
> - **`patch.op` は閉じた 8 種で、`drop-table` / `drop-column` を作らない**（§11.4 の補強）

### 11.1 位置づけ
- **入力＝スキーマの JSON モデル**（§4 serializer 出力をそのまま利用）。
- **判定基準＝§6 の house 規約**（型 avoid リスト・複数形・uuidv7・監査列）をシステムプロンプトのルーブリックに落とし込み、「自社標準からの逸脱」を指摘させる。汎用リファクタ提案に留めない。

### 11.2 アーキテクチャ（backend proxy）
- フロントから直接 API を叩かせない。`POST /api/refactor/suggest` を Spring Boot に置く。
- キーはサーバ側 env（`ANTHROPIC_API_KEY`）に留まる。各自が自分のコンテナ env に注入する**実質 BYOK**（localStorage 不使用、キーはローカルに閉じる）。
- backend でタイムアウト・レート制限・**スキーマハッシュによる結果キャッシュ**（同一スキーマの再課金回避）。
- モデル文字列・structured output 仕様は env 設定＋着手時に docs（https://docs.claude.com/en/docs_site_map.md）で確認。特定モデル名を焼き込まない。

### 11.3 入出力コントラクト（構造化出力を強制）
- 自由テキストをパースしない。**tool use（function calling）で提案スキーマを強制**。
- 提案1件: `{ category: type_smell|missing_index|naming|normalization|missing_audit|missing_pk|fk_gap, severity: info|warn|error, target:{table,column?}, rationale: string(人間向け), patch: {op, ...}(機械可読・適用可能) }`。

### 11.4 適用モデル（review-first・決定論パスに合流）
- **AI 出力は自動適用しない**。提案を diff としてレビューし、ユーザーが1件ずつ承認。
- 承認された `patch` の適用は **§4 の serializer/model 変更と同じ決定論パス**を通す。LLM の非決定性は「生成」だけに閉じ込め、「適用」はテスト済みロジックに合流。
- 適用結果はファイルに書かれ **git diff に出る** → PR レビュー（AI 提案の採否も履歴に残る）。
- テスト: **LLM 呼び出しはモック**。固定提案 JSON → 適用 → モデル差分、を決定論的に検証。特性化テストの規律を崩さない。

### 11.5 プライバシー
- スキーマ（テーブル名・カラム名）が API に送られる。機微なドメインモデルを扱う場合の選択肢として、送信前の匿名化オプション／機能のオプトイン制を設計に残す。既定挙動は着手時に確定。
