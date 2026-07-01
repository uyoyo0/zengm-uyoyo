import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import type { UpdateEvents, ViewInput, Lineup } from "../../common/types.ts";

// Derived per-100-possession ratings and shooting splits for a lineup, using the
// same definitions as advStats.basketball.ts so they reconcile with team stats.
const deriveLineup = (l: Lineup) => {
	const s = l.stats;
	const tsa = s.fga + 0.44 * s.fta;
	return {
		ortg: s.poss > 0 ? (100 * s.pts) / s.poss : 0,
		drtg: s.oppPoss > 0 ? (100 * s.oppPts) / s.oppPoss : 0,
		net:
			(s.poss > 0 ? (100 * s.pts) / s.poss : 0) -
			(s.oppPoss > 0 ? (100 * s.oppPts) / s.oppPoss : 0),
		efg: s.fga > 0 ? (100 * (s.fg + 0.5 * s.tp)) / s.fga : 0,
		tsp: tsa > 0 ? (100 * s.pts) / (2 * tsa) : 0,
		tovp: tsa + s.tov > 0 ? (100 * s.tov) / (tsa + s.tov) : 0,
		// Possessions per 48 minutes (avg of the unit's offensive and defensive
		// possessions), so pace is comparable to the team pace stat.
		pace: s.min > 0 ? (48 * ((s.poss + s.oppPoss) / 2)) / s.min : 0,
	};
};

const updateLineups = async (
	inputs: ViewInput<"lineups">,
	updateEvents: UpdateEvents,
	state: any,
) => {
	if (
		updateEvents.includes("firstRun") ||
		(inputs.season === g.get("season") && updateEvents.includes("gameSim")) ||
		inputs.abbrev !== state.abbrev ||
		inputs.season !== state.season ||
		inputs.playoffs !== state.playoffs
	) {
		const { abbrev, tid, season, playoffs } = inputs;
		const isPlayoffs = playoffs === "playoffs";

		// Pull the season's lineup rows for this team. Use the cache for the current
		// season (it holds not-yet-flushed writes); read the DB directly otherwise.
		let rows: Lineup[];
		if (season === g.get("season")) {
			rows = (
				await idb.cache.lineups.indexGetAll("lineupsByTidSeason", [
					[tid, season],
					[tid, season],
				])
			).filter((l) => l.playoffs === isPlayoffs);
		} else {
			const all = await idb.league.getAllFromIndex(
				"lineups",
				"season, tid",
				IDBKeyRange.bound([season, tid], [season, tid]),
			);
			rows = all.filter((l) => l.playoffs === isPlayoffs && l.tid === tid);
		}

		// Resolve pids -> { name, pos } for every player that appears in a lineup.
		const pidSet = new Set<number>();
		for (const l of rows) {
			for (const pid of l.pids) {
				pidSet.add(pid);
			}
		}
		const playersRaw = await idb.getCopies.players(
			{ pids: [...pidSet] },
			"noCopyCache",
		);
		const players = await idb.getCopies.playersPlus(playersRaw, {
			attrs: ["pid", "firstName", "lastName"],
			ratings: ["pos"],
			season,
			fuzz: true,
			showNoStats: true,
			showRookies: true,
		});
		const playerByPid = new Map<
			number,
			{ pid: number; name: string; pos: string }
		>();
		for (const p of players) {
			playerByPid.set(p.pid, {
				pid: p.pid,
				name: `${p.firstName} ${p.lastName}`,
				pos: p.ratings?.pos ?? "",
			});
		}

		const lineups = rows
			.map((l) => ({
				pids: l.pids,
				players: l.pids.map(
					(pid) => playerByPid.get(pid) ?? { pid, name: "Unknown", pos: "" },
				),
				stats: l.stats,
				...deriveLineup(l),
			}))
			.sort((a, b) => b.net - a.net);

		return {
			abbrev,
			tid,
			season,
			playoffs,
			lineups,
		};
	}
};

export default updateLineups;
