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
) => {
	const current = ratings.tendencyUsage ?? 50;
	const implied = skillTendencyBases(ratings).tendencyUsage;
	const rate =
		USAGE_DRIFT_BASE +
		USAGE_DRIFT_TACTICS * (helpers.bound(coachTactics, 0, 100) / 100);
	const step = helpers.bound(
		rate * (implied - current) + realGauss(0, 1),
		-USAGE_DRIFT_MAX_STEP,
		USAGE_DRIFT_MAX_STEP,
	);
	ratings.tendencyUsage = helpers.bound(Math.round(current + step), 0, 100);
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
