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
npm run typecheck     # src/ tests/ types/ の型検査（既存 js/ は checkJs: false で対象外）
```

`npm run test:browser` と `npm run known-issues` は **Vite dev server** を Playwright が勝手に起動する
（[`../vite.config.ts`](../vite.config.ts)、127.0.0.1:4173）。手で立てる必要はない。
root はリポジトリルートのままなので、`index.html` / `db/` / `locale/` / `styles/` の URL は
§3 段階1 以前の静的サーバ時代と同じ。

---

## なぜ 2 系統あるのか

DDL 生成の実体は JS ではなく **`db/<db>/output.xsl`（XSLT 1.0）をブラウザの `XSLTProcessor` で適用**
したもの（[js/io.js:530-562](../js/io.js#L530-L562)）。Node に `XSLTProcessor` は無い。
モデル層も描画 DOM と密結合で、DOM 無しでは動かない（[ARCHITECTURE.md](ARCHITECTURE.md) §5）。

そこで役割を分けた。

| | 実ブラウザ（`tests/browser/`） | Node（`tests/node/`） |
|---|---|---|
| 実行系 | Playwright + Chromium。本物の `XSLTProcessor` / `DOMParser` / 描画 DOM | vitest + jsdom + `xslt-processor`（純 JS の XSLT 1.0） |
| golden | **生成・確定する（唯一の正）** | 読むだけ。**絶対に書かない** |
| 速さ | 数秒 | 速い |
| カバー範囲 | 全 9 DB プロファイル | 6 DB（3 つは parity 例外、下記） |

現行コードは**抽出せずそのまま動かす**。ロジックを先に抜き出すと「抜き出した後のコード」を
特性化することになり、安全網の意味が消えるため。抽出は HANDOVER §4 の仕事。

§3 段階1（Vite バンドル化）でもこの 2 系統は無改修で通っている。`js/` に import/export を入れず
グローバル公開だけに留めたので、Node 側の「`js/*.js` を 1 本ずつ eval する」経路が生きているため
（[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の決定ログ）。

**§3 段階2（ES クラス化）でもこの前提は崩していない。** `class X { … }` は `window.eval` では
グローバルに残らない（lexical 宣言は使い捨ての環境レコードに入る仕様）ので、必ず同一ファイル内で
`SQL.X = X;` する形にした。ファイル跨ぎの参照が `SQL.` 経由になるのは現行と同じで、Node ハーネスは
無改修のまま通っている。成功判定も段階1 と同じく `git diff tests/golden/` が空であること
（63 + 7 本すべて無差分）。

`.ts` 化する段階3 ではこの前提が崩れるので、Node ハーネスを vitest の変換に載せ替えるか
IIFE バンドルを eval するかの判断が要る。

**2 系統は strict / sloppy でも違う**（[`ARCHITECTURE.md`](ARCHITECTURE.md) §5.4）。ESM で配る
`test:browser` / `test:dist` は常に strict、`window.eval` で流す `npm test` は sloppy。
暗黙グローバルのような問題は**ブラウザ側でしか赤くならない**ので、`npm test` だけで済ませない。

---

## 何を固定しているか

### DDL golden — `tests/golden/ddl/<db>/<fixture>.sql`

7 fixture × 9 DB = **63 本**。[js/io.js:538-562](../js/io.js#L538-L562) の `finish()` と同じ経路
（`toXML()` → `DOMParser` → `XSLTProcessor` → `documentElement.textContent` → `trim`）で採る。
UI の `#textarea` に入る値と一致する。

### serializer golden — `tests/golden/xml/<fixture>.xml`

7 fixture。`SQL.Designer.toXML()` の出力を postgresql の型パレットで解決したもの。
serializer は型解決以外 DB 非依存なので DB 横断はしない（その根拠自体もテストで固定してある）。

### round-trip / 決定論

- **round-trip**: `fixture → toXML → fromXML → toXML → fromXML → toXML` で 1・2・3 回目が完全一致すること。
- **決定論**: 同一モデルから `toXML()` を 2 回呼んで完全一致すること。
- **非決定性の所在**: `<!-- Active URL: ... -->` に `location.href` が入ることを明示的に固定。
  HANDOVER §4 の決定論要件で撤去される対象で、golden ではこの 1 行だけを `{{ACTIVE_URL}}` に正規化している。

### fixture（`tests/fixtures/`）

すべて手書きの well-formed XML。`toXML()` は非決定的なので **fixture の生成に現行コードを使わない**。
`<datatypes>` ブロックは持たせず、DB プロファイルはテスト側が `window.DATATYPES` の差し替えで与える
（`dbResponse()` と同じ操作。[js/wwwsqldesigner.js:108-116](../js/wwwsqldesigner.js#L108-L116)）。

| fixture | 押さえていること |
|---|---|
| `empty` | テーブル 0 件 |
| `minimal` | 1 テーブル / 1 カラム |
| `house-defaults` | uuidv7 PK・timestamptz 監査列・jsonb・複合 PK・UNIQUE・FK・日本語コメント |
| `relations` | 自己参照 FK・多対多・1 テーブルに複数 FK |
| `types-matrix` | 型パレット網羅（サイズ付き含む） |
| `autoincrement` | `autoincrement="1"`（PG の `BIGSERIAL` 分岐） |
| `quotes-i18n` | コメント内の `'`（XSLT の `replace-substring`）・識別子の `"`・日本語識別子 |

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
  `db/vfp9/output.xsl` は upstream 本体が CRLF なので、`eol=lf` にすると upstream ファイルを
  書き換えてしまうため。

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

## parity 例外（Node 側だけ届かない 3 DB）

`xslt-processor` 5.1.0 は XSLT 1.0 の一部を満たしておらず、次の 3 DB でブラウザと結果が一致しない。
実測で原因を特定してあり、内容は [`tests/node/parity-exceptions.ts`](../tests/node/parity-exceptions.ts)。

| DB | 症状 | エンジン側の不足 |
|---|---|---|
| `oracle` | `XPST0008: Unresolved variable reference: $crlf` で失敗 | トップレベル `xsl:variable` を解決できない |
| `sqlalchemy` | カラム区切りのカンマが落ちる | `apply-templates` 経由で `position()` / `last()` を正しく評価しない |
| `vfp9` | 1 文字の default が空にならない | `substring($s, 2, -1)` が空文字を返さない |

この 3 DB の DDL 回帰は **`npm run test:browser` だけが張っている**。
`npm test` だけで済ませないこと。

エンジン側の以下 2 点は [`tests/node/ddl.test.ts`](../tests/node/ddl.test.ts) の adapter で補正済み
（準拠した XML パーサ / text 出力の振る舞いを取り戻すだけの可逆な前後処理で、golden は歪めていない）。

- XML 1.0 の line-end normalization をしない（`db/vfp9/output.xsl` が CRLF のため CR が漏れる）
- `method="text"` でも `& < >` を XML エスケープする

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
