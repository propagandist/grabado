# 規模の実測（issue #206）

10 / 50 / 100 / 300 テーブルの合成設計を実ブラウザに通し、**費用を数で記録する**。

```bash
npm run test:scale                                   # 3 本とも
npx playwright test --project=scale tests/scale/load.spec.ts   # 1 本だけ
SCALE_DUMP=1 npm run test:scale                      # 合成設計を test-results/scale/ に落とす
```

**`npm test` にも `npm run test:browser` にも入らない。** 前者は所要が伸びるから、後者は
`ci-frontend.yml` が回すので**300 テーブルの実測が全 PR に載る**から（`golden:update` も同じ
project 指定なので、golden の再生成にも巻き込まれる）。

**CI に乗るのは [`../node/scale.test.ts`](../node/scale.test.ts) のほう** —— jsdom で
10 / 50 / 100 の 3 点を測り、**カウンタが 1 次式に乗ることを回帰から守る**。増分は
`npm test` の実行時間に出ない（並列で走る）。

## 何を数えているか

| 数えるもの | どうやって |
|---|---|
| レイアウトを強制する読み出し | `HTMLElement.prototype` の `offsetWidth` / `offsetHeight` / `offsetTop` / `offsetLeft` は configurable な accessor。**値ではなく回数**を数える |
| 描画メソッドの呼び出し | 生きている実体から `Object.getPrototypeOf` で辿って包む |
| 実際に走ったレイアウト | Chromium の CDP（`Performance.getMetrics` の `LayoutCount` / `RecalcStyleCount`） |
| DOM ノード数 | 読込後 |

**アプリのコードは 1 行も触らない。** 計装は [`../support/probe.ts`](../support/probe.ts) が持ち、
`page.evaluate` へ**ソース文字列として注入**する（[`../support/state.ts`](../support/state.ts) と
同じ形。正本は 1 本で、Node と実ブラウザの両方が同じ関数を使う）。

## 何を判定していて、何を判定していないか

**判定する（赤くなる）**

- 読み出し回数が jsdom 側と一致すること —— **2 実行系が同じ経路を通っている証拠**
- 実際に走ったレイアウトが、読み出し回数を超えないこと
- 書き出しが往復でバイト一致すること
- FK の型伝播の段数

**判定しない（記録するだけ）**

- **実時間** —— 共有ランナーが不安定で、計装自体が歪める
- **`LayoutCount` / `RecalcStyleCount`** —— Chromium の版で動く

**数の正本は [`../../CUSTOMIZATIONS.md`](../../CUSTOMIZATIONS.md)**（測った日と機械つき）。
ここは同じ数をもう一度書かない。

## 合成設計の形

[`../support/synthetic.ts`](../support/synthetic.ts)。**乱数を使わず添字の算術だけ**で決まる。

- 1 テーブル 9 列（PK ／ 監査列 2 ／ 本体 5 ／ FK 1）。先頭だけ FK が無く 8 列
- 関係は N-1 本。`t(i).parent_id` が `t(i-1).id` を指す
- 座標は 10 列の格子

**★ グラフとしては「深さ 1 の連なり」で、1 本鎖ではない** —— `t1.parent_id` を指すものが
無いので、**FK の型伝播はどの N でも 2 段で止まる**。深い鎖を測るには別の形が要る。

**★ 生成物はコミットしない。** `SCALE_DUMP=1` のときだけ `test-results/`（gitignore 済み）へ
落ちる。既定で 1 バイトも書かない —— CI の最終ステップが `git diff --exit-code` を回す。

## 実ブラウザでしか測れないもの

| | 理由 |
|---|---|
| `LayoutCount` | jsdom はレイアウトしない。**読み出し回数は同じでも、そのうち何回が実際に高くついたかが分からない** |
| `alignTables()` | 折り返しが `offsetWidth` に依存する（jsdom は常に 0） |
| 実時間 | jsdom の所要はブラウザの所要と桁が違う |

**この分担は [`../../docs/TESTING.md`](../../docs/TESTING.md) の「なぜ 2 系統あるのか」と同じ形**で、
新しい規律を作っていない。

## 注意

**`Relation._counter` はページ生涯で単調増加する static。** 同じページで複数の段を回すので、
**relation の色は段ごとに変わる**（[`../support/state.ts`](../support/state.ts) が golden から
色を除外している理由と同じ）。ここは色を見ないので影響しない。
