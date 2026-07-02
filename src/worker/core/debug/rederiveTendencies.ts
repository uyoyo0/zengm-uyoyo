import { isSport } from "../../../common/sportFunctions.ts";
import { last } from "../../../common/utils.ts";
import { idb } from "../../db/index.ts";
import { toUI } from "../../util/index.ts";
import deriveTendencies, {
	DERIVED_TENDENCY_NOISE,
} from "../realRosters/deriveTendencies.basketball.ts";
import loadStatsBasketball from "../realRosters/loadStats.basketball.ts";

// Re-derive behavioral tendencies for real players from their actual career
// stats. For leagues created before tendency derivation existed (or created
// with realStats "none", which used to skip derivation entirely), real players
// have skill-based fallback tendencies, so e.g. Larry Bird shoots threes like
// a modern volume shooter. Run from the console:
//   bbgm.debug.rederiveTendencies() - historical with variation (league default)
//   bbgm.debug.rederiveTendencies("historicalExact") - deterministic
const rederiveTendencies = async (
	mode: "historical" | "historicalExact" = "historical",
) => {
	if (!isSport("basketball")) {
		throw new Error("Only supported for basketball");
	}

	const { stats } = await loadStatsBasketball();
	const statsBySlug = new Map<string, typeof stats>();
	for (const row of stats) {
		const existing = statsBySlug.get(row.slug);
		if (existing) {
			existing.push(row);
		} else {
			statsBySlug.set(row.slug, [row]);
		}
	}

	let numUpdated = 0;
	let numSkipped = 0;

	const tx = idb.league.transaction("players", "readwrite");
	for await (const cursor of tx.store) {
		const p = cursor.value;

		// Only real players (srID is the real-player slug); random players keep
		// their generated skill-based tendencies.
		if (typeof p.srID !== "string" || p.ratings.length === 0) {
			numSkipped += 1;
			continue;
		}

		const careerStats = statsBySlug.get(p.srID) ?? [];
		const tendencies = deriveTendencies(
			careerStats,
			last(p.ratings) as any,
			mode === "historical" ? DERIVED_TENDENCY_NOISE : 0,
		);
		for (const r of p.ratings) {
			Object.assign(r, tendencies);
		}
		await cursor.update(p);
		numUpdated += 1;
	}
	await tx.done;

	console.log(
		`Re-derived tendencies for ${numUpdated} real players (${numSkipped} non-real players unchanged).`,
	);
	await idb.cache.fill();
	await toUI("realtimeUpdate", [["firstRun"]]);
};

export default rederiveTendencies;
