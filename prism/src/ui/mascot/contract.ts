// CoForge's mascot vocabulary, copied for PiResearch: which mascots exist, where their still
// pictures live, and the Rive contract every artboard shares.

export const MASCOT_IDS = ["blue", "orange", "pink", "green", "purple", "black", "yellow"] as const;
export type MascotId = (typeof MASCOT_IDS)[number];

const STATIC_VERSION = 4;
// The Prism bundle is served under a base ("/prism/"), so the pictures move with it.
const PICTURE_DIR = `${import.meta.env.BASE_URL}agent-avatars/`;

export function mascotStaticUrl(id: MascotId): string {
  return `${PICTURE_DIR}mascot-${id}-${STATIC_VERSION}.webp`;
}

export const MASCOT_ACTIVITIES = ["idle", "thinking", "working", "error", "offline"] as const;
export type MascotActivity = (typeof MASCOT_ACTIVITIES)[number];

export const MASCOT_RIVE = {
  stateMachine: "State Machine 1",
  viewModel: "Mascot",
  activityProperty: "activity",
  hoveredProperty: "hovered",
  lookXProperty: "lookX",
  lookYProperty: "lookY",
} as const;

const RIV_VERSION = 6;

export function mascotRivUrl(): string {
  return `${PICTURE_DIR}mascots-${RIV_VERSION}.riv`;
}

export function mascotArtboard(id: MascotId): string {
  return `mascot-${id}`;
}

/** A stable mascot per agent name: FNV-1a over the id, modulo the pool. */
export function mascotOf(agentId: string): MascotId {
  let hash = 0x811c9dc5;
  for (let index = 0; index < agentId.length; index += 1) {
    hash ^= agentId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return MASCOT_IDS[Math.abs(hash) % MASCOT_IDS.length]!;
}
