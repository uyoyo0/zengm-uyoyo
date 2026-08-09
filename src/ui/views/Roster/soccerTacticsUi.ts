import type { SoccerFormation } from "../../../common/types.ts";

export const formationRows: Record<SoccerFormation, number[][]> = {
	"4-3-3": [[8, 9, 10], [5, 7, 6], [1, 2, 3, 4], [0]],
	"4-2-3-1": [[10], [7, 8, 9], [5, 6], [1, 2, 3, 4], [0]],
	"4-4-2": [[9, 10], [5, 6, 7, 8], [1, 2, 3, 4], [0]],
	"3-5-2": [[9, 10], [4, 5, 6, 7, 8], [1, 2, 3], [0]],
	"3-4-3": [[8, 9, 10], [4, 5, 6, 7], [1, 2, 3], [0]],
};

export const dialLabels = {
	mentality: ["Defensive", "Cautious", "Balanced", "Positive", "Attacking"],
	tempo: ["Very slow", "Patient", "Balanced", "Quick", "Very quick"],
	pressing: ["Low block", "Conservative", "Balanced", "Active", "Relentless"],
	defensiveLine: ["Very deep", "Deep", "Balanced", "High", "Very high"],
	width: ["Very narrow", "Narrow", "Balanced", "Wide", "Very wide"],
	directness: ["Short", "Patient", "Balanced", "Direct", "Very direct"],
	transition: [
		"Hold shape",
		"Controlled",
		"Balanced",
		"Counter",
		"Fast counter",
	],
	marking: ["Zonal", "Compact", "Balanced", "Close", "Tight"],
} as const;

export const dialNames = {
	mentality: "Mentality",
	tempo: "Tempo",
	pressing: "Pressing",
	defensiveLine: "Defensive line",
	width: "Width",
	directness: "Passing",
	transition: "Transition",
	marking: "Marking",
} as const;

export const dials = Object.keys(dialLabels) as (keyof typeof dialLabels)[];
