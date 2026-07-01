import { assert, test } from "vitest";
import writeLineupStats from "./writeLineupStats.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import type { LineupStat } from "../../../common/types.basketball.ts";

const stats = (overrides: Partial<LineupStat> = {}): LineupStat => ({
	min: 10,
	poss: 20,
	oppPoss: 20,
	pts: 24,
	oppPts: 22,
	fg: 9,
	fga: 18,
	tp: 2,
	tpa: 6,
	ft: 4,
	fta: 5,
	orb: 2,
	drb: 6,
	tov: 3,
	ast: 5,
	stl: 1,
	blk: 1,
	pf: 2,
	...overrides,
});

// A minimal GameResults shape carrying only what writeLineupStats reads.
const gameResults = (lineups: any) => ({
	team: [{ id: 0 }, { id: 1 }],
	lineups,
});

const readTeam = async (tid: number, season: number) =>
	idb.cache.lineups.indexGetAll("lineupsByTidSeason", [
		[tid, season],
		[tid, season],
	]);

test("writeLineupStats creates and accumulates rows across games", async () => {
	resetG();
	await resetCache();

	const lineupA = { pids: [1, 2, 3, 4, 5], stats: stats() };
	const results = gameResults([[lineupA], []]);

	await writeLineupStats(results as any);
	let rows = await readTeam(0, 2016);
	assert.strictEqual(rows.length, 1);
	assert.deepStrictEqual(rows[0]!.pids, [1, 2, 3, 4, 5]);
	assert.strictEqual(rows[0]!.stats.pts, 24);
	assert.strictEqual(rows[0]!.tid, 0);
	assert.strictEqual(rows[0]!.playoffs, false);

	// Second game with the same unit merges into the same row.
	await writeLineupStats(gameResults([[lineupA], []]) as any);
	rows = await readTeam(0, 2016);
	assert.strictEqual(rows.length, 1);
	assert.strictEqual(rows[0]!.stats.pts, 48);
	assert.strictEqual(rows[0]!.stats.min, 20);
});

test("writeLineupStats keeps distinct units as separate rows", async () => {
	resetG();
	await resetCache();

	await writeLineupStats(
		gameResults([
			[
				{ pids: [1, 2, 3, 4, 5], stats: stats({ pts: 30 }) },
				{ pids: [1, 2, 3, 4, 6], stats: stats({ pts: 10 }) },
			],
			[],
		]) as any,
	);

	const rows = await readTeam(0, 2016);
	assert.strictEqual(rows.length, 2);
	const byKey = new Map(rows.map((r) => [r.pids.join("-"), r.stats.pts]));
	assert.strictEqual(byKey.get("1-2-3-4-5"), 30);
	assert.strictEqual(byKey.get("1-2-3-4-6"), 10);
});

test("writeLineupStats skips All-Star teams (negative tid)", async () => {
	resetG();
	await resetCache();

	await writeLineupStats({
		team: [{ id: -1 }, { id: -2 }],
		lineups: [[{ pids: [1, 2, 3, 4, 5], stats: stats() }], []],
	} as any);

	const all = await idb.cache.lineups.getAll();
	assert.strictEqual(all.length, 0);
});
