package io.propagandist.grabado.api

/**
 * このデプロイで何ができるか（段階5-5）。
 *
 * フロントは起動時に 1 回引き、**できないことのボタンを隠す** —— 403 を押してから知るのでは
 * なく、押せなくする。公開デモ（`READONLY=true`）で「保存」を押せてしまうのは、
 * できることの説明として不正確。
 *
 * ★ **引けなければフロントは「全部できる」に倒す。** `npm run dev` 単体（backend を
 *   起こしていない）のとき、5-5 以前と同じ画面になるのが正しい —— capabilities を引けない
 *   ことは「機能が無い」ではなく「サーバがいない」で、そのときボタンを隠しても何も改善しない。
 *
 * プロパティの順序が JSON のキー順になる（Jackson の既定）。契約表がバイト列で
 * 突き合わせるので、**並べ替えると赤くなる**。
 *
 * @property readonly 保存が 403 になる（段階5-3）
 * @property introspection `?action=import` が使える。**段階5-7 まで常に false**
 * @property ai AI proxy が使える（段階11-2a から実際の状態）。**キー設定済み ∧ モデル設定済み
 *   ∧ 実装がある ∧ `!READONLY`** —— **11-2b で `AnthropicSuggestionSource` が main に入った**ので、
 *   **env 次第で true になる**（11-2a の時点では実装が無く、常に false だった）
 */
data class Capabilities(
    val readonly: Boolean,
    val introspection: Boolean,
    val ai: Boolean,
)
