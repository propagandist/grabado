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
 * @property readonly 副作用（保存・introspection・AI）を止める。**公開デモは `true` 一択** ——
 *   AI は API 費用が自社負担、introspection は SSRF の踏み台になるため。
 *   落ちるのはその 3 つだけで、`list` / `load` は生きている（読み取りビューア）。
 *   編集ストアはブラウザ内なので、READONLY でも「読んで・描いて・DDL を出す」体験は
 *   完全に提供できる。
 */
@ConfigurationProperties("grabado")
data class GrabadoProperties(
    val schemaDir: Path,
    val readonly: Boolean = false,
)
