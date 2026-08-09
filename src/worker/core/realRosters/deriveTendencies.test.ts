import { assert, test } from "vitest";
import deriveTendencies, {
	deriveTendenciesPerSeason,
	lerpTendenciesToward,
} from "./deriveTendencies.basketball.ts";
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
	for (const [key, value] of Object.entries(t)) {
		if (typeof value === "number") {
			assert(value >= 0 && value <= 100, `${key} out of range: ${value}`);
		}
	}
	assert.equal(t.tendencyThree, 50);
	assert.equal(t.tendencyUsage, 50);
	assert.equal(t.tendencyPass, 50);
	// Skill fallback is not an absolute (stats-derived) shot mix.
	assert.equal(t.tendencyAbsolute, false);
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
	// A real career sample makes the shot mix absolute (era scaling skipped).
	assert.equal(shooter.tendencyAbsolute, true);
	assert.equal(nonShooter.tendencyAbsolute, true);
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

test("without location data, rim share is estimated from box stats", () => {
	// Midrange guard: jump-shooter ratings (fg >> dnk), modest 2P% for the era,
	// few free throws. The old athleticism fallback would have handed him a
	// league-average-or-more rim diet; the box-stat model must not.
	const guard = deriveTendencies(
		[
			statRow({
				fga: 2000,
				tpa: 1000,
				fg: 850,
				tp: 350,
				fta: 200,
				min: 2000,
			}),
		],
		{ fg: 80, dnk: 40 } as OnlyRatings,
	);
	// Rim-running big: huge era-relative 2P%, big FT rate, finisher ratings.
	const big = deriveTendencies(
		[
			statRow({
				fga: 1200,
				tpa: 0,
				fg: 700,
				fta: 600,
				min: 2000,
			}),
		],
		{ fg: 30, dnk: 90, ins: 80, hgt: 80, stre: 70 } as OnlyRatings,
	);
	assert(guard.tendencyAtRim < 40, `guard atRim ${guard.tendencyAtRim}`);
	assert(big.tendencyAtRim > 65, `big atRim ${big.tendencyAtRim}`);
	assert.equal(guard.tendencyAbsolute, true);
	assert.equal(big.tendencyAbsolute, true);
});

test("career-average ratings are used when an array of rows is passed", () => {
	// Same career stats; the decline-year row alone (dnk 30) reads as a
	// non-finisher, but averaged with the prime rows (dnk 90) he is one.
	const rows = [statRow({ fga: 1200, tpa: 0, fg: 700, fta: 600, min: 2000 })];
	const prime = { fg: 30, dnk: 90, hgt: 80 } as OnlyRatings;
	const decline = { fg: 30, dnk: 30, hgt: 80 } as OnlyRatings;
	const fromDecline = deriveTendencies(rows, decline);
	const fromCareer = deriveTendencies(rows, [prime, prime, decline]);
	assert(
		fromCareer.tendencyAtRim > fromDecline.tendencyAtRim,
		`career ${fromCareer.tendencyAtRim} should exceed decline-only ${fromDecline.tendencyAtRim}`,
	);
});

test("free-throw drawing target comes from career FT rate", () => {
	const magnet = deriveTendencies(
		[statRow({ fga: 1000, fta: 550, min: 2000 })],
		neutralSkills,
	);
	const avoider = deriveTendencies(
		[statRow({ fga: 1000, fta: 120, min: 2000 })],
		neutralSkills,
	);
	assert.equal(magnet.ftrDraw, 0.55);
	assert.equal(avoider.ftrDraw, 0.12);
	// Tiny careers get no target (composite fallback in the sim).
	const tiny = deriveTendencies(
		[statRow({ fga: 50, fta: 40, min: 100 })],
		neutralSkills,
	);
	assert.equal(tiny.ftrDraw, undefined);
});

test("below-sample careers keep the skill baseline", () => {
	// Only 50 FGA (< MIN_FGA) so the stat must NOT override the skill fallback.
	const t = deriveTendencies(
		[statRow({ fga: 50, tpa: 40, min: 100 })],
		neutralSkills,
	);
	assert.equal(t.tendencyThree, 50);
	assert.equal(t.tendencyAbsolute, false);
});

test("per-season: tendencies track career phases; future seasons keep the late-career identity", () => {
	// A career that evolves from rim-attacking foul magnet to three-point
	// specialist over 2010-2017.
	const rows = [];
	for (let i = 0; i < 8; i++) {
		rows.push(
			statRow({
				season: 2010 + i,
				fga: 1200,
				tpa: 60 + i * 80,
				fg: 560,
				tp: 20 + i * 28,
				fta: 460 - i * 40,
				min: 2500,
			}),
		);
	}
	const ratingsRows = [
		{ season: 2010 },
		{ season: 2017 },
		{ season: 2025 },
	] as any[];

	const bySeason = deriveTendenciesPerSeason(rows, ratingsRows, 1, 0);
	const early = bySeason.get(2010)!;
	const late = bySeason.get(2017)!;
	const future = bySeason.get(2025)!;

	assert(
		late.tendencyThree > early.tendencyThree + 10,
		`three should rise: ${early.tendencyThree} -> ${late.tendencyThree}`,
	);
	assert(
		early.ftrDraw! > late.ftrDraw! + 0.05,
		`FT rate should fall: ${early.ftrDraw} -> ${late.ftrDraw}`,
	);
	// A season past the real career clamps to the nearest real era.
	assert.equal(future.tendencyThree, late.tendencyThree);
	assert.equal(future.ftrDraw, late.ftrDraw);
	// Vintage = the real season the tendencies represent (clamped into span).
	assert.equal(early.tendencyVintage, 2010);
	assert.equal(late.tendencyVintage, 2017);
	assert.equal(future.tendencyVintage, 2017);

	// Seasonality 0 = one career-aggregate identity on every row, matching the
	// career derivation exactly.
	const flat = deriveTendenciesPerSeason(rows, ratingsRows, 0, 0);
	const career = deriveTendencies(rows, ratingsRows as any);
	assert.equal(flat.get(2010)!.tendencyThree, career.tendencyThree);
	assert.equal(flat.get(2017)!.tendencyThree, career.tendencyThree);
	assert.equal(flat.get(2010)!.ftrDraw, career.ftrDraw);
	// And full seasonality straddles the career value.
	assert(early.tendencyThree < career.tendencyThree);
	assert(late.tendencyThree > career.tendencyThree);
});

test("lerpTendenciesToward moves a row toward the target by d", () => {
	const target = deriveTendencies(
		[statRow({ fga: 1000, tpa: 550, fta: 400, min: 2000 })],
		neutralSkills,
	);
	const makeRow = () => ({
		tendencyThree: 40,
		tendencyUsage: 40,
		ftrDraw: 0.2,
		accThree: 0,
	});

	// d=1 snaps to the target.
	const snap: any = makeRow();
	lerpTendenciesToward(snap, target, 1);
	assert.equal(snap.tendencyThree, target.tendencyThree);
	assert.equal(snap.ftrDraw, target.ftrDraw);
	assert.equal(snap.tendencyDataEnd, target.tendencyDataEnd);

	// d=0 is a no-op.
	const frozen: any = makeRow();
	lerpTendenciesToward(frozen, target, 0);
	assert.equal(frozen.tendencyThree, 40);
	assert.equal(frozen.ftrDraw, 0.2);

	// d=0.5 lands halfway.
	const half: any = makeRow();
	lerpTendenciesToward(half, target, 0.5);
	assert.equal(
		half.tendencyThree,
		Math.round(40 + 0.5 * (target.tendencyThree - 40)),
	);
	assert(Math.abs(half.ftrDraw - (0.2 + 0.5 * (target.ftrDraw! - 0.2))) < 1e-9);
});

test("noise varies tendencies around the exact value, within clamps", () => {
	const rows = [statRow({ fga: 1000, tpa: 300, min: 2000 })];
	const exact = deriveTendencies(rows, neutralSkills);

	let sum = 0;
	let anyDifferent = false;
	const N = 300;
	for (let i = 0; i < N; i++) {
		const t = deriveTendencies(rows, neutralSkills, 7);
		assert(t.tendencyThree >= 0 && t.tendencyThree <= 100);
		// Noise must not change the stats-derived (absolute) marker.
		assert.equal(t.tendencyAbsolute, true);
		sum += t.tendencyThree;
		if (t.tendencyThree !== exact.tendencyThree) {
			anyDifferent = true;
		}
	}
	assert(anyDifferent, "noise should actually vary the output");
	// Mean of the draws stays near the exact derivation (sigma 7, N=300 =>
	// s.e. ~0.4; 2 points is a generous band).
	const mean = sum / N;
	assert(
		Math.abs(mean - exact.tendencyThree) < 2,
		`noisy mean ${mean} drifted from exact ${exact.tendencyThree}`,
	);
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
