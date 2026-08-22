package dev.grabado.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.nio.file.Path

/**
 * grabado backend の設定。
 *
 * data class にしているのは**テストのため**。`GrabadoProperties(tempDir)` と書けば
 * Spring 文脈を 1 ミリも起動せずに [dev.grabado.design.FileDesignStore] を組める。
 * `System.getenv` の直読みだと JVM 内で値を差し替えられず、`@Value` だとフィールドに
 * 散って結局 Spring の起動を要求する。
 *
 * @property schemaDir 正本ディレクトリ。git 管理の設計 JSON が置かれ、save は
 *   ここへ write-through する（CLAUDE.md 制約2）。既定 `/data/schema` は
 *   コンテナの mount 先（HANDOVER §2.1）。
 */
@ConfigurationProperties("grabado")
data class GrabadoProperties(
    val schemaDir: Path,
)
