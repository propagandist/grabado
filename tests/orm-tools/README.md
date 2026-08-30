# ORM 出力を実物の道具に通す（issue #120）

`tests/golden/orm/` の 42 本を、**実物の JPA / Prisma / Drizzle が受け付けるか**確かめる。

```bash
npm run test:orm-tools             # 3 本とも
npm run test:orm-tools -- drizzle  # 1 本だけ
```

**要 Docker ＋ ネットワーク。** 道具は使い捨てコンテナに都度入れる —— `devDependencies` を
増やさないため。**`npm test` にも CI にも入らない**（手元で回す層）。

## なぜ要るのか

**golden が固定するのはバイト列だけ**で、そのバイト列を道具が受け付けるかは別の話である。
DDL 側では実物に流して初めて 6-8a の `DEFAULT (UUID())` と known-issue #15 が出た。
ORM では **2026-08-28 まで 1 度も確かめていなかった** —— そして確かめたら、
**Drizzle の 13 本中 8 本が落ちた**（存在しない `bytea` / `blob` を import し、
実在しない `mssql-core` を指し、自己参照 FK が型検査を通らなかった）。

## 何を確かめていて、何を確かめていないか

| 道具 | 確かめること |
|---|---|
| JPA | Kotlin コンパイラが受け付けるか（`jakarta.persistence` を classpath に置く） |
| Prisma | `prisma validate` が受け付けるか |
| Drizzle | `drizzle-orm` の型定義に照らして `tsc --strict` が通るか |

**確かめないこと** —— `drizzle-kit generate` / `prisma migrate diff` は走らせない
（設定ファイルと接続情報が要り、使い捨てで完結しなくなる）。

**★ 構文と型しか見ないので、「情報が落ちている」は 1 つも捕まらない。**
複合 PK が欠けていても型検査は通る（issue #123 がその実例）。
**ここが緑でも「出力が十分」の証明にはならない。**

## 「通す一覧」の作り方

**母集団はディレクトリ走査で作る。一覧を書かない**（`tests/support/fixtures.ts` の
`DB_PROFILES` が `frontend/db/` の実体を正とするのと同じ理由）。`cases.ts` が持つのは
**道具の表**と**除外の表**だけで、除外には `reason` が型として必須。

除外は 2 種類しかない:

| 種類 | 決め方 |
|---|---|
| **出力が 0 バイト**（`empty` は 3 本とも該当） | **走査で自動判定。書かない** ——「空なら道具に渡すものが無い」は規則であって一覧ではない |
| **その組み合わせに対応する形式が存在しない** | `EXCLUSIONS` に手で書く。`reason` 必須 |

**★ 2026-08-28 時点で `EXCLUSIONS` は 0 件。空であることに意味がある。**

一覧が腐っていないかは `tests/node/orm-tools.test.ts` が `npm test` で見る
（Docker を 1 秒も使わない）。

## 落ちたときの切り分け

```
道具が落ちた
├─ ① 名前が解決できない
│    （TS2305 has no exported member / TS2307 Cannot find module /
│     kotlinc unresolved reference）
│     → **grabado が存在しない名前を出している = 欠陥。**
│       「その組み合わせが無い」ではない。**除外理由にしてはいけない**
│
├─ ② 型が合わない・循環する（TS7022 / TS7024）
│     → 道具に標準の書き方があるか調べる。あれば **grabado の欠陥**
│       （例: 自己参照 FK は `.references((): AnyPgColumn => ...)`）
│
├─ ③ 道具の意味論的な要求を満たしていない
│    （Prisma の P1012「unique criteria が無い」など）
│     → 判定基準は **その道具自身が同じ入力に何を出すか**。
│       道具が持っている逃げ道（Prisma なら `@@ignore`）には grabado も乗る → 欠陥
│       逃げ道が道具側に無い（形式が表せない）→ 除外
│
└─ ④ 対応する core / provider が無い
      → **これは落ちる理由にならない。**
        h2 / mssql / oracle / sql-standard の Drizzle 出力は pg-core の形で出しており、
        **pg-core の TypeScript としては妥当であるべき**。Prisma の provider 無し 3 本も
        検証時に datasource を足せば通る。落ちたなら ① か ② に戻る
```

**要点は、「対応する core が無いから」を除外の理由に使わせないこと。**
実測では ④ に当たるものは 1 件も無く、落ちた 9 本は全部 ①〜③ だった。

### 直すと決めたら

**golden を手で書き換えない。** 採取経路は 1 つだけ:

```
frontend/js/io/orm/*.ts を直す
  → npm test が赤くなる（それが正しい）
  → 実ブラウザで npm run golden:update   ← 唯一の採取経路
  → git diff tests/golden/ を 1 件ずつ読む
  → npm test / npm run test:browser / npm run typecheck が緑
  → npm run test:orm-tools を再度回す
  → CUSTOMIZATIONS.md に記録する
```

### 直さないと決めたら

- **その組み合わせが存在しない** → `cases.ts` の `EXCLUSIONS` に理由つきで足す。
  **`tests/known-issues/` には入れない** —— あそこは「**直すべき不具合**」の置き場所で、
  「存在しないもの」を混ぜると「直る予定」の列が書けなくなる
- **直すべきだが今は直さない** → `tests/known-issues/` に登録する。
  ただし **`npm run known-issues` は Playwright ＝ブラウザ層**なので
  「prisma がこう言った」はアサートできない。書けるのは `toOrm()` の**出力リテラル**だけで、
  **道具のエラーは spec のコメントに引用する**

## 設計の判断

- **`server/` の Gradle を使わない**（JPA）—— golden が `./gradlew build` の入力になると
  **`ci-server.yml` がそれを回す**＝「CI に載せない」に自動的に違反する。加えて `TypeSample` が
  8 ファイルで重複し、`dependencyLocking` が配布物のビルド入力を動かす
- **repo に golden 用の `tsconfig.json` を置かない** —— 置いた瞬間 `npm run typecheck` が
  `drizzle-orm` への依存を要求する。`tsconfig.json` の `exclude: ["tests/golden/**"]`
  （「golden は成果物であってソースではない」）を崩さない。
  **検証用の設定はコンテナ内の CLI フラグとしてしか存在しない**
- **イメージはタグ止め、道具の版はピン止め、digest は毎回印字** —— `Dockerfile` が digest ピン
  なのは**配布物を作るから**で、このコンテナは何も生み出さない。再現に要る情報はログに残る
- **1 本目が落ちても止めない** ——「残り 2 本が分からない」状態を作らない
