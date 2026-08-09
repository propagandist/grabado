# BRANCHING.md — grabado ブランチ運用（GitFlow）

対象は**アプリ本体 `grabado` リポジトリ**。運用手段は「素の git ＋ 命名規約 ＋ PR」。
決定の根拠は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md)。

---

## ブランチ一覧

| ブランチ | 役割 | 分岐元 | マージ先 | 直 push |
|---|---|---|---|---|
| `main` | リリース済み・本番。タグでバージョン管理 | — | — | 禁止（PR のみ） |
| `develop` | 開発の統合先。次リリースの最新 | `main` | — | 禁止（PR のみ） |
| `feature/<topic>` | 機能・修正の作業 | `develop` | `develop` | 作業者のみ |
| `release/<version>` | リリース準備（版固め・微修正） | `develop` | `main` ＋ `develop` | 作業者のみ |
| `hotfix/<version>` | 本番緊急修正 | `main` | `main` ＋ `develop` | 作業者のみ |

```
main     ●───────────────●(v0.1.0)───────────●(v0.1.1)
          \             /  \                 /
develop    ●──●──●──●──●────●──●──●─────────●
              \  /           \  /
feature        ●●             ●●        hotfix は main から分岐し main+develop へ
```

## 命名規約

- `feature/<topic>` 例: `feature/ts-serializer`, `feature/ddl-golden-tests`
- `release/<version>` 例: `release/0.1.0`（SemVer）
- `hotfix/<version>` 例: `hotfix/0.1.1`
- topic は kebab-case・英小文字。課題番号があれば `feature/123-ts-serializer`。

## 基本フロー（例：機能開発）

```bash
git checkout develop
git pull
git checkout -b feature/ts-serializer
# ... 実装 ...
git push -u origin feature/ts-serializer
# GitHub で develop 向けの PR を作成 → レビュー → squash merge
```

## リリース

```bash
git checkout -b release/0.1.0 develop
# 版番号更新・最終微修正のみ（新機能は入れない）
# PR: release/0.1.0 -> main
# main マージ後にタグ
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
# release を develop にも戻す（PR or マージ）
```

## hotfix

```bash
git checkout -b hotfix/0.1.1 main
# 修正
# PR: hotfix/0.1.1 -> main（マージ後 v0.1.1 タグ）
# 同内容を develop にも反映
```

## Hard Constraints（CLAUDE.md より）

- **特性化テスト（DDL golden ＋ serializer round-trip/決定論）が緑であることがマージの前提**。緑でない変更、決定論出力を壊す変更はマージしない。
- serializer は決定論・diff フレンドリー（同一モデル→同一バイト列）。
- 全入出力は JSON（`io/serializer.ts` 経由）。XML は読込専用。

## 設計データ（schema JSON 正本）は GitFlow の対象外

- 設計データは本リポ（道具＝grabado）ではなく、**grabado を使う各プロダクトのリポジトリの `schema/*.json`** に置く。
- 設計正本は **トランクベース**（`main` を唯一の正、短命ブランチ→PR で直接取り込み）。`develop` に載せない（split-brain 回避）。
- 詳細は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログを参照。

## ローカルブランチ保護（pre-push hook）

GitHub 側のブランチ保護は現行プラン（private リポ）で使えないため、**ローカルの pre-push hook** で `main` / `develop` への直接 push を禁止する（`.githooks/pre-push`）。

### 有効化（clone 後に各自1回だけ）

```bash
# macOS / Linux / Git Bash
sh scripts/setup-hooks.sh
```

```powershell
# Windows PowerShell
pwsh scripts/setup-hooks.ps1
```

いずれも実体は `git config core.hooksPath .githooks` の1コマンド。設定後、`main` / `develop` へローカルから push しようとすると拒否される。

### 挙動

- `feature/*` など保護対象外ブランチの push は通常どおり通る。
- `main` / `develop` への push・削除は拒否。統合は必ず GitHub 上の PR マージで行う（hook はローカル push のみ対象なので PR マージには影響しない）。
- 緊急でどうしても直 push が必要な場合のみ、一時解除: `PUSH_ALLOW_PROTECTED=1 git push ...`

> 注意: hook はクライアント側の運用支援であり、サーバー側の強制ではない。確実な強制が必要なら GitHub Team 以上へのアップグレードでブランチ保護を有効化する（[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) 参照）。
