import { SOCCER_LEAGUE_COMP_ID } from "../../../common/constants.soccer.ts";
import type { ScheduleGameWithoutKey } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { initializeSoccerWorld } from "./initializeWorld.ts";

export const roundRobin = (tids: number[]) => {
	const teams = [...tids];
	if (teams.length % 2 === 1) {
		teams.push(-1);
	}
	const rounds: [number, number][][] = [];
	for (let round = 0; round < teams.length - 1; round++) {
		const games: [number, number][] = [];
		for (let i = 0; i < teams.length / 2; i++) {
			const a = teams[i]!;
			const b = teams[teams.length - 1 - i]!;
			if (a >= 0 && b >= 0) {
				games.push(round % 2 === 0 ? [a, b] : [b, a]);
			}
		}
		rounds.push(games);
		teams.splice(1, 0, teams.pop()!);
	}
	return [
		...rounds,
		...rounds.map((round) =>
			round.map(([home, away]) => [away, home] as [number, number]),
		),
	];
};

export const scheduleSoccerSeason = async () => {
	const season = g.get("season");
	let competitionSeasons = await idb.league.getAllFromIndex(
		"soccerCompetitionSeasons",
		"season",
		season,
	);
	if (
		!competitionSeasons.some(
			(competition) => competition.compId === SOCCER_LEAGUE_COMP_ID,
		)
	) {
		await initializeSoccerWorld(season);
		competitionSeasons = await idb.league.getAllFromIndex(
			"soccerCompetitionSeasons",
			"season",
			season,
		);
	}

	const games: ScheduleGameWithoutKey[] = [];
	const competition = competitionSeasons.find(
		(row) => row.compId === SOCCER_LEAGUE_COMP_ID,
	);
	if (!competition) {
		throw new Error("Soccer league was not initialized");
	}
	const rounds = roundRobin(competition.participantTids);
	for (let round = 0; round < rounds.length; round++) {
		for (const [homeTid, awayTid] of rounds[round]!) {
			games.push({
				homeTid,
				awayTid,
				day: 1 + round * 4,
				compId: competition.compId,
				competitionStage: "League",
			});
		}
	}
	competition.status = "active";
	await idb.league.put("soccerCompetitionSeasons", competition);

	games.sort((a, b) => a.day - b.day || a.homeTid - b.homeTid);
	await idb.cache.schedule.clear();
	for (const game of games) {
		await idb.cache.schedule.add(game);
	}
	return games;
};

export default scheduleSoccerSeason;
