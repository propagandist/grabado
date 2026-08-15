# tests/golden — 現行実装の実出力（house 仕様ではない）

このディレクトリの中身は **「2026-08-09 時点の現行 wwwsqldesigner が実際に吐いたバイト列」** であって、
**正しい出力でも、grabado が目指す house 仕様でもない**。

役割は 1 つだけ — HANDOVER §9 の移植（フロント TS 化 → IO の JSON 化 → 型パレット → backend）で
**意図しない挙動変化が起きたら赤くする**こと。CLAUDE.md の Hard Constraint 1 が言う安全網の実体。

```
ddl-input/<fixture>.xml  Designer.toXML() の出力＝output.xsl への入力（postgresql の型パレットで解決）
ddl/<db>/<fixture>.sql   db/<db>/output.xsl を適用した DDL。9 DB × 7 fixture
state/<fixture>.json     fromXML() 後のライブツリー＋DOM の状態（§4 段階4-1b で追加）
json/<fixture>.json      Designer.toJson() の出力（§4 段階4-2 で追加）
```

`json/` だけは他の 3 つと性格が違う。**現行実装の実出力ではなく、grabado が決めた新しい正本
フォーマット**（`formatVersion: 1`。仕様は [`../../docs/FORMAT.md`](../../docs/FORMAT.md)）で、
現行の癖のうち known-issues #2 / #3 / #4 / #5 は**意図的に持ち込んでいない**。
「この形が設計を過不足なく運べる」ことの根拠は golden ではなく、XML 経由と JSON 経由で
状態スナップショットが一致することを見る「情報保存」テストのほう。

`ddl-input/` と `ddl/` が押さえるのは**書き出しの結果**だけで、読み込みが撒く副作用
（選択クラス・型パレット由来の色・relation がどの実体に繋がったか・`clearTables()` の後始末）は
1 つも写らない。`state/` はその穴を埋める。採取項目と**意図的に採らないもの**（レイアウト由来の値と
relation の色）は [`../../docs/TESTING.md`](../../docs/TESTING.md) と
[`../support/state.ts`](../support/state.ts) にある。

## 生成元は実ブラウザだけ

すべて Chromium（本物の `XSLTProcessor` / `DOMParser` / 描画 DOM）で採取している。
更新は必ず `npm run golden:update`。Node 側（vitest）は**読むだけで書かない**。
理由と手順は [`../../docs/TESTING.md`](../../docs/TESTING.md)。

## この golden に写り込んでいる現行の癖

正常系の入力でも、現行実装の欠陥はそのまま出力に出る。golden を読むときはこれを踏まえること。
それぞれ [`../known-issues/`](../known-issues/) に独立したテストがあり、**移植で直せばそちらが赤くなる**。

- `UUID` が型パレットに無く `INTEGER` に落ちている（known-issues #4）
- `users` に PRIMARY と UNIQUE があるため制約名 `users_pkey` が 2 回出る（known-issues #6）
- `DEFAULT 'now()'` のように式が引用符で囲まれる（型の `quote` 属性をそのまま適用するため）
- nullable な行に `<default>NULL</default>` が生えている（known-issues #2。撤去は 4-5）

§4 段階4-4 で `<default>` の後だけ改行が無い癖（旧 known-issues #8）は消えた。

## 正規化しているもの

**無い。§4 段階4-4 以降、golden は 1 バイトも加工していない。**

4-4 までは `ddl-input/`（当時 `xml/`）の `<!-- Active URL: {{ACTIVE_URL}} -->` の 1 行だけを
正規化していた。現行 `toXML()` が `location.href` を埋め込んで出力が環境依存になるためで、
「§4 でこれを撤去した」ことが diff に現れるよう行ごとは消さずに残していた。
4-4 でその行と `<datatypes>` の全文埋め込みを撤去し、書き出し側の環境依存が 0 になったので、
[`../support/normalize.ts`](../support/normalize.ts) から正規化関数ごと落とした。

**改行コードを含めてバイト一致で比較する。**
