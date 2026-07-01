import { PHASE } from "../../../common/constants.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { isSport } from "../../../common/sportFunctions.ts";
import type { GameResults, LineupWithoutKey } from "../../../common/types.ts";
import type { LineupStat } from "../../../common/types.basketball.ts";

const LINEUP_FIELDS: (keyof LineupStat)[] = [
	"min",
	"poss",
	"oppPoss",
	"pts",
	"oppPts",
	"fg",
	"fga",
	"tp",
	"tpa",
	"ft",
	"fta",
	"orb",
	"drb",
	"tov",
	"ast",
	"stl",
	"blk",
	"pf",
];

// Merge each team's per-game 5-man lineup totals (from GameSim) into the season
// lineups store. One row per unique unit per team/season/phase; matched by the
// sorted pids. Basketball only; skips All-Star teams (negative tid).
const writeLineupStats = async (results: GameResults) => {
	if (!isSport("basketball") || !results.lineups) {
		return;
	}

	const season = g.get("season");
	const playoffs = g.get("phase") === PHASE.PLAYOFFS;

	for (const t1 of [0, 1] as const) {
		const tid: number = results.team[t1].id;
		if (tid < 0) {
			continue;
		}

		const gameLineups: { pids: number[]; stats: LineupStat }[] =
			results.lineups[t1] ?? [];
		if (gameLineups.length === 0) {
			continue;
		}

		const existing = (
			await idb.cache.lineups.indexGetAll("lineupsByTidSeason", [
				[tid, season],
				[tid, season],
			])
		).filter((l) => l.playoffs === playoffs);
		const byKey = new Map(existing.map((l) => [l.pids.join("-"), l]));

		for (const gl of gameLineups) {
			const key = gl.pids.join("-");
			const row = byKey.get(key);
			if (row) {
				for (const f of LINEUP_FIELDS) {
					row.stats[f] += gl.stats[f];
				}
				await idb.cache.lineups.put(row);
			} else {
				const newRow: LineupWithoutKey = {
					tid,
					season,
					playoffs,
					pids: gl.pids,
					stats: { ...gl.stats },
				};
				await idb.cache.lineups.add(newRow);
			}
		}
	}
};

export default writeLineupStats;
