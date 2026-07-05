import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import type { UpdateEvents, ViewInput } from "../../common/types.ts";

const updateCoach = async (
	{ cid }: ViewInput<"coach">,
	updateEvents: UpdateEvents,
	state: { cid?: number },
) => {
	if (
		updateEvents.includes("firstRun") ||
		updateEvents.includes("playerMovement") ||
		updateEvents.includes("gameSim") ||
		updateEvents.includes("newPhase") ||
		state.cid !== cid
	) {
		if (cid === undefined) {
			return { errorMessage: "Invalid coach ID." };
		}

		// Retired coaches (tid < FREE_AGENT) fall out of the cache, so fall back
		// to reading the store directly.
		const coach =
			(await idb.cache.coaches.get(cid)) ??
			(await idb.league.get("coaches", cid));
		if (!coach) {
			return { errorMessage: "Coach not found." };
		}

		const allTeams = await idb.cache.teams.getAll();
		const teamInfo = new Map(
			allTeams.map((t) => [
				t.tid,
				{ abbrev: t.abbrev, region: t.region, name: t.name },
			]),
		);

		let team;
		let teamCoaching;
		let teamColors: [string, string, string] | undefined;
		let teamJersey: string | undefined;
		if (coach.tid >= 0) {
			const t = teamInfo.get(coach.tid);
			if (t) {
				team = { tid: coach.tid, ...t };
				const fullTeam = allTeams.find((x) => x.tid === coach.tid);
				teamCoaching = fullTeam?.coaching;
				teamColors = fullTeam?.colors;
				teamJersey = fullTeam?.jersey;
			}
		}

		// Season-by-season coaching record, newest first, with team abbrevs.
		const seasons = (coach.seasons ?? [])
			.map((s) => ({
				...s,
				abbrev: teamInfo.get(s.tid)?.abbrev ?? "???",
				delta: s.won - s.expectedWins,
			}))
			.sort((a, b) => b.season - a.season);

		const career = {
			won: seasons.reduce((sum, s) => sum + s.won, 0),
			lost: seasons.reduce((sum, s) => sum + s.lost, 0),
			expectedWins: seasons.reduce((sum, s) => sum + s.expectedWins, 0),
			playoffWon: seasons.reduce((sum, s) => sum + (s.playoffWon ?? 0), 0),
			playoffLost: seasons.reduce((sum, s) => sum + (s.playoffLost ?? 0), 0),
			championships: seasons.filter((s) => s.champion).length,
		};

		return {
			coach: {
				...coach,
				age: g.get("season") - coach.born.year,
			},
			seasons,
			career,
			team,
			teamCoaching,
			teamColors,
			teamJersey,
			godMode: g.get("godMode"),
			season: g.get("season"),
		};
	}
};

export default updateCoach;
