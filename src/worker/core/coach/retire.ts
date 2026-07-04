import { PLAYER } from "../../../common/constants.ts";
import { g, helpers, logEvent } from "../../util/index.ts";
import { idb } from "../../db/index.ts";
import madeHof from "./madeHof.ts";
import type { Coach, Conditions } from "../../../common/types.ts";

// Have a coach retire, including event and Hall of Fame bookkeeping. Mirrors
// player/retire.ts. Writes the coach to the cache.
const retire = async (coach: Coach, conditions?: Conditions) => {
	const season = g.get("season");
	const fromTid = coach.tid;
	const age = season - coach.born.year;

	coach.tid = PLAYER.RETIRED;
	coach.retiredYear = season;

	const coachedTids = new Set(coach.seasons?.map((s) => s.tid) ?? []);
	const userTids = g.get("userTids");
	const coachedUserTeam = userTids.some((tid) => coachedTids.has(tid));

	const name = `<a href="${helpers.leagueUrl(["coach", coach.cid])}">${
		coach.firstName
	} ${coach.lastName}</a>`;

	await logEvent(
		{
			type: "coachRetired",
			text: `Head coach ${name} retired at age ${age}.`,
			tids: fromTid >= 0 ? [fromTid] : [],
			showNotification: fromTid >= 0 && userTids.includes(fromTid),
			score: 20,
		},
		conditions,
	);

	if (!coach.hof && madeHof(coach)) {
		coach.hof = 1;
		coach.awards.push({
			season,
			type: "Inducted into the Hall of Fame",
		});

		await logEvent(
			{
				type: "hallOfFame",
				text: `Coach ${name} was inducted into the <a href="${helpers.leagueUrl(
					["hall_of_fame"],
				)}">Hall of Fame</a>.`,
				showNotification: coachedUserTeam,
				tids: [...coachedTids],
				score: 20,
			},
			conditions,
		);
	}

	await idb.cache.coaches.put(coach);
};

export default retire;
