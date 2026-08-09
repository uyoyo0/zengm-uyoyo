import { describe, expect, test } from "vitest";
import { formatAwardStats } from "./AwardsAndChamp.tsx";

describe("formatAwardStats", () => {
	test("formats soccer attacking stats", () => {
		expect(
			formatAwardStats(
				{ gp: 31, g: 20, a: 8, xg: 18.24, matchRating: 7.34 },
				"attack",
			),
		).toBe("31 apps · 20 goals · 8 assists · 18.2 xG · 7.3 rating");
	});

	test("formats soccer goalkeeper stats as a percentage", () => {
		expect(
			formatAwardStats(
				{ gp: 34, cs: 13, svPct: 83.955, matchRating: 7.12 },
				"goalkeeper",
			),
		).toBe("34 apps · 13 clean sheets · 84.0% saves · 7.1 rating");
	});

	test("does not invent missing historical defensive stats", () => {
		expect(formatAwardStats({ gp: 28, matchRating: 7.2 }, "defense")).toBe(
			"28 apps · 7.2 rating",
		);
	});
});
