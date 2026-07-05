// Метаданные сборки Browser Agent. Отправляется в heartbeat / extension_build_loaded.
// Никаких чувствительных полей: без token, pairing_code, cookies, логинов и т.п.
import {
  AGENT_VERSION,
  AGENT_PROTOCOL_VERSION,
  ATI_SELECTOR_CONFIG_VERSION,
  BUILD_CHANNEL,
  BUILD_DATE,
  COMMIT_SHA,
} from "./version";

export interface BuildInfo {
  agent_version: string;
  protocol_version: string;
  selector_config_version: string;
  build_channel: string;
  build_date: string;
  commit_sha: string | null;
  browser_manifest_version: 3;
}

export const BUILD_INFO: BuildInfo = {
  agent_version: AGENT_VERSION,
  protocol_version: AGENT_PROTOCOL_VERSION,
  selector_config_version: ATI_SELECTOR_CONFIG_VERSION,
  build_channel: BUILD_CHANNEL,
  build_date: BUILD_DATE,
  commit_sha: COMMIT_SHA,
  browser_manifest_version: 3,
};

/** Payload события extension_build_loaded — только безопасные поля. */
export function buildLoadedPayload(): Omit<BuildInfo, "commit_sha" | "browser_manifest_version"> {
  return {
    agent_version: AGENT_VERSION,
    protocol_version: AGENT_PROTOCOL_VERSION,
    selector_config_version: ATI_SELECTOR_CONFIG_VERSION,
    build_channel: BUILD_CHANNEL,
    build_date: BUILD_DATE,
  };
}
