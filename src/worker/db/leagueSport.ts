import { bySport } from "../../common/sportFunctions.ts";
import type { League } from "../../common/types.ts";
import { idb } from "./index.ts";

type Sport = NonNullable<League["sport"]>;

export const CURRENT_SPORT = bySport<Sport>({
	baseball: "baseball",
	basketball: "basketball",
	football: "football",
	hockey: "hockey",
	soccer: "soccer",
});

export const detectLegacyLeagueSport = ({
	player,
	team,
}: {
	player?: any;
	team?: any;
}): Sport | undefined => {
	if (team?.soccerTactics !== undefined) {
		return "soccer";
	}

	const ratings = player?.ratings?.at?.(-1);
	if (!ratings) {
		return undefined;
	}
	if (
		"gkr" in ratings ||
		"gkh" in ratings ||
		"gkp" in ratings ||
		"fin" in ratings
	) {
		return "soccer";
	}
	if (
		"dnk" in ratings ||
		"ins" in ratings ||
		"fg" in ratings ||
		"reb" in ratings
	) {
		return "basketball";
	}
	if ("thv" in ratings || "thp" in ratings || "tha" in ratings) {
		return "football";
	}
	if ("hpw" in ratings || "con" in ratings || "eye" in ratings) {
		return "baseball";
	}
	if ("glk" in ratings || "wst" in ratings || "sst" in ratings) {
		return "hockey";
	}
	return undefined;
};

const getFirstRecord = (db: IDBDatabase, storeName: string) =>
	new Promise<any>((resolve) => {
		if (!db.objectStoreNames.contains(storeName)) {
			resolve(undefined);
			return;
		}
		const request = db
			.transaction(storeName, "readonly")
			.objectStore(storeName)
			.openCursor();
		request.onsuccess = () => resolve(request.result?.value);
		request.onerror = () => resolve(undefined);
	});

const openLegacyLeague = (lid: number) =>
	new Promise<IDBDatabase | undefined>((resolve) => {
		if (globalThis.indexedDB === undefined) {
			resolve(undefined);
			return;
		}
		const request = globalThis.indexedDB.open(`league${lid}`);
		request.onupgradeneeded = () => {
			// A meta row should always have a database. Abort rather than creating a
			// zombie database while inspecting damaged legacy metadata.
			request.transaction?.abort();
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(undefined);
		request.onblocked = () => resolve(undefined);
	});

const detectStoredLeagueSport = async (lid: number) => {
	const db = await openLegacyLeague(lid);
	if (!db) {
		return undefined;
	}
	try {
		const [team, player] = await Promise.all([
			getFirstRecord(db, "teams"),
			getFirstRecord(db, "players"),
		]);
		return detectLegacyLeagueSport({ player, team });
	} finally {
		db.close();
	}
};

export const getLeagueSport = async (league: League) => {
	if (league.sport !== undefined) {
		return league.sport;
	}

	const sport = await detectStoredLeagueSport(league.lid);
	if (sport !== undefined) {
		league.sport = sport;
		await idb.meta.put("leagues", league);
	}
	return sport;
};

export const isLeagueForCurrentSport = async (league: League) =>
	(await getLeagueSport(league)) === CURRENT_SPORT;

export const getLeagueForCurrentSport = async (lid: number) => {
	const league = await idb.meta.get("leagues", lid);
	if (!league || !(await isLeagueForCurrentSport(league))) {
		return undefined;
	}
	return league;
};

export const getLeaguesForCurrentSport = async () => {
	const leagues = await idb.meta.getAll("leagues");
	const matches = await Promise.all(
		leagues.map(async (league) => ({
			league,
			matches: await isLeagueForCurrentSport(league),
		})),
	);
	return matches.flatMap(({ league, matches }) => (matches ? [league] : []));
};
