import { PHASE } from "../../common/constants.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import type { UpdateEvents } from "../../common/types.ts";
import addFirstNameShort from "../util/addFirstNameShort.ts";
import { bySport } from "../../common/sportFunctions.ts";
import { processPlayersHallOfFame } from "../util/processPlayersHallOfFame.ts";
import { coachCareerTotals, getAllCoaches } from "./coachCareer.ts";

// gpF is used on processPlayersHallOfFame for baseball
export const extraStats = bySport({
	baseball: ["gpF"],
	basketball: [],
	football: [],
	hockey: [],
});

const updatePlayers = async (inputs: unknown, updateEvents: UpdateEvents) => {
	if (
		updateEvents.includes("firstRun") ||
		// Players are inducted at the draft lottery, coaches at the preseason
		// coach market.
		(updateEvents.includes("newPhase") &&
			(g.get("phase") === PHASE.DRAFT_LOTTERY ||
				g.get("phase") === PHASE.PRESEASON))
	) {
		const stats = bySport({
			baseball: ["keyStats", "war"],
			basketball: [
				"gp",
				"min",
				"pts",
				"trb",
				"ast",
				"per",
				"ewa",
				"ws",
				"ws48",
			],
			football: ["keyStats", "av"],
			hockey: ["keyStats", "ops", "dps", "ps"],
		});
		const playersAll = await idb.getCopies.players(
			{
				hof: true,
			},
			"noCopyCache",
		);
		const players = await idb.getCopies.playersPlus(playersAll, {
			attrs: [
				"pid",
				"firstName",
				"lastName",
				"draft",
				"retiredYear",
				"statsTids",
			],
			ratings: ["season", "ovr", "pos"],
			stats: ["season", "abbrev", "tid", ...stats, ...extraStats],
			fuzz: true,
		});

		const userTid = g.get("userTid");
		const coaches = (await getAllCoaches())
			.filter((c) => c.hof)
			.map((c) => ({
				cid: c.cid,
				firstName: c.firstName,
				lastName: c.lastName,
				retiredYear: c.retiredYear,
				userTeam: c.seasons?.some((s) => s.tid === userTid) ?? false,
				...coachCareerTotals(c),
			}));
		coaches.sort((a, b) => (a.retiredYear ?? 0) - (b.retiredYear ?? 0));

		return {
			players: addFirstNameShort(processPlayersHallOfFame(players)),
			coaches,
			stats,
		};
	}
};

export default updatePlayers;
