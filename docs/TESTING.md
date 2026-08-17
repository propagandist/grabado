# TESTING.md — 特性化テスト（HANDOVER §7）

移植の安全網。CLAUDE.md の Hard Constraint 1「特性化テストが緑であることが移植の前提」の実体。

現行 wwwsqldesigner が **実際に吐いているバイト列** を固定し、HANDOVER §9 の移植
（フロント TS 化 → IO の JSON 化 → 型パレット → backend）で意図しない挙動変化が起きたら赤くする。

---

## 走らせ方

```bash
npm ci
npx playwright install chromium     # 初回のみ

npm test              # Node 側（jsdom + xslt-processor）。速い。日常はこれ
npm run test:browser  # 実ブラウザ側（Chromium）。golden の権威
npm run test:all      # 両方
npm run known-issues  # 既知の不具合の再現確認（上記いずれにも含まれない）
npm run test:dist     # build 成果物（dist/）のスモーク。上記いずれにも含まれない
npm run typecheck     # js/ src/ tests/ と *.config.ts（strict / noUncheckedIndexedAccess）
npm run migrate:design -- <ファイル>  # 設計 JSON の移行（§4 段階4-2b の形式 ＋ §6 段階6-3 の型 id）
```

`npm run test:browser` と `npm run known-issues` は **Vite dev server** を Playwright が勝手に起動する
（[`../vite.config.ts`](../vite.config.ts)、127.0.0.1:4173）。手で立てる必要はない。
root はリポジトリルートのままなので、`index.html` / `db/` / `locale/` / `styles/` の URL は
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
 ❯ tests/node/serialize.test.ts:8:1
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

DDL 生成の実体は JS ではなく **`db/<db>/output.xsl`（XSLT 1.0）をブラウザの `XSLTProcessor` で適用**
したもの（[js/io.ts](../js/io.ts) の `clientsql()` / `finish()`）。Node に `XSLTProcessor` は無い。
モデル層も描画 DOM と密結合で、DOM 無しでは動かない（[ARCHITECTURE.md](ARCHITECTURE.md) §5）。

そこで役割を分けた。

| | 実ブラウザ（`tests/browser/`） | Node（`tests/node/`） |
|---|---|---|
| 実行系 | Playwright + Chromium。本物の `XSLTProcessor` / `DOMParser` / 描画 DOM | vitest + jsdom + `xslt-processor`（純 JS の XSLT 1.0）。アプリは vite が束ねた IIFE を jsdom で eval |
| golden | **生成・確定する（唯一の正）** | 読むだけ。**絶対に書かない** |
| 速さ | 数秒 | 速い |
| カバー範囲 | 全 5 DB プロファイル | 4 DB（`oracle` だけが parity 例外、下記） |

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
`window.SQL.designer` から **[`../src/main.ts`](../src/main.ts) が置く `window.d`** に寄せた
（upstream 由来のデバッグハンドルを、そのままテスト API として使う）。型パレットの差し替えも
**段階4-0b で `window.DATATYPES` から `window.d.palette.setRoot()` になった**ので、page 側が触る
出荷コードの面は `d` だけになっている（node 側は `designer.palette`。実体は
[`../js/io/palette.ts`](../js/io/palette.ts)）。

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

7 fixture × 5 DB = **35 本**。[js/io.ts](../js/io.ts) の `finish()` と同じ経路
（`toXML()` → `DOMParser` → `XSLTProcessor` → `documentElement.textContent` → `trim`）で採る。
UI の `#textarea` に入る値と一致する。

### DDL 入力 golden — `tests/golden/ddl-input/<fixture>.xml`

7 fixture。`Designer.toXML()` の出力を postgresql の型パレットで解決したもの。
serializer は型解決以外 DB 非依存なので DB 横断はしない（その根拠自体もテストで固定してある）。

**§4 段階4-4 で `golden/xml/` から改名した。** 4-3b でユーザーに見える保存経路が JSON に
なったので、この 7 本が押さえているのは「設計の保存形式」ではなく
**`db/<db>/output.xsl` への入力**（＝上の DDL golden の一段手前）である。

### 状態スナップショット golden — `tests/golden/state/<fixture>.json`

**§4 段階4-1b で追加。読み込み方向（`fromXML`）の安全網。** 上の 2 つは `toXML()` の**結果**しか
押さえておらず、`fromXML` は「XML を再生する UI 操作列」なので、XML に出ない状態が丸ごと
素通りしていた —— 選択クラス・型パレット由来の色・z-index・relation がどの**実体**に繋がったか・
`clearTables()` の後始末。8 本（fixture 7 × postgresql ＋ `house-defaults` × mysql）。

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
- **形式**: 2 スペース・末尾 LF 1 つ・キー順が [`../js/io/json-format.ts`](../js/io/json-format.ts) の
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
| [`../tests/node/type-resolution.test.ts`](../tests/node/type-resolution.test.ts) | [`../js/io/palette.ts`](../js/io/palette.ts) と [`../js/io/xml-parser.ts`](../js/io/xml-parser.ts) を直に叩く（ハーネス不要。どちらも実行時 import 0 本なので `conflict.test.ts` と同じ立場）。**旧規則の参照実装をテスト内に置き、未現代化プロファイル × 全候補名で新旧を突き合わせる差分テスト**が主役。ほかに strict の `aka` 照合（旧型名 → 新型の表をリテラルで固定）・`length` の契約・`fkIndexFor`・パレット差し替え後の追随・旧パレット互換 |
| [`../tests/browser/types.spec.ts`](../tests/browser/types.spec.ts) | 実ブラウザ側。`BIGINT` の解決（known-issue #3 の移設先）・**`UUID` の解決と strict の例外**（#4 の移設先。6-3）・XML 往復の安定・**FK 自動生成**（`rowManager` の対話経路。6-2 まで自動テストが 1 本も通っていなかった面）・パレット差し替え後の FK 生成・**型セレクタの中身**（`Row.buildTypeSelect`。パレットを読む唯一の UI 面で golden に 1 ビットも写らない。6-3） |

差分テストの主張は段階ごとに引き継いでいる。6-2 は「旧規則と違うのは `postgresql/BIGINT` の
1 件だけ」を完了判定にしていたが、**6-3 でその原因（`x_real`）ごと撤去され、`postgresql` が
strict 側へ移った**ので、いまは「**未現代化の 4 プロファイルは 6-2 以前と 1 件も違わない**」
という形になっている（6-8 で `re` を触るときにここが赤くなる）。

### UI の保存/読込経路 — golden を持たない 2 本（§4 段階4-3b）

**golden はここを 1 ビットも押さえない。** 上の golden 85 本はすべて Designer のファサード
（`toXML` / `toJson` / `fromXML` / `fromJson`）経由で採るので [`../js/io.ts`](../js/io.ts) を通らず、
**「UI が JSON に切り替わったこと」は golden 不変と両立してしまう**。だから 4-3b の完了判定は
「golden 85 本が無差分」＋この 2 本の 2 本立てになっている。

| ファイル | 担当 |
|---|---|
| [`../tests/node/io-ui.test.ts`](../tests/node/io-ui.test.ts) | **server 経路の契約** —— URL（`keyword` の `.json`）・`Content-type`・body が serializer の出力とバイト一致・`load` が応答をテキストで受ける・`import` は XML のまま。**段階4-6 から外部変更検知**（save の前に load・衝突時に confirm・断れば save を投げない）も。ハーネスが `OZ.Request`（全通信の唯一の入口）の差し替え先で記録する |
| [`../tests/browser/io-ui.spec.ts`](../tests/browser/io-ui.spec.ts) | **jsdom では見られないもの** —— download の `suggestedFilename`・localStorage・`XSLTProcessor` 経由の DDL 生成（UI ボタンからの実経路 1 本）・ボタンが DOM に実在すること |

両方が押さえるのは「読み込みが JSON と XML の**両方**を受ける」ことと、「読めない入力で
今開いている設計が壊れない」こと。特に**壊れた JSON を XML として読み直さない**（フォールバックが
無い）ことを明示的に見ている —— あると例外が `Null document` に着地して位置情報が消える
（[`../js/io/detect.ts`](../js/io/detect.ts)）。判別関数そのものは
[`../tests/node/detect.test.ts`](../tests/node/detect.test.ts) が fixture と golden の実バイト列で見る。

ボタンを押すのは `page.evaluate` の中（[`../tests/browser/harness.ts`](../tests/browser/harness.ts) の
`clickIo`）。io の container はコンストラクタで DOM から外れているので `page.locator` では拾えず、
かつ `alert` / `prompt` を**その呼び出しの間だけ**差し替えられる（`openDesigner` が張る
dialog ハンドラと衝突しない）。

### 仮想 backend（§4 段階4-6）

4-6 で保存が read-before-write（save の前に load を 1 回投げる）になり、**「サーバ上に何が
置いてあるか」を作り分けられないと一致 / 不一致が試せない**。Node ハーネスの `OZ.Request`
差し替えは URL をリポジトリ内ファイルに解決するだけなので、`backend/` で始まる URL だけを
`php-file` の `data/` に相当する Map へ分岐させてある（`locale` / `datatypes` / `output.xsl` の
fs 経路はそのまま）。

| ハーネスの口 | 用途 |
|---|---|
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

### fixture（`tests/fixtures/`）

すべて手書きの well-formed XML。**fixture の生成に現行コードを使わない**
（採取当時の `toXML()` は非決定的だった。決定論になった段階4-4 以降も、
測る対象で測る対象を作らないという理由で手書きのまま）。
`<datatypes>` ブロックは持たせず、DB プロファイルはテスト側が型パレットの差し替えで与える
（`dbResponse()` と同じ操作。[js/wwwsqldesigner.ts の dbResponse](../js/wwwsqldesigner.ts)）。
差し替え口は段階4-0b から `palette.setRoot()`（page 側は `window.d.palette`、node 側は
ハーネスが掴んでいる `designer.palette`）。

| fixture | 押さえていること |
|---|---|
| `empty` | テーブル 0 件 |
| `minimal` | 1 テーブル / 1 カラム |
| `house-defaults` | uuidv7 PK・timestamptz 監査列・jsonb・複合 PK・UNIQUE・FK・日本語コメント |
| `relations` | 自己参照 FK・多対多・1 テーブルに複数 FK |
| `types-matrix` | 型パレット網羅（サイズ付き含む） |
| `autoincrement` | `autoincrement="1"`（PG の `BIGSERIAL` 分岐） |
| `quotes-i18n` | コメント内の `'`（XSLT の `replace-substring`）・識別子の `"`・日本語識別子 |

**fixture は §6 のパレット差し替えでも動かさない。** 6-3 は `postgresql` のパレットだけを
差し替えたが、fixture を 1 行でも触ると**全 5 プロファイルの DDL golden が動き**、
「PG 以外は 1 バイトも動かない」という段階の完了判定がぼやける。撤去した型の旧名は
パレット側の `aka` が受けるので、`types-matrix` は `SERIAL` / `CHAR(10)` / `JSON` を
書いたまま新しい型に解決する。fixture が PG 用のまま全 DB に流れている構造そのものの
是正は **6-6（DB 別 fixture の整備）**。

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
- `tests/golden/**` と `tests/fixtures/**` は `.gitattributes` で **LF 固定**。
  `db/**` と `locale/**` は `-text`（改行変換なし）で、コミットされたバイトのままチェックアウトされる。
  `db/**` の改行は生成 SQL のバイト列を左右する（`output.xsl` の `xsl:text` 内の改行はそのまま
  出力に出る）ので、環境依存の変換を挟まないのが最も強い保証になるため。**唯一 CRLF だった
  `db/vfp9/output.xsl` は段階6-1 で消えた**が、`locale/ko.xml` が CRLF のまま残っている。

## fixture の追加手順

1. `tests/fixtures/<name>.xml` を手書きで置く（`<datatypes>` は入れない）。
2. [`tests/support/fixtures.ts`](../tests/support/fixtures.ts) の `FIXTURES` に 1 行足す。
3. `npm run golden:update` → 生成された golden を読んで、XSL / serializer から予想した形と合うか確認。
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

なお正常系の入力でも現行の欠陥はそのまま出力に出る（`UUID` → `INTEGER` など）。
golden に写り込んでいる癖の一覧は [`tests/golden/README.md`](../tests/golden/README.md)。

---

## parity 例外（Node 側だけ届かない `oracle`）

`xslt-processor` 5.1.0 は XSLT 1.0 の一部を満たしておらず、次の DB でブラウザと結果が一致しない。
実測で原因を特定してあり、内容は [`tests/node/parity-exceptions.ts`](../tests/node/parity-exceptions.ts)。

| DB | 症状 | エンジン側の不足 |
|---|---|---|
| `oracle` | `XPST0008: Unresolved variable reference: $crlf` で失敗 | トップレベル `xsl:variable` を解決できない |

**段階6-1 で `sqlalchemy`（`position()` / `last()`）と `vfp9`（`substring($s, 2, -1)`）が
対応 DB から外れ、Node 側がカバーしないのは `oracle` 1 本だけになった。**
この 1 本の DDL 回帰は **`npm run test:browser` だけが張っている**。
`npm test` だけで済ませないこと。

エンジン側の以下 2 点は [`tests/node/ddl.test.ts`](../tests/node/ddl.test.ts) の adapter で補正済み
（準拠した XML パーサ / text 出力の振る舞いを取り戻すだけの可逆な前後処理で、golden は歪めていない）。

- XML 1.0 の line-end normalization をしない
- `method="text"` でも `& < >` を XML エスケープする

どちらも 6-1 時点では実際に踏むプロファイルが無い（CRLF の XSL は消え、残る 35 本の golden に
`& < >` は 1 文字も無い）が、**`&` を含む識別子を入れた瞬間に効く**ので残してある
（[`tests/known-issues/fixtures/amp-in-name.xml`](../tests/known-issues/fixtures/amp-in-name.xml) がその形）。
adapter ごと消えるのは 6-5（XSLT 経路そのものが無くなる段階）。

例外が静かに増えたり静かに消えたりしないよう、
「その例外がまだ実在すること」自体もテストにしてある。エンジンが対応したら赤くなり棚卸しを促す。

---

## 構成

```
tests/
  support/       fixture 定義・正規化・golden 入出力（両ハーネス共通）
  fixtures/      入力設計 XML（正常系）
  golden/        現行の実出力（README.md に注意書き）
  browser/       Playwright。golden の権威
  node/          vitest + jsdom。同じ golden を高速に検証
  known-issues/  既知の不具合（golden を持たない）
  dist/          build 成果物のスモーク（golden は読むだけ）
```

## 配布物のスモーク（`npm run test:dist`）

dev server で緑でも `dist/` が壊れていては配布できないので、
[`../playwright.dist.config.ts`](../playwright.dist.config.ts) が `vite build` → `vite preview`
（127.0.0.1:4174）を起こし、[`../tests/dist/smoke.spec.ts`](../tests/dist/smoke.spec.ts) が 3 点だけ確認する。

- バンドルされた `index.html` から `SQL.Designer` が初期化される
- `db/*/datatypes.xml` / `locale/*.xml` / `images/*` が dist に実在する
  （いずれも Rollup の依存グラフに乗らず、`vite-plugin-static-copy` が運んでいる）
- `postgresql` / `house-defaults` の DDL が既存 golden と一致する

**golden は読むだけ**で、ここからは絶対に採り直さない（権威は `tests/browser/`）。
