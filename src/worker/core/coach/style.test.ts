import { assert, beforeAll, describe, test } from "vitest";
import {
	fitBreakdown,
	philosophyFit,
	playerOptimalStyle,
} from "./style.ts";
import genPhilosophy from "./genPhilosophy.ts";
import { player } from "../index.ts";
import { resetG } from "../../../test/helpers.ts";
import { DEFAULT_COACHING } from "../../../common/constants.ts";
import {
	FIT_NEUTRAL,
	coachDevEffect,
	fitAdjustedCoachingLevel,
	fitEffect,
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
		for (const p of players) {
			const preferred = playerOptimalStyle(p.ratings.at(-1));
			for (const philosophy of philosophies) {
				const effect = fitEffect(philosophyFit(preferred, philosophy));
				sum += effect;
				n += 1;
				if (effect > 0) {
					positives += 1;
				} else if (effect < 0) {
					negatives += 1;
				}
			}
		}

		const mean = sum / n;
		assert(
			mean > -0.25 && mean < 0.25,
			`mean fitEffect skewed: ${mean.toFixed(3)} (tune FIT_NEUTRAL)`,
		);
		assert(positives > 0 && negatives > 0);
	});
});
