import { assert, test } from "vitest";
import GameSim from "./index.ts";
import { player, team } from "../index.ts";
import loadTeams from "../game/loadTeams.ts";
import { g, helpers } from "../../util/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { range } from "../../../common/utils.ts";
import { idb } from "../../db/index.ts";
import type { LineupStat } from "../../../common/types.basketball.ts";

// Lineup box-score totals are attributed to whichever 5 players are on the floor,
// exactly like the sim's team totals. So over any game, summing a team's lineup
// buckets must reconcile with that team's team-level totals.

const PER_TEAM = 13;

type GameLineups = { pids: number[]; stats: LineupStat }[][];

const simGame = async () => {
	const teams = await loadTeams([0, 1], {});
	const game = new GameSim({
		gid: 0,
		teams: [teams[0]!, teams[1]!] as any,
		baseInjuryRate: 0,
		doPlayByPlay: false,
		homeCourtFactor: 1,
		allStarGame: false,
		neutralSite: true,
	});
	return game.run() as any;
};

const setup = async () => {
	resetG();
	g.setWithoutSavingToDB("season", 2016);

	const base = range(PER_TEAM).map((i) => {
		const p: any = player.generate(0, 25, 2010, true, DEFAULT_LEVEL);
		p.rosterOrder = i;
		return p;
	});

	const players0 = base.map((p) => {
		const c = structuredClone(p);
		c.tid = 0;
		return c;
	});
	const players1 = base.map((p) => {
		const c = structuredClone(p);
		c.tid = 1;
		return c;
	});

	const teamsDefault = helpers.getTeamsDefault().slice(0, 2);
	await resetCache({
		players: [...players0, ...players1],
		teams: teamsDefault.map(team.generate),
		teamSeasons: teamsDefault.map((t) => team.genSeasonRow(t)),
		teamStats: teamsDefault.map((t) => team.genStatsRow(t.tid)),
	});

	// Compute player values so substitutions happen (otherwise nobody subs).
	for (const p of await idb.cache.players.getAll()) {
		await player.updateValues(p);
		await idb.cache.players.put(p);
	}
};

const sumField = (lineups: GameLineups[number], field: keyof LineupStat) =>
	lineups.reduce((acc, l) => acc + l.stats[field], 0);

test("lineup points reconcile exactly with team points", async () => {
	await setup();

	for (let i = 0; i < 5; i++) {
		const res = await simGame();
		const lineups: GameLineups = res.lineups;

		for (const t of [0, 1] as const) {
			const teamPts = res.team[t].stat.pts;
			const lineupPts = sumField(lineups[t]!, "pts");
			assert.strictEqual(
				lineupPts,
				teamPts,
				`team ${t}: lineup pts ${lineupPts} !== team pts ${teamPts}`,
			);
		}

		// Points a team allowed (oppPts on its lineups) must equal the other team's
		// scored points.
		assert.strictEqual(sumField(lineups[0]!, "oppPts"), res.team[1].stat.pts);
		assert.strictEqual(sumField(lineups[1]!, "oppPts"), res.team[0].stat.pts);
	}
});

test("lineup minutes reconcile with team minutes", async () => {
	await setup();

	const numPlayersOnCourt = g.get("numPlayersOnCourt");

	for (let i = 0; i < 5; i++) {
		const res = await simGame();
		const lineups: GameLineups = res.lineups;

		for (const t of [0, 1] as const) {
			// team.stat.min is summed across all players (≈ numPlayersOnCourt × wall
			// clock); lineup min is wall-clock time the unit shared the floor.
			const expectedWallClock = res.team[t].stat.min / numPlayersOnCourt;
			const lineupMin = sumField(lineups[t]!, "min");
			assert(
				Math.abs(lineupMin - expectedWallClock) < 0.1,
				`team ${t}: lineup min ${lineupMin} vs expected ${expectedWallClock}`,
			);
		}
	}
});

test("every scored point is attributed to a full lineup of players", async () => {
	await setup();

	const numPlayersOnCourt = g.get("numPlayersOnCourt");
	const res = await simGame();
	const lineups: GameLineups = res.lineups;

	assert(lineups[0]!.length > 0);
	for (const t of [0, 1] as const) {
		for (const l of lineups[t]!) {
			assert.strictEqual(
				l.pids.length,
				numPlayersOnCourt,
				"each lineup should have exactly numPlayersOnCourt players",
			);
		}
	}
});
