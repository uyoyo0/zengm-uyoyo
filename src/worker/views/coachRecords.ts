import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import type { UpdateEvents } from "../../common/types.ts";
import { coachCareerTotals, getAllCoaches } from "./coachCareer.ts";

// All-time coaching records: career totals for every coach, active or retired,
// with at least one completed season.
const updateCoachRecords = async (
	inputs: unknown,
	updateEvents: UpdateEvents,
) => {
	if (updateEvents.includes("firstRun") || updateEvents.includes("newPhase")) {
		const teams = await idb.cache.teams.getAll();
		const abbrevByTid = new Map(teams.map((t) => [t.tid, t.abbrev]));

		const coaches = (await getAllCoaches())
			.filter((c) => (c.seasons?.length ?? 0) > 0)
			.map((c) => {
				const totals = coachCareerTotals(c);
				return {
					cid: c.cid,
					firstName: c.firstName,
					lastName: c.lastName,
					tid: c.tid,
					abbrev: c.tid >= 0 ? abbrevByTid.get(c.tid) : undefined,
					active: c.tid >= 0,
					hof: c.hof,
					retiredYear: c.retiredYear,
					winsAboveExpected: totals.won - totals.expectedWins,
					...totals,
				};
			});

		coaches.sort((a, b) => b.won - a.won);

		return {
			coaches,
			userTid: g.get("userTid"),
		};
	}
};

export default updateCoachRecords;
