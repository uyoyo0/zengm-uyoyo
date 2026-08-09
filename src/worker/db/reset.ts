import { league } from "../core/index.ts";
import { getLeaguesForCurrentSport } from "./leagueSport.ts";
import { logEvent } from "../util/index.ts";

const reset = async (type: "all" | "unstarred") => {
	// Delete any current league databases
	console.log("Deleting any current league databases...");
	const leagues = await getLeaguesForCurrentSport();
	let numDeleted = 0;
	for (const l of leagues) {
		if (type === "unstarred" && l.starred) {
			continue;
		}

		await league.remove(l.lid);
		numDeleted += 1;
		await logEvent({
			type: "info",
			text: `Deleted ${numDeleted} of ${leagues.length} leagues...`,
			saveToDb: false,
		});
	}
};

export default reset;
