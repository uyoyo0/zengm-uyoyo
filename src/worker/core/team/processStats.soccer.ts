import type { TeamStatAttr, TeamStats } from "../../../common/types.ts";
import { helpers } from "../../util/index.ts";

const processStats = (
	ts: TeamStats,
	stats: Readonly<TeamStatAttr[]>,
	playoffs: boolean,
) => {
	const row: Record<string, any> = {};
	for (const stat of stats) {
		const key = stat as string;
		if (key === "gd") {
			row[stat] = (ts.g ?? ts.pts ?? 0) - (ts.oppG ?? ts.oppPts ?? 0);
		} else if (key === "posPct") {
			row[stat] = helpers.percentage(ts.pos, ts.pos + ts.oppPos);
		} else if (key === "oppPosPct") {
			row[stat] = helpers.percentage(ts.oppPos, ts.pos + ts.oppPos);
		} else if (key === "pasPct") {
			row[stat] = helpers.percentage(ts.pasCmp, ts.pas);
		} else if (key === "drbPct") {
			row[stat] = helpers.percentage(ts.drbCmp, ts.drbAtt);
		} else if (key === "crsPct") {
			row[stat] = helpers.percentage(ts.crsCmp, ts.crs);
		} else if (key === "prsPct") {
			row[stat] = helpers.percentage(ts.prsWon, ts.prs);
		} else if (key === "goalsPrevented") {
			row[stat] = ts.psxg === undefined ? 0 : ts.psxg - (ts.oppG ?? 0);
		} else if (key === "shotPct") {
			row[stat] = helpers.percentage(ts.g, ts.sh);
		} else if (key === "savePct") {
			row[stat] = helpers.percentage(ts.sv, ts.sv + ts.oppG);
		} else {
			row[stat] = ts[stat] ?? 0;
		}
	}
	row.playoffs = ts.playoffs ?? playoffs;
	return row;
};

export default processStats;
