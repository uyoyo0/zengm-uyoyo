import { assert, beforeAll, describe, test } from "vitest";
import {
	fitBreakdown,
	matchupAdjust,
	playerCoachFit,
	playerOptimalStyle,
	playerSystemFit,
} from "./style.ts";
import { playerRoleScore } from "../../../common/roleNeeds.basketball.ts";
import { ROLE_R0 } from "../../../common/coachingConstants.ts";
import genPhilosophy from "./genPhilosophy.ts";
import { player } from "../index.ts";
import { resetG } from "../../../test/helpers.ts";
import { DEFAULT_COACHING } from "../../../common/constants.ts";
import {
	COACHING,
	FIT_NEUTRAL,
	coachDevEffect,
	fitAdjustedCoachingLevel,
	fitEffect,
	playoffMatchupWeight,
} from "../../../common/coachingConstants.ts";
import { range } from "../../../common/utils.ts";

const baseRatings = {
	tp: 50,
	spd: 50,
	dnk: 50,
	reb: 50,
	hgt: 50,
	diq: 50,
};

describe("playerOptimalStyle", () => {
	test("a shooter prefers a three-heavy system", () => {
		const style = playerOptimalStyle({ ...baseRatings, tp: 80 });
		assert(style.threePointTendency > 0);
	});

	test("a slow interior big prefers packing the paint and slow pace", () => {
		const style = playerOptimalStyle({
			...baseRatings,
			spd: 30,
			hgt: 75,
			diq: 65,
			reb: 70,
		});
		assert(style.paintDefense > 0);
		assert(style.pace < 0);
	});

	test("shot-selection tendency strictly raises the 3PT dial", () => {
		const shooter = { ...baseRatings, tp: 70 };
		const withTendency = playerOptimalStyle({
			...shooter,
			tendencyThree: 100,
		});
		const without = playerOptimalStyle({ ...shooter, tendencyThree: 50 });
		assert(withTendency.threePointTendency > without.threePointTendency);
	});

	test("missing tendencies degrade to the pure rating signal", () => {
		const a = playerOptimalStyle({ ...baseRatings, tp: 80 });
		const b = playerOptimalStyle({
			...baseRatings,
			tp: 80,
			tendencyThree: undefined,
		});
		assert.deepStrictEqual(a, b);
	});
});

describe("fitBreakdown", () => {
	test("largest mismatch comes first with the right direction", () => {
		const preferred = { ...DEFAULT_COACHING, threePointTendency: 1 };
		const actual = { ...DEFAULT_COACHING, threePointTendency: -1, pace: 0.3 };
		const breakdown = fitBreakdown(preferred, actual);
		assert.strictEqual(breakdown[0]!.dial, "threePointTendency");
		assert.strictEqual(breakdown[0]!.playerWants, 1);
		assert.strictEqual(breakdown[0]!.magnitude, 2);
		assert.strictEqual(breakdown[1]!.dial, "pace");
		assert.strictEqual(breakdown[1]!.playerWants, -1);
	});

	test("same-direction gaps are not mismatches", () => {
		// A shooter (preferred +0.5) under a max-3PT coach (+1.0): asked to do
		// MORE of what he's good at - no conflict.
		const preferred = { ...DEFAULT_COACHING, threePointTendency: 0.5 };
		const actual = { ...DEFAULT_COACHING, threePointTendency: 1 };
		const breakdown = fitBreakdown(preferred, actual);
		assert.strictEqual(
			breakdown.find((row) => row.dial === "threePointTendency")!.magnitude,
			0,
		);
	});
});

describe("playerCoachFit", () => {
	const SHOOTER_RATINGS = {
		tp: 85,
		spd: 65,
		dnk: 60,
		reb: 55,
		hgt: 60,
		diq: 60,
		tendencyThree: 85,
	};

	test("shooter-loaded five under a max-3PT coach reads as a good fit", () => {
		// The reported bug: a starting five of elite shooters with a coach who
		// emphasizes threes showed "Bombs away by design, bricks by personnel".
		// Elite well-rounded shooters have comparative-advantage 3PT signals of
		// ~+0.4-0.6, well short of a committed coach's +1.0 dial - which must
		// read as harmony, not mismatch.
		const shooter = playerOptimalStyle(SHOOTER_RATINGS);
		assert(shooter.threePointTendency > 0);
		assert(shooter.threePointTendency < 1);

		const threeHappySystem = {
			...DEFAULT_COACHING,
			threePointTendency: 1,
			pace: 0.3,
		};
		const fit = playerCoachFit(SHOOTER_RATINGS, threeHappySystem);
		assert(fit >= 0.82, `shooter under 3PT coach should grade B+: ${fit}`);

		// And no 3PT mismatch message material.
		const breakdown = fitBreakdown(shooter, threeHappySystem);
		const three = breakdown.find((row) => row.dial === "threePointTendency")!;
		assert.strictEqual(three.magnitude, 0);

		// The same shooter under an opposed, paint-first system is a bad fit.
		const paintSystem = {
			...DEFAULT_COACHING,
			threePointTendency: -1,
			crashOffensiveGlass: 0.8,
			paintDefense: 0.8,
		};
		const badFit = playerCoachFit(SHOOTER_RATINGS, paintSystem);
		assert(badFit < fit - 0.1, `opposed system should fit worse: ${badFit}`);
	});

	test("rim protector behind a gambling perimeter defense is a great fit", () => {
		// The user's canonical complement case: his own preferred style opposes
		// the system's dials (he'd pack the paint), but the scheme is built on
		// having an eraser behind the gambles - the role demand must rescue him.
		const rimProtector = {
			hgt: 75,
			diq: 70,
			jmp: 60,
			spd: 35,
			tp: 25,
			dnk: 65,
			ins: 60,
			reb: 70,
			stre: 75,
			tendencyThree: 15,
		};
		const gamblingPerimeterD = {
			...DEFAULT_COACHING,
			paintDefense: -0.8,
			defensiveAggression: 0.8,
		};

		const fit = playerCoachFit(rimProtector, gamblingPerimeterD);
		const dialOnly = playerSystemFit(
			playerOptimalStyle(rimProtector),
			gamblingPerimeterD,
		);
		assert(fit >= 0.82, `backline eraser should grade B+: ${fit}`);
		assert(fit > dialOnly, `role demand should rescue: ${fit} vs ${dialOnly}`);
	});

	test("adaptable coaches tolerate misfits; above-neutral fits unaffected", () => {
		const paintSystem = {
			...DEFAULT_COACHING,
			threePointTendency: -1,
			crashOffensiveGlass: 0.8,
			paintDefense: 0.8,
		};
		const rigid = playerCoachFit(SHOOTER_RATINGS, paintSystem, 10);
		const neutral = playerCoachFit(SHOOTER_RATINGS, paintSystem, 50);
		const adaptable = playerCoachFit(SHOOTER_RATINGS, paintSystem, 90);
		assert(adaptable > neutral && neutral > rigid);

		const threeHappySystem = { ...DEFAULT_COACHING, threePointTendency: 1 };
		assert.strictEqual(
			playerCoachFit(SHOOTER_RATINGS, threeHappySystem, 10),
			playerCoachFit(SHOOTER_RATINGS, threeHappySystem, 90),
		);
	});
});

describe("fitEffect / fitAdjustedCoachingLevel", () => {
	test("neutral at FIT_NEUTRAL, clamps at extremes", () => {
		assert.strictEqual(fitEffect(FIT_NEUTRAL), 0);
		assert.strictEqual(fitEffect(1), 1);
		assert.strictEqual(fitEffect(0), -1);
	});

	test("perfect fit is +10 dev rating = +5% development", () => {
		assert.strictEqual(fitAdjustedCoachingLevel(50, 1), 60);
		assert.strictEqual(coachDevEffect(60), 0.05);
		assert.strictEqual(fitAdjustedCoachingLevel(95, 1), 100);
		assert.strictEqual(fitAdjustedCoachingLevel(5, 0), 0);
	});
});

describe("playoff coaching", () => {
	test("playoffMatchupWeight grows with series depth and clamps", () => {
		assert.strictEqual(playoffMatchupWeight(1), COACHING.PLAYOFF_MATCHUP_BASE);
		assert(playoffMatchupWeight(7) > playoffMatchupWeight(2));
		assert.strictEqual(
			playoffMatchupWeight(7),
			COACHING.PLAYOFF_MATCHUP_BASE + 6 * COACHING.PLAYOFF_SERIES_LEARN,
		);
		// Weird inputs clamp instead of exploding.
		assert.strictEqual(playoffMatchupWeight(0), playoffMatchupWeight(1));
		assert.strictEqual(playoffMatchupWeight(99), playoffMatchupWeight(7));
	});

	test("matchupAdjust weightMult scales the dial deltas", () => {
		const opp = {
			threeReliance: 0,
			interiorReliance: 1,
			ballHandling: 0,
			defReb: 0,
		};
		const base = { ...DEFAULT_COACHING };
		const regular = matchupAdjust(base, 100, opp, 1);
		const game7 = matchupAdjust(base, 100, opp, playoffMatchupWeight(7));
		// Packing the paint vs an interior team: the playoff adjustment is
		// bigger than the regular-season one.
		assert(regular.paintDefense > 0);
		assert(game7.paintDefense > regular.paintDefense);
	});
});

describe("fit distribution", () => {
	beforeAll(() => {
		resetG();
	});

	// The tuning check for FIT_NEUTRAL: across random players and coach
	// philosophies, the fit effect should be roughly centered with both signs
	// occurring. If this skews, tune FIT_NEUTRAL/FIT_HALF_RANGE in
	// coachingConstants.ts, not the call sites.
	test("fitEffect is roughly centered across random players and coaches", () => {
		const players = range(200).map(
			() => player.generate(0, 25, 2010, true, 50) as any,
		);
		const philosophies = range(10).map(() => genPhilosophy());

		let sum = 0;
		let n = 0;
		let positives = 0;
		let negatives = 0;
		let roleSum = 0;
		for (const p of players) {
			const ratings = p.ratings.at(-1);
			for (const philosophy of philosophies) {
				const effect = fitEffect(playerCoachFit(ratings, philosophy));
				sum += effect;
				n += 1;
				if (effect > 0) {
					positives += 1;
				} else if (effect < 0) {
					negatives += 1;
				}
				roleSum += playerRoleScore(ratings, philosophy).score;
			}
		}

		const mean = sum / n;
		const roleMean0 = roleSum / n;
		assert(
			mean > -0.25 && mean < 0.25,
			`mean fitEffect skewed: ${mean.toFixed(3)} (roleMean ${roleMean0.toFixed(3)}; tune ROLE_R0/ROLE_GAIN_UP, not FIT_NEUTRAL)`,
		);
		assert(positives > 0 && negatives > 0);

		// ROLE_R0 should sit at the empirical mean role score of generated
		// players, so the roleTerm is centered and the main guard isn't
		// silently absorbing a role-side skew.
		const roleMean = roleSum / n;
		assert(
			Math.abs(roleMean - ROLE_R0) < 0.1,
			`mean playerRoleScore ${roleMean.toFixed(3)} far from ROLE_R0 ${ROLE_R0} - retune ROLE_R0`,
		);
	});
});
