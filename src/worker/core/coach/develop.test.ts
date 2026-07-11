import { assert, describe, test } from "vitest";
import developCoach, {
	playoffExperienceNudge,
	shouldRetire,
} from "./develop.ts";
import ovr from "./ovr.ts";
import type { Coach } from "../../../common/types.ts";

const makeCoach = (age: number, rating = 50, season = 2020): Coach => {
	const noOvr = {
		development: rating,
		tactics: rating,
		adaptability: rating,
		motivation: rating,
	};
	return {
		cid: 1,
		tid: 0,
		firstName: "Test",
		lastName: "Coach",
		face: {} as any,
		born: { year: season - age, loc: "USA" },
		contract: { amount: 5000, exp: season + 2 },
		ratings: { ...noOvr, ovr: ovr(noOvr) },
		philosophy: {
			threePointTendency: 0,
			pace: 0,
			crashOffensiveGlass: 0,
			paintDefense: 0,
			defensiveAggression: 0,
		},
		awards: [],
	};
};

const meanOvrDelta = (age: number, rating: number, trials = 200) => {
	let total = 0;
	for (let i = 0; i < trials; i++) {
		const c = makeCoach(age, rating);
		const before = c.ratings.ovr;
		developCoach(c, 2020);
		total += c.ratings.ovr - before;
	}
	return total / trials;
};

describe("developCoach", () => {
	test("young coaches improve, old coaches decline", () => {
		assert(meanOvrDelta(40, 50) > 0.5);
		assert(meanOvrDelta(70, 50) < -1);
	});

	test("young low-rated coaches grow fastest", () => {
		assert(meanOvrDelta(40, 30) > meanOvrDelta(40, 70));
	});

	test("ratings stay clamped and ovr is recomputed", () => {
		const c = makeCoach(35, 99);
		developCoach(c, 2020);
		for (const key of [
			"development",
			"tactics",
			"adaptability",
			"motivation",
		] as const) {
			assert(c.ratings[key] >= 0 && c.ratings[key] <= 100);
		}
		assert.strictEqual(c.ratings.ovr, ovr(c.ratings));
	});

	test("appends history once per season (idempotent)", () => {
		const c = makeCoach(45);
		developCoach(c, 2020);
		developCoach(c, 2020);
		assert.strictEqual(c.ratingsHistory!.length, 1);
		assert.strictEqual(c.ratingsHistory![0]!.season, 2020);
		developCoach(c, 2021);
		assert.strictEqual(c.ratingsHistory!.length, 2);
	});

	test("20-season Monte Carlo: pool distribution stays sane", () => {
		// A pool of coaches developing for 20 seasons should not drift to the
		// extremes or explode in variance.
		const POOL = 200;
		const coaches = Array.from({ length: POOL }, (_, i) =>
			makeCoach(38 + (i % 15), 50, 2020),
		);
		for (let season = 2020; season < 2040; season++) {
			for (const c of coaches) {
				// Simulate pool turnover: coaches that would retire are replaced by a
				// fresh mid-career coach, like ensureCoaches does.
				if (season - c.born.year >= 66) {
					c.born.year = season - 42;
					c.ratings.development = 50;
					c.ratings.tactics = 50;
					c.ratings.adaptability = 50;
					c.ratings.motivation = 50;
					c.ratingsHistory = [];
				}
				developCoach(c, season);
			}
		}
		const ovrs = coaches.map((c) => c.ratings.ovr);
		const mean = ovrs.reduce((a, b) => a + b, 0) / ovrs.length;
		const sd = Math.sqrt(
			ovrs.reduce((a, b) => a + (b - mean) ** 2, 0) / ovrs.length,
		);
		assert(mean > 40 && mean < 65, `pool mean ovr drifted: ${mean}`);
		assert(sd > 5 && sd < 25, `pool ovr sd out of range: ${sd}`);
	});
});

describe("playoffExperienceNudge", () => {
	const seasonsRow = (season: number, playoffRoundsWon?: number) => ({
		season,
		tid: 0,
		won: 45,
		lost: 37,
		expectedWins: 41,
		playoffRoundsWon,
	});

	test("deep runs boost, sustained misses drag, first-round exits neutral", () => {
		const finalsCoach = {
			seasons: [seasonsRow(2017, 3), seasonsRow(2018, 3), seasonsRow(2019, 3)],
		};
		assert.strictEqual(playoffExperienceNudge(finalsCoach, 2020), 0.6);

		const lottery = {
			seasons: [
				seasonsRow(2017, -1),
				seasonsRow(2018, -1),
				seasonsRow(2019, -1),
			],
		};
		assert.strictEqual(playoffExperienceNudge(lottery, 2020), -0.2);

		const firstRound = {
			seasons: [seasonsRow(2017, 0), seasonsRow(2018, 0), seasonsRow(2019, 0)],
		};
		assert.strictEqual(playoffExperienceNudge(firstRound, 2020), 0);
	});

	test("no recent coached seasons or missing playoff data means no nudge", () => {
		assert.strictEqual(playoffExperienceNudge({ seasons: [] }, 2020), 0);
		assert.strictEqual(playoffExperienceNudge({}, 2020), 0);
		// Old rows without playoff data (pre-migration) don't count as misses.
		const legacy = { seasons: [seasonsRow(2019, undefined)] };
		assert.strictEqual(playoffExperienceNudge(legacy, 2020), 0);
		// Only the recent window counts.
		const ancient = { seasons: [seasonsRow(2010, 3)] };
		assert.strictEqual(playoffExperienceNudge(ancient, 2020), 0);
	});

	test("nudge lands on tactics and adaptability, not development", () => {
		const trials = 400;
		const meanKeyDelta = (
			playoffRoundsWon: number,
			key: "tactics" | "development",
		) => {
			let total = 0;
			for (let i = 0; i < trials; i++) {
				const c = makeCoach(50); // plateau age: base drift ~+0.4
				c.seasons = [
					seasonsRow(2017, playoffRoundsWon),
					seasonsRow(2018, playoffRoundsWon),
					seasonsRow(2019, playoffRoundsWon),
				];
				const before = c.ratings[key];
				developCoach(c, 2020);
				total += c.ratings[key] - before;
			}
			return total / trials;
		};

		// Expected gap between finals runs (+0.6) and misses (-0.3) is 0.9/yr on
		// tactics; noise sigma is 1.8, so 400 trials gives se ~0.13 per mean.
		const tacticsGap = meanKeyDelta(3, "tactics") - meanKeyDelta(-1, "tactics");
		assert(tacticsGap > 0.4, `tactics gap too small: ${tacticsGap}`);

		const devGap =
			meanKeyDelta(3, "development") - meanKeyDelta(-1, "development");
		assert(Math.abs(devGap) < 0.45, `development should be unaffected: ${devGap}`);
	});
});

describe("shouldRetire", () => {
	test("never before 66, always at 75", () => {
		for (let i = 0; i < 100; i++) {
			assert.strictEqual(shouldRetire(65), false);
			assert.strictEqual(shouldRetire(75), true);
		}
	});

	test("probability rises with age", () => {
		const rate = (age: number) => {
			let n = 0;
			for (let i = 0; i < 2000; i++) {
				if (shouldRetire(age)) {
					n++;
				}
			}
			return n / 2000;
		};
		assert(rate(67) < rate(73));
	});
});
