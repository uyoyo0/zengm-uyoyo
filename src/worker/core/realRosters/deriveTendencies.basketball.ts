import { helpers } from "../../util/index.ts";
import { skillTendencyBases } from "../player/genTendencies.basketball.ts";
import type { BasketballStats } from "./loadStats.basketball.ts";
import type { OnlyRatings } from "./getOnlyRatings.ts";

// Behavioral tendencies (0-100, 50 = neutral) for real players, derived from
// their actual career stats so on-court behavior matches who they were (shooters
// shoot threes, bigs post up, playmakers pass). Fully deterministic. When a
// particular stat isn't available (old seasons without shot-location or 3PT data,
// or no stats imported at all), we fall back to the skill-correlated baseline.
//
// The mappings are heuristic anchors chosen so a league-typical player lands near
// 50 and extremes reach the ends of the scale. They're intentionally absolute
// (not era-relative): a 1990s team that barely shot threes should have low
// tendencyThree, which is historically accurate.

type StatRow = BasketballStats["stats"][number];

// Minimum sample (career FGA / minutes / located shots) before a stat overrides
// the skill-based fallback, to avoid noise from tiny careers.
const MIN_FGA = 200;
const MIN_MIN = 500;
const MIN_LOCATED = 200;

const clamp = (x: number) => helpers.bound(Math.round(x), 0, 100);

const deriveTendencies = (careerStats: StatRow[], skills: OnlyRatings) => {
	const base = skillTendencyBases(skills);

	const tendencies = {
		tendencyUsage: clamp(base.tendencyUsage),
		tendencyThree: clamp(base.tendencyThree),
		tendencyAtRim: clamp(base.tendencyAtRim),
		tendencyPost: clamp(base.tendencyPost),
		tendencyPass: clamp(base.tendencyPass),
		// No real-stat proxy for clutch, so always skill-based.
		tendencyClutch: clamp(base.tendencyClutch),
	};

	let sumFga = 0;
	let sumTpa = 0;
	let sumFta = 0;
	let sumAst = 0;
	let sumTov = 0;
	let sumAtRim = 0;
	let sumLowPost = 0;
	let sumMidRange = 0;
	let minUsg = 0;
	let usgWeighted = 0;

	for (const s of careerStats) {
		if (s.playoffs) {
			continue;
		}
		sumFga += s.fga ?? 0;
		sumTpa += s.tpa ?? 0;
		sumFta += s.fta ?? 0;
		sumAst += s.ast ?? 0;
		sumTov += s.tov ?? 0;
		sumAtRim += s.fgaAtRim ?? 0;
		sumLowPost += s.fgaLowPost ?? 0;
		sumMidRange += s.fgaMidRange ?? 0;

		const min = s.min ?? 0;
		if (min > 0 && s.usgp !== undefined) {
			minUsg += min;
			usgWeighted += s.usgp * min;
		}
	}

	const located = sumAtRim + sumLowPost + sumMidRange;

	// Map a stat to a [0,100] tendency centered on a league-typical "pivot" value.
	// Tendencies are deliberately gentle modifiers, NOT a restatement of the stat:
	// the sim's shot/usage models already scale with the player's skill ratings
	// (e.g. a great shooter already takes more threes at neutral tendency), so the
	// tendency only nudges around that. Slopes are tuned so a league-typical player
	// sits near 50 and only genuine historical extremes approach 0/100.
	const signal = (value: number, pivot: number, slope: number) =>
		clamp(50 + (value - pivot) * slope);

	// Three-point frequency: 3PA share of FGA. ~35% share is neutral; it takes a
	// ~63%+ share (true volume-shooting outlier) to approach 100.
	if (sumFga >= MIN_FGA) {
		tendencies.tendencyThree = signal(sumTpa / sumFga, 0.35, 130);
	}

	// Usage: usage% is ~20 for an average player (5 share 100%); spread from there.
	if (minUsg >= MIN_MIN) {
		tendencies.tendencyUsage = signal(usgWeighted / minUsg, 20, 1.8);
	}

	// Pass-first: assist ratio = share of a player's used possessions that end in
	// an assist rather than his own shot. Unlike raw AST% (which just tracks ball
	// dominance, so high-usage scorers like SGA score high), this nets out a
	// player's own shooting volume, so only true distributors rate highly.
	const usedPoss = sumFga + 0.44 * sumFta + sumAst + sumTov;
	if (sumFga >= MIN_FGA && usedPoss > 0) {
		tendencies.tendencyPass = signal(sumAst / usedPoss, 0.17, 210);
	}

	// Interior shot selection (only the 2-point shot mix; threes are decided
	// upstream). Shares of located 2P attempts that are at the rim vs the low post.
	if (located >= MIN_LOCATED) {
		tendencies.tendencyAtRim = signal(sumAtRim / located, 0.4, 110);
		tendencies.tendencyPost = signal(sumLowPost / located, 0.1, 150);
	}

	return tendencies;
};

export default deriveTendencies;
