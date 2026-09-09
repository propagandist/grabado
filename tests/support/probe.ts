/*
 * 規模の実測に使う計装（#206）。
 *
 * ★★ **アプリに計装用の面を足さない。** 数えるのは (1) レイアウトを強制する読み出し、
 *   (2) 描画メソッドの呼び出し回数の 2 つで、どちらも**生きている実体から
 *   プロトタイプを辿って**包む。出荷コードは 1 行も変わらず、バンドルの diff にも出ない
 *   （tests/node/app-entry.ts の冒頭が書いている「テストのための面はテストが持つ」の規律）。
 *
 * ★★ **自己完結関数であること。** module スコープの束縛を一切参照しない（ヘルパーはすべて
 *   内側）。page 側は関数を**ソース文字列として注入**するため:
 *
 *       await page.evaluate(`(${installScaleProbe})(window, sample)`)
 *
 *   Node 側は jsdom の window をそのまま渡す。**採取ロジックの正本が 1 本**に保たれ、
 *   2 実行系のずれがそのまま情報になる（tests/support/state.ts と同じ形）。
 *
 * ★ **戻り値に関数を含めない。** page.evaluate はシリアライズできる値しか返せないので、
 *   状態は `window.__scaleProbe` に置き、読み書きを 3 つの関数に分ける。
 */

/** 数えるものの名前。増やすときはここと installScaleProbe の両方を触る */
export interface ScaleCounts {
    /** レイアウトを強制する読み出し（HTMLElement の 4 つの accessor） */
    offsetWidth: number;
    offsetHeight: number;
    offsetTop: number;
    offsetLeft: number;
    /** 描画メソッドの呼び出し */
    rowRedraw: number;
    rowUpdate: number;
    tableRedraw: number;
    relationRedraw: number;
}

/** installScaleProbe に渡す「生きている実体」。ここからプロトタイプを辿る */
export interface ProbeSample {
    table: unknown;
    row: unknown;
    relation: unknown;
}

/**
 * 計装を仕掛ける。**二重に仕掛けない**（既にあれば何もしない）。
 *
 * 包んだものは元に戻さない —— このページ / この jsdom は計測専用で、戻す必要が無い。
 * 戻す口を持つと「戻し忘れたまま次のテストが走る」経路が増えるだけ。
 */
export function installScaleProbe(win: unknown, sample: ProbeSample): void {
    const w = win as Record<string, unknown> & {
        HTMLElement: { prototype: object };
    };
    if (w["__scaleProbe"]) {
        return;
    }

    const counts: Record<string, number> = {
        offsetWidth: 0,
        offsetHeight: 0,
        offsetTop: 0,
        offsetLeft: 0,
        rowRedraw: 0,
        rowUpdate: 0,
        tableRedraw: 0,
        relationRedraw: 0,
    };
    w["__scaleProbe"] = { counts };

    /*
     * offsetWidth / offsetHeight / offsetTop / offsetLeft は configurable な accessor
     * （実ブラウザでも jsdom でも）。**値ではなく回数**を数えるので、元の getter は
     * そのまま呼んで返す。
     */
    const layoutProps = ["offsetWidth", "offsetHeight", "offsetTop", "offsetLeft"];
    for (let i = 0; i < layoutProps.length; i++) {
        const name = layoutProps[i]!;
        const proto = w.HTMLElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, name);
        if (!desc || typeof desc.get !== "function" || !desc.configurable) {
            continue;
        }
        const original = desc.get;
        Object.defineProperty(proto, name, {
            configurable: true,
            enumerable: desc.enumerable,
            get: function (this: unknown): unknown {
                counts[name]!++;
                return original.call(this);
            },
            set: desc.set,
        });
    }

    const wrapMethod = (instance: unknown, method: string, key: string): void => {
        if (!instance) {
            return;
        }
        const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
        const original = proto[method];
        if (typeof original !== "function") {
            return;
        }
        const fn = original as (...args: unknown[]) => unknown;
        proto[method] = function (this: unknown, ...args: unknown[]): unknown {
            counts[key]!++;
            return fn.apply(this, args);
        };
    };

    wrapMethod(sample.row, "redraw", "rowRedraw");
    wrapMethod(sample.row, "update", "rowUpdate");
    wrapMethod(sample.table, "redraw", "tableRedraw");
    wrapMethod(sample.relation, "redraw", "relationRedraw");
}

/** 現在のカウンタ。プレーンなオブジェクトなので page.evaluate から返せる */
export function readScaleProbe(win: unknown): ScaleCounts {
    const probe = (win as Record<string, unknown>)["__scaleProbe"] as
        | { counts: Record<string, number> }
        | undefined;
    if (!probe) {
        throw new Error("installScaleProbe を先に呼ぶこと");
    }
    const c = probe.counts;
    return {
        offsetWidth: c["offsetWidth"]!,
        offsetHeight: c["offsetHeight"]!,
        offsetTop: c["offsetTop"]!,
        offsetLeft: c["offsetLeft"]!,
        rowRedraw: c["rowRedraw"]!,
        rowUpdate: c["rowUpdate"]!,
        tableRedraw: c["tableRedraw"]!,
        relationRedraw: c["relationRedraw"]!,
    };
}

/** カウンタを 0 に戻す。包んだものはそのまま（測る区間の前後で呼ぶ） */
export function resetScaleProbe(win: unknown): void {
    const probe = (win as Record<string, unknown>)["__scaleProbe"] as
        | { counts: Record<string, number> }
        | undefined;
    if (!probe) {
        throw new Error("installScaleProbe を先に呼ぶこと");
    }
    const keys = Object.keys(probe.counts);
    for (let i = 0; i < keys.length; i++) {
        probe.counts[keys[i]!] = 0;
    }
}
