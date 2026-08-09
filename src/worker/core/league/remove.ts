import { deleteDB } from "@dumbmatter/idb";
import close from "./close.ts";
import { idb } from "../../db/index.ts";
import { isLeagueForCurrentSport } from "../../db/leagueSport.ts";
import { g, logEvent } from "../../util/index.ts";

const remove = async (lid: number) => {
	const league = await idb.meta.get("leagues", lid);
	if (!league) {
		return;
	}
	if (!(await isLeagueForCurrentSport(league))) {
		throw new Error("Cannot delete a league from another sport");
	}
	if (g.get("lid") === lid) {
		await close(true);
	}

	await idb.meta.delete("leagues", lid);
	await deleteDB(`league${lid}`, {
		blocked() {
			logEvent({
				type: "error",
				text: "Please close any other open tabs.",
				saveToDb: false,
			});
		},
	});
};

export default remove;
