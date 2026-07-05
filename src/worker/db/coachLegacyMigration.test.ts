import "fake-indexeddb/auto";
import { assert, test } from "vitest";
import { openDB, deleteDB } from "@dumbmatter/idb";

// Exercises the real v78 migration: playoff W/L, playoffRoundsWon, champion
// flags, and "Won Championship" awards get backfilled onto coach season rows
// from playoffSeries + teamSeasons.

const makeSeriesTeam = (tid: number, seed: number, won: number) => ({
	tid,
	cid: 0,
	seed,
	won,
});

test("v78 backfills coach playoff records and championship awards", async () => {
	const connectLeague = (await import("./connectLeague.ts")).default;
	const name = "league9992";
	await deleteDB(name);

	// A v77 DB with one coach whose 2020 season predates playoff tracking.
	// Team 0 won a 2-round playoff (4-1, then 4-2); team 1 lost the final.
	const stale = await openDB(name, 77, {
		upgrade(db) {
			const coachStore = db.createObjectStore("coaches", {
				keyPath: "cid",
				autoIncrement: true,
			});
			coachStore.createIndex("tid", "tid");
			db.createObjectStore("playoffSeries", { keyPath: "season" });
			const teamSeasonsStore = db.createObjectStore("teamSeasons", {
				keyPath: "rid",
				autoIncrement: true,
			});
			teamSeasonsStore.createIndex("tid, season", ["tid", "season"], {
				unique: true,
			});
			db.createObjectStore("teams", { keyPath: "tid" });
		},
	});

	await stale.add("coaches", {
		tid: 0,
		firstName: "Champ",
		lastName: "Coach",
		face: {},
		born: { year: 1970, loc: "USA" },
		contract: { amount: 5000, exp: 2022 },
		ratings: {},
		philosophy: {},
		awards: [],
		seasons: [{ season: 2020, tid: 0, won: 60, lost: 22, expectedWins: 50 }],
	});
	await stale.add("coaches", {
		tid: 1,
		firstName: "Runner",
		lastName: "Up",
		face: {},
		born: { year: 1970, loc: "USA" },
		contract: { amount: 5000, exp: 2022 },
		ratings: {},
		philosophy: {},
		awards: [],
		seasons: [{ season: 2020, tid: 1, won: 55, lost: 27, expectedWins: 50 }],
	});
	await stale.add("playoffSeries", {
		season: 2020,
		currentRound: 1,
		series: [
			[
				{
					home: makeSeriesTeam(0, 1, 4),
					away: makeSeriesTeam(2, 4, 1),
				},
				{
					home: makeSeriesTeam(1, 2, 4),
					away: makeSeriesTeam(3, 3, 2),
				},
			],
			[
				{
					home: makeSeriesTeam(0, 1, 4),
					away: makeSeriesTeam(1, 2, 2),
				},
			],
		],
	});
	await stale.add("teamSeasons", {
		tid: 0,
		season: 2020,
		playoffRoundsWon: 2,
	});
	await stale.add("teamSeasons", {
		tid: 1,
		season: 2020,
		playoffRoundsWon: 1,
	});
	stale.close();

	const db = (await connectLeague(9992)) as any;
	try {
		const coaches = await db.getAll("coaches");

		const champ = coaches.find((c: any) => c.lastName === "Coach");
		assert.strictEqual(champ.seasons[0].playoffWon, 8);
		assert.strictEqual(champ.seasons[0].playoffLost, 3);
		assert.strictEqual(champ.seasons[0].playoffRoundsWon, 2);
		assert.strictEqual(champ.seasons[0].champion, true);
		assert.strictEqual(champ.awards.length, 1);
		assert.strictEqual(champ.awards[0].type, "Won Championship");
		assert.strictEqual(champ.awards[0].season, 2020);

		const runnerUp = coaches.find((c: any) => c.lastName === "Up");
		assert.strictEqual(runnerUp.seasons[0].playoffWon, 6);
		assert.strictEqual(runnerUp.seasons[0].playoffLost, 6);
		assert.strictEqual(runnerUp.seasons[0].champion, false);
		assert.strictEqual(runnerUp.awards.length, 0);
	} finally {
		db.close();
		await deleteDB(name);
	}
});
