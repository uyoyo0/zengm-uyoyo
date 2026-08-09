import type teamStats from "../worker/core/team/stats.soccer.ts";

export type Position =
	| "GK"
	| "CB"
	| "LB"
	| "RB"
	| "DM"
	| "CM"
	| "AM"
	| "LW"
	| "RW"
	| "ST";

export type RatingKey =
	| "hgt"
	| "stre"
	| "spd"
	| "acc"
	| "endu"
	| "pas"
	| "ftc"
	| "drb"
	| "crs"
	| "fin"
	| "sht"
	| "hea"
	| "tck"
	| "oiq"
	| "diq"
	| "cmp"
	| "gkr"
	| "gkh"
	| "gkp";

export type PlayerRatings = Record<RatingKey, number> & {
	fuzz: number;
	injuryIndex?: number;
	locked?: boolean;
	ovr: number;
	pot: number;
	ovrs: Record<Position, number>;
	pots: Record<Position, number>;
	pos: Position;
	season: number;
	skills: string[];
};

export type TeamStatAttr =
	| (typeof teamStats)["raw"][number]
	| "gd"
	| "posPct"
	| "pasPct"
	| "drbPct"
	| "crsPct"
	| "prsPct"
	| "goalsPrevented"
	| "shotPct"
	| "savePct";

export type AwardPlayer = {
	pid: number;
	name: string;
	tid: number;
	abbrev?: string;
	pos: Position;
	gp: number;
	g: number;
	a: number;
	xg: number;
	xa: number;
	cs: number;
	tkl: number;
	int: number;
	clr: number;
	sv: number;
	ga: number;
	svPct: number;
	matchRating: number;
};

export type Awards = {
	season: number;
	bestRecord: unknown;
	bestRecordConfs: unknown[];
	mvp?: AwardPlayer;
	roy?: AwardPlayer;
	dpoy?: AwardPlayer;
	goy?: AwardPlayer;
	finalsMvp?: AwardPlayer;
	allLeague: {
		title: string;
		players: AwardPlayer[];
	}[];
	allRookie: AwardPlayer[];
};
