import { realGauss } from "../../../common/random.ts";
import { helpers } from "../../util/index.ts";

type Skills = {
	tp?: number;
	dnk?: number;
	spd?: number;
	ins?: number;
	hgt?: number;
	stre?: number;
	fg?: number;
	oiq?: number;
	drb?: number;
	pss?: number;
};

const r = (skills: Skills, key: keyof Skills) => skills[key] ?? 50;

// Raw, deterministic tendency targets (centered on 50, pulled toward the relevant
// skill(s)), before any noise or rounding. Shared by random player generation
// (which adds noise) and real-player derivation (which uses these as the fallback
// when career stats aren't available).
export const skillTendencyBases = (skills: Skills) => {
	const tp = r(skills, "tp");
	const dnk = r(skills, "dnk");
	const spd = r(skills, "spd");
	const ins = r(skills, "ins");
	const hgt = r(skills, "hgt");
	const stre = r(skills, "stre");
	const fg = r(skills, "fg");
	const oiq = r(skills, "oiq");
	const pss = r(skills, "pss");

	const scoring = (ins + dnk + fg + tp + oiq) / 5;

	return {
		tendencyUsage: 50 + (scoring - 50) * 0.5,
		tendencyThree: 50 + (tp - 50) * 0.7 + (oiq - 50) * 0.1,
		tendencyAtRim: 50 + ((dnk + spd) / 2 - 50) * 0.6,
		tendencyPost: 50 + ((ins + hgt + stre) / 3 - 50) * 0.6,
		tendencyPass: 50 + ((pss + oiq) / 2 - 50) * 0.6,
		// Clutch is mostly independent of skill (a slight lean on composure/IQ).
		tendencyClutch: 50 + (oiq - 50) * 0.1,
	};
};

// Centered on 50, pulled toward the relevant skill(s), plus noise. Also reused
// by real-player tendency derivation to add per-league variation.
export const dial = (base: number, noise = 9) =>
	noise > 0
		? helpers.bound(Math.round(base + realGauss(0, noise)), 0, 100)
		: helpers.bound(Math.round(base), 0, 100);

// Annual drift of the usage tendency toward what the player's CURRENT skills
// imply, run each preseason. Without this, tendencies are frozen at creation:
// a late-blooming star would keep his rookie role-player usage identity
// forever, and an aging star would never cede possessions. The coach's
// tactics rating paces the drift - a sharp coach restructures the offense
// around developing (or declining) talent quickly, a poor one leaves the
// breakout kid in a role-player box for years. Bounded per-year step, small
// noise so careers don't move in lockstep.
export const USAGE_DRIFT_BASE = 0.15; // fraction of the gap closed per year
export const USAGE_DRIFT_TACTICS = 0.15; // + up to this at tactics 100
export const USAGE_DRIFT_MAX_STEP = 6; // tendency points per year

export const driftUsageTendency = (
	ratings: Skills & { tendencyUsage?: number },
	coachTactics = 50,
	// Scales the whole step; the preseason logic passes (1 - tendency
	// determinism) for real players still within their real-data span.
	strength = 1,
) => {
	if (strength <= 0) {
		return;
	}
	const current = ratings.tendencyUsage ?? 50;
	const implied = skillTendencyBases(ratings).tendencyUsage;
	const rate =
		USAGE_DRIFT_BASE +
		USAGE_DRIFT_TACTICS * (helpers.bound(coachTactics, 0, 100) / 100);
	const step =
		strength *
		helpers.bound(
			rate * (implied - current) + realGauss(0, 1),
			-USAGE_DRIFT_MAX_STEP,
			USAGE_DRIFT_MAX_STEP,
		);
	ratings.tendencyUsage = helpers.bound(Math.round(current + step), 0, 100);
};

// Annual drift of the shot-mix/behavior tendencies toward what CURRENT skills
// imply. Same pacing as usage drift (coach tactics speeds it up), same
// bounded step. Without this, a young star's shot diet, passing lean, and
// foul drawing stay frozen forever, and an aging player never keeps
// declining behaviorally.
//
// The caller (newPhasePreseason) decides the strength: full for fictional
// players and for real players past their real-data span; scaled by
// (1 - tendency determinism) while still within the span, where the
// determinism lerp toward the real career arc is the other force.
//
// The atRim/post athleticism skew is halved vs the generation baseline -
// drifting long-simmed leagues toward the full-strength skew would recreate
// the "athletic guards live at the rim" bias the stat-derived mixes fixed.
export const driftShotTendencies = (
	ratings: Skills & {
		tendencyThree?: number;
		tendencyAtRim?: number;
		tendencyPost?: number;
		tendencyPass?: number;
		ftrDraw?: number;
		tendencyDataEnd?: number;
	},
	coachTactics = 50,
	strength = 1,
) => {
	if (strength <= 0) {
		return;
	}

	const b = skillTendencyBases(ratings);
	const rate =
		USAGE_DRIFT_BASE +
		USAGE_DRIFT_TACTICS * (helpers.bound(coachTactics, 0, 100) / 100);
	const dnk = r(ratings, "dnk");
	const spd = r(ratings, "spd");
	const ins = r(ratings, "ins");
	const hgt = r(ratings, "hgt");
	const stre = r(ratings, "stre");
	const drb = r(ratings, "drb");
	const oiq = r(ratings, "oiq");

	const targets: [keyof typeof ratings, number][] = [
		["tendencyThree", b.tendencyThree],
		["tendencyAtRim", 50 + ((dnk + spd) / 2 - 50) * 0.3],
		["tendencyPost", 50 + ((ins + hgt + stre) / 3 - 50) * 0.3],
		["tendencyPass", b.tendencyPass],
	];
	for (const [key, target] of targets) {
		const current = (ratings[key] as number | undefined) ?? 50;
		const step =
			strength *
			helpers.bound(
				rate * (target - current) + realGauss(0, 1),
				-USAGE_DRIFT_MAX_STEP,
				USAGE_DRIFT_MAX_STEP,
			);
		(ratings[key] as number) = helpers.bound(
			Math.round(current + step),
			0,
			100,
		);
	}

	// FT drawing target from the foul-drawing skills (drawingFouls composite
	// inputs); drifts slowly, no noise (it's a rate, not a 0-100 dial).
	if (ratings.ftrDraw !== undefined) {
		const drawAvg = (hgt + spd + drb + dnk + oiq) / 5;
		const target = helpers.bound(0.25 + (drawAvg - 50) * 0.004, 0.08, 0.6);
		const step =
			strength * helpers.bound(rate * (target - ratings.ftrDraw), -0.02, 0.02);
		ratings.ftrDraw = helpers.bound(ratings.ftrDraw + step, 0.02, 0.85);
	}
};

// Behavioral tendencies correlated to a player's skills (a great shooter tends to
// shoot more 3s; a big tends to post up), with noise so they're not identical to
// skill. Reused by player generation and the league migration.
const genTendencies = (skills: Skills) => {
	const b = skillTendencyBases(skills);

	return {
		tendencyUsage: dial(b.tendencyUsage),
		tendencyThree: dial(b.tendencyThree),
		tendencyAtRim: dial(b.tendencyAtRim),
		tendencyPost: dial(b.tendencyPost),
		tendencyPass: dial(b.tendencyPass),
		tendencyClutch: dial(b.tendencyClutch, 14),
	};
};

export default genTendencies;
