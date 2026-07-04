import { idb } from "../../db/index.ts";
import { toUI } from "../../util/index.ts";
import { coach } from "../index.ts";
import { PLAYER } from "../../../common/constants.ts";

// Backfill HoF flags for retired coaches, e.g. after the v78 migration added
// playoff/championship data to leagues that predate the coach Hall of Fame.
const recomputeCoachHallOfFame = async () => {
	const tx = idb.league.transaction("coaches", "readwrite");

	for await (const cursor of tx.store) {
		const c = cursor.value;

		const made = c.tid === PLAYER.RETIRED && coach.madeHof(c);

		const prev = c.hof;
		if (made) {
			c.hof = 1;
		} else {
			delete c.hof;
		}

		if (c.hof !== prev) {
			await cursor.update(c);
		}
	}

	await tx.done;

	await idb.cache.fill();
	await toUI("realtimeUpdate", [["firstRun"]]);
};

export default recomputeCoachHallOfFame;
