import { helpers } from "../../util/index.ts";
import { realGauss } from "../../../common/random.ts";

// Award credit toward a season's seeded popularity, so backfilled history
// looks plausible for legends. Awards for season S affect the S+1 row,
// matching updatePopularity's timing.
const awardBonus = (
	awards: { season: number; type: string }[],
	season: number,
) => {
	let bonus = 0;
	for (const award of awards) {
		if (award.season === season) {
			if (award.type === "Most Valuable Player") {
				bonus += 22;
			} else if (
				award.type === "Won Championship" ||
				award.type === "Finals MVP"
			) {
				bonus += 10;
			} else if (award.type === "All-Star") {
				bonus += 8;
			}
		}
	}
	return Math.min(30, bonus);
};

// Seed charisma and popularity on any ratings rows missing them (or holding
// junk). Used for new players (via develop), league file imports including
// real-players leagues (via augmentPartialPlayer), the v79 migration, and the
// debug backfill. Uses no game attributes, so it's safe inside DB upgrade
// transactions.
const seedPopularity = (p: {
	ratings: any[];
	awards?: { season: number; type: string }[];
}) => {
	// One charisma for the whole career; reuse an existing value if any row
	// already has one.
	let charisma = p.ratings.find(
		(r) => typeof r.charisma === "number" && !Number.isNaN(r.charisma),
	)?.charisma;
	charisma ??= helpers.bound(Math.round(50 + realGauss(0, 9)), 15, 85);

	let changed = false;
	for (const r of p.ratings) {
		if (typeof r.charisma !== "number" || Number.isNaN(r.charisma)) {
			r.charisma = charisma;
			changed = true;
		}
		if (typeof r.popularity !== "number" || Number.isNaN(r.popularity)) {
			r.popularity = helpers.bound(
				Math.round(
					12 +
						0.75 * Math.max(0, (r.ovr ?? 0) - 30) +
						0.5 * (r.charisma - 50) +
						awardBonus(p.awards ?? [], r.season - 1) +
						realGauss(0, 4),
				),
				0,
				100,
			);
			changed = true;
		}
	}
	return changed;
};

export default seedPopularity;
