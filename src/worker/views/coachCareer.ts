import { idb } from "../db/index.ts";
import type { Coach } from "../../common/types.ts";

// All coaches ever, merged from the league store and the cache. Retired
// coaches exist only in the store, while active coaches may have newer rows in
// the cache than the last flush wrote to the store.
export const getAllCoaches = async (): Promise<Coach[]> => {
	const byCid = new Map<number, Coach>();
	for (const c of await idb.league.getAll("coaches")) {
		byCid.set(c.cid, c);
	}
	for (const c of await idb.cache.coaches.getAll()) {
		byCid.set(c.cid, c);
	}
	return [...byCid.values()];
};

export const coachCareerTotals = (coach: Coach) => {
	const seasons = coach.seasons ?? [];

	let won = 0;
	let lost = 0;
	let expectedWins = 0;
	let playoffWon = 0;
	let playoffLost = 0;
	let championships = 0;
	let firstSeason: number | undefined;
	let lastSeason: number | undefined;

	for (const s of seasons) {
		won += s.won;
		lost += s.lost;
		expectedWins += s.expectedWins;
		playoffWon += s.playoffWon ?? 0;
		playoffLost += s.playoffLost ?? 0;
		if (s.champion) {
			championships += 1;
		}
		if (firstSeason === undefined || s.season < firstSeason) {
			firstSeason = s.season;
		}
		if (lastSeason === undefined || s.season > lastSeason) {
			lastSeason = s.season;
		}
	}

	const gp = won + lost;
	const coy = coach.awards.filter(
		(a) => a.type === "Coach of the Year",
	).length;

	return {
		numSeasons: seasons.length,
		won,
		lost,
		winp: gp > 0 ? won / gp : 0,
		expectedWins,
		playoffWon,
		playoffLost,
		championships,
		coy,
		firstSeason,
		lastSeason,
	};
};
