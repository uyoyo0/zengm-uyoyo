import getWinner from "../../../common/getWinner.ts";
import { SOCCER_LEAGUE_COMP_ID } from "../../../common/constants.soccer.ts";
import type {
	GameResults,
	ScheduleGameWithoutKey,
	SoccerCompetitionTeamSeason,
} from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";

type SoccerResult = GameResults &
	Pick<
		ScheduleGameWithoutKey,
		"compId" | "competitionStage" | "tieId" | "requiresWinner"
	>;

const emptyRow = (
	compId: string,
	tid: number,
): SoccerCompetitionTeamSeason => ({
	key: `${g.get("season")}:${compId}:${tid}`,
	season: g.get("season"),
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

const updateTable = async (result: SoccerResult) => {
	if (result.compId !== SOCCER_LEAGUE_COMP_ID) {
		return;
	}
	const winner = getWinner([result.team[0].stat, result.team[1].stat]);
	for (const index of [0, 1] as const) {
		const team = result.team[index];
		const opponent = result.team[index === 0 ? 1 : 0];
		const key = `${g.get("season")}:${result.compId}:${team.id}`;
		const row =
			(await idb.league.get("soccerCompetitionTeamSeasons", key)) ??
			emptyRow(result.compId, team.id);
		row.gp += 1;
		row.gf += team.stat.pts;
		row.ga += opponent.stat.pts;
		if (winner === -1) {
			row.drawn += 1;
			row.pts += 1;
		} else if (winner === index) {
			row.won += 1;
			row.pts += 3;
		} else {
			row.lost += 1;
		}
		await idb.league.put("soccerCompetitionTeamSeasons", row);
	}
};

const finishLeagueIfComplete = async (result: SoccerResult) => {
	if (result.compId !== SOCCER_LEAGUE_COMP_ID) {
		return;
	}
	const season = g.get("season");
	const key = `${season}:${SOCCER_LEAGUE_COMP_ID}`;
	const competition = await idb.league.get("soccerCompetitionSeasons", key);
	if (!competition || competition.status === "complete") {
		return;
	}
	const rows = (
		await idb.league.getAllFromIndex(
			"soccerCompetitionTeamSeasons",
			"season",
			season,
		)
	).filter((row) => row.compId === SOCCER_LEAGUE_COMP_ID);
	const expectedGames = (competition.participantTids.length - 1) * 2;
	if (
		rows.length !== competition.participantTids.length ||
		rows.some((row) => row.gp < expectedGames)
	) {
		return;
	}
	const table = rows.toSorted(
		(a, b) =>
			b.pts - a.pts ||
			b.gf - b.ga - (a.gf - a.ga) ||
			b.gf - a.gf ||
			a.tid - b.tid,
	);
	for (const [index, row] of table.entries()) {
		row.position = index + 1;
		if (index === 0) {
			row.outcome = "champion";
		}
	}
	competition.championTid = table[0]!.tid;
	competition.status = "complete";
	await Promise.all([
		idb.league.put("soccerCompetitionSeasons", competition),
		...table.map((row) => idb.league.put("soccerCompetitionTeamSeasons", row)),
	]);
};

const recordSoccerMatch = async (result: SoccerResult) => {
	await updateTable(result);
	await finishLeagueIfComplete(result);
};

export default recordSoccerMatch;
