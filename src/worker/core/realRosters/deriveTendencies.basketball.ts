import { helpers } from "../../util/index.ts";
import {
	TENDENCY_SHARE,
	tendencyFromShare,
} from "../../../common/tendencyShares.basketball.ts";
import { dial, skillTendencyBases } from "../player/genTendencies.basketball.ts";
import type { BasketballStats } from "./loadStats.basketball.ts";
import type { OnlyRatings } from "./getOnlyRatings.ts";

// Behavioral tendencies (0-100, 50 = neutral) for real players, derived from
// their actual career stats so on-court behavior matches who they were (shooters
// shoot threes, bigs post up, playmakers pass). Deterministic at noise 0; league
// creation normally passes a noise sigma so each league gets a slightly
// different version of every player. When a particular stat isn't available
// (old seasons without shot-location or 3PT data, or no stats imported at all),
// we fall back to the skill-correlated baseline.
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

// "Moderate" per-league variation (user-facing "Historical + variation" mode):
// sigma in tendency points. For tendencyThree this is ~5 percentage points of
// 3PA share per sigma - enough that no two leagues play out the same, small
// enough that players stay recognizably themselves.
export const DERIVED_TENDENCY_NOISE = 7;

const deriveTendencies = (
	careerStats: StatRow[],
	skills: OnlyRatings,
	noise = 0,
) => {
	const base = skillTendencyBases(skills);

	const tendencies = {
		tendencyUsage: clamp(base.tendencyUsage),
		tendencyThree: clamp(base.tendencyThree),
		tendencyAtRim: clamp(base.tendencyAtRim),
		tendencyPost: clamp(base.tendencyPost),
		tendencyPass: clamp(base.tendencyPass),
		// No real-stat proxy for clutch, so always skill-based.
		tendencyClutch: clamp(base.tendencyClutch),
		// True when the shot-mix tendencies below were derived from real career
		// stats, i.e. they encode the player's absolute historical shot shares.
		// The sim then skips era scaling (threePointTendencyFactor) for this
		// player, since his tendency already carries the era signal.
		tendencyAbsolute: false,
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
	// Shot-mix tendencies are a direct encoding of the player's career shot
	// shares (see tendencyShares.basketball.ts): the sim inverts the mapping to
	// recover the target share, so a real player's simulated shot mix tracks his
	// actual one. Slopes are tuned so a league-typical player sits near 50 and
	// only genuine historical extremes approach 0/100.
	const signal = (value: number, pivot: number, slope: number) =>
		clamp(tendencyFromShare(value, { pivot, slope }));

	// Three-point frequency: 3PA share of FGA.
	if (sumFga >= MIN_FGA) {
		const m = TENDENCY_SHARE.three;
		tendencies.tendencyThree = signal(sumTpa / sumFga, m.pivot, m.slope);
		tendencies.tendencyAbsolute = true;
	}

	// Usage: usage% is ~20 for an average player (5 share 100%); spread from
	// there. Like the shot mix, this is a share encoding: the sim inverts it
	// when picking who shoots, so a player's realized usage tracks his real one.
	if (minUsg >= MIN_MIN) {
		const m = TENDENCY_SHARE.usage;
		tendencies.tendencyUsage = signal(
			usgWeighted / minUsg / 100,
			m.pivot,
			m.slope,
		);
	}

	// Pass-first: assist ratio = share of a player's used possessions that end in
	// an assist rather than his own shot. Unlike raw AST% (which just tracks ball
	// dominance, so high-usage scorers like SGA score high), this nets out a
	// player's own shooting volume, so only true distributors rate highly. Like
	// the shot mix, the sim inverts this mapping when crediting assists, so a
	// real distributor's simulated assist volume tracks his actual one.
	const usedPoss = sumFga + 0.44 * sumFta + sumAst + sumTov;
	if (sumFga >= MIN_FGA && usedPoss > 0) {
		const m = TENDENCY_SHARE.pass;
		tendencies.tendencyPass = signal(sumAst / usedPoss, m.pivot, m.slope);
	}

	// Interior shot selection (only the 2-point shot mix; threes are decided
	// upstream). Shares of located 2P attempts that are at the rim vs the low post.
	if (located >= MIN_LOCATED) {
		const mRim = TENDENCY_SHARE.atRim;
		const mPost = TENDENCY_SHARE.post;
		tendencies.tendencyAtRim = signal(sumAtRim / located, mRim.pivot, mRim.slope);
		tendencies.tendencyPost = signal(
			sumLowPost / located,
			mPost.pivot,
			mPost.slope,
		);
	}

	if (noise > 0) {
		tendencies.tendencyUsage = dial(tendencies.tendencyUsage, noise);
		tendencies.tendencyThree = dial(tendencies.tendencyThree, noise);
		tendencies.tendencyAtRim = dial(tendencies.tendencyAtRim, noise);
		tendencies.tendencyPost = dial(tendencies.tendencyPost, noise);
		tendencies.tendencyPass = dial(tendencies.tendencyPass, noise);
		tendencies.tendencyClutch = dial(tendencies.tendencyClutch, noise);
	}

	return tendencies;
};

export default deriveTendencies;
