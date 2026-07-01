import { assert, describe, test } from "vitest";
import {
	aggregateOnOff,
	deriveLineupStats,
	emptyLineupStats,
	onOffStateKey,
} from "./lineupStats.ts";
import type { LineupStat as LineupStatBasketball } from "./types.basketball.ts";

const makeStats = (
	partial: Partial<LineupStatBasketball>,
): LineupStatBasketball => ({
	...emptyLineupStats(),
	...partial,
});

// Three lineup rows for a team whose selected duo is pids 1 and 2:
// both on, only 1 on, neither on.
const lineups = [
	{
		pids: [1, 2, 3, 4, 5],
		stats: makeStats({
			min: 100,
			poss: 200,
			oppPoss: 200,
			pts: 240,
			oppPts: 200,
		}),
	},
	{
		pids: [1, 3, 4, 5, 6],
		stats: makeStats({
			min: 50,
			poss: 100,
			oppPoss: 100,
			pts: 100,
			oppPts: 110,
		}),
	},
	{
		pids: [3, 4, 5, 6, 7],
		stats: makeStats({ min: 30, poss: 60, oppPoss: 60, pts: 55, oppPts: 65 }),
	},
];

describe("aggregateOnOff", () => {
	test("partitions all team minutes exhaustively", () => {
		const states = aggregateOnOff(lineups, [1, 2]);
		const totalMin = [...states.values()].reduce(
			(sum, state) => sum + state.stats.min,
			0,
		);
		const expectedMin = lineups.reduce((sum, l) => sum + l.stats.min, 0);
		assert.strictEqual(totalMin, expectedMin);
	});

	test("creates all 2^N states for N=2, including unobserved ones", () => {
		const states = aggregateOnOff(lineups, [1, 2]);
		assert.strictEqual(states.size, 4);

		// "Only 2" never happened, but the state should exist with zero stats
		const only2 = states.get(onOffStateKey([2]))!;
		assert.strictEqual(only2.stats.min, 0);
		assert.deepStrictEqual(only2.onPids, [2]);
	});

	test("buckets rows into the correct states", () => {
		const states = aggregateOnOff(lineups, [1, 2]);

		const bothOn = states.get(onOffStateKey([1, 2]))!;
		assert.strictEqual(bothOn.stats.min, 100);
		assert.strictEqual(bothOn.countOn, 2);

		const only1 = states.get(onOffStateKey([1]))!;
		assert.strictEqual(only1.stats.min, 50);

		const bothOff = states.get(onOffStateKey([]))!;
		assert.strictEqual(bothOff.stats.min, 30);
		assert.strictEqual(bothOff.countOn, 0);
	});

	test("rates come from summed totals, not averaged rates", () => {
		// Two "both on" rows with very different sample sizes: averaging the two
		// rows' ortgs would give 110, but the possession-weighted truth is 104.
		const uneven = [
			{
				pids: [1, 2, 3, 4, 5],
				stats: makeStats({ min: 10, poss: 20, pts: 24 }), // ortg 120
			},
			{
				pids: [1, 2, 4, 5, 6],
				stats: makeStats({ min: 40, poss: 80, pts: 80 }), // ortg 100
			},
		];
		const states = aggregateOnOff(uneven, [1, 2]);
		const bothOn = states.get(onOffStateKey([1, 2]))!;
		assert.strictEqual(deriveLineupStats(bothOn.stats).ortg, 104);
	});

	test("empty selection puts everything in the all-off state", () => {
		const states = aggregateOnOff(lineups, []);
		assert.strictEqual(states.size, 1);
		assert.strictEqual(states.get("")!.stats.min, 180);
	});
});

describe("deriveLineupStats", () => {
	test("zero possessions/minutes do not divide by zero", () => {
		const derived = deriveLineupStats(emptyLineupStats());
		assert.strictEqual(derived.ortg, 0);
		assert.strictEqual(derived.drtg, 0);
		assert.strictEqual(derived.net, 0);
		assert.strictEqual(derived.pace, 0);
	});
});
