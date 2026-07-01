import "fake-indexeddb/auto";
import { assert, test } from "vitest";
import { openDB, deleteDB } from "@dumbmatter/idb";

// Exercises the real IndexedDB migration path (not the in-memory cache) to make
// sure the lineups store gets created both for brand-new leagues (create()) and
// for leagues that were left half-upgraded at v76 with no lineups store.

// Minimal store set that create() in connectLeague expects. We only care that,
// after opening at the current version, the lineups store exists and is usable.

test("opening a fresh league DB creates a usable lineups store", async () => {
	const { LEAGUE_DATABASE_VERSION } = await import("../../common/constants.ts");
	const connectLeague = (await import("./connectLeague.ts")).default;

	await deleteDB("league9990");

	const db = (await connectLeague(9990)) as any;
	try {
		assert(
			db.objectStoreNames.contains("lineups"),
			"lineups store should exist after a fresh open",
		);
		assert.strictEqual(db.version, LEAGUE_DATABASE_VERSION);

		// The store is writable and its index works.
		await db.add("lineups", {
			tid: 0,
			season: 2016,
			playoffs: false,
			pids: [1, 2, 3, 4, 5],
			stats: { min: 10, poss: 20, oppPoss: 20, pts: 24, oppPts: 22 },
		});
		const rows = await db.getAllFromIndex(
			"lineups",
			"season, tid",
			IDBKeyRange.bound([2016, 0], [2016, 0]),
		);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0].stats.pts, 24);
	} finally {
		db.close();
		await deleteDB(`league9990`);
	}
});

test("a DB stuck at v76 with no lineups store gets the store on upgrade", async () => {
	const migrateModule = await import("./connectLeague.ts");
	const name = "league9991";
	await deleteDB(name);

	// Simulate the half-upgraded state: a DB at version 76 that is missing the
	// lineups store (the exact broken state from editing in watch mode).
	const stale = await openDB(name, 76, {
		upgrade(db) {
			// Just enough to exist at v76 without a lineups store.
			if (!db.objectStoreNames.contains("teams")) {
				db.createObjectStore("teams", { keyPath: "tid" });
			}
		},
	});
	assert(!stale.objectStoreNames.contains("lineups"));
	stale.close();

	// Re-open at the current version using the real migrate(); the store should
	// now be created idempotently.
	const connectLeague = migrateModule.default;
	const db = (await connectLeague(9991)) as any;
	try {
		assert(
			db.objectStoreNames.contains("lineups"),
			"lineups store should be created when upgrading a half-upgraded v76 DB",
		);
	} finally {
		db.close();
		await deleteDB(name);
	}
});
