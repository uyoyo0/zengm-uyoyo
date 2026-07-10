import { assert, beforeEach, describe, test } from "vitest";
import updateFrivolitiesLineups from "./frivolitiesLineups.ts";
import { idb } from "../db/index.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { emptyLineupStats } from "../../common/lineupStats.ts";

// Two lineup rows for one team-season:
// - Unit A (pids 1-5): 1000 min, ORtg 110, DRtg 100 -> net +10
// - Unit B (pids 2-6): 1000 min, ORtg 95, DRtg 100 -> net -5
const seedLineups = async () => {
	await idb.cache.lineups.add({
		tid: 0,
		season: 2016,
		playoffs: false,
		pids: [1, 2, 3, 4, 5],
		stats: {
			...emptyLineupStats(),
			min: 1000,
			poss: 2000,
			oppPoss: 2000,
			pts: 2200,
			oppPts: 2000,
		},
	});
	await idb.cache.lineups.add({
		tid: 0,
		season: 2016,
		playoffs: false,
		pids: [2, 3, 4, 5, 6],
		stats: {
			...emptyLineupStats(),
			min: 1000,
			poss: 2000,
			oppPoss: 2000,
			pts: 1900,
			oppPts: 2000,
		},
	});
};

describe("frivolitiesLineups", () => {
	beforeEach(async () => {
		resetG();
		await resetCache({});
		await seedLineups();

		// resolveNames falls through to the store for pids missing from the cache;
		// an empty players store is fine, names just come back as "???".
		idb.league = {
			transaction: () => ({
				store: {
					// eslint-disable-next-line require-yield
					async *iterate() {
						return;
					},
				},
			}),
		} as any;
	});

	test("best lineups ranks by net rating", async () => {
		const result = (await updateFrivolitiesLineups(
			{ type: "best" } as any,
			["firstRun"],
			{},
		))!;
		if (result.mode !== "lineup") {
			throw new Error("Wrong mode");
		}
		assert.strictEqual(result.rows.length, 2);
		assert.deepStrictEqual(
			result.rows[0]!.players.map((p: any) => p.pid),
			[1, 2, 3, 4, 5],
		);
		assert.strictEqual(Math.round(result.rows[0]!.net), 10);
		assert.strictEqual(Math.round(result.rows[1]!.net), -5);
	});

	test("on/off computes on minus off net per player", async () => {
		const result = (await updateFrivolitiesLineups(
			{ type: "on_off" } as any,
			["firstRun"],
			{},
		))!;
		if (result.mode !== "onoff") {
			throw new Error("Wrong mode");
		}

		// Players 2-5 have 0 off minutes and are filtered; only 1 and 6 qualify.
		assert.strictEqual(result.rows.length, 2);

		const first = result.rows[0] as any;
		assert.strictEqual(first.player.pid, 1);
		assert.strictEqual(Math.round(first.netOn), 10);
		assert.strictEqual(Math.round(first.netOff), -5);
		assert.strictEqual(Math.round(first.diff), 15);

		const last = result.rows[1] as any;
		assert.strictEqual(last.player.pid, 6);
		assert.strictEqual(Math.round(last.diff), -15);
	});

	test("duos aggregate careers and respect the minutes floor", async () => {
		const result = (await updateFrivolitiesLineups(
			{ type: "duos" } as any,
			["firstRun"],
			{},
		))!;
		if (result.mode !== "duo") {
			throw new Error("Wrong mode");
		}

		// Pairs involving 1 or 6 have only 1000 minutes together (< 1500 floor).
		// The 6 pairs among players 2-5 each have 2000 minutes and net +2.5.
		assert.strictEqual(result.rows.length, 6);
		for (const row of result.rows) {
			assert.strictEqual(Math.round(row.min), 2000);
			assert.strictEqual(row.net, 2.5);
		}
	});

	test("trios aggregate three-man combos with a lower floor", async () => {
		const result = (await updateFrivolitiesLineups(
			{ type: "trios" } as any,
			["firstRun"],
			{},
		))!;
		if (result.mode !== "duo") {
			throw new Error("Wrong mode");
		}
		assert.strictEqual((result as any).comboLabel, "Trio");

		// Trios entirely within players 2-5 (C(4,3) = 4 of them) have 2000
		// minutes; all others include player 1 or 6 and have only 1000, which is
		// exactly the 1000-minute floor - so those qualify too. Unit A trios
		// with player 1 net +10; unit B trios with player 6 net -5; the shared
		// 2-5 trios blend to +2.5 over 2000 minutes.
		const shared = result.rows.filter((row) => Math.round(row.min) === 2000);
		assert.strictEqual(shared.length, 4);
		for (const row of shared) {
			assert.strictEqual(row.players.length, 3);
			assert.strictEqual(row.net, 2.5);
		}
		// Best trios are the unit-A-only ones at +10.
		assert.strictEqual(Math.round(result.rows[0]!.net), 10);
	});

	test("single-season duos are scoped to one season", async () => {
		// Add a second season where players 2-3 play together much better.
		await idb.cache.lineups.add({
			tid: 0,
			season: 2015,
			playoffs: false,
			pids: [2, 3, 7, 8, 9],
			stats: {
				...emptyLineupStats(),
				min: 900,
				poss: 1800,
				oppPoss: 1800,
				pts: 2100,
				oppPts: 1800,
			},
		} as any);

		const result = (await updateFrivolitiesLineups(
			{ type: "duos_season" } as any,
			["firstRun"],
			{},
		))!;
		if (result.mode !== "seasonDuo") {
			throw new Error("Wrong mode");
		}

		// The 2015 pair 2-3 (+16.7 net) beats every 2016 pair, and appears as a
		// separate row from their 2016 season together.
		const top = result.rows[0]!;
		assert.strictEqual(top.season, 2015);
		assert.deepStrictEqual(
			top.players.map((p: any) => p.pid).toSorted((a: number, b: number) => a - b),
			[2, 3],
		);
		assert(top.net > 15 && top.net < 18, `${top.net}`);
		assert(
			result.rows.some(
				(row) =>
					row.season === 2016 &&
					row.players.some((p: any) => p.pid === 2) &&
					row.players.some((p: any) => p.pid === 3),
			),
			"2016 pair 2-3 should be its own row",
		);
	});
});
