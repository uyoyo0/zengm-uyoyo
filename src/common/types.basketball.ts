import type teamStats from "../worker/core/team/stats.basketball.ts";

// Should all the extra ones be in teamStats["derived"]?
export type TeamStatAttr =
	| (typeof teamStats)["raw"][number]
	| "fgp"
	| "oppFgp"
	| "fgpAtRim"
	| "oppFgpAtRim"
	| "fgpLowPost"
	| "oppFgpLowPost"
	| "fgpMidRange"
	| "oppFgpMidRange"
	| "tpp"
	| "oppTpp"
	| "ftp"
	| "oppFtp"
	| "mov"
	| "oppMov"
	| "pw"
	| "pl"
	| "ortg"
	| "drtg"
	| "nrtg"
	| "pace"
	| "poss"
	| "tpar"
	| "ftr"
	| "tsp"
	| "efg"
	| "tovp"
	| "orbp"
	| "ftpFga"
	| "trb"
	| "oppTrb"
	| "2p"
	| "2pa"
	| "2pp"
	| "opp2p"
	| "opp2pa"
	| "opp2pp"
	| "oppEfg"
	| "oppTovp"
	| "drbp"
	| "oppFtpFga"
	| "pip"
	| "oppPip";

type AwardTeam = {
	tid: number;
	abbrev: string;
	region: string;
	name: string;
	won: number;
	lost: number;
	tied: number | undefined;
	otl: number | undefined;
};

export type AwardCoach = {
	cid: number;
	tid: number;
	abbrev: string;
	region: string;
	name: string; // coach's full name
	won: number;
	lost: number;
	expectedWins?: number;
};

export type AwardPlayer = {
	pid: number;
	name: string;
	tid: number;
	pts: number;
	trb: number;
	ast: number;
};

export type AwardPlayerDefense = {
	pid: number;
	name: string;
	tid: number;
	trb: number;
	blk: number;
	stl: number;
};

export type AwardPlayerClutch = {
	pid: number;
	name: string;
	tid: number;
	clutchPts: number; // season total
	gp: number;
};

export type Awards<
	PlayerOverride = AwardPlayer,
	PlayerDefenseOverride = AwardPlayerDefense,
> = {
	season: number;
	bestRecord: AwardTeam;

	// undefined gets turned into null by JSON.stringify
	bestRecordConfs: (AwardTeam | undefined | null)[];

	// Only in old leagues
	bre?: AwardTeam;
	brw?: AwardTeam;

	roy: PlayerOverride | undefined;
	allRookie: PlayerOverride[];
	mip: PlayerOverride | undefined;
	mvp: PlayerOverride | undefined;
	smoy: PlayerOverride | undefined;
	allLeague: [
		{
			title: "First Team";
			players: PlayerOverride[];
		},
		{
			title: "Second Team";
			players: PlayerOverride[];
		},
		{
			title: "Third Team";
			players: PlayerOverride[];
		},
	];
	dpoy: PlayerDefenseOverride | undefined;
	allDefensive: [
		{
			title: "First Team";
			players: PlayerDefenseOverride[];
		},
		{
			title: "Second Team";
			players: PlayerDefenseOverride[];
		},
		{
			title: "Third Team";
			players: PlayerDefenseOverride[];
		},
	];
	finalsMvp: PlayerOverride | undefined;
	sfmvp: PlayerOverride[] | undefined;
	coachOfTheYear?: AwardCoach;
	clutchPoy?: AwardPlayerClutch | undefined;
};

export type PlayerRatings = {
	diq: number;
	dnk: number;
	drb: number;
	endu: number;
	fg: number;
	ft: number;
	fuzz: number;
	hgt: number;
	injuryIndex?: number;
	ins: number;
	jmp: number;
	locked?: boolean;
	oiq: number;
	ovr: number;
	pos: string;
	pot: number;
	pss: number;
	reb: number;
	season: number;
	spd: number;
	skills: string[];
	stre: number;
	tp: number;

	// Behavioral tendencies (0-100, 50 = neutral). Bias how a player plays,
	// independent of skill. Excluded from ovr/pot. Optional for old leagues.
	tendencyUsage?: number; // looks for own shot
	tendencyThree?: number; // chooses 3s over 2s
	tendencyAtRim?: number; // attacks the rim
	tendencyPost?: number; // posts up
	tendencyPass?: number; // pass-first / playmaking
	tendencyClutch?: number; // performs in late-game clutch situations
	// True when the shot-mix tendencies were derived from real career stats and
	// encode absolute shot shares; the sim then skips era scaling
	// (threePointTendencyFactor) for this player.
	tendencyAbsolute?: boolean;

	// Fan popularity (0-100). Mostly emergent: performance, style, awards,
	// clutch play, tenure, draft pedigree. Updated each preseason from last
	// season (updatePopularity); drives All-Star fan voting and star-power
	// revenue. Excluded from ovr/pot and from fuzz (it's public sentiment).
	popularity?: number;
	// Innate charisma seed (0-100, 50 = neutral, hidden): how magnetic a
	// player is independent of performance. Constant for a player's career.
	charisma?: number;
};

export type TendencyKey =
	| "tendencyUsage"
	| "tendencyThree"
	| "tendencyAtRim"
	| "tendencyPost"
	| "tendencyPass"
	| "tendencyClutch";

export type RatingKey =
	| "diq"
	| "dnk"
	| "drb"
	| "endu"
	| "fg"
	| "ft"
	| "hgt"
	| "ins"
	| "jmp"
	| "oiq"
	| "pss"
	| "reb"
	| "spd"
	| "stre"
	| "tp";

// Box-score totals accumulated for a single 5-man lineup (the set of players on
// the floor together). Analogous to the per-player on/off tracking, but keyed on
// the whole unit. min/poss/oppPoss are credited per possession; the rest are the
// box stats recorded while that unit is on the floor. See GameSim.recordStat.
export type LineupStat = {
	min: number;
	poss: number; // offensive possessions for this unit
	oppPoss: number; // defensive possessions for this unit
	pts: number;
	oppPts: number;
	fg: number;
	fga: number;
	tp: number;
	tpa: number;
	ft: number;
	fta: number;
	orb: number;
	drb: number;
	tov: number;
	ast: number;
	stl: number;
	blk: number;
	pf: number;
};

// Which recordStat stat names accumulate onto the on-court lineup. min/poss are
// handled separately (per possession, not per recorded event).
export type LineupStatKey =
	| "pts"
	| "fg"
	| "fga"
	| "tp"
	| "tpa"
	| "ft"
	| "fta"
	| "orb"
	| "drb"
	| "tov"
	| "ast"
	| "stl"
	| "blk"
	| "pf";
