import type { UpdateEvents } from "../../common/types.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";

const updateSoccerCompetitions = async (_inputs: unknown, updateEvents: UpdateEvents) => {
	if (!updateEvents.includes("firstRun") && !updateEvents.includes("gameSim")) {return;}
	const season = g.get("season");
	const [competitions, competitionSeasons, rows, teams] = await Promise.all([
		idb.league.getAll("soccerCompetitions"),
		idb.league.getAllFromIndex("soccerCompetitionSeasons", "season", season),
		idb.league.getAllFromIndex("soccerCompetitionTeamSeasons", "season", season),
		idb.cache.teams.getAll(),
	]);
	const teamInfo = Object.fromEntries(teams.map((team) => [team.tid, { tid: team.tid, abbrev: team.abbrev, region: team.region, name: team.name }]));
	return {
		season,
		competitions: competitions.map((competition) => ({
			...competition,
			season: competitionSeasons.find((row) => row.compId === competition.compId),
			table: rows.filter((row) => row.compId === competition.compId).toSorted((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf),
		})),
		teamInfo,
	};
};

export default updateSoccerCompetitions;
