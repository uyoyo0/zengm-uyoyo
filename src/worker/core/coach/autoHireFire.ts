import { idb } from "../../db/index.ts";
import { g, helpers, logEvent } from "../../util/index.ts";
import { PLAYER } from "../../../common/constants.ts";
import { orderBy } from "../../../common/utils.ts";
import genContract from "./genContract.ts";
import hire from "./hire.ts";
import fire from "./fire.ts";
import ensureCoaches from "./ensureCoaches.ts";
import developCoach, { shouldRetire } from "./develop.ts";
import type { Conditions } from "../../../common/types.ts";

// Offseason coach churn: develop/age coaches, retire the old ones, renew
// expiring contracts, let AI teams fire underperformers, and make sure every
// team has a coach. Run each preseason.
const autoHireFire = async (conditions?: Conditions) => {
	const season = g.get("season");
	const userTids = g.get("userTids");

	// Coaches develop with age and experience, and old coaches whose contract is
	// up (or who are unemployed) may retire. Never mid-contract.
	for (const coach of await idb.cache.coaches.getAll()) {
		developCoach(coach, season);

		const age = season - coach.born.year;
		const betweenContracts =
			coach.tid === PLAYER.FREE_AGENT ||
			(coach.tid >= 0 && coach.contract.exp < season);
		if (betweenContracts && shouldRetire(age)) {
			const fromTid = coach.tid;
			coach.tid = PLAYER.RETIRED;
			await idb.cache.coaches.put(coach);
			await logEvent(
				{
					type: "coachRetired",
					text: `Head coach ${coach.firstName} ${coach.lastName} retired at age ${age}.`,
					tids: fromTid >= 0 ? [fromTid] : [],
					showNotification: fromTid >= 0 && userTids.includes(fromTid),
					score: 20,
				},
				conditions,
			);
			continue;
		}

		await idb.cache.coaches.put(coach);
	}

	// Renew expired contracts in place (coaches re-sign rather than walk; AI churn
	// is handled by firing below).
	for (const coach of await idb.cache.coaches.getAll()) {
		if (coach.tid >= 0 && coach.contract.exp < season) {
			coach.contract = genContract(coach.ratings.ovr);
			await idb.cache.coaches.put(coach);
		}
	}

	// AI teams fire underperforming coaches.
	const teams = (await idb.cache.teams.getAll()).filter((t) => !t.disabled);
	for (const t of teams) {
		if (userTids.includes(t.tid) || g.get("spectator")) {
			continue;
		}
		const coaches = await idb.cache.coaches.indexGetAll("coachesByTid", t.tid);
		const coach = coaches[0];
		if (!coach) {
			continue;
		}

		const ts = await idb.cache.teamSeasons.indexGet("teamSeasonsByTidSeason", [
			t.tid,
			season - 1,
		]);
		if (ts) {
			const gp = ts.won + ts.lost + (ts.tied ?? 0);
			const winp = gp > 0 ? (ts.won + 0.5 * (ts.tied ?? 0)) / gp : 0.5;
			const fireProb =
				helpers.bound(0.45 - winp, 0, 0.45) * (1 - coach.ratings.ovr / 130);
			if (Math.random() < fireProb) {
				await fire(t.tid, conditions);
			}
		}
	}

	// Fill any coachless team with the best available free agent.
	for (const t of teams) {
		const coaches = await idb.cache.coaches.indexGetAll("coachesByTid", t.tid);
		if (coaches.length > 0) {
			continue;
		}
		const freeAgents = orderBy(
			(await idb.cache.coaches.getAll()).filter(
				(c) => c.tid === PLAYER.FREE_AGENT,
			),
			(c) => c.ratings.ovr,
			"desc",
		);
		if (freeAgents[0]) {
			await hire(freeAgents[0].cid, t.tid, { conditions });
		}
	}

	// Top up the free-agent pool (and cover any team still without a coach).
	await ensureCoaches();
};

export default autoHireFire;
