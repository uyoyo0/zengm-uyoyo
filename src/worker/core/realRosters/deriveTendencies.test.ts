import { assert, test } from "vitest";
import deriveTendencies from "./deriveTendencies.basketball.ts";
import type { BasketballStats } from "./loadStats.basketball.ts";
import type { OnlyRatings } from "./getOnlyRatings.ts";

// Neutral skills (everything 50) so skill-based fallbacks land at 50.
const neutralSkills = {} as OnlyRatings;

const statRow = (
	extra: Partial<BasketballStats["stats"][number]>,
): BasketballStats["stats"][number] => ({
	slug: "x",
	season: 2015,
	abbrev: "ABC",
	jerseyNumber: "1",
	...extra,
});

test("empty career stats fall back to skill baseline (neutral -> ~50)", () => {
	const t = deriveTendencies([], neutralSkills);
	for (const key of Object.keys(t) as (keyof typeof t)[]) {
		assert(t[key] >= 0 && t[key] <= 100, `${key} out of range: ${t[key]}`);
	}
	assert.equal(t.tendencyThree, 50);
	assert.equal(t.tendencyUsage, 50);
	assert.equal(t.tendencyPass, 50);
});

test("a high-3PA-share career yields high tendencyThree", () => {
	const shooter = deriveTendencies(
		[statRow({ fga: 1000, tpa: 550, min: 2000 })],
		neutralSkills,
	);
	const nonShooter = deriveTendencies(
		[statRow({ fga: 1000, tpa: 0, min: 2000 })],
		neutralSkills,
	);
	assert(
		shooter.tendencyThree > 65,
		`shooter tendencyThree ${shooter.tendencyThree}`,
	);
	assert(
		nonShooter.tendencyThree < 20,
		`non-shooter tendencyThree ${nonShooter.tendencyThree}`,
	);
	assert(shooter.tendencyThree > nonShooter.tendencyThree);
});

test("usage maps to usage tendency; assist ratio maps to pass tendency", () => {
	// Distributor: many assists relative to his own shot volume.
	const distributor = deriveTendencies(
		[
			statRow({
				fga: 800,
				fta: 200,
				ast: 600,
				tov: 200,
				min: 2000,
				usgp: 24,
			}),
		],
		neutralSkills,
	);
	// Scorer: high usage, few assists relative to a big shot diet.
	const scorer = deriveTendencies(
		[
			statRow({
				fga: 1400,
				fta: 400,
				ast: 150,
				tov: 150,
				min: 2000,
				usgp: 33,
			}),
		],
		neutralSkills,
	);
	assert(scorer.tendencyUsage > 65, `scorer usage ${scorer.tendencyUsage}`);
	assert(
		distributor.tendencyPass > 75,
		`distributor pass ${distributor.tendencyPass}`,
	);
	// A high-usage scorer must NOT read as pass-first (the SGA/AST% bug).
	assert(scorer.tendencyPass < 55, `scorer pass ${scorer.tendencyPass}`);
	assert(distributor.tendencyPass > scorer.tendencyPass);
});

test("interior shot mix maps to post vs at-rim tendencies", () => {
	const postBig = deriveTendencies(
		[
			statRow({
				fga: 1000,
				min: 2000,
				fgaLowPost: 400,
				fgaAtRim: 300,
				fgaMidRange: 100,
			}),
		],
		neutralSkills,
	);
	const rimRunner = deriveTendencies(
		[
			statRow({
				fga: 1000,
				min: 2000,
				fgaLowPost: 20,
				fgaAtRim: 600,
				fgaMidRange: 180,
			}),
		],
		neutralSkills,
	);
	assert(postBig.tendencyPost > rimRunner.tendencyPost);
	assert(rimRunner.tendencyAtRim > postBig.tendencyAtRim);
});

test("below-sample careers keep the skill baseline", () => {
	// Only 50 FGA (< MIN_FGA) so the stat must NOT override the skill fallback.
	const t = deriveTendencies(
		[statRow({ fga: 50, tpa: 40, min: 100 })],
		neutralSkills,
	);
	assert.equal(t.tendencyThree, 50);
});

test("playoff rows are ignored", () => {
	const t = deriveTendencies(
		[
			statRow({ fga: 1000, tpa: 0, min: 2000 }),
			statRow({ fga: 1000, tpa: 1000, min: 2000, playoffs: true }),
		],
		neutralSkills,
	);
	// Only the regular-season row (0 threes) should count; if the playoff row
	// (all threes) leaked in, tendencyThree would be far higher.
	assert(t.tendencyThree < 20, `tendencyThree ${t.tendencyThree}`);
});
