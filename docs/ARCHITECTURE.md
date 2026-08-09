# ARCHITECTURE.md — grabado 現行構成と移行対応

`ondras/wwwsqldesigner` 由来の現行構成の把握と、house 新アーキテクチャ（[`HANDOVER.md`](HANDOVER.md)）への対応図。
HANDOVER §0 の**現物確認が完了するまで、backend の契約（パス・action 名・レスポンス）は未検証**である点に注意。

> ステータス: 初版（雛形）。§0「現物確認」の実測で順次埋める。

---

## 1. 現行（wwwsqldesigner）ディレクトリ構成（取り込み時点）

```
index.html                アプリ本体（SPA エントリ）
js/                        描画エンジン・UI・型定義（保持＝Tier 2 で TS 化）
styles/                    スタイル（保持）
locale/                    多言語（日本語ロケール微調整の対象）
images/                    画像・ロゴ（差し替え対象）
db/                        型定義・DB プロファイル（*.xml。型パレット差分の対象）
backend/                   各種 backend 実装（下記）。PHP は廃止予定
  php-postgresql/          PostgreSQL 版（§0 現物確認の主対象）
  php-file/ php-mysql/ ...  その他多数（参照のみ）
  php-s3/amazon-s3-php/    submodule（未初期化。PHP 撤去時に削除）
config.xml.sample         設定テンプレ（実 config.xml は .gitignore 対象）
license.txt               BSD License（保持必須）
Dockerfile                upstream の Dockerfile（house 版で置換予定）
```

## 2. 移行対応図（現行 → house）

| 層 | 現行 | house 到達点（HANDOVER） | Tier |
|---|---|---|---|
| frontend | 素の JS（`js/`）＋グローバル `SQL.*` | 完全 TS 化（Vite/strict）。描画エンジンは温存 | Tier 2 |
| IO | XML 永続化（読み書き） | JSON 統一・決定論出力。XML は読込専用に | — |
| backend | PHP（`backend/php-*`） | Kotlin/Spring Boot（file I/O ＋ introspection＋AI proxy） | — |
| 永続化 | 共有 PG / ファイル 各種 | git 管理 JSON ファイル正本（DB レス既定） | — |
| 型パレット | `db/*.xml` | PostgreSQL 18 型パレット（§6.1） | — |
| 配布 | 共有サーバ＋外部 PG | マルチステージ Docker・各自ローカル | — |

## 3. 現物確認 TODO（HANDOVER §0・未実施）

- [ ] `backend/php-postgresql`（または該当）を `php -S localhost:8000` で起動
- [ ] DevTools で **save / load / list / remove / connect(introspection)** の実通信をキャプチャ
  - [ ] action 名・パラメータ・body・Content-Type・レスポンス本文
  - [ ] introspection のレスポンス構造（XML）
- [ ] 実測を本書 §4 に追記、HANDOVER との差分を [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) に記録
- [ ] 特性化テスト（DDL golden ＋ serializer round-trip/決定論）を先に緑化

## 4. backend 契約（実測）

> 未計測。§3 完了後に、フロント無改修で移植するための実契約をここに記載する。

## 5. フロント構成の把握（実測）

> 未整理。`js/` のモジュール依存（型定義 → DDL 生成 → シリアライザ → 描画中核）を段階 TS 化の順に沿って整理する。
