# TESTING.md — 特性化テスト（HANDOVER §7）

移植の安全網。CLAUDE.md の Hard Constraint 1「特性化テストが緑であることが移植の前提」の実体。

現行 wwwsqldesigner が **実際に吐いているバイト列** を固定し、HANDOVER §9 の移植
（フロント TS 化 → IO の JSON 化 → 型パレット → backend）で意図しない挙動変化が起きたら赤くする。

---

## 走らせ方

```bash
npm ci
npx playwright install chromium     # 初回のみ

npm test              # Node 側（jsdom）。速い。日常はこれ
npm run test:browser  # 実ブラウザ側（Chromium）。golden の権威
npm run test:all      # 両方
npm run known-issues  # 既知の不具合の再現確認（上記いずれにも含まれない）
npm run test:dist     # build 成果物（dist/）のスモーク。上記いずれにも含まれない
npm run typecheck     # js/ src/ tests/ と *.config.ts（strict / noUncheckedIndexedAccess）
npm run migrate:design -- <ファイル>  # 設計 JSON の移行（§4 段階4-2b の形式 ＋ §6 段階6-3 の型 id）
```

実 HTTP の E2E（段階5-9）。**要 JDK 25。** ブラウザ（実 XHR）→ Vite dev proxy → Kotlin →
ファイルシステムを通しで動かす、唯一の系統。

```bash
npm run test:server   # server/ の jar を作ってから Playwright を回す
```

配布イメージの E2E（段階2-4）。**要 Docker。** compose がイメージを build して起こし、
ブラウザ（実 XHR）→ 単一プロセス（Spring Boot）→ bind mount したホストのファイル、を通しで動かす。
**手元の jar には static が入らない**ので（dist を入れるのは Dockerfile の COPY）、
「単一プロセスが static と API の両方を配る」を確かめられるのはここだけ。

```bash
npm run test:image    # 通常モードで一巡 → READONLY で起こし直して一巡 → down まで
```

**3.0 分**（フロントか backend を変えた場合）／ **35 秒**（変えていない場合。ビルドがキャッシュに
当たる。2026-08-26 実測）。

**CI では [`ci-image.yml`](../.github/workflows/ci-image.yml) が回す**（段階2-5。paths は
`.dockerignore` の許可リストが正本）。**ジョブ 131〜147 秒**（2 run の幅） —— うち**イメージの build が 78 秒**
（**まっさらな runner なので `--no-cache` 相当**）、起動 6 秒、13 本 11 秒、Chromium の取得 24〜39 秒。
**ぶれているのは Chromium の取得だけ**で、build とテストは 2 run とも動かない。
**手元より速い**のは、Docker Desktop for Windows を通していないから。分担と 3 層の割り当ては
[`ARCHITECTURE.md`](ARCHITECTURE.md) §9.6、判断規約は org の `ci-strategy.md`。

backend（`server/`。段階5-1b で入った Kotlin / Spring Boot）は Gradle 側にある。**要 JDK 25。**

```bash
cd server && ./gradlew test    # Node/Playwright とは独立に回る
cd server && ./gradlew build   # test ＋ bootJar
```

**introspection の統合テストは opt-in**（段階5-7a）。`GRABADO_IT_JDBC_URL` が無ければ
丸ごと skip する ——「たまたま走らなかった」ではなく「意図して走らせていない」ことが
テスト結果に出る。

```bash
# PostgreSQL 18
docker run -d --name grabado-pg -e POSTGRES_PASSWORD=grabado \
  -e POSTGRES_DB=grabado_survey -p 55432:5432 postgres:18
docker exec -i grabado-pg psql -U postgres -d grabado_survey \
  < docs/samples/introspection-sample-schema.sql

# MySQL 8.4（段階5-8a）。★ --default-character-set=utf8mb4 を忘れると
#   コメントが化けて DB に入る（実際に踏んだ）
docker run -d --name grabado-mysql -e MYSQL_ROOT_PASSWORD=grabado \
  -e MYSQL_DATABASE=grabado_survey -p 33066:3306 mysql:8.4
docker exec -i grabado-mysql mysql -uroot -pgrabado --default-character-set=utf8mb4 \
  grabado_survey < docs/samples/introspection-sample-schema-mysql.sql

cd server && \
  GRABADO_IT_JDBC_URL=jdbc:postgresql://127.0.0.1:55432/grabado_survey \
  GRABADO_IT_USER=postgres GRABADO_IT_PASSWORD=grabado \
  GRABADO_IT_MYSQL_URL=jdbc:mysql://127.0.0.1:33066/grabado_survey \
  GRABADO_IT_MYSQL_USER=root GRABADO_IT_MYSQL_PASSWORD=grabado \
  ./gradlew test

# フィクスチャを採り直す（実 DB の出力が正）
... GRABADO_IT_WRITE_FIXTURE=1 ./gradlew test --tests '*CatalogIntegrationTest*'
```

**ORM 出力を実物の道具に通す**（issue #120）。**要 Docker ＋ ネットワーク** ——
使い捨てコンテナに `kotlinc` / `prisma` / `drizzle-orm` を都度入れる（`devDependencies` は
増やさない）。**`npm test` にも CI にも入らない。**

```bash
npm run test:orm-tools             # 3 本とも
npm run test:orm-tools -- drizzle  # 1 本だけ
```

**確かめるのは構文と型だけ** —— JPA は Kotlin コンパイラ、Prisma は `prisma validate`、
Drizzle は `drizzle-orm` の型定義に照らした `tsc --strict`。**`drizzle-kit generate` /
`prisma migrate diff` は走らせない**（設定と接続情報が要り、使い捨てで完結しなくなる）。

**★ 型検査が緑でも「出力が十分」の証明にはならない** —— 複合 PK が欠けていても型は通る
（issue #123）。運用と落ちたときの切り分けは `tests/orm-tools/README.md`。

**なぜ 2 層なのか** —— 純粋なフィクスチャだけで写像を試すと速くて依存も 0 だが、
**フィクスチャは「PG18 はこう返すはずだ」という信念を符号化したもの**でしかない。
信念が間違っていればテストは緑のまま本番が壊れる（`ARCHITECTURE.md` §4.6 の 2 不具合が
まさにその形で 10 年以上残っていた）。**採り直し以外の方法でフィクスチャが生まれない**
ようにしてあるので、この経路が閉じる。

| テスト | 走る条件 | 見るもの |
|---|---|---|
| `IntrospectionMapperTest` / `MySqlMapperTest` | **常に**（CI 込み） | フィクスチャ → 応答モデルの写し方 |
| `PostgresCatalogIntegrationTest` | `GRABADO_IT_JDBC_URL` があるとき | **フィクスチャが実 DB と一致するか** ＋ SQL そのもの |
| `MySqlCatalogIntegrationTest` | `GRABADO_IT_MYSQL_URL` があるとき | 同上（MySQL / MariaDB） |

`npm test` 系と `./gradlew test` は**互いに依存しない**。フロントのテストは仮想 backend
（[`../tests/node/harness.ts`](../tests/node/harness.ts)）を使うので、Kotlin を起動しない。
CI もワークフローを分けてある（`.github/workflows/ci-frontend.yml` / `ci-server.yml` /
`ci-image.yml` の 3 本。**`paths` で絞りたい単位が、そのままワークフローの単位になる**。段階2-5）。

`npm run test:browser` と `npm run known-issues` は **Vite dev server** を Playwright が勝手に起動する
（[`../vite.config.ts`](../vite.config.ts)、127.0.0.1:4173）。手で立てる必要はない。
**root は `frontend/`**（段階2-6 で集約）。**URL 空間は 1 バイトも変わっていない**ので、
`index.html` / `db/` / `locale/` / `styles/` の URL は
§3 段階1 以前の静的サーバ時代と同じ。

### `npm test` はラッパー経由（Windows の vitest バグ回避）

`npm test` は `vitest run` を直接呼ばず [`../scripts/vitest.mjs`](../scripts/vitest.mjs) を経由する。
**Windows で cwd のドライブレターが小文字（`d:\…`）だと vitest ランタイムが二重ロードされ、
テストが 1 件も走らないまま落ちる**ため（vitest 側の未修正バグ）。ラッパーは cwd を
`fs.realpathSync.native` と一致する形に正規化してから vitest を起動するだけで、
**Windows 以外では何もしない**（Docker / Linux は無関係）。

**この症状の見分け方** — テストが 0 件で、トップレベルの `describe(...)` の行にこれが出る:

```
TypeError: Cannot read properties of undefined (reading 'config')
 ❯ tests/node/ddl.test.ts:23:1
 Test Files  2 failed (2)
      Tests  no tests
```

`npx vitest` や IDE の vitest 拡張から直接起動すると**ラッパーを通らない**。その場合は
[`../vitest.config.ts`](../vitest.config.ts) のガードが原因を説明して止めるので、`npm test` を使うこと。

再現・検証したいときは cwd の case を強制する（`cd` は case を正規化してしまうので使えない）:

```bash
# 危険側（ラッパー無し）。対策前はこれで必ず落ちた
node -e "process.chdir('d:/projects/grabado'); require('child_process').spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run'],{stdio:'inherit'})"

# 対策後（ラッパー経由）。同じ cwd で通る
node -e "process.chdir('d:/projects/grabado'); require('child_process').spawnSync(process.execPath,['scripts/vitest.mjs','run'],{stdio:'inherit'})"
```

原因・却下した対策・**撤去条件**は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログ。
撤去忘れを防ぐため [`workarounds.test.ts`](../tests/node/workarounds.test.ts) が vitest の
バージョンを固定していて、**vitest を上げると必ず 1 回赤くなる**（parity 例外と同じイディオム）。

---

## なぜ 2 系統あるのか

モデル層が描画 DOM と密結合で、DOM 無しでは動かない（[ARCHITECTURE.md](ARCHITECTURE.md) §5）。

**段階6-5a まではもう 1 つ理由があった** —— DDL 生成の実体が `db/<db>/output.xsl`（XSLT 1.0）を
ブラウザの `XSLTProcessor` で適用したもので、Node に `XSLTProcessor` が無かった。
生成が TS になった（[`../frontend/js/io/ddl/`](../frontend/js/io/ddl/)）ので、いま 2 系統を分ける理由は DOM だけ。

そこで役割を分けた。

| | 実ブラウザ（`tests/browser/`） | Node（`tests/node/`） |
|---|---|---|
| 実行系 | Playwright + Chromium。本物の `DOMParser` / 描画 DOM | vitest + jsdom。アプリは vite が束ねた IIFE を jsdom で eval |
| golden | **生成・確定する（唯一の正）** | 読むだけ。**絶対に書かない** |
| 速さ | 数秒 | 速い |
| カバー範囲 | 全 5 DB プロファイル | **全 5 DB プロファイル**（段階6-5a まで `oracle` だけが parity 例外だった。下記） |

現行コードは**抽出せずそのまま動かす**。ロジックを先に抜き出すと「抜き出した後のコード」を
特性化することになり、安全網の意味が消えるため。抽出は HANDOVER §4 の仕事。

### Node 側がアプリを起こす経路（§3 段階3-0 で変更・3-4b で入口を差し替え）

[`../tests/node/harness.ts`](../tests/node/harness.ts) は **[`../tests/node/app-entry.ts`](../tests/node/app-entry.ts)
を vite の build API（`write: false`）で単一 IIFE に束ね、それを jsdom の `window.eval` に 1 回渡す**。
段階1・2 の間は `js/*.js` を 1 本ずつ eval していたが、その経路は `js/` が `.ts` になった時点で
動かなくなる（本書がかつて「段階3 の分岐点」として予告していた箇所）。バンドルを噛ませると
**`js/` が `.js` でも `.ts` でも、参照がグローバルでも ESM でも同じハーネスで動く**ので、
段階3 の残り（`.ts` 化と import 導入）でここを触り直さずに済む。

副次的に、読み込み順の定義が `src/app.ts` の 1 か所になった（従来はハーネス側にも
`SCRIPT_ORDER` として二重に書かれていた）。ハーネスがバンドルするのが `src/main.ts` ではないのは、
**js/ を全部評価 → `OZ.Request` を fs 読みに差し替え → `new Designer()`** という順序を現行のまま
保つため（起動を含むエントリを束ねるとこの順序が作れない）。

**エントリが `src/app.ts` から [`../tests/node/app-entry.ts`](../tests/node/app-entry.ts) に替わったのは
段階3-4b。** `import "../../src/app.ts"` に続けて `window.__grabado = { OZ, Designer }` を載せるだけの
薄いファイルで、読み込み順の定義は `src/app.ts` の 1 か所のまま。差し替えの理由は、
**バンドルの内側に Node 側から手を届かせる経路をテストが自分で持つため** — 段階3-4a までは
出荷コードが置いていた `window.OZ` / `window.SQL` を踏んでいたが、その撤去が段階3-4 の目的そのもの。
ハーネス側は `window.OZ.Request = …` が `api.OZ.Request = …` に、
`window.eval("new SQL.Designer();")` ＋ `window.SQL.designer` が `new api.Designer()` の戻り値に
なった（差し替える関数の中身は 1 文字も変えていない）。

**page 文脈（`test:browser` / `test:dist` / `known-issues`）は別経路**。`page.evaluate` は
バンドルの外で走るので `import` に置き換えられず、`window` 越しのハンドルが要る。段階3-4b で
`window.SQL.designer` から **[`../frontend/src/main.ts`](../frontend/src/main.ts) が置く `window.d`** に寄せた
（upstream 由来のデバッグハンドルを、そのままテスト API として使う）。型パレットの差し替えも
**段階4-0b で `window.DATATYPES` から `window.d.palette.setRoot()` になった**ので、page 側が触る
出荷コードの面は `d` だけになっている（node 側は `designer.palette`。実体は
[`../frontend/js/io/palette.ts`](../frontend/js/io/palette.ts)）。

**この狙いは段階3-1 で実証された**。`js/oz.js` / `config.js` / `globals.js` が `.ts` になり
`export` を持ったが、[`../tests/node/harness.ts`](../tests/node/harness.ts) の変更は
`OzRequestCallback` / `OzRequestOptions` を `import type` で受ける 1 行だけで済んだ
（型の置き場所が `types/globals.d.ts`（段階3-3b で削除済み）から `js/oz.ts` へ移ったため）。
バンドル経路そのものは 1 行も触っていない。
**段階3-2 では描画中核 7 本が `.ts` になり `extends` が値 import に変わったが、ハーネスは
1 行も変えていない**（`SqlDesigner` が `types/globals.d.ts` から `js/globals.ts` へ移った分は
`interface Window` の 1 行が `import(...)` を挟む形になっただけ）。その `SqlDesigner` は
**段階4-1c で撤去**され、[`../tests/support/state.ts`](../tests/support/state.ts) は
`js/wwwsqldesigner.ts` の `Designer` を直接 `import type` する（node / page 両実行系とも
採取関数の面は変わっていない）。

判断の根拠・却下した 2 案は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログ。

### strict / sloppy の差（縮んだが、消えてはいない）

`window.eval` に渡すコードには `"use strict";` を前置してある（段階3-0）。ESM で配る
`test:browser` / `test:dist` が常に strict なのに Node 側だけ sloppy、という乖離を縮めるため。

**ただし暗黙グローバルは依然として `npm test` では捕まらない。** jsdom の `Window` は vm の
contextified global（Proxy）で、strict でも未宣言の名前への代入が成立してしまう。実測では
前置ありのとき関数内の `this` は `undefined`、frozen への代入は `TypeError`、`delete` 変数は
`SyntaxError`（＝コードは確かに strict）だが、暗黙グローバル代入だけが素通りして `window` に載る。
Node の素の indirect eval と `vm.runInContext` では同じコードが `ReferenceError` になるので、
これは jsdom 固有の制約。

したがって **`npm test` だけで済ませない**（段階2 が直した `js/io.js` の `req` /
`js/oz.js` の `y` のような問題は `npm run test:browser` だけが赤くする）。

**ただしこの穴は `.ts` 化が進むほど縮む。** `.ts` になったファイルは `npm run typecheck` の
対象なので、暗黙グローバルは実行前に `TS2304 Cannot find name` で落ちる。段階3-2 の時点で
`js/` 18 本のうち 10 本（`oz` / `config` / `globals` ＋ 描画中核 7 本）がこちら側に移り、
残るは末尾 8 本（段階3-3）。

**それでも `.ts` 化そのものが張れない層がある。** golden はモデル API（`toXML` / `fromXML`）を
直接叩くので、マウス／キーボード操作の経路（ドラッグ、row の展開・折りたたみ、ラバーバンド、
ミニマップ）は誰も張っていない。段階3-1・3-2 はここを **`npm run dev` と `npm run preview` の
両方で一巡し pageerror 0 件**を確認することで補っている（項目と結果は
[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログ）。回帰かどうかの切り分けは
`develop` 上で同じ操作を流して突き合わせる。

---

## 何を固定しているか

### DDL golden — `tests/golden/ddl/<db>/<fixture>.sql`

7 fixture × 8 DB = **56 本**（§6 段階6-7a〜6-7c で `sql-standard` / `h2` / `mariadb` が
入り、**対応 DB 8 本がそろった**）。**段階6-8a 〜 6-8d で既存 4 本（`mysql` / `mssql` /
`oracle` / `sqlite`）が現代化され、56 本すべてが「その DB の DDL」になった** ——
それまでの非 PG の golden は upstream の XSLT を逐語移植した粗さを含んでいた。
[js/io.ts](../frontend/js/io.ts) の `clientsql()` と同じ経路（`Designer.toDdl()` → `.trim()`）で採る。
UI の `#textarea` に入る値と一致する。
入力は**そのプロファイルの fixture**（`tests/fixtures/<db>/`。§6 段階6-6a）。

**§6 段階6-5a で `tests/golden/ddl-input/` の 7 本が消えた。** あれは `Designer.toXML()` の
出力＝`db/<db>/output.xsl` への入力で、DDL 生成が「モデル → 中間 XML → XSLT → 文字列」の
3 段だったことの副産物だった。XSLT が TS 生成器になって中間表現ごと不要になり、
**grabado から XML の書き出しが 1 つ残らず消えている**（読み込みは互換で残る）。

### ORM golden — `tests/golden/orm/<target>/<db>/<fixture>.<ext>`（§6 段階6-9d で新設）

**ターゲット 1 本につき 14 本**（6-9e で Prisma、**6-9f で Drizzle** が入って 42 本）。DDL のように 8 × 7 = 56 本にはしていない。** ORM 出力は「型の写像」と
「構造の組み立て」に分かれ、**構造の側はプロファイルに依らない**（生成器が見るのは
正規型 `kind` と関係とキーだけで、SQL 型名も識別子の引用も通らない）:

```
型の写像   8 プロファイル × types-matrix   そのプロファイルの全型が 1 列ずつ入っている
構造       postgresql × 残り 6 本           複合 PK・自己参照 FK・identity・日本語識別子
```

母集団の定義は [`../tests/support/fixtures.ts`](../tests/support/fixtures.ts) の
`ormGoldenCases`、拡張子は [`../frontend/js/io/orm/generate.ts`](../frontend/js/io/orm/generate.ts) の
`ORM_EXTENSIONS`。ORM が 4 本になっても 56 本で、DDL の 56 本と同じ桁に収まる。

**`db/` にディレクトリを作っていない**のが要点 —— 作った瞬間 `DB_PROFILES` に入り、
ORM が型パレットの契約（`strict` / `<template>` / `newrowtype` / 全型網羅）を背負うことになる。
ORM は下敷きの db プロファイルの上に乗る**別の軸**で、
**同じ設計から DDL と ORM の両方が出せる**（それを見るテストが `tests/browser/orm.spec.ts` に 1 本ある）。

**★ golden が固定するのはバイト列だけで、そのバイト列を道具が受け付けるかは別の層が見る**
（issue #120）。**2026-08-28 まで 1 度も確かめていなかった** —— 確かめたら Drizzle の 13 本中
8 本が落ちた（存在しない `bytea` / `blob` を import し、実在しない `mssql-core` を指していた）。
走らせ方は上の「走らせ方」、運用は [`../tests/orm-tools/README.md`](../tests/orm-tools/README.md)。

### プロファイル変換 golden — `tests/golden/convert/<from>-<to>/<fixture>.sql`（§6 段階6-10a で新設）

**14 本。** postgresql の設計 × 他 7 プロファイル向けの出力 × 2 fixture で、
8 × 8 × 7 = 448 本にはしていない —— 変換は「設計側の型 → 正規型（`kind`）→ 出力側の型」の
1 段なので、**出発点を 1 つに固定すれば写像の全体は types-matrix が覆う**（postgresql の
全 24 型が 1 列ずつ）。もう 1 本の house-defaults は「**house 既定が各 DB で何を失うか**」を
見るためのもので、生成物の先頭コメントにそれがそのまま出る。

母集団の定義は [`../tests/support/fixtures.ts`](../tests/support/fixtures.ts) の
`convertGoldenCases`。採るのは [`../tests/browser/convert.spec.ts`](../tests/browser/convert.spec.ts)。

**既存の DDL golden 56 本が 1 バイトも動かないこと**が本段階の完了判定で、根拠は
[`../frontend/js/io/convert.ts`](../frontend/js/io/convert.ts) の `convertDesign` が**同じ db を恒等で返す**こと
（寄せ先の選び方を素直に通すと「同じ kind の先頭型」に寄って別の型になりうる）。

### 状態スナップショット golden — `tests/golden/state/<fixture>.json`

**§4 段階4-1b で追加。読み込み方向（`fromXML`）の安全網。** 上の 2 つは `toXML()` の**結果**しか
押さえておらず、`fromXML` は「XML を再生する UI 操作列」なので、XML に出ない状態が丸ごと
素通りしていた —— 選択クラス・型パレット由来の色・z-index・relation がどの**実体**に繋がったか・
`clearTables()` の後始末。8 本（fixture 7 × postgresql ＋ `house-defaults` × **`h2`**）。
**最後の 1 本の寄せ先は 6-8d で `h2` に落ち着いた。** 6-8c までは「未現代化のプロファイル」が
条件で（strict なパレットは未知の型を例外にするため）、mysql → oracle → sqlite と現代化の
たびに動いていた。8 本すべてが strict になって動かす先が尽き、**house 既定の 8 型が全部 `aka` で
解決する唯一の非 PG プロファイル**である `h2` へ移した（`state/h2-house-defaults.json`）。
主張も「別パレットで読むと潰れる」から**「strict どうしなら潰れずに移る」**に変わっている。

- 採取関数は [`../tests/support/state.ts`](../tests/support/state.ts) の 1 本だけ。**module スコープを
  参照しない自己完結関数**にしてあり、page 側はテンプレートリテラルで関数を展開して
  `(<関数のソース>)(window.d)` という式を `page.evaluate` に渡す＝**ソース文字列として注入**する
  （`page.evaluate` はバンドル外なので import を解決できない）。
  Node 側は jsdom の designer をそのまま渡す。
- **relation は名前ではなく添字**（`designer.tables.indexOf` / `table.rows.indexOf`）で採る。
  同名テーブルで両端が先頭のテーブルへ解決される既知の不具合は、名前で採ると
  「名前は合っているが実体が違う」状態が素通りする。
- **レイアウト由来の値は採らない**（`offsetWidth` 系・relation path の `d`・mini のサイズ・
  `designer.width/height`）。jsdom はレイアウトしないので、除外して初めて **1 本の golden を
  Chromium と jsdom で共有**できる。relation の色も除外する（`Relation._counter` が
  ページ生涯で単調増加する static なので、同じ設計でもテストの実行順で変わる）。

### 設計 JSON golden — `tests/golden/json/<fixture>.json`

**§4 段階4-2 で追加、4-2b で型キーを安定 `id` に移した。**`Designer.toJson()` の出力 7 本
（postgresql）。上の 3 つと違い、**現行実装の実出力ではなく grabado が決めた新しい正本フォーマット**
（`formatVersion: 2`。仕様は [`FORMAT.md`](FORMAT.md)）なので、golden だけでは
「その形が設計を過不足なく運べるか」を何も言っていない。それを言うのが次の 1 本。

- **情報保存**: 同じ fixture を **XML 経由**（`toXML` → `fromXML`）と **JSON 経由**
  （`toJson` → `fromJson`）で往復させ、`tests/support/state.ts` の状態スナップショットが
  バイト一致すること。7 fixture すべてで緑。どちらも「2 回目の読み込み」に揃えてあるので
  履歴依存（z-index 等）は相殺される。**差が出たらそれがそのまま「JSON が落とした情報」の一覧**になる。
- **形式**: 2 スペース・末尾 LF 1 つ・キー順が [`../frontend/js/io/json-format.ts`](../frontend/js/io/json-format.ts) の
  宣言順であること。`JSON.stringify(JSON.parse(actual), null, 2)` に戻して完全一致することで、
  2 スペース以外の加工が 1 つも入っていないことを見ている。
- **diff フレンドリー**: テーブルを 1 つ足した設計を読み書きすると、既存部分が 1 バイトも動かず
  末尾にブロックが 1 つ増えるだけであること（CLAUDE.md 制約3 の実地確認）。
- **壊れた入力**: `formatVersion` 違い・未知の型 `id`・必須キー欠落・構文エラーで例外になり、
  かつ**今開いている設計が消えない**こと。あわせて 4-2b で 2 つ足した ——
  **`formatVersion: 1` は黙って読まず移行コマンドを名指しする**ことと、
  **`db` が実行中のパレットと違えば拒む**こと（後者は label 時代に postgresql と mysql が
  共有していた 12 型の無言誤解決を塞ぐ）。

**型 `id` の規則そのもの**は [`../tests/node/palette-id.test.ts`](../tests/node/palette-id.test.ts) が
全プロファイルについて見る（正規表現への適合・パレット内の一意性・`fk` の参照先が実在すること・
`sql` と `aka` が重複しないこと・`x_` が付いている entry が 0 件であること）。
**移行ツール**の規則は [`../tests/node/migrate-design.test.ts`](../tests/node/migrate-design.test.ts)
（形式 v1 → v2 と、段階6-3 の型 `id` 移行表の両方）。
ツールが serializer と同じバイト列を書くことは、`tests/golden/json/` の 7 本が
**ツールで移行したもの**であることをもって golden テストが毎回確認している ——
6-3 では `types-matrix.json` にツールを当てた結果が、`golden:update` で採り直した
serializer の出力と 1 バイトも違わなかった（**読み込み側と移行ツールの `size` の扱いが
一致していることの機械的な証明**でもある）。

### 型解決 — golden より手前で押さえる 2 本（§6 段階6-2 / 6-3）

型パレットを引く経路（`<datatype>` の名前 → 添字、`fk` → 子行の型）は golden に間接的にしか
現れない。6-2 が照合規則を触ったので、**規則そのものを直接見るテスト**を 2 本置いた。

| ファイル | 担当 |
|---|---|
| [`../tests/node/type-resolution.test.ts`](../tests/node/type-resolution.test.ts) | [`../frontend/js/io/palette.ts`](../frontend/js/io/palette.ts) と [`../frontend/js/io/xml-parser.ts`](../frontend/js/io/xml-parser.ts) を直に叩く（ハーネス不要。どちらも実行時 import 0 本なので `conflict.test.ts` と同じ立場）。**8 プロファイル × 全候補名を掃き、解決先が必ずその名前を `sql` か `aka` に持つ型であることを見る全数テスト**が主役（6-8d まで「旧規則の参照実装との差分テスト」だったものを、比較相手がコードから消えたので裏返した）。ほかに `aka` 照合（旧型名 → 新型の表をリテラルで固定）・`length` の契約・`fkIndexFor`・パレット差し替え後の追随・**撤去した legacy 規則の再発防止 3 本**（人工パレット） |
| [`../tests/browser/types.spec.ts`](../tests/browser/types.spec.ts) | 実ブラウザ側。`BIGINT` の解決（known-issue #3 の移設先）・**`UUID` の解決と strict の例外**（#4 の移設先。6-3）・XML 往復の安定・**FK 自動生成**（`rowManager` の対話経路。6-2 まで自動テストが 1 本も通っていなかった面）・パレット差し替え後の FK 生成・**型セレクタの中身**（`Row.buildTypeSelect`。パレットを読む唯一の UI 面で golden に 1 ビットも写らない。6-3） |

### 初期テーブルテンプレート — golden に 1 ビットも写らない面（§6 段階6-4）

golden はすべて fixture を読み込んでから `toXML()` / `toJson()` で採るので、**「テーブル追加
ボタンを押したときに何ができるか」はどのファイルにも現れない**。6-4 が §6.2 の house 既定を
そこに入れたので、受け皿を 2 本置いた。

| ファイル | 担当 |
|---|---|
| [`../tests/node/template.test.ts`](../tests/node/template.test.ts) | [`../frontend/js/io/template.ts`](../frontend/js/io/template.ts) を直に叩く（ハーネス不要。実行時 import 0 本）。**8 本すべてが `<template>` と `newrowtype` を持つこと**・`postgresql` / `sql-standard` / `sqlite` の 3 列がその DB で house 既定をどう表すか・`<template>` を持たないパレット（旧 XML 同梱）が空を返すこと・`applyTemplate` が PRIMARY を先に作る順序・型 id が引けなければ例外 |
| [`../tests/browser/template.spec.ts`](../tests/browser/template.spec.ts) | 実ブラウザ側。**UI から新規テーブルを作る経路**（`TableManager.click()` の入口を `window.d` 越しに叩く）。3 列と PK ができること・その DDL が `DEFAULT uuidv7()` で出ること・`Add row` の既定型が `text` になること・**`sqlite` の 3 列**（PK が既定値を持てない側の例） |
| [`../tests/node/identifier.test.ts`](../tests/node/identifier.test.ts) | [`../frontend/js/io/ddl/naming.ts`](../frontend/js/io/ddl/naming.ts) の識別子検査を直に叩く（ハーネス不要。段階6-9b）。**どの名前が・どのプロファイルで・なぜ使えないか**の 3 つ組。8 本の上限と単位の表（実測と一次資料の別つき）・**囲めば通るものは 1 件も警告しない**こと・known-issue #15 が直っていないこと |
| [`../tests/browser/identifier.spec.ts`](../tests/browser/identifier.spec.ts) | 実ブラウザ側（段階6-9b）。**警告が画面に届いているか** —— 波線（`class="invalid"`）と理由の tooltip、テーブル名ではコメントと重ねること、**警告が出ても名前はモデルに入る**（止めない）こと |
| [`../tests/node/orm.test.ts`](../tests/node/orm.test.ts) | ORM 出力（段階6-9d / 6-9e）。golden 14 本を読むほか、**golden から読み取れない規則**を近くで押さえる —— テーブル名 → クラス名（**単数化は英語の規則だけ。倒せない語はそのまま**）・Kotlin 識別子の 3 段（そのまま / バッククォート / `_` 置換）・8 プロファイルの全型が型注釈を持つこと・**JPA は逆参照を出さない**こと・**Prisma は出す**こと（形式が要求するため。自己参照の名前付き relation と、ASCII だけの識別子の一意化を含む） |
| [`../tests/node/type-mapping.test.ts`](../tests/node/type-mapping.test.ts) | [`TYPE-MAPPING.md`](TYPE-MAPPING.md) の表を実装の出力と 1 セルずつ突き合わせる（段階6-10b）。**手で書いた表は必ず腐る**ので、パレットを触れば docs が赤くなる形にしてある |
| [`../tests/node/convert.test.ts`](../tests/node/convert.test.ts) | プロファイル変換（段階6-10a）。**golden から読めない規則**を押さえる —— 同じ db なら恒等（既存 golden が動かない根拠）・逆向きの劣化（`timestamp -> date`）を 1 つも持たないこと・Oracle の `DATE` の罠（名前が同じでも値の域が違えば寄せない）・8 プロファイルへの全型変換で着地点がすべて説明できること |
| [`../tests/browser/convert.spec.ts`](../tests/browser/convert.spec.ts) | プロファイル変換 golden の権威（段階6-10a）。14 本 ＋ 決定論 ＋ **設計が 1 バイトも変わらないこと**（出力時変換のみというスコープの実体）＋ 引数なしの `toDdl()` が従来と同一であること。**段階6-10b で UI 経路が加わった** —— 出力先 select の中身・SQL ボタンのラベル（`(postgresql -> mysql)`）・ORM が同じ select に従うこと（golden はここを 1 ビットも押さえない） |
| [`../tests/browser/orm.spec.ts`](../tests/browser/orm.spec.ts) | ORM golden の権威（段階6-9d）。14 本 ＋ 決定論 ＋ 知らないターゲットが例外になること ＋ **同じ設計から DDL と ORM の両方が出る**こと（「ORM を db プロファイルにしない」判断の実体） |

**段階6-5b で 3 本目を足した。** [`../tests/browser/keys.spec.ts`](../tests/browser/keys.spec.ts) は
キー管理 UI から `CREATE INDEX` に届く経路（`KeyManager.add()` → avail から列を選んで `←`）。
`INDEX` / `FULLTEXT` を持つ fixture が 1 本も無いので **56 本の golden に `CREATE INDEX` は
1 行も出ない** —— 名前の規約そのものは [`../tests/node/ddl.test.ts`](../tests/node/ddl.test.ts) が
押さえ、ここは「人がそこへ辿り着けるか」だけを見る。

**マウス操作そのものを張るテストは 6-5b でも 0 本のまま。** `#area` の実クリックではなく
同じ入口を叩いている（座標だけを持つ event で足りる）。上の「`.ts` 化そのものが張れない層」の
穴は塞いでいない —— 塞いだのは「テンプレートが何を作るか」であって、ドラッグや選択の経路ではない。

なお `<default>` を型の `quote` で囲むかどうかの規則（6-4 が strict 側で式判定にした箇所）は
[`../tests/node/ddl.test.ts`](../tests/node/ddl.test.ts) が入力値と出力の表で固定している
（**段階6-5a まで `serialize.test.ts` が `<default>` 要素の中身として見ていた**。XML の書き出しが
消えたので観測面を生成 DDL に移した）。fixture を足していないのは、`DDL_FIXTURES` に入れると
golden がプロファイル数ぶん増えるため。

差分テストの主張は段階ごとに引き継いできた。6-2 は「旧規則と違うのは `postgresql/BIGINT` の
1 件だけ」を完了判定にし、6-3 でその原因（`x_real`）ごと撤去された後は「未現代化の N
プロファイルは 6-2 以前と 1 件も違わない」という形になっていた。**6-8d で未現代化が 0 本になり、
比較相手（`indexOfTypeNameLegacy`）もコードから消えたので役目を終えた。**

**機構は捨てていない** —— 候補名の全数掃きはそのまま残し、「8 プロファイル × 全候補名で、
解決先は必ずその名前を `sql` か `aka` に持つ型である」という不変条件テストに裏返してある。
known-issue #10（`re` の後勝ち）も #4（先頭型フォールバック）も、再発すればこの形を破る。

### AI patch の適用 — golden を 1 本も持たない純関数（§11 段階11-1）

**返るのはバイト列ではなくモデル**なので、golden の出番が無い（同じ性質の
`convert.test.ts` / `introspect-parser.test.ts` も素の vitest アサーション）。むしろ
**golden を足さないこと自体が 11-1 の完了判定**だった —— 「既存 114 本が 1 バイトも動かない」が
そのまま「フロントに 1 行も配線していない」の証明になる。

| ファイル | 担当 |
|---|---|
| [`../tests/node/apply-patch.test.ts`](../tests/node/apply-patch.test.ts) | [`../frontend/js/io/ai/apply-patch.ts`](../frontend/js/io/ai/apply-patch.ts) を直に叩く（ハーネス不要。実行時 import 0 本）。**8 op の意味論**（rename の追随先 3 つ・`hasSize` に従う `size` の始末・キー名を空で入れること・FK は `relations` に入ること）・**18 の落ち方が例外ではなく理由になること**（全ケースでモデルが同一参照）・`applyPatches` が配列順の畳み込みで途中の失敗に中断しないこと・**固定の提案 JSON を丸ごと通した結果**が serializer と DDL 生成にそのまま乗ること |

入力は 3 つ —— `tests/fixtures/postgresql/relations.xml`（**rename の巻き込みすぎと取りこぼしが
両方出る**唯一の fixture。自己参照 FK・複数 FK・多対多）、テスト内で組む小さな設計
（`VARCHAR(255)` の 1 列・**FK がまだ張られていない** 2 テーブル。どちらも fixture に無い形）、
そして [`../tests/fixtures/ai/review-response.json`](../tests/fixtures/ai/review-response.json)。

最後の 1 つは **11-2 のモック LLM 応答を兼ねる**ので、形は `docs/ARCHITECTURE.md` §8.3 の提案
そのものにしてある（8 op すべてと、**`patch` を持たない提案** 1 件を含む）。`tests/fixtures/`
直下は `db/` のプロファイルと 1 対 1 であることを `fixture-set.test.ts` が機械的に見ているので、
`ai` は `NON_PROFILE_FIXTURE_DIRS`（`tests/support/fixtures.ts`）に宣言して外している ——
introspection の入力（5-6）と同じ扱いで、**除外を暗黙にしない**。

### AI レビューの配線 — golden を持たない（§11 段階11-3）

**golden はここを 1 ビットも押さえない**（`toDdl` / `toJson` / `state` はこの経路を通らない）。
`js/io.ts` に AI が入った段階の完了判定は「**golden 114 本が無差分**」＋下の 2 本。

| ファイル | 担当 |
|---|---|
| [`../tests/node/ai-request.test.ts`](../tests/node/ai-request.test.ts) | 送る形（`js/io/ai/request.ts`）と見せ方（`notice.ts`）の純関数。**座標・`formatVersion`・`db` を送らない**こと・型が SQL 名に解決されること・**空のものを送らない**こと・**同じモデルから同じバイト列**が出ること（結果キャッシュの鍵が安定する条件）・提案が重い順に並ぶこと |
| [`../tests/node/io-ui.test.ts`](../tests/node/io-ui.test.ts)（AI の describe） | UI 経路。押すと**送る JSON がそのまま textarea に出る**こと・**断ったら 1 バイトも送らない**こと・**送った body が見せたものと一致する**こと・提案が一覧になること・**429 に文言が出る**こと・`capabilities.ai` で押せる押せないが切り替わること |

仮想 backend（`tests/node/harness.ts`）は `setAiReview(body, status)` で応答を差し込む。
**既定は 403** —— キーもモデル名も無いデプロイが既定の姿。`/api/ai/review` は `?action=` の形を
取らないので、**パスの先頭が `api/` なら backend 側**として振り分ける。

**段階11-4 で適用 UI が加わった。** 見るのは 4 つ —— 番号の選択が純関数であること
（`all` / `1,3,5` / 範囲外 / 重複）、**適用後に設計が実際に変わる**こと、**保存が 1 度も飛ばない**
こと、落ちた提案の理由が **locale の語**で出ること（`js/io/` は locale を通せないので、
`applyNotice` は翻訳関数を引数に取る —— テストは恒等関数を渡せる）。

### 配布イメージ — golden を 1 本も持たない（§2 段階2-4 / 2-5）

**見ているのは「配る形」**なので golden の出番が無い。段階の完了判定は
「**golden 114 本が無差分**」＋下の 2 本。

| ファイル | 担当 |
|---|---|
| [`../tests/image/smoke.spec.ts`](../tests/image/smoke.spec.ts) | 通常モード。**単一プロセスが classpath の static を配る**こと・Rollup グラフ外の資産・**セキュリティヘッダ 5 本 × 4 経路**・**`Cache-Control` の経路別**・条件付き GET の 304・**bind mount への write-through**・**CSP 違反 0 件のまま主要操作が一巡**すること |
| [`../tests/image/readonly.spec.ts`](../tests/image/readonly.spec.ts) | 公開デモと同じ条件。**READONLY でも healthy**・save / import が 403・list / load は 200（ホストが置いたファイルが読める）・**画面のボタンが押せない** |

コンテナの起こし方は [`../tests/image/compose.ts`](../tests/image/compose.ts)（`--wait` で healthy を待つ。
**落ちたときだけコンテナのログを出す** —— `--wait` は「healthy にならなかった」としか言わないので、
無いと**起動時の例外が 1 行も見えない**。段階2-5）。
**mount 先は `tests/tmp-image-schema/`** —— 正本ディレクトリ `schema/` にテストを書かせないため、
[`../compose.e2e.yaml`](../compose.e2e.yaml) が volumes の 1 行だけを上書きする。
**Linux では [`../tests/image/global-setup.ts`](../tests/image/global-setup.ts) が mount 先を
誰でも書けるようにする** —— **これはテストを通すための細工で、利用者の条件とは違う**
（配布物の側の問題は [#103](https://github.com/propagandist/grabado/issues/103)。**直ったら消す**）。

★ **この系統が最初に見つけたのは、保存のたびに出ていた CSP 違反**（`js/io.ts` の `sendSave` が
応答を `xml: true` で受けており、`responseXML` を読むと Chrome が空の応答に HTML パーサを当てる。
2026-08-26）。**`vite preview` には backend が無く、`curl` では CSP が見えない**ので、
**既存のどの系統からも見えない位置**にあった。

★ **2 つ目は、Linux ホストでは起動すらしないこと**（2026-08-26。**CI に載せた初回の run**）。
コンテナは**非 root**（uid 100）で走り、**bind mount の所有権はホスト側のものがそのまま見える**
—— `FileDesignStore` の起動時 fail-fast が `正本ディレクトリに書けない: /data/schema` で止めた
（段階5-3 の設計が正しく働いた形）。**Docker Desktop for Windows は所有権を偽装する**ので、
**手元では 2-1 から 2-4 まで一度も踏まなかった** —— 申し送りに 3 段階連続で
「Linux ホストは未実測」と書かれていたものが、**CI に載せたその日に出た**。

### UI の保存/読込経路 — golden を持たない 2 本（§4 段階4-3b）

**golden はここを 1 ビットも押さえない。** golden 50 本（`ddl` 35 ＋ `json` 7 ＋ `state` 8）は
すべて Designer のファサード（`toDdl` / `toJson` / `fromXML` / `fromJson`）経由で採るので
[`../frontend/js/io.ts`](../frontend/js/io.ts) を通らず、**「UI が JSON に切り替わったこと」は golden 不変と
両立してしまう**。だから 4-3b の完了判定は「golden 無差分」＋この 2 本の 2 本立てになっていた。

| ファイル | 担当 |
|---|---|
| [`../tests/node/io-ui.test.ts`](../tests/node/io-ui.test.ts) | **server 経路の契約** —— URL（`keyword` の `.json`）・`Content-type`・body が serializer の出力とバイト一致・`load` が応答をテキストで受ける・`import` は XML のまま。**段階4-6 から外部変更検知**（save の前に load・衝突時に confirm・断れば save を投げない）も。ハーネスが `OZ.Request`（全通信の唯一の入口）の差し替え先で記録する |
| [`../tests/browser/io-ui.spec.ts`](../tests/browser/io-ui.spec.ts) | **jsdom では見られないもの** —— download の `suggestedFilename`・localStorage・DDL 生成（UI ボタンからの実経路 1 本）・ボタンが DOM に実在すること |

両方が押さえるのは「読み込みが JSON と XML の**両方**を受ける」ことと、「読めない入力で
今開いている設計が壊れない」こと。特に**壊れた JSON を XML として読み直さない**（フォールバックが
無い）ことを明示的に見ている —— あると例外が `Null document` に着地して位置情報が消える
（[`../frontend/js/io/detect.ts`](../frontend/js/io/detect.ts)）。判別関数そのものは
[`../tests/node/detect.test.ts`](../tests/node/detect.test.ts) が fixture と golden の実バイト列で見る。

ボタンを押すのは `page.evaluate` の中（[`../tests/browser/harness.ts`](../tests/browser/harness.ts) の
`clickIo`）。io の container はコンストラクタで DOM から外れているので `page.locator` では拾えず、
かつ `alert` / `prompt` を**その呼び出しの間だけ**差し替えられる（`openDesigner` が張る
dialog ハンドラと衝突しない）。

### ライブツリーを壊す操作 — golden の経路に出てこない層（#216）

golden は fixture を**読んで書き出す**だけなので、**行やキーを壊す操作**（`destroy` /
`removeRow`）は 1 ビットも通らない。

| ファイル | 担当 |
|---|---|
| [`../tests/node/live-tree.test.ts`](../tests/node/live-tree.test.ts) | **複数のキーに属する行を消すと、どのキーからも消えること**（#216）・消えた列が保存バイト列に出ないこと・`Table` ごと / `clearTables()` 経由でも残骸が出ないこと ＋ **キーと行の双方向リンクの不変条件**。**FK の伝播がサイクルで止まること**（#212 / #231）と、**非循環では伝播の回数が変わらないこと** ＋ **相互 FK が UI の経路で作れること** |

**★ 不変条件をコードではなくテストで担保している。** `Row.destroy` の
`while (this.keys.length)` が止まる根拠は「`Key.removeRow` が必ず縮める」ことだが、
`Key.removeRow` は `indexOf` で早期 return するので**無条件には成り立たない**。成り立つのは

> `k ∈ row.keys` ⟺ `row ∈ k.rows`

が保たれているとき。実行時ガードを足さないイディオム C
（[`../frontend/js/row.ts`](../frontend/js/row.ts) の KDoc）に従い、**この不変条件を見張る
テストを置くことで担保する**。`Key.destroy` が作る**逆向きの**非対称（`key.rows` に残るが
`row.keys` からは消える）もリテラルで固定してある —— こちらは行側から見えないので
無限ループの原因にならない。

**★★ サイクル検出は「訪問済み集合」ではなく「経路上の集合」**（#212 / #231）。
再帰の前に足し、**後で外す**。大域の visited にすると**非循環でも訪問回数が減る** ——
ダイヤモンド（A→B、A→C、B→C）で合流点は **2 回**更新されるのが現行の挙動で、visited だと
1 回になる。経路上の集合なら DAG で枝刈りが 1 つも起きないので、**値だけでなく `redraw()` の
回数まで不変**（#207 / #210 が数えているのがそれ）。

**この主張は「修正前から緑になるテスト」で示している** —— ダイヤモンドの 2 回・3 段チェーンの
`size` の到達・非循環リネームの 3 本は、修正の前後どちらでも通る。**それが「挙動を変えて
いない」の実体**で、赤くなるのはサイクルの 4 本だけ。

**★ 相互 FK の作成は塞がない**（#212 の判断）。SQL として正当な設計で、`rowClick` が弾くのは
`r1 == r2` だけ。**この issue の前は目視でしか確かめられなかった**ものを、`rowManager` の
`connecting` を立てて `rowClick` を直接叩くテストに落としてある。

**★ `Table.destroy()` を直に呼ばない。** `Designer.tables` から外れないので、次の読み込みの
`clearTables()` が**二重に壊す**（`dom.mini.parentNode` が `null` で TypeError）。
テストは `Designer.removeTable()` を通す。

**★ golden は実走で確かめた** —— `npm run golden:update` を回して
`git diff --stat tests/golden/` が **0 files changed**（2026-09-09）。この変更だけは
`clearTables()` 経由で **golden の全読み込みを通る**ので、比較テストの緑だけで済ませない。

### リレーション解決 — 索引化しても解決先が変わらないこと（#208）

**golden は「どの実体に繋がったか」を写さない。** 同名が絡む壊れ方は正常系の fixture に
出てこないので、`applyRelations` を線形走査から索引へ変えるときの安全網が無かった。

| ファイル | 担当 |
|---|---|
| [`../tests/node/relation-resolve.test.ts`](../tests/node/relation-resolve.test.ts) | **先勝ち**の 3 通り（同名の行は先頭へ ／ 同名テーブルでは子側の端まで先頭へ寄る ／ 引き直した先に行が無ければ黙って捨てる）・**`addRelation` の呼び出し順が入力順のまま**・**relation の復元が `findNamedTable` を 1 度も引かない**（索引化の効果） |

**★ `applyDesignModel` を直に import している。** [`../frontend/js/io/apply.ts`](../frontend/js/io/apply.ts)
は実行時 import が 0 本（型だけ）なので Node 側からそのまま呼べる
（[`../tests/node/apply-patch.test.ts`](../tests/node/apply-patch.test.ts) と同じ立場）。

**これは近道ではなく、必要な経路** —— **同名テーブルは #232 / #233 の関門が XML / JSON の
読み込みで拒む**ので、`applyRelations` まで届くのは**関門を通らない 2 つの呼び手**だけ
（AI パッチの適用と introspection の取り込み。`js/io.ts:1060` / `:1194`）。

**★ 行名の重複は関門が見ていない**（`js/io/validate.ts` が見るのはテーブル名の重複と
キーが指す列の不在の 2 つ）。**XML の読み込みで実際に到達する**ので、そちらは fixture 相当の
XML をテスト内で組んで踏ませている。

**★ 効果は回数で見る**（実時間ではない）。`relations` fixture（relation 5 本・`<part>` 5 個）で
**`findNamedTable` 10 → 0** ／ **`findNamedRow` 15 → 5**（残るのは `applyKey` の分。
2026-09-10 実測）。プロトタイプは**生きている実体から辿る** ——
[`../tests/support/probe.ts`](../tests/support/probe.ts) と同じ形で、アプリに計装用の面を足さない。

### リスナー登録簿 — アプリから観測できる面が 1 つも無い層（#209）

`OZ.Event._byID` / `_byName`（[`../frontend/js/oz.ts`](../frontend/js/oz.ts)）は `Map` ではなく
**素のオブジェクト**なので、削除されない限り**デタッチ済みの要素と bind クロージャを永久に
保持する** —— GC も効かない。**golden にも state スナップショットにも 1 ビットも出ない。**

| ファイル | 担当 |
|---|---|
| [`../tests/node/listeners.test.ts`](../tests/node/listeners.test.ts) | **読み込みを 2 回しても登録が増えない**こと・`clearTables()` で読み込み前の水準へ戻ること・**行の開閉を繰り返しても増えない**こと（`buildEdit` が張る 3 本）・**開いたまま破棄しても残らない**こと（`collapse()` を通らない経路）＋ **`clearTables()` の `Table.redraw` 回数が列数に依存しない**こと |

**★ 数えるのは登録の件数だけ。** どの要素に何が張られているかは見ない —— それは
「今の実装がこう張っている」であって、守りたい不変条件ではない。守るのは
「**同じ操作を繰り返しても増えない**」の 1 つ。

**★ `0` と `0` を比べない。** 「`clearTables()` で戻る」の前に「**読み込みで実際に増えている**」
ことを見る 1 行を置いてある。片方が壊れて両方 0 になっても緑になる形を避ける。

**★ ハーネスに `oz` を開けた**（[`../tests/node/harness.ts`](../tests/node/harness.ts)）。
`designer` を開けたときと同じ判断で、ハーネスは前から `__grabado.OZ` を掴んでいた
（`OZ.Request` の差し替えに使っている）。

**★ 修正前の数**（2026-09-10 実測。4 テーブル × 6 列 ＝ N=4 / C=6）:

| | 修正前 | 修正後 |
|---|---|---|
| 読み込み 1 → 2 → 3 回目の登録件数 | 125 → 173 → 221（**毎回 +48 ＝ 2NC**） | 125 → 125 → 125 |
| `clearTables()` 後（空は 57） | **201**（144 件が残る） | **57** |
| 行の開閉 5 回 | **+15**（**毎回 +3**） | **0** |
| `clearTables()` の `Table.redraw` | C=4 で **25** / C=16 で **85** | どちらも **5** |

### 規模の費用 — 2 系統に分かれる 4 本目の層（#206）

**10 / 50 / 100 / 300 テーブルの合成設計を通し、費用を数で記録する。**
実時間ではなく**回数**で判定するのは、共有ランナーが不安定で計装自体が実時間を歪めるから。

| ファイル | 実行系 | 担当 |
|---|---|---|
| [`../tests/node/scale.test.ts`](../tests/node/scale.test.ts) | jsdom（**CI に乗る**） | 10 / 50 / 100 の 3 点で**カウンタが 1 次式に乗ること**。合成設計が決定論で正準形であること。`clearTables()` で DOM が戻ること |
| [`../tests/scale/load.spec.ts`](../tests/scale/load.spec.ts) | 実ブラウザ | 4 段の読み込み ＋ **`LayoutCount` と読み出し回数の比** |
| [`../tests/scale/export.spec.ts`](../tests/scale/export.spec.ts) | 実ブラウザ | `toJson()` / `toDdl()` の費用とバイト数 |
| [`../tests/scale/interaction.spec.ts`](../tests/scale/interaction.spec.ts) | 実ブラウザ | 読み込んだ後の**1 操作**あたりの費用 |

**★★ 3 点で見る。2 点は必ず直線に乗る**ので、線形性の証明にならない。加えて
**式とは独立に次数を見る 1 本**を置いてある（N が 10 倍で費用がおよそ 10 倍。二次なら 100 倍）
—— 式が全部合っていても「式を実測に合わせて書き換えただけ」かもしれないため。

**★★ 実ブラウザ側は `npm run test:browser` に入れない。** `ci-frontend.yml` がそれを回すので、
**300 テーブルの実測が全 PR に載る**（`golden:update` も同じ project 指定なので、golden の
再生成にも巻き込まれる）。`npm run test:scale` で別に回す。

**★ 計装の正本は 1 本。** [`../tests/support/probe.ts`](../tests/support/probe.ts) を、
Node は直接呼び、page 側は**ソース文字列として注入**する（`state.ts` と同じ形）。
**アプリのコードは 1 行も触らない** —— 出荷コードが変わらず、バンドルの diff にも出ない。

**★ jsdom で数えられないもの**: `LayoutCount`（jsdom はレイアウトしない）／ `alignTables()`
（折り返しが `offsetWidth` に依存する）／ 実時間。**この分担は上の「なぜ 2 系統あるのか」と
同じ形**で、新しい規律を作っていない。

**★ 生成物はコミットしない。** `SCALE_DUMP=1` のときだけ `test-results/`（gitignore 済み）へ
落ちる。既定で 1 バイトも書かない —— CI の最終ステップが `git diff --exit-code` を回す。

**数の正本は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md)**（測った日と機械つき）、
費用モデルは [`ARCHITECTURE.md`](ARCHITECTURE.md) §5.7、運用は
[`../tests/scale/README.md`](../tests/scale/README.md)。

### 開いて使うサンプル — 母集団が表ではなくディレクトリ（#237）

[`../docs/samples/`](../docs/samples/) に置いた**人が開く設計**が、現行のパーサで読めて
**正準形である**ことを見る。

| ファイル | 担当 |
|---|---|
| [`../tests/node/samples.test.ts`](../tests/node/samples.test.ts) | `docs/samples/*.json` を `readdirSync` で全部拾い、`db` が実在プロファイルであること・CRLF が混ざっていないこと・**読み込んで書き戻すと 1 バイトも変わらないこと** |

**★ assert は実質 1 つ（往復でバイト一致）で、それが 4 つを同時に押さえる:**

| 押さえること | 落ちる契機 |
|---|---|
| 現行のパーサで読める | `formatVersion` ／ `db` 照合 ／ 未知の型 id |
| **正準形である** | キー順 ／ 既定値と同じキーが出ている ／ 2 スペース ／ 末尾 LF ／ 展開形 |
| 同名テーブルが無い | `json-serializer.ts` の `assertUniqueTableNames` が throw |
| size の正規化に乗る | `length="0"` の型に `size` を書いている |

**★★ 母集団は表ではなくディレクトリの実体。** [`../tests/node/fixture-set.test.ts`](../tests/node/fixture-set.test.ts)
が表を持つのは **8 × 7 の格子が固定**だからで、`docs/samples/` は**可変長のリスト** ——
表を持たせると保守だけが乗って利得が無い。**サンプルを足しても、テストに書き足すことは何も無い。**

**★ 赤くなる契機はパレットから型を撤去したとき。** 対処は
`npm run migrate:design -- docs/samples/*.json` で、これは**既にリポジトリ内の設計ファイルに
要る作業**（[`../frontend/js/io/json-parser.ts`](../frontend/js/io/json-parser.ts) の KDoc）。
**コストではなく、移行漏れを見る場所が 1 つ増える利得。**

**★ 再現用サンプル（`repro-*.json`）が今も再現するかは追わない。** それは
[`../tests/known-issues/`](../tests/known-issues/) の軸で、ここから追うと**不具合を直した日に
docs のテストが赤くなる**。`repro-*` が持つのは**人が実ブラウザで確かめる手順**で、
機械側は `tests/node/live-tree.test.ts` と `tests/node/rename.test.ts` が持っている。

**★ `.gitattributes` に `docs/samples/*.json text eol=lf` が要る。** 無いと
`core.autocrlf=true` の環境で CRLF になり、末尾 LF の比較が落ちる ——
`tests/fixtures/**` を LF 固定しているのと同じ理由。

### リネームの伝播 — 置換の両側がユーザー入力だった（#213）

`Row.setTitle` / `Table.setTitle` は、名前を変えたときに**追随する側の名前**を書き換える。
その置換が **旧名を正規表現へ、新名を置換文字列へ、どちらも生のまま**渡していた。

| ファイル | 担当 |
|---|---|
| [`../tests/node/rename.test.ts`](../tests/node/rename.test.ts) | **3 通りの壊れ方**（下表）＋ 置換文字列の展開 ＋ **これまでどおり追随すること**。規則の実体は [`../frontend/js/rename.ts`](../frontend/js/rename.ts) |

**★ 壊れ方は 3 通りある**（2026-09-09 実測）。#213 のタイトルは crash だけを挙げているが、
**本文が例に挙げている `Products (old)` は落ちない**:

| 入力 | 修正前 |
|---|---|
| `a(b` / `a[b` / `*x` / `+x` / `?x` / `a)b` / `a{2,1}` | **SyntaxError** |
| **`Products (old)`** / `price+tax` | valid だが**自分自身に当たらず、黙って追随しない**（`(old)` がキャプチャグループになる） |
| `user.name` | `.` が任意 1 文字に当たり**誤置換** |
| 新名に `$&` `` $` `` `$'` `$$` | 置換文字列として**展開され、一致テキストが注入される** |

**★ 読み込み経路ではこのループが 1 度も走らない** ——
[`../frontend/js/io/apply.ts`](../frontend/js/io/apply.ts) が relation を張る前に `setTitle` を
呼ぶので、`relations` が空でループが 0 回になる。**だから golden は 1 バイトも動かず、
この経路を見ているテストは #213 まで 1 本も無かった。**

**★ `Table.setTitle` が書き換えるのは「自テーブルの行」**（子テーブルの行ではない）。
内側ループは `row.relations` を辿るが、置換の対象はループ変数ではなく `row` 自身 ——
**そのテーブルの行のうち、参照される側になっているもの**が対象になる。
FK の既定命名パターン `%R_%T` が親テーブル名を含むので、house 既定に沿った設計でそのまま出る形。

**★ ハーネスに `designer` を公開した**（[`../tests/node/harness.ts`](../tests/node/harness.ts)）。
`createHarness` は前から掴んでいて、公開していたのが `io` だけだった。**ライブツリーの
オブジェクトグラフを直接叩くテスト**を積むので口を開けてある（#216 / #212 も同じ口を使う）。

### 座標系 — jsdom が 0 しか返さない層（#214）

**ここは jsdom では成立しない。** `Designer.minSize` は `#area` の `offsetWidth` /
`offsetHeight` から採られる（[`../frontend/js/wwwsqldesigner.ts`](../frontend/js/wwwsqldesigner.ts)）が、
jsdom はレイアウトしないので両方 0 になる。[`../tests/support/state.ts`](../tests/support/state.ts) も
同じ理由で**レイアウト由来の値を golden から全部除外している**（`table.width/height`、
`dom.mini` の位置と大きさ、**relation path の `d` 属性**、`designer.width/height`）。

結果、**この層を見ているテストは #214 まで 1 本も無かった。**

| ファイル | 担当 |
|---|---|
| [`../tests/browser/canvas.spec.ts`](../tests/browser/canvas.spec.ts) | `minSize` が `#area` の実寸と一致すること・**幅と高さの下限が独立していること**（#214 の再現）・テーブルがあれば下限を超えること・**ミニマップの port が縦横で別々に追随すること**・`<svg>` の寸法属性が `designer` と一致すること ＋ **幾何の棚**（下記。#236） |

**★ CSS の値を焼かない。** `#area` は現在 3000x3000 の正方形（`styles/base.css` の
`--area-size`）で、**正方形であるあいだ `minSize[0]` と `minSize[1]` は区別できない**。
3000 をハードコードすると、縦横比を変えた日に**通ったまま意味を失う**。

**★ #214 で 2 つ目が出た**（2026-09-09 実測）。`minSize` を読む行は `applyStyle()` より前に
あり、**テーマ CSS（`[data-theme^="material-"] #area`）が当たる前の `#area`** を測っていた
—— 実測 `[1264, 0]`。高さに `minSize[0]` を読んでいたバグが、**`minSize[1]` が 0 であることを
隠していた**。測り直しは `init2()`（`applyStyle()` の後）に置いてある。

### 幾何の棚 — 性能 PR が「値を変えていない」と言うための器（#236）

**発端は、器が無いことそのもの。** 上のとおり state golden はレイアウト由来の値を 1 つも
採らないので、**コネクタのジオメトリとミニマップの写像を壊しても緑のまま通る**。
性能の作業（#207 / #208 / #209 / #210）は**まさにその層**を触るため、
「出力を 1 ビットも変えていない」という主張を裏づける手段が無かった。

採取は [`../tests/support/geometry.ts`](../tests/support/geometry.ts)（`captureCanvasGeometry`）。
`state.ts` / `probe.ts` と同じく**自己完結関数をソース文字列として注入**し、
page 側の口は [`../tests/browser/harness.ts`](../tests/browser/harness.ts) の `captureGeometry()`。

| 押さえること | 壊れると出る形 |
|---|---|
| **コネクタの両端が「テーブルの縁 × 行の中心」に乗っている** | 線が箱から外れる／行 1 つぶんずれる |
| **テーブルを動かすと両端が追随する** | ドラッグ後に線が置き去りになる |
| **relation の描き込みがテーブルの実測を動かさない** | #207 の 2 パス化（全部読んでから全部書く）が不正になる |
| **ミニマップ上の分身が designer の縦横に別々に追随する** | 縦横で同じ比を読み、非正方形の盤面で分身がずれる |

**★ golden を増やさない。** `state.ts` の除外は「2 実行系で 1 本の golden を共有する」ための
判断で、**それは動かさない**。端点もアンカーも**同じページの同じレイアウト**から出るので、
突き合わせはページ内で閉じる —— **フォントにも viewport にも OS にも依らない**
（CI は ubuntu、手元は Windows）。

**★ `d` 属性の値を焼かない。** 焼くと「テーブルの幅が変わった日」に赤くなるだけで、
**コネクタが正しい場所に繋がっているか**は何も言えない。

**★ 判定を採取側に書かない。** `captureCanvasGeometry` が返すのは生の実測だけで、
**左右どちらの縁を選ぶか**（`relation.ts` の分岐）は候補として両方持ち、判定はテスト側にある。
分岐まで写すと、テストが実装の言い換えになって何も検知しなくなる。

**★ 検知力を実測した**（2026-09-10）。2 つ変異させて**両方が赤くなること**を確かめてある ——
行の中心 `Math.round(offsetHeight / 2)` を `0` にする（端点 2 本が赤）、
ミニマップの縦を `ratioX` で描く（ミニマップ 1 本が赤）。

**★ 幾何の棚は #207 で 2 本増えた**（2026-09-10）。どちらも**性能の変更が成り立つ前提**を
そのままテストにしたもので、**CSS を読んで判定しない** —— `position: fixed` の宣言を
assert しても「その宣言があること」しか言えず、テーマが増えた日に落ちる。

| 足したもの | 何の前提か |
|---|---|
| ミニマップを極端な位置へ描いてもテーブルの実測が動かない | `Table.redraw()` の `offsetWidth` 2 回読みを **1 回**にできる根拠（間にあるのが `dom.mini` への書き込みだけだから） |
| **2 パスで描いた `d` と、1 本ずつ描いた `d` が一致する** | 「出力を 1 ビットも変えていない」**そのもの**。**動かした直後に採る** —— 落ち着いた盤面で 2 回描き直しても「読みが古い値を掴む」壊れ方は出ない |

**★ 検知力を実測した**（2026-09-10）。`Table.redraw()` の `measure()` ループを
`style.left` の書き込みより**前**へ動かす変異（＝古い座標を掴む）で、
**両端の追随 1 本と等価性 1 本が赤**になった。

**ここは今後も積む棚**。`rubberband.ts` / `keymanager.ts` / `window.ts` / `toggle.ts` は
まだテストからの参照が 0 で、ドラッグとラバーバンドは下の「見た目とキーボードの手動確認」に残る。

### 仮想 backend（§4 段階4-6）

4-6 で保存が read-before-write（save の前に load を 1 回投げる）になり、**「サーバ上に何が
置いてあるか」を作り分けられないと一致 / 不一致が試せない**。Node ハーネスの `OZ.Request`
差し替えは URL をリポジトリ内ファイルに解決するだけなので、`backend/` で始まる URL だけを
正本ディレクトリに相当する Map へ分岐させてある（`locale` / `datatypes` の fs 経路はそのまま）。

**★ 段階5-1c から、これは手書きの推測ではなく契約の第 2 実装。** 上の「backend の契約は 1 つの
表に置く」のとおり、`tests/contract/backend-cases.json` の `virtual: true` のケースが
Kotlin 実装と**同じ表**で検証する。挙動を変えるときは表を先に直すこと。

| ハーネスの口 | 用途 |
|---|---|
| `callBackend(url, options)` | 仮想 backend を 1 往復だけ直接叩く（契約表を流す口。段階5-1c） |
| `setServerFile(keyword, text)` | 仮想 backend に置く / `null` で消す（＝ load が 404） |
| `getServerFile(keyword)` | save の write-through を検算する |
| `clearServerFiles()` | テストごとの初期化 |
| `failNextLoad(status)` | 次の load だけ 500 などにする |
| `setConfirm(answer)` / `takeConfirms()` | confirm の答えを固定し、出た文言を取り出す |

`confirm` の差し替えが要るのは、jsdom の `confirm` が "not implemented" で常に false を返し、
**「それでも上書きする」側の経路が試せない**ため（`alert` と同じ形にしてある）。
判定そのもの（`verdictForSave()`）は純関数なので
[`../tests/node/conflict.test.ts`](../tests/node/conflict.test.ts) が表で押さえ、
[`../tests/node/io-ui.test.ts`](../tests/node/io-ui.test.ts) は**通信が起きたか・confirm が出たか・
サーバ上のファイルが変わったか**だけを見る。

### round-trip / 決定論

- **round-trip**: `fixture → toXML → fromXML → toXML → fromXML → toXML` で 1・2・3 回目が完全一致すること。
  JSON も同じ形で `toJson` / `fromJson` を回す。
- **決定論**: 同一モデルから `toXML()` を 2 回呼んで完全一致すること（`toJson()` も同様）。
- **環境依存が無いこと**: 出力に `location.href` も `Active URL` コメントも現れないことを明示的に固定。
  **§4 段階4-4 まではこれが「非決定性の所在」テスト**で、`<!-- Active URL: ... -->` に
  `location.href` が入ることを固定し、golden ではその 1 行だけを `{{ACTIVE_URL}}` に正規化していた。
  4-4 で行ごと撤去したので主張を反転させ、golden の正規化も無くなった。

### fixture（`tests/fixtures/<db>/`）

すべて手書きの well-formed XML。**fixture の生成に現行コードを使わない**
（採取当時の `toXML()` は非決定的だった。決定論になった段階4-4 以降も、
測る対象で測る対象を作らないという理由で手書きのまま）。
`<datatypes>` ブロックは持たせず、DB プロファイルはテスト側が型パレットの差し替えで与える
（`dbResponse()` と同じ操作。[js/wwwsqldesigner.ts の dbResponse](../frontend/js/wwwsqldesigner.ts)）。
差し替え口は段階4-0b から `palette.setRoot()`（page 側は `window.d.palette`、node 側は
ハーネスが掴んでいる `designer.palette`）。

**§6 段階6-6a から fixture は DB 別**（`tests/fixtures/<db>/<name>.xml`）。名前の 7 本は
どのプロファイルにも同じだけ在り、**中身がその DB の型で書かれている**。読むのは
`readFixture(db, name)` で、**db は省略できない** —— 「どのプロファイル向けの入力を、
どのパレットで読んでいるか」がずれていること自体が主張になっているテストがあるため
（`state/h2-house-defaults.json` は**postgresql の fixture を `h2` のパレットで読む**。
6-8d まで known-issues #4 / #10 も同じ形で未現代化のパレットを使っていた）。全プロファイル分が
実在することは [`../tests/node/fixture-set.test.ts`](../tests/node/fixture-set.test.ts) が
機械的に見る。

| fixture | 押さえていること |
|---|---|
| `empty` | テーブル 0 件 |
| `minimal` | 1 テーブル / 1 カラム |
| `house-defaults` | house 既定をそのプロファイルで表せる範囲・複合 PK・UNIQUE・FK・日本語コメント |
| `relations` | 自己参照 FK・多対多・1 テーブルに複数 FK |
| `types-matrix` | **そのプロファイルの**型パレット網羅（サイズ付き含む） |
| `autoincrement` | `autoincrement="1"`（PG は段階6-5b から `<datatype>` ＋ `GENERATED ALWAYS AS IDENTITY`。それまでは `BIGSERIAL` 固定） |
| `quotes-i18n` | コメント内の `'`（生成器の `replaceSubstring`。段階6-5a まで XSLT の `replace-substring`）・識別子の `"`・日本語識別子 |

**fixture は §6 のパレット差し替えでも動かさない。** 6-3 は `postgresql` のパレットだけを
差し替えたが、fixture を 1 行でも触ると**全プロファイルの DDL golden が動き**、
「PG 以外は 1 バイトも動かない」という段階の完了判定がぼやける。撤去した型の旧名は
パレット側の `aka` が受けるので、`postgresql/types-matrix` は `SERIAL` / `CHAR(10)` / `JSON` を
書いたまま新しい型に解決する。

**§6 段階6-6b で 4 プロファイルの中身がその DB の実型・実関数になった。**
`types-matrix` はパレットの全型を 1 列ずつ網羅し（sqlite 5・oracle 15・postgresql 24・
mysql 25・mssql 26 型ほか）、`house-defaults` は house 既定を「その DB で普通に書く形」で
表している（`uniqueidentifier` ＋ `NEWID()` / `RAW(16)` ＋ `SYS_GUID()` など）。
**網羅とパレットの整合は
[`../tests/node/fixture-set.test.ts`](../tests/node/fixture-set.test.ts) が機械的に見る** ——
パレットに型を足して fixture を忘れると、足りない型名を名指しで落ちる。

**書けるのは現行パレットに実在する型だけ。** 6-6b の時点では oracle の
`TIMESTAMP WITH TIME ZONE` も mssql の `date` もパレットに無く、**6-6b の非 PG golden は
「6-8 直前のベースライン」**であってその DB の理想形ではなかった。**6-8a 〜 6-8d で 4 本とも
現代化され、56 本すべてが「その DB の DDL」になっている。**house 既定が各 DB で何を失うかは
[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の段階6-6b（表）と 6-8a 〜 6-8d の各エントリ。

---

## golden の更新手順

```bash
npm run golden:update     # 実ブラウザで採り直す（UPDATE_GOLDEN=1 playwright test）
git diff tests/golden/    # 差分を必ず 1 件ずつ読む
npm test                  # Node 側も新しい golden で緑になるか
```

- **Node 側からは絶対に更新しない。** `tests/support/golden.ts` の書き込みは
  `UPDATE_GOLDEN=1` のときだけで、その環境変数を立てるのはブラウザ用の npm script だけ。
- 差分が出たら「意図した変更か」を必ず判断する。意図しない差分が出たまま golden を上書きすると
  安全網が無くなる。判断は [`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) に記録する。
- `tests/golden/**` / `tests/fixtures/**` / **`db/**`** は `.gitattributes` で **LF 固定**。
  `locale/**` だけが `-text`（改行変換なし）で、コミットされたバイトのままチェックアウトされる
  （`locale/ko.xml` が今も CRLF のため）。
  **`db/**` は段階6-5a まで `-text` だった** —— `output.xsl` の `xsl:text` 内の改行はそのまま
  生成 SQL に出るので、`db/` の改行コードが DDL golden のバイト列を左右していた。DDL 生成が
  TS に移ってその経路が消え、`db/` に残るのは属性を読むだけの `datatypes.xml` だけになったので
  LF 固定へ揃えた（5 本とも既に LF でコミットされていたのでバイト列は動いていない）。

## fixture の追加手順

1. `tests/fixtures/<db>/<name>.xml` を手書きで置く（`<datatypes>` は入れない）。
   **全プロファイル分を置く** —— 1 本でも欠けると
   [`tests/node/fixture-set.test.ts`](../tests/node/fixture-set.test.ts) が名指しで落ちる。
   型はそのプロファイルのパレットに実在する `sql` 名で書く。
2. [`tests/support/fixtures.ts`](../tests/support/fixtures.ts) の `FIXTURES` に 1 行足す。
3. `npm run golden:update` → 生成された golden を読んで、生成器 / serializer から予想した形と合うか確認。
4. `npm test` と `npm run test:browser` が緑になることを確認。

既知の不具合を踏む入力は `tests/fixtures/` ではなく
[`tests/known-issues/`](../tests/known-issues/) に置く（下記）。

---

## 既知の不具合は golden に入れない

`tests/golden/` は「移植で変わってはいけない挙動」の記録なので、不具合をそこに焼くと
*期待される正しい出力* に見えてしまう。現行コードの不具合は
[`tests/known-issues/`](../tests/known-issues/) に隔離し、**golden ファイルを持たず**
「現在こう壊れている」ことをテストコード内のリテラルで直接アサートしている。

移植で直すと `npm run known-issues` が赤くなる。それが正しい。運用手順は
[`tests/known-issues/README.md`](../tests/known-issues/README.md)。

**§6 段階6-8d で収録は 2 本になった**（#9 introspection・#15 Oracle の識別子）。
どちらも §6 の型パレット / DDL 生成の話ではないので、**この隔離は §6 の残りを
もう 1 つも指していない**。

**★ 訂正（issue #120 の作業中に気づいた）—— いま生きているのは 1 本**（#15 だけ）。
**#9 は直って移設済み**で、[`tests/known-issues/README.md`](../tests/known-issues/README.md)
の収録表がそう書いている。**元の記述は消さない**（6-8d 時点の観測として正しい）。

なお正常系の入力でも現行の欠陥はそのまま出力に出る（`UUID` → `INTEGER` など）。
golden に写り込んでいる癖の一覧は [`tests/golden/README.md`](../tests/golden/README.md)。

---

## parity 例外（段階6-5a で消えた）

**段階6-5a まで、`oracle` だけが Node 側の DDL 回帰から外れていた。**
`xslt-processor` 5.1.0 が XSLT 1.0 の一部を満たしておらず、`db/oracle/output.xsl` の
トップレベル `xsl:variable` を解決できずに `XPST0008: Unresolved variable reference: $crlf`
で落ちていたため（XSLT 1.0 としては正当な書き方で、エンジン側の未対応だった）。
Node 側の [`ddl.test.ts`](../tests/node/ddl.test.ts) には、エンジンの非準拠を補う adapter も
2 本あった —— XML 1.0 の line-end normalization をしないこと、`method="text"` でも
`& < >` を XML エスケープしてしまうこと。

**DDL 生成が TS になり、その 3 つ（parity 例外・adapter 2 本・`xslt-processor` 依存）が
まとめて消えた。** ブラウザと Node で同じ [`../frontend/js/io/ddl/`](../frontend/js/io/ddl/) が動くのでエンジン差が
存在しない。**`oracle` の 7 件が Node 回帰に復帰し、`npm test` の skipped は 0 になった。**

段階6-1 で `sqlalchemy`（`position()` / `last()`）と `vfp9`（`substring($s, 2, -1)`）が
対応 DB から外れたのも同じ性質の話だったが、そちらは対応 DB ごと消えている。

**この節が残っているのは記録のため。** いま Node 側が届かない DB は 1 本も無い。

「その例外がまだ実在すること」自体をテストにしておく（エンジンが対応したら赤くなり棚卸しを促す）
というイディオムは [`workarounds.test.ts`](../tests/node/workarounds.test.ts) に残っている ——
vitest の cwd 正規化ラッパーがそれで、**vitest を上げると必ず 1 回赤くなる**。

---

## 構成

```
tests/
  support/       fixture 定義・正規化・golden 入出力・状態と座標系の採取（両ハーネス共通）
  fixtures/<db>/ 入力設計 XML（正常系。§6 段階6-6a から DB 別）
  golden/        現行の実出力（README.md に注意書き）
  browser/       Playwright。golden の権威
  node/          vitest + jsdom。同じ golden を高速に検証
  known-issues/  既知の不具合（golden を持たない）
  dist/          build 成果物のスモーク（golden は読むだけ）
  contract/      backend の HTTP 契約（言語非依存の表。§5 段階5-1b）
  server/        実 HTTP の E2E（§5 段階5-9 / §11 段階11-5）。**要 JDK 25**。
                 ブラウザ → proxy → Kotlin → fs ／ AI は上流まで（opt-in）
  image/         配布イメージの E2E（§2 段階2-4）。**要 Docker**。
                 compose で起こして通しで叩く ／ READONLY で起こし直してもう一巡
  orm-tools/     ORM 出力を実物の道具に通す（issue #120）。**要 Docker ＋ ネットワーク**。
                 使い捨てコンテナで kotlinc / prisma validate / tsc に golden を食わせる

server/src/test/kotlin/io/propagandist/grabado/
  api/BackendContractTest.kt    tests/contract/ の表を実 HTTP に流す
  api/BackendBehaviourTest.kt   表で書けないもの（往復・副作用の不在）
  api/ReadOnlyContractTest.kt   同じ表の serverMode: readonly（§5 段階5-3）
  ai/AiContractTest.kt          同じ表の serverMode: ai（§11 段階11-2a）
  ai/AiReviewServiceTest.kt     上限・キャッシュ・レート制限を HTTP なしで
  ai/ReviewSchemaTest.kt        スキーマと js/io/ai/suggestion.ts の語彙を突き合わせる
  ai/AnthropicIntegrationTest.kt 実キーで 1 往復（opt-in。§11 段階11-2b）
  design/DesignNameTest.kt      keyword の検証規則（純粋な表テスト）
  design/FileDesignStoreTest.kt 実 FS への I/O（@TempDir）
```

## backend の契約は 1 つの表に置く（§5 段階5-1b）

[`../tests/contract/backend-cases.json`](../tests/contract/backend-cases.json) が
「1 リクエスト → 1 レスポンス」を持つ。読み手は 2 つ:

1. **Kotlin** — `BackendContractTest` が `@ParameterizedTest` で全ケースを実サーバに流す
2. **TypeScript** — 仮想 backend（`tests/node/harness.ts`）に `virtual: true` のケースを流す（**段階5-1c で配線**）

こうすると仮想 backend が「サーバについての手書きの推測」から「**同じ表で検証された第 2 実装**」に
変わる。散文の正は [`ARCHITECTURE.md`](ARCHITECTURE.md) §4（実測・旧 PHP）と §7（Kotlin の到達点）で、
表はそれを機械可読にしたもの。手で書いた表が腐る問題への対処は、`type-mapping.test.ts` が
`docs/TYPE-MAPPING.md` を実装と 1 セルずつ突き合わせているのと同じイディオム。

`virtual: false` は仮想 backend では再現できないケース（Map であってファイルシステムでは
ないので、パス解決や dotfile の扱いを模せない）。**模せる範囲を表の中で宣言する**ことで、
harness がどこまでサーバなのかが文書ではなくデータになる。

**Kotlin 側は MockMvc ではなく実サーバ（`RANDOM_PORT`）を使う。** 契約には日本語 keyword の
URL 往復と `%2F` の扱いが含まれ、どちらもサーブレットコンテナのデコード層の話で
**MockMvc はそこを素通りする**。JDK 標準の `HttpClient` を使うので依存も増えない。

### 起動条件ごとに流す側を分ける（§5 段階5-3 / §11 段階11-2a）

**表は 1 つのまま、流す側が 3 つある。** READONLY も AI の有効化も**サーバの起動条件**なので、
同じインスタンスでは試せない。`serverMode` がその宣言で、省略が通常起動。

| 流す側 | `serverMode` | 起動条件 |
|---|---|---|
| `BackendContractTest` | （なし） | 通常 |
| `ReadOnlyContractTest` | `readonly` | `GRABADO_READONLY=true` |
| `AiContractTest` | `ai` | AI の env ＋ **テスト用の `SuggestionSource`** |

**AI の URL は `/backend/<name>/?action=` の形を取らない**（`/api/ai/review`）。表の
`request.path` がそれで、**あればそちらを使う**——URL の組み立て方が 2 通りになるが、
どちらなのかは文書ではなくデータで分かる。

★ **段階11-2b で `AnthropicSuggestionSource` が main に入り、`SuggestionSource` の Bean が
2 つになった。** `AiContractTest` のスタブは `@Primary` で本物より優先する ——
**本物を除外する形は採らない**（除外すると「本物が居ても契約が保たれる」ことが試されなくなる）。

### 上流を実際に叩く 2 本（§11 段階11-2b）

| ファイル | 走る条件 | 担当 |
|---|---|---|
| `ai/ReviewSchemaTest.kt` | **既定で走る** | structured outputs のスキーマが [`../frontend/js/io/ai/suggestion.ts`](../frontend/js/io/ai/suggestion.ts) と**同じ語彙**であること（`op` 8 語 / `keyType` 4 語 / `category` 7 語 / `severity` 3 語）＋ **スキーマ自身が Claude のサブセットに収まっていること**（全オブジェクトの `additionalProperties: false`・数値/文字列長の制約を使っていない・再帰していない） |
| `ai/AnthropicIntegrationTest.kt` | **opt-in**（`ANTHROPIC_API_KEY` ＋ `GRABADO_IT_AI_MODEL`） | 実キーで 1 往復。house 既定から外れた設計に**実際の指摘が返る**こと・返った提案が enum の内側にあること・知らない `dialect` でも落ちないこと |

**なぜ両方要るか。** スキーマ側だけだと「Claude はこのスキーマを受け付けるはずだ」という
**我々の信念を符号化したもの**でしかなく、信念が間違っていれば全部緑のまま本番が 400 になる
（`PostgresCatalogIntegrationTest` が書いている構図と同じ）。逆に実 API 側だけだと CI で回せない。

**さらにもう 1 層ある** —— `tests/server/ai-e2e.spec.ts`（§11 段階11-5。opt-in）。
ブラウザ（実 XHR）→ Vite dev proxy → Kotlin → Anthropic を通しで動かす唯一の場所で、
**単体テストが全部緑のまま残っていた欠陥を 2 つ捕まえた**:

- `vite.config.ts` の proxy が `/backend` しか転送しておらず、`npm run dev` 経由では
  `/api/ai/review` が backend に届いていなかった（仮想 backend は proxy を通らない）
- `@RequestBody ByteArray` が**ブラウザの `Content-Type: application/json` に 415 を返した**。
  契約表のケースはヘッダを送っていなかったので通っていた（再発防止に
  `ai-review-json-content-type` を足してある）

```bash
set -a; . ./.env; set +a
GRABADO_IT_AI_MODEL=claude-opus-5 server/gradlew -p server test   --tests '*AnthropicIntegrationTest*' --info | grep 'ai review:'
```

使った量は `AnthropicSuggestionSource` が INFO で出す（`input=… cacheRead=…`）。
**返ってきた提案そのものも `--info` で読める** —— 形はアサーションで見られるが、
**中身が製品として意味のある指摘かは人が読むしかない**。

時間に依存するもの（結果キャッシュの TTL・レート制限のウィンドウ）は `Clock` を渡して
その場で進める（`AiReviewServiceTest`）。**`Thread.sleep` で待たない**——遅くなるうえに
落ちる日が来る。

## セキュリティヘッダと CSP の前提（§2 段階2-2）

配布イメージは**単一プロセスが static と API の両方を配る**（段階2-1）ので、ヘッダは
[`SecurityHeadersFilter`](../server/src/main/kotlin/io/propagandist/grabado/config/SecurityHeadersFilter.kt)
1 本で全応答に付く。**値の正本はそこ**で、[`../vite.config.ts`](../vite.config.ts) の
`preview.headers` はその写し —— 手元の `vite preview` を**配布時と同じヘッダ**で回すために置いている。

| テスト | 何を見るか |
|---|---|
| [`tests/node/csp.test.ts`](../tests/node/csp.test.ts) | 正本と写しが 1 バイトも違わないこと。CSP が `script-src` を緩めていないこと・`frame-ancestors 'none'` があること・`default-src 'none'` から始まること |
| [`tests/node/forbidden-api.test.ts`](../tests/node/forbidden-api.test.ts) | `js/` `src/` に動的評価が **0 件**（CSP の前提。org security-verification §2.1 の「書いてはいけない形」の型） |
| [`tests/node/options-cookie.test.ts`](../tests/node/options-cookie.test.ts) | オプション cookie の往復。**段階2-2 以前の書式 `{k:'v'}` を読めること**（撤去の互換）と、記号を含む値が壊れないこと |
| `BackendBehaviourTest`（Gradle 側） | 5 本が実際の応答に付くこと。**404 でも付くこと** —— ヘッダが落ちるのは、たいてい正常系ではない経路（同 §1.2） |

**★ `innerHTML` は縛っていない**（2026-08-25 実測で 24 か所）。棚卸しは別段階 ——
**0 を 1 にする変更が赤くなればよい**のであって、既存を読み直す作業ではない。

**★ `curl` はヘッダの有無しか見ない。** 「違反が出ないこと」と「機能が壊れていないこと」は
ブラウザにしか出ない（同 §1.2）ので、下のスモークが console を拾う。

## compose と env の一致（§2 段階2-3）

**env の正本は
[`../server/src/main/resources/application.yaml`](../server/src/main/resources/application.yaml)**
（実際に読むのがそこだから）。[`../.env.example`](../.env.example) は利用者向けの写しで、
[`../compose.yaml`](../compose.yaml) の `environment:` は**コンテナへ渡す口**。3 つがずれると
「**`.env` に書いたのに効かない**」が黙って起きる —— 外から見て壊れているのと区別がつかない。

| テスト | 何を見るか |
|---|---|
| [`tests/node/env-contract.test.ts`](../tests/node/env-contract.test.ts) | 3 つのファイルが**同じ 12 本**を持つこと。**裸の互換名（`SCHEMA_DIR` / `READONLY`）を外向きの一覧に出さない**こと。mount 先が application.yaml の既定と一致すること。**`env_file:` を使わない**・**`environment:` に `${...}` を書かない**・**`image:` を指さない**という段階2-3 の判断 3 つ |

**見るのは名前の集合だけで、値は見ない** —— 既定値は application.yaml と
[`ARCHITECTURE.md`](ARCHITECTURE.md) §7.3 / §8.4 が持ち、写せば正本が 2 か所になる。

**★ イメージを起こす検証はここに無い。** compose が実際に起動し、save がホストへ書け、
`READONLY` で 403 になることは**手で確かめた**（実測は [`ARCHITECTURE.md`](ARCHITECTURE.md) §9.5）。
**自動化は 2-4** —— 5-9 / 11-5 と同じ形で E2E を張る。

## ツールチェーンの版の一致（issue #134）

**配布物と CI が同じ Node / Java で動いていること**を見る。
[`../Dockerfile`](../Dockerfile) の web ステージは前から「版は `ci-frontend.yml` の
`node-version` に揃える。**CI と違うもので配布物を作らない**」と書いていたが、
**2026-08-30 まで、それを確かめる機械が 1 つも無かった** —— Dependabot の
[#130](https://github.com/propagandist/grabado/pull/130)（node 24 → 26）は Dockerfile の 1 行だけを
動かすもので、**全ジョブ緑のまま**食い違いを入れられる形だった。

| | 正本 | 写し |
|---|---|---|
| Node | [`ci-frontend.yml`](../.github/workflows/ci-frontend.yml) の `node-version` | Dockerfile の web ステージ |
| Java | [`build.gradle.kts`](../server/build.gradle.kts) の `jvmToolchain`（**実際にコンパイルするのがそこ**） | [`ci-server.yml`](../.github/workflows/ci-server.yml) の `java-version` ／ Dockerfile の api（jdk）と runtime（jre） |

| テスト | 何を見るか |
|---|---|
| [`tests/node/toolchain.test.ts`](../tests/node/toolchain.test.ts) | 上の 4 対が一致すること。**読み取りが空振りしたら赤くなる**こと（書式が変わったとき「一致している」ではなく「**読めなかった**」と言わせる）。ベースイメージの正規表現は `@sha256:` を必須にしてあるので、**digest ピンを外しても赤くなる** |

**版の数字そのものはテストに書かない** —— 書けば正本が 2 つになる（`env-contract.test.ts` が
「値そのものは見ない」と決めているのと同じ理由）。**どの版にするかは正本の側が決める**
（判断は [`HANDOVER.md`](HANDOVER.md) §2.2 の「着手時に**最新 LTS** 確認」）。

**★ 意図して対象外にしたものが 2 つある**（漏れではない）。
[`ci-image.yml`](../.github/workflows/ci-image.yml) の `node-version` は**揃える義務が無い**
（段階2-5 の「**揃える先を 3 か所に増やさない**」。あれは Playwright を回す Node で、
イメージの中身とは別）。[`../tests/orm-tools/cases.ts`](../tests/orm-tools/cases.ts) の
`node:24` は**使い捨てコンテナで tsc を回すだけ**で、配布物のビルド入力ではない。

**★ この検査のために [`ci-frontend.yml`](../.github/workflows/ci-frontend.yml) の `paths` が
3 ファイル広がっている**（`Dockerfile` / `server/build.gradle.kts` / `ci-server.yml`）——
**一致検査は、正本と写しのどちらが動いても走らないと意味が無い**ため。

## 配布物のスモーク（`npm run test:dist`）

dev server で緑でも `dist/` が壊れていては配布できないので、
[`../playwright.dist.config.ts`](../playwright.dist.config.ts) が `vite build` → `vite preview`
（127.0.0.1:4174）を起こし、[`../tests/dist/smoke.spec.ts`](../tests/dist/smoke.spec.ts) が確認する。

- バンドルされた `index.html` から `SQL.Designer` が初期化される
- `db/*/datatypes.xml` / `locale/*.xml` / `images/*` が dist に実在する
  （いずれも Rollup の依存グラフに乗らず、`vite-plugin-static-copy` が運んでいる）
- `postgresql` / `house-defaults` の DDL が既存 golden と一致する
- **配布時と同じセキュリティヘッダで配られる**（段階2-2）
- **CSP 下で** blob: のダウンロードが通り、主要操作（テーブル追加 → 行 → キー → テーマ切り替え →
  DDL 出力 → localStorage の保存/読込）が一巡する

**★ CSP 違反は `afterEach` が拾う。** ブラウザの console に出たものを毎テスト引き取って
空を確かめるので、**どのテストで出たか**が分かる（違反が 1 本でもあれば赤）。

**golden は読むだけ**で、ここからは絶対に採り直さない（権威は `tests/browser/`）。

---

## 見た目とキーボードの手動確認（v0.3.0 / #175）

**機械に落とせなかったぶんだけをここに置く。** 落とせたものは
[`../tests/node/styles.test.ts`](../tests/node/styles.test.ts)（トークン・コントラスト・
`@import`・`url()`・`!important`）と
[`../tests/browser/theme.spec.ts`](../tests/browser/theme.spec.ts)（テーマが本当に当たっているか）、
[`../tests/browser/dialog.spec.ts`](../tests/browser/dialog.spec.ts)（1 問ダイアログの形と Esc）が持つ。

**★ スクリーンショットは `npm run shots` で撮れる**（3 テーマ × 3 画面 = 9 枚が `shots/` に出る）。
**baseline は持たせない** —— 比較しないので壊れやすいテストにならず、
**PR に貼ってレビューを実質的にするためだけ**に使う（判断は `CUSTOMIZATIONS.md` の 2026-09-06）。

### 何を見るか

**3 テーマ**（`material-inspired` / `material-dark` / `original`）× **2 ロケール**（en / ja）で、
下の 8 画面を一巡する。

| # | 画面 | 見るもの |
|---|---|---|
| 1 | ツールバー | **42 ボタンにアイコンが出ている**（#170）。**ラベルが切れていない** —— de / ru は元から 1 個切れており、溝を空けて 3 個 / 5 個になった（#170 の実測）。`text-overflow: ellipsis` が付いているので、**切れていれば「…」が見える** |
| 2 | テーブル追加 | カードが読める。**選択の枠がレイアウトを動かさない**（#171 で `border` → `outline`） |
| 3 | 行編集の展開 | **型の帯が 4 色に見える**（material は右端 4px の帯、original は行の背景色。**2 テーマの意図的な差**） |
| 4 | Keys | `<<` / `>>` が押せる |
| 5 | Options | **テーマを変えて OK を押した瞬間に切り替わる**（#172 で `applyStyle()` の欠落を塞いだ）。リロードは要らない |
| 6 | Save / Load | 「保存」4 種が**行き先の絵で読み分けられる**（#170） |
| 7 | ミニマップのドラッグ | port が動く（`map.ts` が `offsetWidth - 2` を前提にしている。#171 で `box-sizing` を固定した）。**port の大きさの計算は `canvas.spec.ts` が張る**が、**ドラッグ操作そのものは目視のまま**（#236） |
| 8 | ラバーバンド | 枠が 1px で見える（#171 で `.2px` から直した） |

### キーボードだけで一巡する

- **Tab のリングが常に見える**（#171 の `:focus-visible`）。**入力欄でも**（着手前は
  `outline: 0` が 3 か所にあり、`0px none` だった）
- **モーダルは Esc で閉じ、フォーカスが開く前の要素に戻る**（#173。`dialog.spec.ts` が
  1 問ダイアログ側を張っているが、**`#window` の 4 パネル側は目視**）
- **Tab がモーダルの外へ抜けない**
- Enter が OK として効く

### そのほか

- **OS のダーク切り替え** —— リロードすると `material-dark` で開く。
  **実行中は追従しない**（#172 の決めたこと。承知の副作用）
- **印刷プレビュー** —— **ダークのままでも黒塗りにならない**（`print.css` がライトを強制する）
- **幅 1024 / 1280 / 1920** —— `#io` が画面外に出ない、`#window` が縦に溢れずスクロールする
- **スクリーンリーダ** —— ダイアログの名前が読み上げられる（`aria-labelledby`）。
  **`lang` が効いて日本語が日本語として読まれる**（#175 で `languageResponse()` が入れる）
