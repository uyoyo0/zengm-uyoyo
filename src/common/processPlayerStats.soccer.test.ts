import { describe, expect, test } from "vitest";
import processPlayerStats from "./processPlayerStats.soccer.ts";

describe("processPlayerStats soccer", () => {
	test("preserves saved goals and assists and derives rate stats", () => {
		const processed = processPlayerStats(
			{
				gp: 4,
				g: 3,
				a: 2,
				matchRating: 29.2,
				pas: 100,
				pasCmp: 82,
				aw: 6,
				aa: 10,
			},
			["g", "a", "matchRating", "pasPct", "aerialPct", "keyStats"],
		);

		expect(processed).toMatchObject({
			g: 3,
			a: 2,
			matchRating: 7.3,
			pasPct: 82,
			aerialPct: 60,
			keyStats: "3 G, 2 A",
		});
	});

	test("formats goalkeeper totals without producing NaN", () => {
		const processed = processPlayerStats(
			{ gp: 2, g: 0, a: 0, sv: 8, ga: 2, cs: 1 },
			["g", "a", "svPct", "goalsPrevented", "keyStats"],
		);

		expect(processed).toMatchObject({
			g: 0,
			a: 0,
			svPct: 80,
			goalsPrevented: 0,
			keyStats: "1 CS, 80.0 SV%",
		});
	});

	test("derives possession, per-90, and goalkeeper value stats", () => {
		const processed = processPlayerStats(
			{
				min: 900,
				drbAtt: 40,
				drbCmp: 22,
				crs: 20,
				crsCmp: 5,
				prs: 80,
				prsWon: 24,
				prgC: 30,
				psxg: 15.4,
				ga: 13,
			},
			["drbPct", "crsPct", "prsPct", "prgC90", "goalsPrevented"],
		);

		expect(processed.crsPct).toBe(25);
		expect(processed.prsPct).toBe(30);
		expect(processed.prgC90).toBe(3);
		expect(processed.drbPct).toBeCloseTo(55);
		expect(processed.goalsPrevented).toBeCloseTo(2.4);
	});
});
