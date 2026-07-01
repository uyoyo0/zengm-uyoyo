import type { LineupStat as LineupStatBasketball } from "./types.basketball.ts";

export const emptyLineupStats = (): LineupStatBasketball => ({
	min: 0,
	poss: 0,
	oppPoss: 0,
	pts: 0,
	oppPts: 0,
	fg: 0,
	fga: 0,
	tp: 0,
	tpa: 0,
	ft: 0,
	fta: 0,
	orb: 0,
	drb: 0,
	tov: 0,
	ast: 0,
	stl: 0,
	blk: 0,
	pf: 0,
});

export const addLineupStats = (
	target: LineupStatBasketball,
	source: LineupStatBasketball,
) => {
	for (const key of Object.keys(target) as (keyof LineupStatBasketball)[]) {
		target[key] += source[key];
	}
};

// Derived per-100-possession ratings and shooting splits, using the same
// definitions as advStats.basketball.ts so they reconcile with team stats.
export const deriveLineupStats = (s: LineupStatBasketball) => {
	const tsa = s.fga + 0.44 * s.fta;
	return {
		ortg: s.poss > 0 ? (100 * s.pts) / s.poss : 0,
		drtg: s.oppPoss > 0 ? (100 * s.oppPts) / s.oppPoss : 0,
		net:
			(s.poss > 0 ? (100 * s.pts) / s.poss : 0) -
			(s.oppPoss > 0 ? (100 * s.oppPts) / s.oppPoss : 0),
		efg: s.fga > 0 ? (100 * (s.fg + 0.5 * s.tp)) / s.fga : 0,
		tsp: tsa > 0 ? (100 * s.pts) / (2 * tsa) : 0,
		tovp: tsa + s.tov > 0 ? (100 * s.tov) / (tsa + s.tov) : 0,
		// Possessions per 48 minutes (avg of the unit's offensive and defensive
		// possessions), so pace is comparable to the team pace stat.
		pace: s.min > 0 ? (48 * ((s.poss + s.oppPoss) / 2)) / s.min : 0,
	};
};

export type OnOffState = {
	onPids: number[]; // which of the selected pids are on the floor in this state
	countOn: number;
	stats: LineupStatBasketball;
};

export const onOffStateKey = (onPids: number[]) =>
	[...onPids].sort((a, b) => a - b).join("-");

// Bucket every lineup row into one of the 2^N combination states of which
// selected players are on the floor, summing raw stats per state. Every team
// second belongs to exactly one lineup row, so the states exhaustively
// partition team minutes. All 2^N states are seeded even if never observed,
// so callers can render a complete grid.
export const aggregateOnOff = (
	lineups: { pids: number[]; stats: LineupStatBasketball }[],
	selectedPids: number[],
): Map<string, OnOffState> => {
	const states = new Map<string, OnOffState>();

	const numStates = 2 ** selectedPids.length;
	for (let mask = 0; mask < numStates; mask++) {
		const onPids = selectedPids.filter((_, i) => mask & (1 << i));
		states.set(onOffStateKey(onPids), {
			onPids,
			countOn: onPids.length,
			stats: emptyLineupStats(),
		});
	}

	for (const l of lineups) {
		const onPids = selectedPids.filter((pid) => l.pids.includes(pid));
		const state = states.get(onOffStateKey(onPids))!;
		addLineupStats(state.stats, l.stats);
	}

	return states;
};
