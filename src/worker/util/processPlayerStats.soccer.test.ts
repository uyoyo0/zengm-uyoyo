import { describe, expect, test } from "vitest";
import { processPlayerStats } from "./processPlayerStats.ts";

describe("worker processPlayerStats soccer routing", () => {
	test("uses soccer totals on player profiles", () => {
		expect(
			processPlayerStats({ gp: 5, g: 4, a: 3, matchRating: 36.5 }, [
				"g",
				"a",
				"matchRating",
				"keyStats",
			]),
		).toMatchObject({
			g: 4,
			a: 3,
			matchRating: 7.3,
			keyStats: "4 G, 3 A",
		});
	});
});
