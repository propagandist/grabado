# grabado の配布イメージ（HANDOVER §2 / 段階2-1）。**契約は docs/ARCHITECTURE.md §9。**
#
#   docker build -t grabado .
#   docker run --rm -p 8080:8080 -v "$PWD/schema:/data/schema" grabado
#
# **compose で起こすなら compose.yaml**（mount と env の口はそこ。一覧は .env.example、
# 起動手順は README）。CSP と配信ヘッダは段階2-2。
#
# ★ 3 ステージ。**runtime に残るのは jar 1 本だけ**で、Node も Gradle も JDK も入らない。
#
# ★ ベースは digest でピンする（org security-baseline §5.1）—— タグだけでは、同じ Dockerfile
#   から違うものが入る。**末尾コメントの版表記を消さないこと**：Dependabot が digest と一緒に
#   書き換える対象で、消すとどの版か読めなくなる（.github/workflows/*.yml の action ピンと
#   同じ書式）。**ピンは Dependabot とセットで初めて安全**で、凍結したまま放置すると
#   セキュリティ修正が降りてこないぶん浮動タグより悪い（.github/dependabot.yml の docker entry）。
#
# ★ **レジストリへは publish しない**（段階2-0 の決めたこと 5）。イメージは各自が build する。


# ---------------------------------------------------------------------------
# 1) web —— フロントを束ねる（vite build -> /web/frontend/dist。root は frontend/。段階2-6）
#
# ★ 版は ci-frontend.yml の `node-version: 24` に揃える。**CI と違うもので配布物を作らない。**
#   **揃っていることは tests/node/toolchain.test.ts が見る**（issue #134）——
#   2026-08-30 まで**この一文しか無く**、Dependabot が片側だけ動かしても全ジョブ緑だった。
#   版そのものを上げる判断は docs/HANDOVER.md §2.2（着手時に**最新 LTS** 確認）。
# ---------------------------------------------------------------------------
FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS web

WORKDIR /web

# 依存の取得だけを先の層に置く。**package*.json が動かない限り再取得しない。**
COPY package.json package-lock.json ./
RUN npm ci

# 残りはビルドの入力そのもの。**何が入るかは .dockerignore の許可リストが唯一の正**
# ——ここに COPY を並べると、配るものの正本が 2 か所になる。
#
# ★ 段階2-6 でフロントの実体は frontend/ へ移った。**vite の root が frontend/ なので、
#   出力は /web/frontend/dist**（下の api ステージの COPY と対）。**cwd は /web のまま**で、
#   package.json も vite.config.ts も root に居るので、この 2 行は動いていない。
COPY . .
RUN npm run build


# ---------------------------------------------------------------------------
# 2) api —— jar を作る（bootJar -> grabado.jar）
#
# ★ **dist を static へ入れるのはこの COPY で、Gradle タスクにしない**（段階2-0 の決めたこと 2）
#   ——タスクにすると手元の `./gradlew bootJar` が Node のビルドを要求し、開発時の 2 プロセスと
#   `npm run test:server` が壊れる。代償として**手元の jar に static は入らない**ので、
#   **イメージの検証はイメージでやる**（2-4）。
#
# ★ temurin の版は **server/build.gradle.kts の `jvmToolchain` が正本**（実際にコンパイルする
#   のがそこだから）。**このステージと下の runtime、そして ci-server.yml の `java-version` が
#   その写し**で、**揃っていることは tests/node/toolchain.test.ts が見る**（issue #134）。
# ---------------------------------------------------------------------------
FROM eclipse-temurin:25-jdk-alpine@sha256:09349d79941fd53bb3d487b393ca118d8853c08c09193f416fe6a8718df9e732 AS api

WORKDIR /src

# wrapper が落とす Gradle 配布物は distributionSha256Sum が固定している
# （server/gradle/wrapper/gradle-wrapper.properties）—— **取りに行くものはハッシュで縛る。**
COPY server/ ./
COPY --from=web /web/frontend/dist ./src/main/resources/static

# ★ `sh ./gradlew` と書くのは、**実行ビットがホストの OS 次第**だから（Windows のチェック
#   アウトでは落ちる）。同じ Dockerfile がどこでビルドされても同じように動く形にする。
# ★ `--no-daemon`: 1 回しかビルドしないコンテナで daemon を残す意味が無い。
RUN sh ./gradlew bootJar --no-daemon


# ---------------------------------------------------------------------------
# 3) runtime —— jar だけを thin JRE で起こす（単一プロセスで static と API の両方を配る）
# ---------------------------------------------------------------------------
FROM eclipse-temurin:25-jre-alpine@sha256:3137541deb3cac6626b5d9a4a2187bc0d6a34312f858bd2c67dd01e732e6b682

# ★ 非 root で走らせる。`/data/schema` は **save が書く先**（正本は git 管理のファイル。
#   CLAUDE.md 制約2）なので、先に作って所有権を渡す。
#
# ★ **降りる先は起動時に決める**（issue #103）。bind mount は**ホスト側の所有権をそのまま
#   通す**ので、固定の uid で走ると Linux ホストで 2 方向に壊れる（書けない／書いたものを
#   ホストが読めない）。`docker-entrypoint.sh` が mount 先の所有者を見て su-exec で降りる
#   —— **理由と分岐はそのファイルの冒頭**。
#
# ★ **su-exec は「runtime に残るのは jar 1 本だけ」を崩す唯一の例外**（静的バイナリ 1 本）。
#   段階2-1 の原則を曲げてまで入れたのは、**利用者が `docker compose up` 以外に何もしなくて
#   よい**形が #103 の目指す状態だったから。
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# ★ `chmod +x` をイメージ側で立てるのは、**実行ビットがホストの OS 次第**だから ——
#   Windows のチェックアウトでは立たず、`COPY` はホストのモードをそのまま持ち込むので
#   **`exec: permission denied` で起動に失敗する**（2026-08-27 に CI で踏んだ）。
#   上の api ステージが `sh ./gradlew` と書いているのと**同じ理由・同じ対処**である。
RUN addgroup -S grabado && adduser -S -G grabado grabado \
 && mkdir -p /data/schema && chown grabado:grabado /data/schema \
 && apk add --no-cache su-exec \
 && chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app

# 名前は build.gradle.kts の archiveFileName が固定している（**ワイルドカードにしない**）。
COPY --from=api /src/build/libs/grabado.jar ./grabado.jar

EXPOSE 8080

# ★ **`USER grabado` は置かない**（issue #103）。entrypoint が mount 先の所有者を読むために
#   root で始まり、**アプリは必ず su-exec で降りた先で動く**。root のまま走ることは無い。
#
# exec 形式で su-exec も exec するので、**PID 1 は java** になり SIGTERM が直接届く
# （Spring Boot の graceful shutdown が効く）。
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["java", "-jar", "/app/grabado.jar"]
