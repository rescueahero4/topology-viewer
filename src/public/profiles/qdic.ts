import type { TopologyProfile } from "../../../types/index";
import vocabulary from "../../contract/profile/qdic.json" with { type: "json" };
import sprite from "../../renderer/sprite.json" with { type: "json" };

export const qdicProfile: TopologyProfile = { vocabulary, sprite };
