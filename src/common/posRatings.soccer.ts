import type { Position, RatingKey } from "./types.soccer.ts";

const ratingsByPosition: Record<Position, RatingKey[]> = {
	GK: ["gkr", "gkh", "gkp", "cmp", "pas", "hgt"],
	CB: ["tck", "diq", "hea", "stre", "hgt", "spd", "pas"],
	LB: ["spd", "acc", "endu", "tck", "diq", "crs", "pas"],
	RB: ["spd", "acc", "endu", "tck", "diq", "crs", "pas"],
	DM: ["tck", "diq", "pas", "cmp", "stre", "endu", "ftc"],
	CM: ["pas", "ftc", "oiq", "cmp", "endu", "tck", "drb"],
	AM: ["pas", "oiq", "ftc", "drb", "cmp", "fin", "sht"],
	LW: ["spd", "acc", "drb", "crs", "oiq", "fin", "ftc"],
	RW: ["spd", "acc", "drb", "crs", "oiq", "fin", "ftc"],
	ST: ["fin", "oiq", "cmp", "ftc", "hea", "spd", "acc", "stre"],
};

const posRatings = (pos: string): RatingKey[] =>
	ratingsByPosition[pos as Position] ?? [];

export default posRatings;
