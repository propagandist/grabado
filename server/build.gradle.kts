/*
 * grabado backend（HANDOVER §5）。
 *
 * 段階5-1b は **実測契約（docs/ARCHITECTURE.md §4）をそのまま満たす**ところまで。
 * `.json` の強制・READONLY・ETag・URL の変更はいずれも後段（同 §7 の表）。
 *
 * ★ 依存は最小に保つ（org security-baseline の分類 B）。入れなかったものと理由:
 *   - spring-boot-starter-jdbc  … DB レス既定（CLAUDE.md 制約5）。HikariCP が classpath に
 *                                 無いので `spring.datasource.*` の auto-configuration が
 *                                 そもそも存在しない＝構造で保証される。JDBC は 5-7 で入る
 *   - spring-boot-starter-security … 認証も認可も無い（単一ユーザーのローカルコンテナ）。
 *                                 入れると全経路が 401 になり permitAll の列挙が判断対象に増える
 *   - spring-boot-starter-validation … keyword の検証は純関数で書きたい（アノテーション経由だと
 *                                 テストが Validator を要求して純度が落ちる）。規則は 5-2 で増える
 *   - jackson-module-kotlin     … いま JSON は書き出し方向しか無い（save の body は生バイト）。
 *                                 data class へのデシリアライズが要る日に足す
 */
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.spring.boot)
}

group = "dev.grabado"
version = "0.0.0"

kotlin {
    // ランタイムは eclipse-temurin:21-jre-alpine（HANDOVER §2.2）。開発機の JDK が何であれ
    // 出力を 21 に固定する＝ビルドを決定論的にする（CLAUDE.md 制約3 の精神をビルドにも効かせる）。
    jvmToolchain(21)
    compilerOptions {
        // フロントが strict + noUncheckedIndexedAccess なので、backend だけ緩いのは非対称。
        allWarningsAsErrors = true
    }
}

repositories {
    mavenCentral()
}

/*
 * ★ 依存ロック。org security-baseline §3.12 / §5.1 が、分類 B に対して
 *   「解決済みの依存グラフをどこにも持たない」を**崩れる変更**として名指ししている。
 *   Gradle は locking が既定 off で、gradle.lockfile が無いと trivy fs が未走査を返す。
 *   **CI の有無と無関係に必要**（手元で見るため）。
 *
 *   更新は `./gradlew dependencies --write-locks`。
 */
dependencyLocking {
    lockAllConfigurations()
}

dependencies {
    implementation(platform(libs.spring.boot.bom))
    implementation(libs.spring.boot.starter.web)
    // @ConfigurationProperties の constructor binding が要求する（libs.versions.toml の注記）。
    implementation(libs.kotlin.reflect)
    // introspection の唯一の JDBC ドライバ（段階5-7a）。版は Spring Boot の BOM が決める。
    // starter-jdbc は入れない —— HikariCP が来ると DB レス既定が構造で保証されなくなる。
    implementation(libs.postgresql)
    // MySQL / MariaDB（段階5-8a）。MariaDB はプロトコルとカタログが互換なので
    // このドライバ 1 本で両方に繋がる —— **ドライバを 2 本にしない**（イメージサイズと
    // CVE 面積が増えるだけ）。
    implementation(libs.mysql)
    // H2（段階5-8b）。**組み込みで動く**ので統合テストが Docker 無しで常に走る。
    // ★ H2 Console（Web UI）は使わない —— 過去の RCE（CVE-2021-42392 など）はすべて
    //   Console 経由で、JDBC ドライバとして使う限り到達しない。
    implementation(libs.h2)

    // JUnit 5 + MockMvc + AssertJ。モックライブラリは足さない
    // （store は @TempDir で実 FS を使う。in-memory の double はテストを空虚にする）。
    testImplementation(libs.spring.boot.starter.test)
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    // 契約表（tests/contract/backend-cases.json）は repo ルート側にある —— Kotlin と
    // TypeScript の**両方**が同じバイト列を読むので、server/ の中には置けない。
    systemProperty("grabado.repoRoot", rootDir.parentFile.absolutePath)
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
    // Dockerfile の COPY をワイルドカードにしないため名前を固定する（HANDOVER §2.2）。
    archiveFileName = "grabado.jar"
}
