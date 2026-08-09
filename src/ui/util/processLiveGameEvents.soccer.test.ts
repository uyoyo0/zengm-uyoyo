import { expect, test } from "vitest";
import processLiveGameEventsSoccer from "./processLiveGameEvents.soccer.tsx";

test("soccer live sim updates lineups, scoring, and final statistics", () => {
	const boxScore: any = {
		gid: 1,
		quarter: "",
		quarterShort: "",
		time: "",
		scoringSummary: [],
		teams: [
			{ pts: 0, g: 0, ptsQtrs: [], players: [{ pid: 2, name: "Away" }] },
			{ pts: 0, g: 0, ptsQtrs: [], players: [{ pid: 1, name: "Home" }] },
		],
	};
	const events = [
		{ type: "init", lineups: [[1], [2]] },
		{
			type: "goal",
			t: 0,
			clock: 60,
			quarter: 1,
			pids: [1],
			names: ["Home"],
		},
		{
			type: "finalStats",
			teams: [
				{
					stat: { pts: 1, g: 1, sh: 11 },
					players: [{ id: 1, stat: { g: 1, sh: 3 } }],
				},
				{
					stat: { pts: 0, g: 0, sh: 8 },
					players: [{ id: 2, stat: { g: 0, sh: 2 } }],
				},
			],
		},
		{ type: "gameOver", clock: 0, quarter: 2 },
	];

	let output;
	do {
		output = processLiveGameEventsSoccer({
			boxScore,
			events,
			overtimes: 0,
			quarters: [],
		});
	} while (events.length > 0);

	expect(boxScore.teams[1].pts).toBe(1);
	expect(boxScore.teams[1].sh).toBe(11);
	expect(boxScore.teams[1].players[0].g).toBe(1);
	expect(boxScore.teams[1].players[0].sh).toBe(3);
	expect(boxScore.scoringSummary).toHaveLength(1);
	expect(boxScore.gameOver).toBe(true);
	expect(output.text).toBe("Full time");
});
