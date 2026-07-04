import type { PlayoffSeries } from "../../../common/types.ts";

// Per-team playoff W/L summed across a season's playoff series. Play-in games
// are excluded, matching the playoffRoundsWon convention.
const getPlayoffRecords = (series: PlayoffSeries["series"] | undefined) => {
	const records = new Map<number, { won: number; lost: number }>();
	if (!series) {
		return records;
	}

	const add = (tid: number, won: number, lost: number) => {
		const record = records.get(tid) ?? { won: 0, lost: 0 };
		record.won += won;
		record.lost += lost;
		records.set(tid, record);
	};

	for (const round of series) {
		for (const matchup of round) {
			// No away team means a bye, not a played series.
			if (!matchup.away) {
				continue;
			}
			add(matchup.home.tid, matchup.home.won, matchup.away.won);
			add(matchup.away.tid, matchup.away.won, matchup.home.won);
		}
	}

	return records;
};

export default getPlayoffRecords;
