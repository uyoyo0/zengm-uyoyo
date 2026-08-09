import { helpers } from "./helpers.ts";
import type { PlayerStats, PlayerStatType } from "./types.ts";

const processStats = (
	ps: PlayerStats,
	stats: string[],
	_statType?: PlayerStatType,
	bornYear?: number,
) => {
	const row: Record<string, any> = {};

	for (const stat of stats) {
		if (stat === "pasPct") {
			row[stat] = helpers.percentage(ps.pasCmp ?? 0, ps.pas ?? 0);
		} else if (stat === "drbPct") {
			row[stat] = helpers.percentage(ps.drbCmp ?? 0, ps.drbAtt ?? 0);
		} else if (stat === "crsPct") {
			row[stat] = helpers.percentage(ps.crsCmp ?? 0, ps.crs ?? 0);
		} else if (stat === "prsPct") {
			row[stat] = helpers.percentage(ps.prsWon ?? 0, ps.prs ?? 0);
		} else if (stat === "aerialPct") {
			row[stat] = helpers.percentage(ps.aw ?? 0, ps.aa ?? 0);
		} else if (stat === "svPct") {
			row[stat] = helpers.percentage(ps.sv ?? 0, (ps.sv ?? 0) + (ps.ga ?? 0));
		} else if (stat === "matchRating") {
			row[stat] = helpers.ratio(ps.matchRating ?? 0, ps.gp ?? 0);
		} else if (stat === "goalsPrevented") {
			row[stat] = ps.psxg === undefined ? 0 : ps.psxg - (ps.ga ?? 0);
		} else if (stat.endsWith("90")) {
			const source = stat.slice(0, -2);
			row[stat] = helpers.ratio((ps as any)[source] ?? 0, ps.min ?? 0) * 90;
		} else if (stat === "age") {
			if (bornYear === undefined) {
				throw new Error("You must supply bornYear to process soccer age");
			}
			row.age = ps.season - bornYear;
		} else if (stat === "keyStats" || stat === "keyStatsWithGoalieGP") {
			const isGoalkeeper = (ps.sv ?? 0) + (ps.ga ?? 0) > 0;
			row[stat] = isGoalkeeper
				? `${ps.cs ?? 0} CS, ${(helpers.percentage(ps.sv ?? 0, (ps.sv ?? 0) + (ps.ga ?? 0)) ?? 0).toFixed(1)} SV%`
				: `${ps.g ?? 0} G, ${ps.a ?? 0} A`;
		} else {
			row[stat] = ps[stat];
		}

		if (row[stat] === undefined || Number.isNaN(row[stat])) {
			row[stat] = 0;
		}
	}

	row.playoffs = ps.playoffs;
	if (ps.hasTot) {
		row.hasTot = ps.hasTot;
	}
	return row;
};

export default processStats;
