package io.propagandist.grabado.config

import io.propagandist.grabado.design.DesignStore
import io.propagandist.grabado.design.FileDesignStore
import io.propagandist.grabado.design.ReadOnlyDesignStore
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * [DesignStore] の組み立て（段階5-3）。
 *
 * `grabado.readonly` が真なら [ReadOnlyDesignStore] で包む。**READONLY の実現がここ 1 か所に
 * 閉じている**ので、コントローラは「保存できるかどうか」を知らないままでいられる。
 *
 * ★ **正本ディレクトリが無いデプロイ（§9.7 の公開デモ）でも、ここの組み立ては変わらない**
 *   （issue #286）。「**無くてもよい**」の判定は [FileDesignStore] が持つ —— ここで
 *   `Files.notExists` を見て別の store に差し替えると、**あちらの起動時 fail-fast を
 *   別のファイルが黙って無効にする**形になり、**#202 と同じ病**になる。
 *   ここが閉じているのは「**禁止**（save を止めること）」であって、起動の条件ではない。
 */
@Configuration
class StoreConfiguration {

    @Bean
    fun designStore(properties: GrabadoProperties): DesignStore {
        val store = FileDesignStore(properties)
        return if (properties.readonly) ReadOnlyDesignStore(store) else store
    }
}
