import { DEFAULT_COACHING } from "../../../common/constants.ts";
import { COACHING } from "../../../common/coachingConstants.ts";
import { helpers } from "../../util/index.ts";
import { last } from "../../../common/utils.ts";
import type { Coach, Player, TeamCoaching } from "../../../common/types.ts";

const DIAL_KEYS = Object.keys(DEFAULT_COACHING) as (keyof TeamCoaching)[];

const round1 = (x: number) => Math.round(helpers.bound(x, -1, 1) * 10) / 10;

const avg = (xs: number[]) =>
	xs.length === 0 ? 50 : xs.reduce((a, b) => a + b, 0) / xs.length;

// The top ~8 players by value, as raw ratings objects.
const topRatings = (players: Player[]) =>
	[...players]
		.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
		.slice(0, 8)
		.map((p) => last(p.ratings) as any);

// Shared core: dials from a ratings accessor. Signals are centered on the
// average across the involved ratings, so they express comparative advantage
// ("we shoot better than we do anything else") rather than absolute rating
// level - otherwise below-average rosters/players get told to do less of
// everything, and every dial drifts negative league-wide.
const styleFromMeans = (m: (key: string) => number): TeamCoaching => {
	const tp = m("tp");
	const spd = m("spd");
	const dnk = m("dnk");
	const reb = m("reb");
	const hgt = m("hgt");
	const diq = m("diq");

	const ref = (tp + spd + dnk + reb + hgt + diq) / 6;
	const signal = (v: number, scale: number) =>
		helpers.bound(((v - ref) / 25) * scale, -1, 1);

	return {
		threePointTendency: round1(signal(tp, 0.8)),
		pace: round1(signal((spd + dnk) / 2, 0.8)),
		crashOffensiveGlass: round1(signal((reb + hgt) / 2, 0.6)),
		// Tall/high-IQ interior teams pack the paint; quick teams guard the
		// perimeter. Already relative (a within-roster difference).
		paintDefense: round1((((hgt + diq) / 2 - spd) / 25) * 0.8),
		defensiveAggression: round1(signal((diq + spd) / 2, 0.6)),
	};
};

// The style that best fits a roster's strengths, from the top ~8 players.
export const rosterOptimalStyle = (players: Player[]): TeamCoaching => {
	const top = topRatings(players);
	if (top.length === 0) {
		return { ...DEFAULT_COACHING };
	}
	return styleFromMeans((key) => avg(top.map((r) => r[key] ?? 50)));
};

// One player's preferred system: the same comparative-advantage signals,
// scoped to his own ratings, with shot-selection identity blended into the
// 3PT dial - a player who *shoots* threes wants a three-heavy system even
// more than one who merely can.
export const playerOptimalStyle = (ratings: {
	[key: string]: unknown;
}): TeamCoaching => {
	const style = styleFromMeans((key) => (ratings[key] as number) ?? 50);

	const tendencyThree = ratings.tendencyThree as number | undefined;
	if (tendencyThree !== undefined) {
		const tendencySignal = helpers.bound((tendencyThree - 50) / 50, -1, 1);
		style.threePointTendency = round1(
			0.6 * style.threePointTendency + 0.4 * tendencySignal,
		);
	}

	return style;
};

// How well a preferred style matches an actual one: 1 = identical dials,
// 0 = maximally opposed (dials are in [-1, 1]). Used both for coach-vs-roster
// (hiring) and player-vs-system (chemistry).
export const philosophyFit = (
	philosophy: TeamCoaching,
	target: TeamCoaching,
) => {
	const meanDist =
		DIAL_KEYS.reduce(
			(sum, key) => sum + Math.abs(philosophy[key] - target[key]),
			0,
		) / DIAL_KEYS.length;
	return 1 - meanDist / 2;
};

// Per-dial signed differences between a player's preferred style and the
// team's actual style, largest mismatch first. playerWants is the sign of
// (preferred - actual): +1 means the player wants more of that dial than the
// system gives. Drives the chemistry mismatch messages.
export const fitBreakdown = (
	preferred: TeamCoaching,
	actual: TeamCoaching,
): { dial: keyof TeamCoaching; playerWants: 1 | -1; magnitude: number }[] => {
	return DIAL_KEYS.map((dial) => {
		const diff = preferred[dial] - actual[dial];
		return {
			dial,
			playerWants: (diff >= 0 ? 1 : -1) as 1 | -1,
			magnitude: Math.abs(diff),
		};
	}).sort((a, b) => b.magnitude - a.magnitude);
};

// The season's effective style: blend the coach's philosophy with the roster-optimal
// style, weighted by how adaptable the coach is.
export const seasonStyle = (
	coach: Coach,
	rosterOptimal: TeamCoaching,
): TeamCoaching => {
	const a = helpers.bound(coach.ratings.adaptability / 100, 0, 1);
	const out = {} as TeamCoaching;
	for (const k of DIAL_KEYS) {
		out[k] = round1(coach.philosophy[k] * (1 - a) + rosterOptimal[k] * a);
	}
	return out;
};

export type OpponentProfile = {
	threeReliance: number;
	interiorReliance: number;
	ballHandling: number;
	defReb: number;
};

// A normalized [-1, 1] read on what the opponent does well, used for scouting.
// Centered on the opponent's own average (comparative strengths), matching
// rosterOptimalStyle - absolute centering biased every profile negative.
export const opponentProfile = (players: Player[]): OpponentProfile => {
	const top = topRatings(players);
	const m = (key: string) => avg(top.map((r) => r[key] ?? 50));

	const tp = m("tp");
	const ins = m("ins");
	const dnk = m("dnk");
	const hgt = m("hgt");
	const drb = m("drb");
	const pss = m("pss");
	const reb = m("reb");

	const ref = (tp + ins + dnk + hgt + drb + pss + reb) / 7;
	const signal = (v: number) => helpers.bound((v - ref) / 25, -1, 1);

	return {
		threeReliance: signal(tp),
		interiorReliance: signal((ins + dnk + hgt) / 3),
		ballHandling: signal((drb + pss) / 2),
		defReb: signal((reb + hgt) / 2),
	};
};

// Adapt the style to who's actually on the floor (e.g. when starters are injured),
// scaled by tactics. A high-tactics coach shifts toward what the healthy roster
// does well; a low-tactics coach plays the same regardless of availability.
export const availabilityAdjust = (
	style: TeamCoaching,
	tactics: number,
	availablePlayers: Player[],
): TeamCoaching => {
	const w = helpers.bound(tactics / 100, 0, 1) * COACHING.AVAILABILITY_MAX;
	if (w === 0 || availablePlayers.length === 0) {
		return style;
	}
	const optimal = rosterOptimalStyle(availablePlayers);
	const out = {} as TeamCoaching;
	for (const k of DIAL_KEYS) {
		out[k] = round1(style[k] * (1 - w) + optimal[k] * w);
	}
	return out;
};

// Per-matchup adjustment: a high-tactics coach tweaks the dials to exploit the
// opponent. Ephemeral (applied at game time, not stored).
export const matchupAdjust = (
	style: TeamCoaching,
	tactics: number,
	opp: OpponentProfile,
): TeamCoaching => {
	const scale = helpers.bound(tactics / 100, 0, 1) * COACHING.MATCHUP_MAX;
	return {
		...style,
		// Pack the paint vs. interior teams; guard the arc vs. shooting teams.
		paintDefense: round1(
			style.paintDefense + scale * (opp.interiorReliance - opp.threeReliance),
		),
		// Gamble for turnovers vs. poor ball handlers.
		defensiveAggression: round1(
			style.defensiveAggression + scale * -opp.ballHandling,
		),
		// Crash the glass vs. poor defensive-rebounding teams.
		crashOffensiveGlass: round1(
			style.crashOffensiveGlass + scale * -opp.defReb,
		),
	};
};
