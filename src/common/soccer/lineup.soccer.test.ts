import { describe, expect, test } from "vitest";
import {
	optimizeSoccerLineup,
	removePlayerFromSoccerLineup,
} from "./lineup.ts";

const candidate = (
	id: number,
	naturalPosition: string,
	positionRatings: Record<string, number>,
) => ({ id, naturalPosition, positionRatings });

describe("soccer formation lineup selection", () => {
	test("optimizes the whole lineup instead of letting the first slot take a striker", () => {
		const lineup = optimizeSoccerLineup({
			candidates: [
				candidate(1, "ST", { LB: 80, ST: 95 }),
				candidate(2, "LB", { LB: 78, ST: 30 }),
			],
			slots: ["LB", "ST"],
		});

		expect(lineup).toEqual([2, 1]);
	});

	test("preserves every valid starter at their saved formation index", () => {
		const lineup = optimizeSoccerLineup({
			candidates: [
				candidate(10, "GK", { GK: 75 }),
				candidate(12, "LB", { LB: 65 }),
				candidate(19, "ST", { LB: 82, ST: 92 }),
			],
			locked: [10, -1, 19],
			slots: ["GK", "LB", "ST"],
		});

		expect(lineup).toEqual([10, 12, 19]);
	});

	test("leaves a formation hole when a player departs", () => {
		expect(removePlayerFromSoccerLineup([10, 11, 12, 13], 11)).toEqual([
			10, -1, 12, 13,
		]);
	});
});
