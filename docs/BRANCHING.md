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

# リリースノートを出す（#150）。まず --draft で描画を見てから publish する。
# assets は付けない（配布物はレジストリにある。Release に置くのは digest 1 行 —— 同じものを
# 2 か所から配らない）。変更を列挙しない（正本は git log）。
gh release create v0.1.0 --draft --title "v0.1.0 — <到達点の名前>" --notes-file <file>
gh release edit v0.1.0 --draft=false

# マイルストーンを閉じる（#174）。人が閉じる —— 全 issue が closed でも自動では閉じない。
# 閉じる前に、残っている open issue を次の版へ動かすか外すかを決める（判断はここで 1 回だけ）。
gh api -X PATCH repos/propagandist/grabado/milestones/<N> -f state=closed
# 次の版のマイルストーンを作り、続けて issue を付ける（0 本のまま放置しない）。
gh api -X POST repos/propagandist/grabado/milestones \
  -f title='v0.2.0 — <到達点の名前>' -f description='<何が成立したら閉じるかを 1 文で>'
```

**タグを打って終わりにしない。** org `repo-surface-baseline.md` §3.7 の確かめ方は
**リポジトリの右柱**で、**タグだけでは右柱に何も出ない**。ノートの値（日本語・assets なし・
変更を列挙しない）は [`../CLAUDE.md`](../CLAUDE.md) の「作業の型」、判断は
[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の 2026-08-30「版 v0.1.0」の訂正。

**★ マイルストーンと 1 続きにする**（**2026-09-01**。#174）—— **単位が版なので、切る・閉じる・
次を作るが同じ行為**になった。**順序と規律は org `work-conventions.md` の「マイルストーンと版」節**、
**値**（単位・タイトルの形・patch 版を作らない）は [`../CLAUDE.md`](../CLAUDE.md) の「作業の型」。

**★ ノートの末尾に「次は〜」を書くときが (b) の発火点。** 申し送りと `docs/` の予約の**両方**を見て、
**結果を [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) に必ず書く —— 0 件でも書く**
（**2026-08-31 に空振りし、回されなかったことが誰にも見えなかった**）。

## hotfix

```bash
git checkout -b hotfix/0.1.1 main
# 修正
# PR: hotfix/0.1.1 -> main（マージ後 v0.1.1 タグ）
# 同内容を develop にも反映
```

### ★ 配ったイメージに CVE が出たら、patch 版を切って再 publish する

**2026-09-04**（#164。**分類が B ＋ P になった日**）。**分類 P では、配った側が再リリースしない
限り古いまま**で、**利用者の手元に残り続ける**（org `security-baseline.md` §5.3.2 の★★）。
**`develop` を直しても解決しない** —— これがライブラリ（分類 L）と最も違うところ。

| | |
|---|---|
| **契機** | Dependabot の security alert ／ ベースイメージの更新（`docker` entry）／ 同梱した依存の CVE |
| **判断者と通知の宛先** | 作業者（1 人）。**org `security-verification.md` §0 の★★が ③ 層に求める条件 3 は、この経路があって初めて満たされる** |
| **手順** | 上の「リリース」節と同じ。**patch 版のマイルストーンは作らない**（[`../CLAUDE.md`](../CLAUDE.md) の「作業の型」—— 緊急で切るので作る余地が無い。**切ってから記録する**） |

- **★ コードが 1 行も変わらないことがある** —— `Dockerfile` のベース digest だけが動く場合。
  **それでも版を上げる**（上げないと、配った座標と中身の対応が崩れる）
- **★ `main` へ流す前に、その修正が `develop` にも入っていることを確かめる** ——
  hotfix は `main` から切るので、**戻し忘れると次の版で元に戻る**

## Hard Constraints（CLAUDE.md より）

- **特性化テスト（DDL golden ＋ serializer round-trip/決定論）が緑であることがマージの前提**。緑でない変更、決定論出力を壊す変更はマージしない。
- serializer は決定論・diff フレンドリー（同一モデル→同一バイト列）。
- 全入出力は JSON（`io/serializer.ts` 経由）。XML は読込専用。

## 設計データ（schema JSON 正本）は GitFlow の対象外

- 設計データは本リポ（道具＝grabado）ではなく、**grabado を使う各プロダクトのリポジトリの `schema/*.json`** に置く。
- 設計正本は **トランクベース**（`main` を唯一の正、短命ブランチ→PR で直接取り込み）。`develop` に載せない（split-brain 回避）。
- 詳細は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログを参照。

## ローカルブランチ保護（pre-push hook）

**GitHub 側のブランチ保護は可視性で分かれる** —— Free プランの private リポでは使えず、**public では使える**。
private だった間の代わりとして、**ローカルの pre-push hook** で `main` / `develop` への直接 push を
禁止している（`.githooks/pre-push`）。**2026-08-26 に public 化した**（[#95](https://github.com/propagandist/grabado/issues/95)。
`gh repo view` が `PUBLIC` を返すことを確認）ので**保護は使えるようになった**が、
**実際に張るかは別 issue で決める** —— 可視性を変えることと、
何を強制するかは別。**張ったあとも hook は残す**（止める層が違う。hook はローカルの push、保護はサーバ側）。

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

> 注意: hook はクライアント側の運用支援であり、**サーバ側の強制ではない**。確実な強制が要るなら
> **public のブランチ保護**を張る（**Team 以上へのアップグレードは要らない**。private だった頃の
> 記述を 2026-08-26 に訂正した。決定の記録は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md)）。
