import { assert, describe, test } from "vitest";
import {
	driftShotTendencies,
	driftUsageTendency,
	skillTendencyBases,
	USAGE_DRIFT_MAX_STEP,
} from "./genTendencies.basketball.ts";

const ELITE_SCORER = {
	ins: 75,
	dnk: 80,
	fg: 78,
	tp: 75,
	oiq: 82,
};

const WASHED = {
	ins: 40,
	dnk: 38,
	fg: 42,
	tp: 45,
	oiq: 55,
};

// Average drift over trials, to wash out the sigma-1 noise.
const meanDrift = (
	skills: Record<string, number>,
	tendencyUsage: number,
	coachTactics: number,
	trials = 300,
) => {
	let total = 0;
	for (let i = 0; i < trials; i++) {
		const ratings: any = { ...skills, tendencyUsage };
		driftUsageTendency(ratings, coachTactics);
		total += ratings.tendencyUsage - tendencyUsage;
	}
	return total / trials;
};

describe("driftUsageTendency", () => {
	test("a breakout scorer's usage identity rises; a fading star's falls", () => {
		// Elite skills, role-player identity: implied ~64, current 45.
		assert(meanDrift(ELITE_SCORER, 45, 50) > 2);

		// Washed skills, star identity: implied ~46, current 70.
		assert(meanDrift(WASHED, 70, 50) < -3);
	});

	test("a sharp coach restructures the offense faster", () => {
		const fast = meanDrift(ELITE_SCORER, 45, 100);
		const slow = meanDrift(ELITE_SCORER, 45, 0);
		assert(fast > slow * 1.3, `${fast} vs ${slow}`);
	});

	test("settled identities barely move", () => {
		const implied = skillTendencyBases(ELITE_SCORER).tendencyUsage;
		const drift = meanDrift(ELITE_SCORER, Math.round(implied), 50);
		assert(Math.abs(drift) < 1, `${drift}`);
	});

	test("per-year step is bounded and values stay in range", () => {
		for (let i = 0; i < 100; i++) {
			const ratings: any = { ...ELITE_SCORER, tendencyUsage: 0 };
			driftUsageTendency(ratings, 100);
			assert(ratings.tendencyUsage <= USAGE_DRIFT_MAX_STEP + 1);
			assert(ratings.tendencyUsage >= 0);

			const ratings2: any = { ...WASHED, tendencyUsage: 100 };
			driftUsageTendency(ratings2, 100);
			assert(ratings2.tendencyUsage >= 100 - USAGE_DRIFT_MAX_STEP - 1);
			assert(ratings2.tendencyUsage <= 100);
		}
	});

	test("missing tendency defaults to neutral and drifts from there", () => {
		const ratings: any = { ...ELITE_SCORER };
		driftUsageTendency(ratings, 50);
		assert(typeof ratings.tendencyUsage === "number");
		assert(ratings.tendencyUsage >= 50 - USAGE_DRIFT_MAX_STEP - 1);
	});
});

describe("driftShotTendencies", () => {
	const meanShotDrift = (
		base: Record<string, number | undefined>,
		key: string,
		strength = 1,
		trials = 300,
	) => {
		let total = 0;
		for (let i = 0; i < trials; i++) {
			const ratings: any = { ...base };
			driftShotTendencies(ratings, 50, strength);
			total += (ratings[key] ?? 50) - ((base[key] as number) ?? 50);
		}
		return total / trials;
	};

	test("a developed shooter's three tendency rises toward his skills", () => {
		// Sharpshooter skills, low historical three tendency (young-career
		// identity).
		const base = {
			tp: 85,
			oiq: 70,
			tendencyThree: 30,
		};
		assert(meanShotDrift(base, "tendencyThree") > 2);
	});

	test("strength 0 is a no-op; partial strength scales the step", () => {
		const base = {
			tp: 85,
			oiq: 70,
			tendencyThree: 30,
		};
		assert.equal(meanShotDrift(base, "tendencyThree", 0), 0);
		const full = meanShotDrift(base, "tendencyThree", 1, 500);
		const half = meanShotDrift(base, "tendencyThree", 0.5, 500);
		assert(half > 0.5 && half < full, `${half} vs ${full}`);
	});

	test("ftrDraw drifts toward the foul-drawing skills, bounded", () => {
		// Ground-bound jump shooter with a foul-magnet history: FTr erodes.
		const fades = {
			hgt: 40,
			spd: 40,
			drb: 45,
			dnk: 35,
			oiq: 55,
			ftrDraw: 0.5,
		};
		let total = 0;
		for (let i = 0; i < 100; i++) {
			const ratings: any = { ...fades };
			driftShotTendencies(ratings, 50);
			assert(ratings.ftrDraw >= 0.48 - 0.021, `${ratings.ftrDraw}`);
			total += ratings.ftrDraw - fades.ftrDraw;
		}
		assert(total / 100 < -0.005, `${total / 100}`);
	});
});
