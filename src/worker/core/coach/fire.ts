import { idb } from "../../db/index.ts";
import { g, helpers, logEvent } from "../../util/index.ts";
import { PLAYER } from "../../../common/constants.ts";
import type { Conditions } from "../../../common/types.ts";

// Fire a team's coach: they become a free agent, and the team owes the rest of
// the contract as dead money on its coaching expense line. The team is left
// without a coach until one is hired (the preseason market fills AI teams; the
// user hires from the UI).
const fire = async (tid: number, conditions?: Conditions, log = true) => {
	const season = g.get("season");
	const coaches = await idb.cache.coaches.indexGetAll("coachesByTid", tid);
	for (const coach of coaches) {
		coach.tid = PLAYER.FREE_AGENT;
		coach.prevTid = tid;
		await idb.cache.coaches.put(coach);

		// Remaining contract becomes dead money through its expiration.
		const yearsOwed = coach.contract.exp - season + 1;
		const t = await idb.cache.teams.get(tid);
		if (t && yearsOwed > 0) {
			if (!t.deadCoachMoney) {
				t.deadCoachMoney = [];
			}
			t.deadCoachMoney.push({
				cid: coach.cid,
				name: `${coach.firstName} ${coach.lastName}`,
				amountPerYear: coach.contract.amount,
				exp: coach.contract.exp,
			});
			await idb.cache.teams.put(t);
		}

		if (log) {
			const teamName = t
				? `<a href="${helpers.leagueUrl(["roster", `${t.abbrev}_${t.tid}`])}">${t.region} ${t.name}</a>`
				: "team";
			const owedText =
				yearsOwed > 0
					? ` They are still owed ${helpers.formatCurrency(
							(coach.contract.amount * yearsOwed) / 1000,
							"M",
						)} through ${coach.contract.exp}.`
					: "";
			await logEvent(
				{
					type: "coachFired",
					text: `The ${teamName} fired head coach ${coach.firstName} ${coach.lastName}.${owedText}`,
					tids: [tid],
					showNotification: g.get("userTids").includes(tid),
					score: 20,
				},
				conditions,
			);
		}
	}
};

export default fire;
