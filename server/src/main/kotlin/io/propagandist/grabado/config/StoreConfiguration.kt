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
 */
@Configuration
class StoreConfiguration {

    @Bean
    fun designStore(properties: GrabadoProperties): DesignStore {
        val store = FileDesignStore(properties)
        return if (properties.readonly) ReadOnlyDesignStore(store) else store
    }
}
