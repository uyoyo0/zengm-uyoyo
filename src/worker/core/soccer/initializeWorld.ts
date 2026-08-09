import type {
	SoccerCompetition,
	SoccerCompetitionSeason,
	SoccerCompetitionTeamSeason,
} from "../../../common/types.ts";
import { SOCCER_LEAGUE_COMP_ID } from "../../../common/constants.soccer.ts";
import { idb } from "../../db/index.ts";
import { getInitialSoccerBudgets } from "./transfers.ts";
import { normalizeSoccerTactics } from "../../../common/soccer/tactics.ts";

const makeTeamSeason = (
	season: number,
	compId: string,
	tid: number,
): SoccerCompetitionTeamSeason => ({
	key: `${season}:${compId}:${tid}`,
	season,
	compId,
	tid,
	gp: 0,
	won: 0,
	drawn: 0,
	lost: 0,
	gf: 0,
	ga: 0,
	pts: 0,
});

export const initializeSoccerWorld = async (season: number) => {
	const teams = await idb.cache.teams.getAll();
	const participantTids = teams
		.filter((team) => !team.disabled)
		.map((team) => team.tid);
	const participantTidSet = new Set(participantTids);
	const competition: SoccerCompetition = {
		compId: SOCCER_LEAGUE_COMP_ID,
		name: "Premier League",
		shortName: "League",
		type: "league",
	};
	const competitionSeason: SoccerCompetitionSeason = {
		key: `${season}:${SOCCER_LEAGUE_COMP_ID}`,
		season,
		compId: SOCCER_LEAGUE_COMP_ID,
		status: "scheduled",
		participantTids,
	};
	const competitionTeamSeasons = participantTids.map((tid) =>
		makeTeamSeason(season, SOCCER_LEAGUE_COMP_ID, tid),
	);

	const transaction = idb.league.transaction(
		[
			"soccerAssociations",
			"soccerCompetitions",
			"soccerCompetitionSeasons",
			"soccerCompetitionTeamSeasons",
		],
		"readwrite",
	);
	const associationsStore = transaction.objectStore("soccerAssociations");
	const competitionsStore = transaction.objectStore("soccerCompetitions");
	await Promise.all([
		associationsStore.clear(),
		competitionsStore.clear(),
		competitionsStore.put(competition),
		transaction.objectStore("soccerCompetitionSeasons").put(competitionSeason),
		...competitionTeamSeasons.map((row) =>
			transaction.objectStore("soccerCompetitionTeamSeasons").put(row),
		),
	]);
	await transaction.done;

	const teamSeasonsByTid = new Map(
		(await idb.cache.teamSeasons.getAll())
			.filter((teamSeason) => teamSeason.season === season)
			.map((teamSeason) => [teamSeason.tid, teamSeason]),
	);
	const teamSeasonsToUpdate = [];

	for (const team of teams) {
		if (!participantTidSet.has(team.tid)) {
			continue;
		}
		team.cid = 0;
		team.did = 0;
		delete team.soccerAssociationId;
		delete team.soccerTier;
		team.soccerTactics = normalizeSoccerTactics(team.soccerTactics);
		const teamSeason = teamSeasonsByTid.get(team.tid);
		if (teamSeason) {
			const budgets = getInitialSoccerBudgets(team.pop);
			teamSeason.transferBudget = budgets.transferBudget;
			teamSeason.wageBudget = budgets.wageBudget;
			teamSeason.maxDebt = budgets.maxDebt;
			teamSeason.boardExpectation = "topHalf";
			teamSeasonsToUpdate.push(teamSeason);
		}
	}

	await Promise.all([
		...teams.map((team) => idb.cache.teams.put(team)),
		...teamSeasonsToUpdate.map((teamSeason) =>
			idb.cache.teamSeasons.put(teamSeason),
		),
	]);
};
