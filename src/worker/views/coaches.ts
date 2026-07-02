import { PLAYER } from "../../common/constants.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import { coachDemand, philosophyFit } from "../core/coach/market.ts";
import { rosterOptimalStyle } from "../core/coach/style.ts";
import type { UpdateEvents } from "../../common/types.ts";

const updateCoaches = async (inputs: unknown, updateEvents: UpdateEvents) => {
	if (
		updateEvents.includes("firstRun") ||
		updateEvents.includes("gameSim") ||
		updateEvents.includes("playerMovement") ||
		updateEvents.includes("newPhase")
	) {
		const season = g.get("season");
		const userTid = g.get("userTid");
		const teams = await idb.cache.teams.getAll();

		// The user team's last-season win% drives what coaches ask from them.
		const userTs = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsByTidSeason",
			[userTid, season - 1],
		);
		const userGp = userTs ? userTs.won + userTs.lost + (userTs.tied ?? 0) : 0;
		const userWinp =
			userGp > 0 ? (userTs!.won + 0.5 * (userTs!.tied ?? 0)) / userGp : 0.5;

		const userTeam = teams.find((t) => t.tid === userTid);
		const deadCoachMoney = (userTeam?.deadCoachMoney ?? []).filter(
			(d) => d.exp >= season,
		);

		// How well each coach's preferred style suits the user's roster.
		const userPlayers = await idb.cache.players.indexGetAll(
			"playersByTid",
			userTid,
		);
		const userOptimal = rosterOptimalStyle(userPlayers);
		const teamInfo = new Map(
			teams.map((t) => [
				t.tid,
				{ abbrev: t.abbrev, region: t.region, name: t.name },
			]),
		);

		const allCoaches = await idb.cache.coaches.getAll();

		const coaches = await Promise.all(
			allCoaches.map(async (c) => {
				const info = teamInfo.get(c.tid);

				// Current-season record + expected wins for employed coaches.
				let won;
				let expectedWins;
				if (c.tid >= 0) {
					const ts = await idb.cache.teamSeasons.indexGet(
						"teamSeasonsByTidSeason",
						[c.tid, season],
					);
					if (ts) {
						won = ts.won;
						expectedWins = ts.expectedWins;
					}
				}

				// What this coach would ask from the user's team: free agents always,
				// plus the user's own coach when extension-eligible (final year).
				const negotiable =
					c.tid === PLAYER.FREE_AGENT ||
					(c.tid === userTid && c.contract.exp <= season);
				const demand = negotiable
					? coachDemand(c, userTid, userWinp)
					: undefined;

				return {
					cid: c.cid,
					firstName: c.firstName,
					lastName: c.lastName,
					age: season - c.born.year,
					tid: c.tid,
					abbrev: info?.abbrev,
					region: info?.region,
					name: info?.name,
					ratings: c.ratings,
					philosophy: c.philosophy,
					contract: c.contract,
					fromPid: c.fromPid,
					awards: c.awards,
					numAwards: c.awards.length,
					won,
					expectedWins,
					fit: philosophyFit(c.philosophy, userOptimal),
					// Face only for the user's coach (rendered in the My Coach card).
					face: c.tid === userTid ? c.face : undefined,
					prevTid: c.prevTid,
					prevAbbrev:
						c.prevTid !== undefined
							? teamInfo.get(c.prevTid)?.abbrev
							: undefined,
					demand,
				};
			}),
		);

		coaches.sort((a, b) => {
			// Employed coaches first (by team), then free agents by ovr.
			if (a.tid >= 0 && b.tid < 0) {
				return -1;
			}
			if (a.tid < 0 && b.tid >= 0) {
				return 1;
			}
			if (a.tid >= 0 && b.tid >= 0) {
				return a.tid - b.tid;
			}
			return b.ratings.ovr - a.ratings.ovr;
		});

		return {
			coaches,
			deadCoachMoney,
			userTeamColors: userTeam?.colors,
			userTeamJersey: userTeam?.jersey,
			userTid,
			userTids: g.get("userTids"),
			freeAgent: PLAYER.FREE_AGENT,
			godMode: g.get("godMode"),
			spectator: g.get("spectator"),
			phase: g.get("phase"),
			season,
		};
	}
};

export default updateCoaches;
