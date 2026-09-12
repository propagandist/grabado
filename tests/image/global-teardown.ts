import { down } from "./compose.ts";
import { removeContainers } from "./docker-run.ts";

/*
 * コンテナもネットワークも残さない（段階2-4）。**mount 先（tests/tmp-image-schema/）は
 * 消さない** —— 落ちたときに「何が書かれたか」を見られるようにするため。次回の
 * globalSetup が作り直す。
 */
export default function globalTeardown(): void {
    down();
    /* compose の外で起こした公開デモの形（issue #286）。**compose では片付かない。** */
    removeContainers();
}
