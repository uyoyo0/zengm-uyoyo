import type { UpdateEvents } from "../../common/types.ts";
import { FORMATIONS } from "../../common/constants.soccer.ts";
import { last } from "../../common/utils.ts";
import { normalizeSoccerTactics } from "../../common/soccer/tactics.ts";
import { recoverSoccerFitness } from "../../common/soccer/fitness.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";

const updateSoccerTactics = async (
	_inputs: unknown,
	updateEvents: UpdateEvents,
) => {
	if (
		!updateEvents.includes("firstRun") &&
		!updateEvents.includes("playerMovement") &&
		!updateEvents.includes("gameSim")
	) {
		return;
	}
	const tid = g.get("userTid");
	const [team, roster] = await Promise.all([
		idb.cache.teams.get(tid),
		idb.cache.players.indexGetAll("playersByTid", tid),
	]);
	if (!team) {
		throw new Error("Invalid team");
	}
	const schedule = await idb.cache.schedule.getAll();
	const nextMatchDay = schedule
		.filter((game) => game.homeTid === tid || game.awayTid === tid)
		.map((game) => game.day)
		.filter((day): day is number => typeof day === "number")
		.toSorted((a, b) => a - b)[0];
	return {
		tid,
		team: { region: team.region, name: team.name },
		tactics: normalizeSoccerTactics(team.soccerTactics),
		formations: FORMATIONS,
		players: roster
			.map((p) => {
				const currentRatings = last(p.ratings);
				return {
					pid: p.pid,
					name: `${p.firstName} ${p.lastName}`,
					pos: currentRatings.pos,
					ovr: currentRatings.ovr,
					ovrs: currentRatings.ovrs,
					injury: p.injury,
					fitness: recoverSoccerFitness({
						day: nextMatchDay,
						endurance: (50 + currentRatings.endu) / 200,
						fitness: p.soccerFitness,
						lastMatchDay: p.soccerLastMatchDay,
					}),
				};
			})
			.toSorted((a, b) => b.ovr - a.ovr),
	};
};

export default updateSoccerTactics;
