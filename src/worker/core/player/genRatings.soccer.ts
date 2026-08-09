import { POSITION_COUNTS, POSITIONS, RATINGS } from "../../../common/constants.soccer.ts";
import type { PlayerRatings, Position, RatingKey } from "../../../common/types.soccer.ts";
import { truncGauss } from "../../../common/random.ts";
import genFuzz from "./genFuzz.ts";
import limitRating from "./limitRating.ts";

const choosePosition = (): Position => {
	const total = Object.values(POSITION_COUNTS).reduce((sum, count) => sum + count, 0);
	let value = Math.random() * total;
	for (const position of POSITIONS) {
		value -= POSITION_COUNTS[position];
		if (value <= 0) {
			return position;
		}
	}
	return "CM";
};

const boosts: Record<Position, RatingKey[]> = {
	GK: ["gkr", "gkh", "gkp", "cmp", "hgt"],
	CB: ["tck", "diq", "hea", "stre", "hgt"],
	LB: ["spd", "acc", "endu", "tck", "crs"],
	RB: ["spd", "acc", "endu", "tck", "crs"],
	DM: ["tck", "diq", "pas", "cmp", "stre"],
	CM: ["pas", "ftc", "oiq", "cmp", "endu"],
	AM: ["pas", "oiq", "ftc", "drb", "cmp"],
	LW: ["spd", "acc", "drb", "crs", "oiq"],
	RW: ["spd", "acc", "drb", "crs", "oiq"],
	ST: ["fin", "oiq", "cmp", "ftc", "hea"],
};

const genRatings = (season: number, scoutingLevel: number) => {
	const intendedPosition = choosePosition();
	const raw = {} as Record<RatingKey, number>;
	for (const key of RATINGS) {
		raw[key] = limitRating(truncGauss(key === "hgt" ? 48 : 14, 7, 2, 42));
	}
	for (const key of boosts[intendedPosition]) {
		raw[key] = limitRating(raw[key] + truncGauss(22, 9, 10, 42));
	}
	if (intendedPosition !== "GK") {
		raw.gkr = limitRating(raw.gkr * 0.25);
		raw.gkh = limitRating(raw.gkh * 0.25);
		raw.gkp = limitRating(raw.gkp * 0.25);
	}

	const blank = Object.fromEntries(POSITIONS.map((position) => [position, 0])) as Record<Position, number>;
	const ratings: PlayerRatings = {
		...raw,
		fuzz: genFuzz(scoutingLevel),
		ovr: 0,
		pot: 0,
		ovrs: { ...blank },
		pots: { ...blank },
		pos: intendedPosition,
		season,
		skills: [],
	};
	return {
		heightInInches: Math.round(64 + (ratings.hgt * 16) / 100),
		ratings,
	};
};

export default genRatings;
