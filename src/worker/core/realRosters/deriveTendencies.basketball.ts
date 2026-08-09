import { helpers } from "../../util/index.ts";
import { realGauss } from "../../../common/random.ts";
import {
	TENDENCY_SHARE,
	tendencyFromShare,
	shareFromTendency,
} from "../../../common/tendencyShares.basketball.ts";
import {
	ZONE_ACCURACY,
	FT_ACCURACY,
	ACC_SHRINK_ATT,
	ACC_MAX,
} from "../../../common/shotAccuracy.basketball.ts";
import { COMPOSITE_WEIGHTS } from "../../../common/constants.basketball.ts";
import {
	dial,
	skillTendencyBases,
} from "../player/genTendencies.basketball.ts";
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
const MIN_2PA = 300;

const clamp = (x: number) => helpers.bound(Math.round(x), 0, 100);

// League-average 2P% and FT rate (FTA/FGA) by season, computed from the real
// stats file. Used to era-normalize a player's career numbers: "shot well
// inside for his era" is the signal that predicts rim volume, not the raw
// percentage (a 1962 guard and a 2024 guard with the same 2P% were doing very
// different things).
// prettier-ignore
const LEAGUE_TWO_PCT_FTR: [number, number, number][] = [
	[1947, 0.279, 0.267], [1948, 0.284, 0.281], [1949, 0.327, 0.354],
	[1950, 0.340, 0.398], [1951, 0.357, 0.399], [1952, 0.367, 0.411],
	[1953, 0.370, 0.466], [1954, 0.372, 0.439], [1955, 0.384, 0.415],
	[1956, 0.387, 0.416], [1957, 0.380, 0.391], [1958, 0.383, 0.376],
	[1959, 0.395, 0.355], [1960, 0.409, 0.329], [1961, 0.415, 0.342],
	[1962, 0.426, 0.344], [1963, 0.441, 0.354], [1964, 0.433, 0.353],
	[1965, 0.426, 0.356], [1966, 0.433, 0.361], [1967, 0.441, 0.352],
	[1968, 0.446, 0.368], [1969, 0.441, 0.353], [1970, 0.460, 0.339],
	[1971, 0.449, 0.333], [1972, 0.455, 0.326], [1973, 0.456, 0.261],
	[1974, 0.459, 0.270], [1975, 0.457, 0.276], [1976, 0.458, 0.294],
	[1977, 0.465, 0.301], [1978, 0.469, 0.306], [1979, 0.485, 0.309],
	[1980, 0.488, 0.307], [1981, 0.491, 0.327], [1982, 0.497, 0.324],
	[1983, 0.492, 0.315], [1984, 0.499, 0.336], [1985, 0.499, 0.330],
	[1986, 0.495, 0.341], [1987, 0.490, 0.343], [1988, 0.490, 0.332],
	[1989, 0.490, 0.324], [1990, 0.488, 0.327], [1991, 0.488, 0.320],
	[1992, 0.486, 0.305], [1993, 0.489, 0.323], [1994, 0.483, 0.315],
	[1995, 0.491, 0.332], [1996, 0.486, 0.329], [1997, 0.480, 0.320],
	[1998, 0.470, 0.330], [1999, 0.457, 0.330], [2000, 0.468, 0.308],
	[2001, 0.461, 0.309], [2002, 0.465, 0.293], [2003, 0.463, 0.302],
	[2004, 0.460, 0.303], [2005, 0.470, 0.324], [2006, 0.478, 0.333],
	[2007, 0.485, 0.327], [2008, 0.484, 0.306], [2009, 0.485, 0.306],
	[2010, 0.492, 0.300], [2011, 0.487, 0.300], [2012, 0.477, 0.276],
	[2013, 0.483, 0.270], [2014, 0.488, 0.284], [2015, 0.485, 0.273],
	[2016, 0.491, 0.276], [2017, 0.503, 0.271], [2018, 0.510, 0.252],
	[2019, 0.520, 0.259], [2020, 0.524, 0.260], [2021, 0.530, 0.247],
	[2022, 0.533, 0.248], [2023, 0.548, 0.266], [2024, 0.545, 0.244],
	[2025, 0.545, 0.243], [2026, 0.550, 0.264],
];

const leagueBaseline = (season: number) => {
	const first = LEAGUE_TWO_PCT_FTR[0]!;
	const last = LEAGUE_TWO_PCT_FTR.at(-1)!;
	if (season <= first[0]) {
		return first;
	}
	if (season >= last[0]) {
		return last;
	}
	return LEAGUE_TWO_PCT_FTR.find((row) => row[0] === season) ?? last;
};

// Composite rating from raw skills (unfuzzed; missing ratings treated as
// neutral 50), using the same weights as the sim so the accuracy inversion
// below predicts what the sim will actually do with this player.
const rawComposite = (
	skills: OnlyRatings,
	key:
		| "shootingAtRim"
		| "shootingLowPost"
		| "shootingMidRange"
		| "shootingThreePointer",
) => {
	const { ratings, weights } = COMPOSITE_WEIGHTS[key]!;
	let numerator = 0;
	let denominator = 0;
	for (const [i, component] of ratings.entries()) {
		const weight = weights ? weights[i]! : 1;
		const value =
			typeof component === "number"
				? component
				: ((skills as any)[component] ?? 50);
		numerator += value * weight;
		denominator += 100 * weight;
	}
	return helpers.bound(numerator / denominator, 0, 1);
};

// Expected realized FG% for this player in a zone (sim's probMake model minus
// the measured in-game haircut from defense/fatigue/blocks).
const ZONE_COMPOSITE = {
	atRim: "shootingAtRim",
	lowPost: "shootingLowPost",
	midRange: "shootingMidRange",
} as const;

const zoneFgPct = (skills: OnlyRatings, key: keyof typeof ZONE_COMPOSITE) => {
	const zone = ZONE_ACCURACY[key];
	return (
		zone.mult * rawComposite(skills, ZONE_COMPOSITE[key]) +
		zone.base -
		zone.realizedOffset
	);
};

// Per-player accuracy correction for one zone: how much better (or worse) his
// real career percentage is than what the ratings model predicts. Shrunk
// toward 0 for small samples and clamped; 0 when there's no usable sample.
const accCorrection = (made: number, att: number, modelPct: number) => {
	if (att < 50) {
		return 0;
	}
	const delta = (made / att - modelPct) * (att / (att + ACC_SHRINK_ATT));
	return helpers.bound(delta, -ACC_MAX, ACC_MAX);
};

// Estimate a player's at-rim share of 2P attempts from career box stats.
// Regression fitted (2PA-weighted least squares) on the 822 careers that are
// fully covered by real bbref 0-3ft shot-location data (1997+, imported by
// tools/import-shot-locations.ts); weighted RMSE ~0.087. Era-relative 2P%
// carries most of the signal, the dnk-vs-fg rating gap separates finishers
// from jump shooters, and hgt/ins adjust DOWN for bigs who do their interior
// damage from the post/short zone (3-10ft) instead of at the rim. On top of
// the regression, a bounded nudge from inverting the sim's accuracy model
// pulls the mix toward reproducing the player's actual career 2P%.
const RIM_SHARE_BETA = [0.379, 1.307, 0.092, 0.366, -0.126, -0.186] as const;
const RIM_NUDGE_MAX = 0.06;

const estimateRimShare = (
	skills: OnlyRatings,
	twoPct: number,
	ftr: number,
	lgTwoPct: number,
	lgFtr: number,
	postShare: number,
) => {
	const s = (key: keyof OnlyRatings) => (skills[key] ?? 50) as number;
	const x = [
		1,
		twoPct - lgTwoPct,
		ftr - lgFtr,
		(s("dnk") - s("fg")) / 100,
		(s("hgt") - 50) / 100,
		(s("ins") - 50) / 100,
	];
	let rim = x.reduce((sum, v, i) => sum + v * RIM_SHARE_BETA[i]!, 0);
	rim = helpers.bound(rim, 0.12, 0.85);

	// Nudge toward matching his real career 2P% under the sim's accuracy model,
	// so a player whose 2P% the mix alone can't explain trades a few mid-range
	// attempts for rim attempts (or vice versa). Bounded so an accuracy outlier
	// (peak Jokic) can't warp his shot diet.
	const R = zoneFgPct(skills, "atRim");
	const P = zoneFgPct(skills, "lowPost");
	const M = zoneFgPct(skills, "midRange");
	if (R - M > 0.06) {
		const predTwoPct = rim * R + postShare * P + (1 - rim - postShare) * M;
		const nudge = helpers.bound(
			(twoPct - predTwoPct) / (R - M),
			-RIM_NUDGE_MAX,
			RIM_NUDGE_MAX,
		);
		rim = helpers.bound(rim + nudge, 0.1, 0.9);
	}

	// Leave room for the post share so shares stay a valid mix.
	return Math.min(rim, 0.95 - postShare);
};

// "Moderate" per-league variation (user-facing "Historical + variation" mode):
// sigma in tendency points. For tendencyThree this is ~5 percentage points of
// 3PA share per sigma - enough that no two leagues play out the same, small
// enough that players stay recognizably themselves.
export const DERIVED_TENDENCY_NOISE = 7;

const RATING_KEYS = [
	"hgt",
	"stre",
	"spd",
	"jmp",
	"endu",
	"ins",
	"dnk",
	"ft",
	"fg",
	"tp",
	"diq",
	"oiq",
	"drb",
	"pss",
	"reb",
] as const;

// Career stats are a career aggregate, so pair them with career-average
// ratings: deriving from a single (usually final, i.e. decline-year) ratings
// row would read e.g. old Westbrook's eroded athleticism as "never got to the
// rim".
const averageRatings = (rows: OnlyRatings[]): OnlyRatings => {
	const out: any = {};
	for (const key of RATING_KEYS) {
		let sum = 0;
		for (const row of rows) {
			sum += (row as any)[key] ?? 50;
		}
		out[key] = rows.length > 0 ? sum / rows.length : 50;
	}
	return out;
};

const deriveTendencies = (
	careerStats: StatRow[],
	skillsInput: OnlyRatings | OnlyRatings[],
	noise = 0,
) => {
	const skills = Array.isArray(skillsInput)
		? averageRatings(skillsInput)
		: skillsInput;
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
		// How the interior mix was sourced (surfaced in the UI): real location
		// data, box-stat estimation, or the ratings fallback.
		tendencyMixSource: "skill" as "located" | "estimated" | "skill",
		// Per-zone accuracy corrections (bounded probMake deltas): how much the
		// player's real career percentages beat (or trail) the ratings model.
		// 0 = pure ratings model (fictional players, tiny samples).
		accAtRim: 0,
		accLowPost: 0,
		accMidRange: 0,
		accThree: 0,
		accFT: 0,
		// Career FTA/FGA (absolute foul-draw target; the sim inverts it given
		// the shot mix). undefined = drawingFouls-composite fallback.
		ftrDraw: undefined as number | undefined,
		// Last real-data season behind these tendencies. Preseason drift leaves
		// a real player's identity alone until the league simulates past this,
		// then lets it follow his (sim-)changing skills. undefined = no real
		// data, drift always applies.
		tendencyDataEnd: undefined as number | undefined,
		// The REAL season these tendencies represent (the kernel center). The
		// preseason logic advances this by one each year and uses it - not the
		// league calendar - to walk the player's career arc, so cross-era and
		// random-debuts players age through their own careers correctly.
		tendencyVintage: undefined as number | undefined,
	};

	let sumFg = 0;
	let sumFga = 0;
	let sumTp = 0;
	let sumTpa = 0;
	let sumFt = 0;
	let sumFta = 0;
	let sumAst = 0;
	let sumTov = 0;
	let sumAtRim = 0;
	let sumLowPost = 0;
	let sumMidRange = 0;
	let minUsg = 0;
	let usgWeighted = 0;
	let sumDist03 = 0;
	let sumFgDist03 = 0;
	let sumDist310 = 0;
	let sumFgDist310 = 0;
	let locatedTwoP = 0;
	let locatedTwoPA = 0;
	// Career totals for the seasons WITHOUT shot-location data (the box-stat
	// estimator only has to describe this uncovered portion of the career; the
	// located seasons speak for themselves).
	let uFg = 0;
	let uFga = 0;
	let uTp = 0;
	let uTpa = 0;
	let uFta = 0;
	let uLgW = 0;
	let uLgTwoPctW = 0;
	let uLgFtrW = 0;

	for (const s of careerStats) {
		if (s.playoffs) {
			continue;
		}
		sumFg += s.fg ?? 0;
		sumFga += s.fga ?? 0;
		sumTp += s.tp ?? 0;
		sumTpa += s.tpa ?? 0;
		sumFt += s.ft ?? 0;
		sumFta += s.fta ?? 0;
		sumAst += s.ast ?? 0;
		sumTov += s.tov ?? 0;
		sumAtRim += s.fgaAtRim ?? 0;
		sumLowPost += s.fgaLowPost ?? 0;
		sumMidRange += s.fgaMidRange ?? 0;

		const twoPaRow = (s.fga ?? 0) - (s.tpa ?? 0);
		const [, lgTwoPct, lgFtr] = leagueBaseline(s.season);

		// Real shot-location seasons (bbref distance bins, imported by
		// tools/import-shot-locations.ts; 1997+ only).
		if (s.fgaDist03 !== undefined) {
			sumDist03 += s.fgaDist03;
			sumFgDist03 += s.fgDist03 ?? 0;
			sumDist310 += s.fgaDist310 ?? 0;
			sumFgDist310 += s.fgDist310 ?? 0;
			locatedTwoP += (s.fg ?? 0) - (s.tp ?? 0);
			locatedTwoPA += twoPaRow;
		} else {
			uFg += s.fg ?? 0;
			uFga += s.fga ?? 0;
			uTp += s.tp ?? 0;
			uTpa += s.tpa ?? 0;
			uFta += s.fta ?? 0;
			// Era baselines for the uncovered seasons, weighted by 2PA.
			uLgW += twoPaRow;
			uLgTwoPctW += lgTwoPct * twoPaRow;
			uLgFtrW += lgFtr * twoPaRow;
		}

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

	// Free-throw drawing: career FTA/FGA, kept absolute like the shot mix (a
	// 1960s foul magnet really did live at the line). Wilt's 0.72 career FTr
	// is the historical extreme, hence the loose upper bound.
	if (sumFga >= MIN_FGA) {
		tendencies.ftrDraw = helpers.bound(sumFta / sumFga, 0.02, 0.85);
	}

	if (sumFga > 0) {
		let dataEnd = -Infinity;
		for (const s of careerStats) {
			if (!s.playoffs && (s.fga ?? 0) > 0) {
				dataEnd = Math.max(dataEnd, s.season);
			}
		}
		if (dataEnd > -Infinity) {
			tendencies.tendencyDataEnd = dataEnd;
		}
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
	// upstream). Source precedence for the rim share of 2PA:
	//   1. Zone-labeled data (fgaAtRim etc.) - only present in custom imports.
	//   2. Real shot-location data (bbref 0-3ft bins, 1997+, imported locally
	//      by tools/import-shot-locations.ts), blended with the box-stat
	//      estimator by how much of the career the located seasons cover (a
	//      pre-1997 career with a located tail shouldn't be judged entirely by
	//      its decline years).
	//   3. Box-stat estimation (era-relative 2P% and FT rate plus ratings; see
	//      estimateRimShare). Without at least this, the skill fallback hands
	//      every athletic guard a huge rim diet and inflates FG% league-wide -
	//      dnk measures whether you finish, not whether you get there.
	const mRim = TENDENCY_SHARE.atRim;
	const mPost = TENDENCY_SHARE.post;
	const twoPA = sumFga - sumTpa;
	if (located >= MIN_LOCATED) {
		tendencies.tendencyAtRim = signal(
			sumAtRim / located,
			mRim.pivot,
			mRim.slope,
		);
		tendencies.tendencyPost = signal(
			sumLowPost / located,
			mPost.pivot,
			mPost.slope,
		);
		tendencies.tendencyMixSource = "located";
	} else if (twoPA >= MIN_2PA) {
		const coverage = locatedTwoPA >= MIN_LOCATED ? locatedTwoPA / twoPA : 0;
		const locShare = coverage > 0 ? sumDist03 / locatedTwoPA : 0;
		const uTwoPA = uFga - uTpa;

		let rimShare;
		if (uTwoPA >= MIN_2PA && uLgW > 0) {
			// Estimate the uncovered (no location data) portion of the career from
			// its box stats. Post share keeps the skill prior (no box-stat proxy
			// for post-ups; the bbref 3-10ft bin is floaters as much as post-ups,
			// so it can't label post players either).
			const postShare = helpers.bound(
				shareFromTendency(base.tendencyPost, TENDENCY_SHARE.post),
				0.02,
				0.35,
			);
			const rimStat = estimateRimShare(
				skills,
				(uFg - uTp) / uTwoPA,
				uFta / uFga,
				uLgTwoPctW / uLgW,
				uLgFtrW / uLgW,
				postShare,
			);
			// Small samples get pulled toward a tamed skill prior (the raw
			// fallback's athleticism skew, at half strength).
			const rimPrior = helpers.bound(
				mRim.pivot +
					(((skills.dnk ?? 50) + (skills.spd ?? 50)) / 2 - 50) *
						(0.3 / mRim.slope),
				0.1,
				0.7,
			);
			const w = helpers.bound(uTwoPA / 1500, 0, 1);
			const estShare = w * rimStat + (1 - w) * rimPrior;
			// Weight real located seasons by how much of the career they cover.
			rimShare = coverage * locShare + (1 - coverage) * estShare;
		} else if (coverage > 0) {
			// The uncovered sliver is too small to estimate; trust the located data.
			rimShare = locShare;
		}

		if (rimShare !== undefined) {
			tendencies.tendencyMixSource = coverage >= 0.5 ? "located" : "estimated";
			tendencies.tendencyAtRim = signal(rimShare, mRim.pivot, mRim.slope);
		}
	}

	// Per-player accuracy corrections: anchor each zone's simulated FG% to the
	// player's real career percentage where a sample exists (see
	// shotAccuracy.basketball.ts). This is what separates a Jokic (outshoots
	// what his ratings predict everywhere) from a player whose ratings flatter
	// him - the linear ratings model alone misses individuals by up to ~10pp.
	// Threes and FTs work for every era; the 2P zones use located seasons
	// (1997+), with an aggregate-2P% fallback for fully pre-1997 careers.
	{
		// Match GameSim's high-end compression of the three-point composite.
		let threeComp = rawComposite(skills, "shootingThreePointer");
		if (threeComp > 0.55) {
			threeComp = 0.55 + (threeComp - 0.55) * (0.3 / 0.45);
		}
		const zThree = ZONE_ACCURACY.threePointer;
		tendencies.accThree = accCorrection(
			sumTp,
			sumTpa,
			zThree.mult * threeComp + zThree.base - zThree.realizedOffset,
		);
		tendencies.accFT = accCorrection(
			sumFt,
			sumFta,
			FT_ACCURACY.mult * ((skills.ft ?? 50) / 100) + FT_ACCURACY.base,
		);

		if (locatedTwoPA > 0) {
			tendencies.accAtRim = accCorrection(
				sumFgDist03,
				sumDist03,
				zoneFgPct(skills, "atRim"),
			);
			// The 3-10ft bin anchors the sim's lowPost zone (hooks, floaters,
			// short push shots all live there for shot-making purposes).
			tendencies.accLowPost = accCorrection(
				sumFgDist310,
				sumDist310,
				zoneFgPct(skills, "lowPost"),
			);
			tendencies.accMidRange = accCorrection(
				locatedTwoP - sumFgDist03 - sumFgDist310,
				locatedTwoPA - sumDist03 - sumDist310,
				zoneFgPct(skills, "midRange"),
			);
		} else if (twoPA >= MIN_2PA) {
			// Fully pre-1997 career: no per-zone truth, so anchor the aggregate
			// 2P% instead - the residual left after the mix nudge, spread evenly
			// across the 2P zones with a tighter clamp.
			const rimShare = helpers.bound(
				shareFromTendency(tendencies.tendencyAtRim, TENDENCY_SHARE.atRim),
				0.02,
				0.9,
			);
			const postShare = helpers.bound(
				shareFromTendency(tendencies.tendencyPost, TENDENCY_SHARE.post),
				0.02,
				0.35,
			);
			const pred =
				rimShare * zoneFgPct(skills, "atRim") +
				postShare * zoneFgPct(skills, "lowPost") +
				(1 - rimShare - postShare) * zoneFgPct(skills, "midRange");
			const residual = helpers.bound(
				((sumFg - sumTp) / twoPA - pred) * (twoPA / (twoPA + ACC_SHRINK_ATT)),
				-0.05,
				0.05,
			);
			tendencies.accAtRim = residual;
			tendencies.accLowPost = residual;
			tendencies.accMidRange = residual;
		}
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

export type DerivedTendencies = ReturnType<typeof deriveTendencies>;

// ============================================================================
// Per-season derivation: instead of stamping one career-aggregate identity on
// every ratings row, derive each season's tendencies from a kernel-weighted
// window of stats centered on that season, so 2010 Curry, 2016 Curry, and
// 2025 Curry each play like themselves. The `seasonality` league setting
// (0-1) blends between career-aggregate (0, the old behavior) and fully
// per-season (1).
// ============================================================================

// Kernel time constant in seasons: the center season gets weight 1, +/-1
// season ~0.51, +/-2 ~0.26. This smooths single-season sample noise (a thin
// season borrows from its neighbors) while still tracking career arcs.
const SEASON_KERNEL_TAU = 1.5;

// Counting stats scaled by the kernel weight; rate stats (usgp) are already
// weighted by the scaled min inside deriveTendencies.
const COUNTING_KEYS = [
	"fg",
	"fga",
	"tp",
	"tpa",
	"ft",
	"fta",
	"ast",
	"tov",
	"min",
	"fgaAtRim",
	"fgaLowPost",
	"fgaMidRange",
	"fgaDist03",
	"fgDist03",
	"fgaDist310",
	"fgDist310",
] as const;

const scaleStatRow = (s: StatRow, w: number): StatRow => {
	const out: any = { ...s };
	for (const key of COUNTING_KEYS) {
		if (out[key] !== undefined) {
			out[key] *= w;
		}
	}
	return out;
};

const TENDENCY_BLEND_KEYS = [
	"tendencyUsage",
	"tendencyThree",
	"tendencyAtRim",
	"tendencyPost",
	"tendencyPass",
	"tendencyClutch",
] as const;
const ACC_BLEND_KEYS = [
	"accAtRim",
	"accLowPost",
	"accMidRange",
	"accThree",
	"accFT",
] as const;

export const deriveTendenciesPerSeason = (
	careerStats: StatRow[],
	ratingsRows: (OnlyRatings & { season?: number })[],
	seasonality = 1,
	noise = 0,
): Map<number | undefined, DerivedTendencies> => {
	const career = deriveTendencies(careerStats, ratingsRows, 0);

	// One noise draw per player (not per row), so "historical + variation"
	// shifts a player's whole identity consistently instead of jittering his
	// tendencies season to season.
	const noiseOffsets =
		noise > 0 ? TENDENCY_BLEND_KEYS.map(() => realGauss(0, noise)) : undefined;

	const finalize = (t: DerivedTendencies): DerivedTendencies => {
		if (noiseOffsets) {
			for (const [i, key] of TENDENCY_BLEND_KEYS.entries()) {
				t[key] = clamp(t[key] + noiseOffsets[i]!);
			}
		}
		return t;
	};

	// Real-career span, for clamping the window center: a ratings row from a
	// season with no real data nearby (a league simulated past the real
	// timeline, or a dummy rookie row before the debut) uses the nearest real
	// era of the career - an aging star simulated into 2031 keeps his
	// late-career identity, not his career average or prime.
	let firstSeason = Infinity;
	let lastSeason = -Infinity;
	for (const s of careerStats) {
		if (!s.playoffs) {
			firstSeason = Math.min(firstSeason, s.season);
			lastSeason = Math.max(lastSeason, s.season);
		}
	}

	const out = new Map<number | undefined, DerivedTendencies>();
	for (const row of ratingsRows) {
		const season = row.season;
		if (out.has(season)) {
			continue;
		}
		if (season === undefined || seasonality <= 0 || firstSeason > lastSeason) {
			const vintage =
				season !== undefined && firstSeason <= lastSeason
					? helpers.bound(season, firstSeason, lastSeason)
					: undefined;
			out.set(season, finalize({ ...career, tendencyVintage: vintage }));
			continue;
		}
		const center = helpers.bound(season, firstSeason, lastSeason);

		const windowed = deriveTendencies(
			careerStats.map((s) =>
				scaleStatRow(
					s,
					Math.exp(-Math.abs(s.season - center) / SEASON_KERNEL_TAU),
				),
			),
			row,
			0,
		);

		// A window without a usable stat sample (only possible when the career
		// itself is near the gates) falls back to skill-based values; prefer the
		// career signal in that case rather than blending stats with skill.
		if (!windowed.tendencyAbsolute && career.tendencyAbsolute) {
			out.set(season, finalize({ ...career, tendencyVintage: center }));
			continue;
		}

		const blended: DerivedTendencies = { ...windowed };
		for (const key of TENDENCY_BLEND_KEYS) {
			blended[key] = clamp(
				seasonality * windowed[key] + (1 - seasonality) * career[key],
			);
		}
		for (const key of ACC_BLEND_KEYS) {
			blended[key] =
				seasonality * windowed[key] + (1 - seasonality) * career[key];
		}
		if (windowed.ftrDraw !== undefined && career.ftrDraw !== undefined) {
			blended.ftrDraw =
				seasonality * windowed.ftrDraw + (1 - seasonality) * career.ftrDraw;
		} else {
			blended.ftrDraw = windowed.ftrDraw ?? career.ftrDraw;
		}
		blended.tendencyAbsolute =
			windowed.tendencyAbsolute || career.tendencyAbsolute;
		blended.tendencyVintage = center;

		out.set(season, finalize(blended));
	}

	return out;
};

// Move a ratings row's tendencies fraction `d` of the way toward a derived
// target (the player's real career-arc identity for the new season). Used by
// the preseason Tendency Determinism logic: d=1 snaps to the real arc, d=0 is
// a no-op (pure skill drift takes over instead).
export const lerpTendenciesToward = (
	row: any,
	target: DerivedTendencies,
	d: number,
) => {
	if (d <= 0) {
		return;
	}
	for (const key of TENDENCY_BLEND_KEYS) {
		const current = row[key] ?? 50;
		row[key] = clamp(current + d * (target[key] - current));
	}
	for (const key of ACC_BLEND_KEYS) {
		const current = row[key] ?? 0;
		row[key] = current + d * (target[key] - current);
	}
	if (target.ftrDraw !== undefined) {
		const current = row.ftrDraw ?? target.ftrDraw;
		row.ftrDraw = current + d * (target.ftrDraw - current);
	}
	row.tendencyAbsolute = target.tendencyAbsolute || row.tendencyAbsolute;
	row.tendencyMixSource = target.tendencyMixSource;
	row.tendencyDataEnd = target.tendencyDataEnd;
	row.tendencyVintage = target.tendencyVintage;
};

export default deriveTendencies;
