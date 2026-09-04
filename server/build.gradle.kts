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

group = "io.propagandist.grabado"
version = "0.2.0"

kotlin {
    // ランタイムは eclipse-temurin:25-jre-alpine（段階2-1 の Dockerfile）。開発機の JDK が
    // 何であれ出力を 25 に固定する＝ビルドを決定論的にする（CLAUDE.md 制約3 の精神をビルドにも
    // 効かせる）。**手元・CI・イメージの 3 つを同じ版に揃える** —— イメージだけ動かすと、
    // 同じソースから 3 種類のビルドが出る。
    //
    // ★ **foojay-resolver は入れない。** JDK が無い環境では Gradle が落ちる（auto-download は
    //   有効だが、解決プラグインが無いので実際には落とせない）—— **ビルド時に外部から取得する
    //   ものを増やさない**ため（org security-baseline §5.1）。手元に JDK 25 が要る。
    jvmToolchain(25)
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

    // AI proxy（段階11-2b）。**外部ホストへ出る唯一の依存**で、org security-baseline §5.2
    // （AI を組み込むとき）が分類にかかわらず掛かる。HTTP を直接組まないのは、
    // structured outputs のスキーマ強制・prompt caching・エラーの型が SDK 側で保たれるため。
    implementation(libs.anthropic)

    // JUnit 5 + MockMvc + AssertJ。モックライブラリは足さない
    // （store は @TempDir で実 FS を使う。in-memory の double はテストを空虚にする）。
    testImplementation(libs.spring.boot.starter.test)

    // ★ BOM が決める版への唯一の例外（2026-09-04。#105）。理由と外す条件は
    //   libs.versions.toml の tomcat の注記。**Boot 4.1.1 の BOM が指す tomcat 11.0.24 に
    //   critical 3 件**（CVE-2026-68525 / -65905 / -65182）があり、**安定版の Boot に
    //   11.0.25 を指すものが無い**。
    //
    //   ★ **dependencies ではなく constraints にする** —— 依存を足すのではなく版だけを
    //     引き上げるので、starter-web が引く 3 本に効き、**Boot の BOM が 11.0.25 以上を
    //     指した日に BOM 側が高くなって、この constraint は何もしなくなる**
    //     （消し忘れても、古い版へ引き戻す側には働かない）。
    constraints {
        implementation(libs.tomcat.embed.core)
        implementation(libs.tomcat.embed.el)
        implementation(libs.tomcat.embed.websocket)
    }
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

/*
 * jar を起こす java の絶対パスを書き出す。読むのは `playwright.server.config.ts`
 * （`npm run test:server` → `scripts/build-server.mjs` → `bootJar` → ここ、の順）。
 *
 * ★ **PATH の java を当てにしない。** 段階2-1 で jvmToolchain を 25 に上げたとき、
 *   JAVA_HOME が 21 のままの開発機では `java -jar` が UnsupportedClassVersionError
 *   （class file version 69.0 に対して 65.0 まで）で落ちた —— **Gradle は toolchain を
 *   自分で見つけるのに、E2E だけ PATH に頼る**のが非対称だった。ビルドに使った launcher を
 *   そのまま渡せば、開発機の JAVA_HOME が何であれ jar が起きる。
 */
val writeJavaLauncher =
    tasks.register("writeJavaLauncher") {
        val launcher = javaToolchains.launcherFor(java.toolchain)
        val target = layout.buildDirectory.file("java-launcher.txt")
        outputs.file(target)
        doLast {
            target.get().asFile.writeText(launcher.get().executablePath.asFile.absolutePath)
        }
    }

tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
    // Dockerfile の COPY をワイルドカードにしないため名前を固定する（HANDOVER §2.2）。
    archiveFileName = "grabado.jar"
    finalizedBy(writeJavaLauncher)
}
