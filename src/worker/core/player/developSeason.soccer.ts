import { RATINGS } from "../../../common/constants.soccer.ts";
import type { PlayerRatings } from "../../../common/types.soccer.ts";
import { realGauss } from "../../../common/random.ts";
import { coachingEffect } from "../../../common/budgetLevels.ts";
import limitRating from "./limitRating.ts";

const developSeason = (ratings: PlayerRatings, age: number, coachingLevel: number) => {
	const base = age <= 20 ? 3.4 : age <= 23 ? 2.1 : age <= 26 ? 0.8 : age <= 29 ? 0 : age <= 32 ? -1.4 : -3.2;
	const coaching = 1 + coachingEffect(coachingLevel);
	for (const key of RATINGS) {
		if (key === "hgt") {
			continue;
		}
		let ageAdjustment = base;
		if (["spd", "acc", "endu"].includes(key) && age >= 29) {
			ageAdjustment -= 1.5;
		}
		if (["oiq", "diq", "cmp", "gkp"].includes(key) && age <= 30) {
			ageAdjustment += 0.6;
		}
		ratings[key] = limitRating(ratings[key] + realGauss(ageAdjustment * coaching, age <= 23 ? 3.5 : 2));
	}
};

export default developSeason;
