import { idb } from "../db/index.ts";

// Pick the lid for a new league: one more than the largest sane lid. Scan all
// keys rather than trusting the last one, because IndexedDB accepts keys that
// break "max + 1": huge floats (2^53 + 1 === 2^53), Infinity, and strings
// (which sort after all numbers) can get in via imported league files, and
// any of them would make "last key + 1" collide forever.
export const getNewLeagueLid = async () => {
	const keys = await (await idb.meta.transaction("leagues")).store.getAllKeys();

	let lid = 1;
	for (const key of keys) {
		if (typeof key === "number" && Number.isSafeInteger(key) && key >= lid) {
			lid = key + 1;
		}
	}

	return lid;
};
