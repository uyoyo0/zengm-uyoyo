import { describe, expect, test } from "vitest";
import { PLAYER } from "../../../../common/constants.ts";
import { resetG } from "../../../../test/helpers.ts";
import { DEFAULT_LEVEL } from "../../../../common/budgetLevels.ts";
import { getSoccerTeamsDefault } from "../../../../common/soccer/defaultWorld.ts";
import createRandomPlayers, {
	getNumPlayersPerTeam,
} from "./createRandomPlayers.ts";

describe("createRandomPlayers soccer startup", () => {
	test("fills the initial roster from the value-sorted player pool", async () => {
		resetG();

		const players = await createRandomPlayers({
			activeTids: [0],
			onlyFreeAgents: false,
			scoutingLevel: DEFAULT_LEVEL,
			teams: [{ tid: 0 }],
		});
		const roster = players.filter((p) => p.tid === 0);

		expect(getNumPlayersPerTeam()).toBe(30);
		expect(roster).toHaveLength(getNumPlayersPerTeam());
		expect(
			players.every((p) => p.tid === 0 || p.tid === PLAYER.FREE_AGENT),
		).toBe(true);
		expect(new Set(roster.map((p) => p.jerseyNumber)).size).toBe(roster.length);
	});

	test("loads the current Premier League squads for the default league", async () => {
		resetG();
		const teams = getSoccerTeamsDefault();
		const players = await createRandomPlayers({
			activeTids: teams.map((team) => team.tid),
			onlyFreeAgents: false,
			scoutingLevel: DEFAULT_LEVEL,
			teams,
		});

		expect(players).toHaveLength(426);
		expect(
			players.every((p) => p.real && p.srID && p.ratings[0].fuzz === 0),
		).toBe(true);
		for (const team of teams) {
			const roster = players.filter((p) => p.tid === team.tid);
			expect(roster.length).toBeGreaterThanOrEqual(17);
			expect(new Set(roster.map((p) => p.jerseyNumber)).size).toBe(
				roster.length,
			);
		}

		const haaland = players.find(
			(p) => p.firstName === "Erling" && p.lastName === "Haaland",
		);
		expect(haaland?.tid).toBe(14);
		expect((haaland?.ratings[0] as any).fin).toBeGreaterThanOrEqual(90);
	});
});
