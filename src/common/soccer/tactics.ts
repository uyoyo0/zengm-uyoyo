import type { SoccerTactics } from "../types.ts";

export const DEFAULT_SOCCER_TACTICS: SoccerTactics = {
	formation: "4-3-3",
	starting: [],
	bench: [],
	duties: {},
	mentality: 0,
	tempo: 0,
	pressing: 0,
	defensiveLine: 0,
	width: 0,
	directness: 0,
	transition: 0,
	marking: 0,
	substitutionTiming: 0,
};

export const normalizeSoccerTactics = (
	tactics: Partial<SoccerTactics> | undefined,
): SoccerTactics => ({
	...DEFAULT_SOCCER_TACTICS,
	...tactics,
	starting: tactics?.starting ?? [],
	bench: tactics?.bench ?? [],
	duties: tactics?.duties ?? {},
});

export const getDefaultSoccerDuty = (
	pos: string,
): SoccerTactics["duties"][number] => {
	if (["GK", "CB", "LB", "RB", "DM"].includes(pos)) {return "defend";}
	if (["AM", "LW", "RW", "ST"].includes(pos)) {return "attack";}
	return "support";
};

export const SOCCER_TACTICAL_PRESETS = {
	balanced: {
		name: "Balanced",
		values: {},
	},
	possession: {
		name: "Possession",
		values: {
			tempo: -1,
			pressing: 1,
			defensiveLine: 1,
			width: 1,
			directness: -2,
			transition: -1,
		},
	},
	gegenpress: {
		name: "Gegenpress",
		values: {
			mentality: 1,
			tempo: 2,
			pressing: 2,
			defensiveLine: 2,
			transition: 1,
			marking: 1,
			substitutionTiming: -1,
		},
	},
	counter: {
		name: "Counter attack",
		values: {
			mentality: -1,
			tempo: 1,
			pressing: -1,
			defensiveLine: -1,
			width: 1,
			directness: 2,
			transition: 2,
		},
	},
	lowBlock: {
		name: "Low block",
		values: {
			mentality: -2,
			tempo: -1,
			pressing: -2,
			defensiveLine: -2,
			width: -1,
			directness: 1,
			transition: 1,
			substitutionTiming: 1,
		},
	},
	attacking: {
		name: "All-out attack",
		values: {
			mentality: 2,
			tempo: 2,
			pressing: 1,
			defensiveLine: 1,
			width: 2,
			directness: 1,
			transition: 2,
			substitutionTiming: -1,
		},
	},
} as const satisfies Record<
	string,
	{ name: string; values: Partial<SoccerTactics> }
>;
