import type { CompositeWeights, Conf, Div, NonEmptyArray } from "./types.ts";
import type { Position, RatingKey } from "./types.soccer.ts";

export const SOCCER_LEAGUE_COMP_ID = "league";

export const COMPOSITE_WEIGHTS: CompositeWeights<RatingKey> = {
	pace: {
		ratings: ["spd", "acc"],
		weights: [1, 1],
		skill: { label: "P", cutoff: 0.72 },
	},
	creator: {
		ratings: ["pas", "ftc", "oiq", "cmp"],
		weights: [1, 0.6, 0.8, 0.4],
		skill: { label: "C", cutoff: 0.68 },
	},
	dribbler: {
		ratings: ["drb", "ftc", "acc", "cmp"],
		weights: [1, 0.6, 0.5, 0.2],
		skill: { label: "Dr", cutoff: 0.7 },
	},
	crosser: {
		ratings: ["crs", "pas", "oiq", "cmp"],
		weights: [1, 0.45, 0.35, 0.2],
		skill: { label: "Cr", cutoff: 0.7 },
	},
	finisher: {
		ratings: ["fin", "oiq", "cmp", "ftc"],
		weights: [1, 0.6, 0.5, 0.25],
		skill: { label: "F", cutoff: 0.7 },
	},
	aerial: {
		ratings: ["hea", "hgt", "stre", "oiq"],
		weights: [1, 0.45, 0.35, 0.25],
		skill: { label: "A", cutoff: 0.68 },
	},
	defender: {
		ratings: ["tck", "diq", "stre", "spd", "hea"],
		weights: [1, 1, 0.35, 0.3, 0.35],
		skill: { label: "D", cutoff: 0.7 },
	},
	goalkeeping: {
		ratings: ["gkr", "gkh", "gkp", "cmp"],
		weights: [1, 0.8, 0.8, 0.2],
		skill: { label: "G", cutoff: 0.7 },
	},
	endurance: { ratings: [50, "endu"], weights: [1, 1] },
	scoring: {
		ratings: ["fin", "sht", "oiq", "cmp", "ftc"],
		weights: [1, 0.6, 0.7, 0.35, 0.3],
	},
};

export const PLAYER_GAME_STATS = {
	outfield: {
		name: "Outfield",
		stats: [
			"g",
			"a",
			"sh",
			"sot",
			"xg",
			"xa",
			"pas",
			"pasCmp",
			"tkl",
			"int",
			"yc",
			"rc",
			"min",
			"matchRating",
		],
		sortBy: ["min"],
	},
	possession: {
		name: "Possession & Progression",
		stats: [
			"drbAtt",
			"drbCmp",
			"prgP",
			"prgC",
			"crs",
			"crsCmp",
			"recov",
			"prsWon",
			"blk",
			"fouled",
			"min",
		],
		sortBy: ["min"],
	},
	goalkeeper: {
		name: "Goalkeeper",
		stats: [
			"ga",
			"sv",
			"svPct",
			"psxg",
			"goalsPrevented",
			"cs",
			"gkClaims",
			"pas",
			"pasCmp",
			"min",
			"matchRating",
		],
		sortBy: ["min"],
	},
};

export const PLAYER_SUMMARY = {
	summaryOutfield: {
		name: "Summary",
		onlyShowIf: ["CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"],
		stats: ["gp", "gs", "g", "a", "xg", "xa", "matchRating"],
	},
	summaryGoalkeeper: {
		name: "Goalkeeper",
		onlyShowIf: ["GK"],
		stats: ["gp", "gs", "ga", "svPct", "cs", "matchRating"],
	},
};

export const PLAYER_STATS_TABLES = {
	standard: {
		name: "Standard",
		stats: [
			"gp",
			"gs",
			"subIn",
			"subOut",
			"min",
			"g",
			"a",
			"penG",
			"penA",
			"penM",
			"sh",
			"sot",
			"xg",
			"xa",
			"yc",
			"rc",
			"matchRating",
		],
	},
	passing: {
		name: "Passing",
		stats: ["gp", "min", "pas", "pasCmp", "pasPct", "prgP", "kp", "xa"],
	},
	possession: {
		name: "Possession",
		stats: [
			"gp",
			"min",
			"drbAtt",
			"drbCmp",
			"drbPct",
			"prgC",
			"crs",
			"crsCmp",
			"crsPct",
			"recov",
			"possLost",
			"fouled",
			"penWon",
			"off",
		],
	},
	defending: {
		name: "Defending",
		stats: [
			"gp",
			"min",
			"tkl",
			"int",
			"clr",
			"blk",
			"prs",
			"prsWon",
			"prsPct",
			"aw",
			"aa",
			"aerialPct",
			"fl",
			"penCon",
		],
	},
	goalkeeping: {
		name: "Goalkeeping",
		onlyShowIf: ["sv", "ga"],
		stats: [
			"gp",
			"gs",
			"min",
			"ga",
			"sv",
			"svPct",
			"psxg",
			"goalsPrevented",
			"cs",
			"gkClaims",
			"matchRating",
		],
	},
	per90: {
		name: "Per 90 Minutes",
		stats: [
			"gp",
			"min",
			"g90",
			"a90",
			"xg90",
			"xa90",
			"drbCmp90",
			"prgP90",
			"prgC90",
			"tkl90",
			"int90",
			"recov90",
			"prsWon90",
		],
	},
	gameHighs: {
		name: "Game Highs",
		stats: [
			"gMax",
			"aMax",
			"shMax",
			"sotMax",
			"drbCmpMax",
			"prgCMax",
			"svMax",
			"matchRatingMax",
		],
	},
};

export const TEAM_STATS_TABLES = {
	team: {
		name: "Team",
		stats: [
			"g",
			"a",
			"sh",
			"sot",
			"xg",
			"posPct",
			"pas",
			"pasCmp",
			"pasPct",
			"cor",
			"fl",
			"yc",
			"rc",
			"gd",
		],
	},
	possession: {
		name: "Possession",
		stats: [
			"drbAtt",
			"drbCmp",
			"drbPct",
			"prgP",
			"prgC",
			"crs",
			"crsCmp",
			"crsPct",
			"recov",
			"possLost",
			"prs",
			"prsWon",
			"prsPct",
		],
	},
	defending: {
		name: "Defending & Pressing",
		stats: ["tkl", "int", "clr", "blk", "recov", "prs", "prsWon", "prsPct"],
	},
	discipline: {
		name: "Discipline & Set Pieces",
		stats: [
			"fl",
			"fouled",
			"yc",
			"rc",
			"off",
			"penG",
			"penA",
			"penM",
			"penWon",
			"penCon",
			"cor",
		],
	},
	goalkeeping: {
		name: "Goalkeeping",
		stats: ["sv", "psxg", "goalsPrevented", "gkClaims"],
	},
	opponent: {
		name: "Opponent",
		stats: [
			"oppG",
			"oppSh",
			"oppSot",
			"oppXg",
			"oppPosPct",
			"oppPas",
			"oppPasCmp",
			"oppCor",
			"oppFl",
			"oppYc",
			"oppRc",
		],
	},
};

export const POSITIONS: Position[] = [
	"GK",
	"CB",
	"LB",
	"RB",
	"DM",
	"CM",
	"AM",
	"LW",
	"RW",
	"ST",
];

export const POSITION_COUNTS: Record<Position, number> = {
	GK: 3,
	CB: 5,
	LB: 2,
	RB: 2,
	DM: 3,
	CM: 5,
	AM: 2,
	LW: 2,
	RW: 2,
	ST: 4,
};

export const RATINGS: RatingKey[] = [
	"hgt",
	"stre",
	"spd",
	"acc",
	"endu",
	"pas",
	"ftc",
	"drb",
	"crs",
	"fin",
	"sht",
	"hea",
	"tck",
	"oiq",
	"diq",
	"cmp",
	"gkr",
	"gkh",
	"gkp",
];

export const SIMPLE_AWARDS = [
	"mvp",
	"roy",
	"dpoy",
	"goy",
	"finalsMvp",
] as const;

export const AWARD_NAMES = {
	mvp: "Player of the Year",
	roy: "Young Player of the Year",
	dpoy: "Defender of the Year",
	goy: "Goalkeeper of the Year",
	finalsMvp: "Cup Most Valuable Player",
	allLeague: "Team of the Season",
	allRookie: "Young Team of the Season",
} as const;

export const DEFAULT_CONFS: NonEmptyArray<Conf> = [{ cid: 0, name: "League" }];

export const DEFAULT_DIVS: NonEmptyArray<Div> = [
	{ did: 0, cid: 0, name: "Premier League" },
];

export const FORMATIONS = {
	"4-3-3": ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "AM", "LW", "ST", "RW"],
	"4-2-3-1": ["GK", "LB", "CB", "CB", "RB", "DM", "DM", "LW", "AM", "RW", "ST"],
	"4-4-2": ["GK", "LB", "CB", "CB", "RB", "LW", "CM", "CM", "RW", "ST", "ST"],
	"3-5-2": ["GK", "CB", "CB", "CB", "LB", "CM", "DM", "CM", "RB", "ST", "ST"],
	"3-4-3": ["GK", "CB", "CB", "CB", "LB", "CM", "CM", "RB", "LW", "ST", "RW"],
} as const;
