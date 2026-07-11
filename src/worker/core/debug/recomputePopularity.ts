import { idb } from "../../db/index.ts";
import { toUI } from "../../util/index.ts";
import seedPopularity from "../player/seedPopularity.basketball.ts";

// Backfill popularity/charisma for any players missing them (or holding NaN),
// e.g. real-players leagues created before augmentPartialPlayer seeded them.
const recomputePopularity = async () => {
	const tx = idb.league.transaction("players", "readwrite");

	for await (const cursor of tx.store) {
		const p = cursor.value;
		if (seedPopularity(p)) {
			await cursor.update(p);
		}
	}

	await tx.done;

	await idb.cache.fill();
	await toUI("realtimeUpdate", [["firstRun"]]);
};

export default recomputePopularity;
