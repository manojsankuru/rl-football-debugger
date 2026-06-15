// actions.ts — the GRF default discrete action set (19 actions) with metadata.
export type ActionCategory = "move" | "pass" | "shoot" | "tempo" | "release" | "idle";

export interface ActionDef {
  id: number;
  name: string;
  short: string;
  category: ActionCategory;
  /** One-line human explanation shown in the action panel. */
  help: string;
}

export const ACTIONS: ActionDef[] = [
  { id: 0, name: "idle", short: "—", category: "idle", help: "Do nothing this step; keep current sticky state." },
  { id: 1, name: "left", short: "←", category: "move", help: "Move toward your own goal (−x). Sets the left direction sticky." },
  { id: 2, name: "top_left", short: "↖", category: "move", help: "Move up-and-left. Sets the top-left sticky." },
  { id: 3, name: "top", short: "↑", category: "move", help: "Move up the screen (−y). Sets the top sticky." },
  { id: 4, name: "top_right", short: "↗", category: "move", help: "Move up-and-right toward the opponent goal." },
  { id: 5, name: "right", short: "→", category: "move", help: "Move toward the opponent goal (+x). The main attacking direction." },
  { id: 6, name: "bottom_right", short: "↘", category: "move", help: "Move down-and-right toward the opponent goal." },
  { id: 7, name: "bottom", short: "↓", category: "move", help: "Move down the screen (+y). Sets the bottom sticky." },
  { id: 8, name: "bottom_left", short: "↙", category: "move", help: "Move down-and-left toward your own goal." },
  { id: 9, name: "long_pass", short: "L⊳", category: "pass", help: "Drive a long ball to a far teammate; bypasses lines but riskier." },
  { id: 10, name: "high_pass", short: "H⊳", category: "pass", help: "Loft the ball over opponents to a teammate; beats a tight lane." },
  { id: 11, name: "short_pass", short: "S⊳", category: "pass", help: "Quick ground pass to the nearest open teammate; safest option." },
  { id: 12, name: "shot", short: "◎", category: "shoot", help: "Shoot at goal. Best with a small distance and a wide angle." },
  { id: 13, name: "sprint", short: "»", category: "tempo", help: "Hold sprint: faster but drains stamina. Sets the sprint sticky." },
  { id: 14, name: "release_direction", short: "↺d", category: "release", help: "Stop steering; clears all 8 directional stickies." },
  { id: 15, name: "release_sprint", short: "↺»", category: "release", help: "Stop sprinting; clears the sprint sticky to recover stamina." },
  { id: 16, name: "sliding", short: "⤞", category: "tempo", help: "Slide tackle to win the ball; effective but risks a foul/turnover." },
  { id: 17, name: "dribble", short: "~", category: "tempo", help: "Close-control dribble; keeps the ball under pressure. Sets dribble sticky." },
  { id: 18, name: "release_dribble", short: "↺~", category: "release", help: "Stop close dribbling; clears the dribble sticky." },
];

export const N_ACTIONS = ACTIONS.length; // 19
export const actionName = (id: number) => ACTIONS[id]?.name ?? `a${id}`;

export const CATEGORY_COLOR: Record<ActionCategory, string> = {
  move: "#3dd7c9",
  pass: "#7ee787",
  shoot: "#ffd166",
  tempo: "#c77dff",
  release: "#9fb0c0",
  idle: "#5d6f80",
};
