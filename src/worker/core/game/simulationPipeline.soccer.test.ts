import "fake-indexeddb/auto";
import { afterEach, expect, test } from "vitest";
import { LEAGUE_DATABASE_VERSION, PHASE } from "../../../common/constants.ts";
import { defaultGameAttributes } from "../../../common/defaultGameAttributes.ts";
import { last } from "../../../common/utils.ts";
import createStreamFromLeagueObject from "../league/create/createStreamFromLeagueObject.ts";
import { game, league, phase } from "../index.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { getDefaultSettings } from "../../views/newLeague.ts";

const assertNoNaNs = (value: unknown, path = "root") => {
	if (typeof value === "number") {
		expect(Number.isNaN(value), `${path} is NaN`).toBe(false);
	} else if (Array.isArray(value)) {
		value.forEach((item, index) => assertNoNaNs(item, `${path}[${index}]`));
	} else if (value && typeof value === "object") {
		for (const [key, item] of Object.entries(value)) {
			assertNoNaNs(item, `${path}.${key}`);
		}
	}
};

test(
	"persists a complete soccer matchday without corrupting stats or finances",
	{ timeout: 120_000 },
	async () => {
		await league.createStream(createStreamFromLeagueObject({}), {
			confs: last(defaultGameAttributes.confs).value,
			divs: last(defaultGameAttributes.divs).value,
			fromFile: {
				gameAttributes: undefined,
				hasRookieContracts: true,
				maxGid: undefined,
				startingSeason: undefined,
				teams: undefined,
				version: LEAGUE_DATABASE_VERSION,
			},
			getLeagueOptions: undefined,
			keptKeys: new Set(),
			lid: 91,
			name: "Soccer simulation integration test",
			setLeagueCreationStatus: () => {},
			settings: getDefaultSettings(),
			shuffleRosters: false,
			startingSeasonFromInput: "2026",
			teamsFromInput: helpers.addPopRank(helpers.getTeamsDefault()),
			tid: 0,
		});

		await phase.newPhase(PHASE.REGULAR_SEASON, {});
		await game.play(1, {}, false);

		const [games, players, teamStats, teamSeasons] = await Promise.all([
			idb.league.getAll("games"),
			idb.cache.players.indexGetAll("playersByTid", [0, Infinity]),
			idb.cache.teamStats.getAll(),
			idb.cache.teamSeasons.getAll(),
		]);
		expect(games.length).toBeGreaterThan(0);
		assertNoNaNs(games, "games");
		assertNoNaNs(teamStats, "teamStats");
		assertNoNaNs(teamSeasons, "teamSeasons");

		const gameGoals = games.reduce(
			(total, completedGame) =>
				total + completedGame.teams.reduce((sum, team) => sum + team.pts, 0),
			0,
		);
		const playerGoals = players.reduce(
			(total, p) => total + (p.stats.at(-1)?.g ?? 0),
			0,
		);
		const playerAssists = players.reduce(
			(total, p) => total + (p.stats.at(-1)?.a ?? 0),
			0,
		);
		const playerDribblesAttempted = players.reduce(
			(total, p) => total + (p.stats.at(-1)?.drbAtt ?? 0),
			0,
		);
		const playerDribblesCompleted = players.reduce(
			(total, p) => total + (p.stats.at(-1)?.drbCmp ?? 0),
			0,
		);
		const teamDribblesAttempted = teamStats.reduce(
			(total, row) => total + (row.drbAtt ?? 0),
			0,
		);
		expect(playerGoals).toBe(gameGoals);
		expect(playerAssists).toBeLessThanOrEqual(playerGoals);
		expect(playerDribblesAttempted).toBeGreaterThan(0);
		expect(playerDribblesCompleted).toBeLessThanOrEqual(
			playerDribblesAttempted,
		);
		expect(teamDribblesAttempted).toBe(playerDribblesAttempted);
		expect(players.some((p) => (p.soccerFitness ?? 1) < 1)).toBe(true);
	},
);

afterEach(async () => {
	if (typeof g.get("lid") === "number") {
		await league.remove(g.get("lid"));
	}
});
