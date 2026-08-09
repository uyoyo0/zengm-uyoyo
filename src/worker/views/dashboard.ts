import type { UpdateEvents } from "../../common/types.ts";
import { getLeaguesForCurrentSport } from "../db/leagueSport.ts";

const updateDashboard = async (inputs: unknown, updateEvents: UpdateEvents) => {
	if (updateEvents.includes("firstRun") || updateEvents.includes("leagues")) {
		const leagues = await getLeaguesForCurrentSport();

		for (const league of leagues) {
			league.teamRegion ??= "???";
			league.teamName ??= "???";
		}

		return {
			leagues,
		};
	}
};

export default updateDashboard;
