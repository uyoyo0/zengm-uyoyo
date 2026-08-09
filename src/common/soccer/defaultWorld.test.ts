import { assert, describe, test } from "vitest";
import { DEFAULT_CONFS, DEFAULT_DIVS } from "../constants.soccer.ts";
import { getSoccerTeamsDefault } from "./defaultWorld.ts";

describe("default soccer world", () => {
	test("contains the current 20-club Premier League", () => {
		const teams = getSoccerTeamsDefault();
		assert.strictEqual(teams.length, 20);
		assert.strictEqual(new Set(teams.map((team) => team.tid)).size, 20);
		assert.strictEqual(new Set(teams.map((team) => team.abbrev)).size, 20);
		assert.ok(teams.every((team) => team.cid === 0 && team.did === 0));
		assert.ok(
			teams.every(
				(team) =>
					team.imgURL === `/img/logos-primary/${team.abbrev}.png` &&
					team.imgURLSmall === team.imgURL,
			),
		);
		assert.deepEqual(
			teams.map((team) => team.name),
			[
				"Arsenal",
				"Aston Villa",
				"Bournemouth",
				"Brentford",
				"Brighton & Hove Albion",
				"Chelsea",
				"Coventry City",
				"Crystal Palace",
				"Everton",
				"Fulham",
				"Hull City",
				"Ipswich Town",
				"Leeds United",
				"Liverpool",
				"Manchester City",
				"Manchester United",
				"Newcastle United",
				"Nottingham Forest",
				"Sunderland",
				"Tottenham Hotspur",
			],
		);
		assert.deepEqual(DEFAULT_CONFS, [{ cid: 0, name: "League" }]);
		assert.deepEqual(DEFAULT_DIVS, [
			{ did: 0, cid: 0, name: "Premier League" },
		]);
	});
});
