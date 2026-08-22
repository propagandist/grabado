package dev.grabado.design

/**
 * 保存だけを止める delegate（段階5-3）。
 *
 * ## なぜフィルタでも各ハンドラの `if` でもなく、Bean の差し替えなのか
 *
 * **禁止を「禁止したいもの」の直上に置くため。** 副作用を持つのは [DesignStore.save] だけなので、
 * ここで塞げば **将来 `?action=rename` のような経路が増えても自動的に守られる**。
 * フィルタ方式や各ハンドラの `if` は「守るべき経路の一覧」を人が維持することになり、
 * CLAUDE.md 制約6（READONLY 時は副作用を無効化）を人力に依存させる。
 *
 * 副産物として、**HTTP を 1 バイトも通さずにテストできる**。
 *
 * @see dev.grabado.config.StoreConfiguration 差し替えの場所
 */
class ReadOnlyDesignStore(private val delegate: DesignStore) : DesignStore {

    override fun list(): List<String> = delegate.list()

    override fun load(name: DesignName): Stored? = delegate.load(name)

    override fun save(
        name: DesignName,
        bytes: ByteArray,
        ifMatch: String?,
        ifNoneMatch: String?,
    ): Nothing = throw ReadOnlyException()
}

/**
 * このデプロイでは副作用が禁止されている。[dev.grabado.api.ApiExceptionHandler] が **403** に写す。
 *
 * 501（実装が無い）でも 503（一時的に不能）でもなく 403 を選んだのは、**501 に寄せると
 * 「READONLY だから save できない」と「サーバが壊れている」が同じ画面になる**から
 * （`js/io.ts` の `check()` はどちらも `http501` の文言を出す）。意味を曲げて locale の
 * 1 キーをケチる取引は、公開 API として割に合わない。
 */
class ReadOnlyException : RuntimeException("このデプロイでは副作用が禁止されている（grabado.readonly）")
