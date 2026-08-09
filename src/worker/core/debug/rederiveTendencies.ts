import { isSport } from "../../../common/sportFunctions.ts";
import { idb } from "../../db/index.ts";
import { g, toUI } from "../../util/index.ts";
import {
	DERIVED_TENDENCY_NOISE,
	deriveTendenciesPerSeason,
} from "../realRosters/deriveTendencies.basketball.ts";
import loadStatsBasketball from "../realRosters/loadStats.basketball.ts";

// Re-derive behavioral tendencies for real players from their actual career
// stats. For leagues created before tendency derivation existed (or created
// with realStats "none", which used to skip derivation entirely), real players
// have skill-based fallback tendencies, so e.g. Larry Bird shoots threes like
// a modern volume shooter. Run from the console:
//   bbgm.debug.rederiveTendencies() - historical with variation (league default)
//   bbgm.debug.rederiveTendencies("historicalExact") - deterministic
//   bbgm.debug.rederiveTendencies("historical", 0) - career-aggregate identity
// The second arg (0-1) is tendency seasonality: how strongly each ratings row
// tracks that specific season of the player's career. Defaults to the
// league's Tendency Seasonality setting.
const rederiveTendencies = async (
	mode: "historical" | "historicalExact" = "historical",
	seasonality?: number,
) => {
	if (!isSport("basketball")) {
		throw new Error("Only supported for basketball");
	}
	seasonality ??= g.get("realTendenciesSeasonality") ?? 1;

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
	const sourceCounts = { located: 0, estimated: 0, skill: 0 };

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
		const bySeason = deriveTendenciesPerSeason(
			careerStats,
			p.ratings as any,
			seasonality,
			mode === "historical" ? DERIVED_TENDENCY_NOISE : 0,
		);
		let counted = false;
		for (const r of p.ratings) {
			const tendencies = bySeason.get((r as any).season);
			if (tendencies) {
				Object.assign(r, tendencies);
				if (!counted) {
					sourceCounts[tendencies.tendencyMixSource] += 1;
					counted = true;
				}
			}
		}
		await cursor.update(p);
		numUpdated += 1;
	}
	await tx.done;

	console.log(
		`Re-derived tendencies for ${numUpdated} real players (${numSkipped} non-real players unchanged).`,
	);
	console.log(
		`Shot mix sources: ${sourceCounts.located} from real location data, ${sourceCounts.estimated} estimated from box stats, ${sourceCounts.skill} ratings-based.`,
	);
	await idb.cache.fill();
	await toUI("realtimeUpdate", [["firstRun"]]);
};

export default rederiveTendencies;
