// Flavor text for player-vs-system and roster-vs-system style mismatches.
// Message pools are keyed by (dial, direction); a deterministic hash picks the
// variant so text is stable across renders but varies across players, teams,
// and seasons.

type Direction = 1 | -1;

// playerWants: +1 = the player wants more of this dial than the system gives.
const PLAYER_MISMATCH: Record<string, Record<Direction, string[]>> = {
	threePointTendency: {
		1: [
			"Wants to let it fly from deep, but this offense keeps hunting twos",
			"His shooting gravity is wasted in a paint-first scheme",
			"Built to bomb away, stuck watching post-ups",
			"A shooter marooned in a midrange world",
		],
		[-1]: [
			"Keeps getting run off the three-point line he never wanted to shoot from",
			"A downhill player asked to space the floor and wait",
			"This system wants threes he doesn't have in his bag",
		],
	},
	pace: {
		1: [
			"Wants to run, but the coach walks it up every possession",
			"An open-court blur wasted in a halfcourt grind",
			"His legs are built for a track meet this system never enters",
		],
		[-1]: [
			"A halfcourt operator stuck in a track meet",
			"The tempo runs him ragged - he'd rather play chess than sprints",
			"Built for methodical sets, dragged into transition chaos",
		],
	},
	crashOffensiveGlass: {
		1: [
			"Lives for putbacks, but the team retreats the moment a shot goes up",
			"His offensive rebounding is switched off by design",
			"Wants to crash the glass; the scheme says get back",
		],
		[-1]: [
			"Asked to bang for boards when his game is leaking out",
			"The glass-crashing assignment doesn't suit his style",
			"Spends possessions wrestling inside where he adds the least",
		],
	},
	paintDefense: {
		1: [
			"A rim protector dragged out to the perimeter",
			"Wants to anchor the paint, but the scheme has him chasing shooters",
			"His shot-blocking never matters this far from the rim",
		],
		[-1]: [
			"A perimeter hound stuck packed in the paint",
			"Quick feet wasted standing under the rim",
			"Wants to pressure the arc; the scheme concedes it",
		],
	},
	defensiveAggression: {
		1: [
			"His gambling instincts are shackled by a conservative scheme",
			"Wants to jump passing lanes, told to stay home",
			"A havoc creator asked to play it safe",
		],
		[-1]: [
			"The pressing scheme leaves him on an island he can't hold",
			"All that gambling behind him leads to fouls and blow-bys",
			"Prefers sound positioning; this defense wants chaos",
		],
	},
};

const PLAYER_GOOD_FIT = [
	"A perfect engine for this system",
	"The scheme amplifies everything he does well",
	"Plays exactly the way this coach wants to play",
	"System and player in complete harmony",
];

// Direction is what the roster wants relative to the system.
const TEAM_MISMATCH: Record<string, Record<Direction, string[]>> = {
	threePointTendency: {
		1: [
			"A roster full of shooters playing a paint-first system",
			"All this shooting talent, and the scheme hunts twos",
		],
		[-1]: [
			"The system demands threes this roster can't make",
			"Bombs away by design, bricks by personnel",
		],
	},
	pace: {
		1: [
			"The roster is built to run, but this system walks it up",
			"Athletes everywhere, handbrake on",
		],
		[-1]: [
			"A halfcourt roster being asked to sprint",
			"The tempo is writing checks these legs can't cash",
		],
	},
	crashOffensiveGlass: {
		1: [
			"Big bodies who could own the glass are told to retreat",
			"All this size, and nobody's crashing the boards",
		],
		[-1]: [
			"Crashing the glass with a roster built to leak out",
			"The scheme hunts putbacks the personnel can't get",
		],
	},
	paintDefense: {
		1: [
			"Interior defenders stretched out to the perimeter",
			"The paint is begging to be packed by this frontline",
		],
		[-1]: [
			"Perimeter defenders packed uselessly in the paint",
			"Packing the paint with a roster built to pressure the arc",
		],
	},
	defensiveAggression: {
		1: [
			"A ball-hawking roster stuck playing passive defense",
			"All these instincts, no license to gamble",
		],
		[-1]: [
			"An aggressive scheme this roster can't cover for",
			"Gambling on defense without the speed to recover",
		],
	},
};

const TEAM_GOOD_FIT = [
	"Coach and roster pulling in the same direction",
	"The system fits this roster like a glove",
	"Scheme and personnel in lockstep",
];

// Deterministic variant pick: stable for a given seed, varied across seeds.
const pick = (pool: string[], seed: number) => {
	const index = Math.abs(Math.trunc(seed * 2654435761)) % pool.length;
	return pool[index]!;
};

export const playerFitMessage = (
	fitDetails: { dial: string; playerWants: 1 | -1 }[] | undefined,
	seed: number,
): string | undefined => {
	const top = fitDetails?.[0];
	if (!top) {
		return undefined;
	}
	const pool = PLAYER_MISMATCH[top.dial]?.[top.playerWants];
	return pool ? pick(pool, seed) : undefined;
};

export const playerGoodFitMessage = (seed: number) =>
	pick(PLAYER_GOOD_FIT, seed);

export const teamFitMessage = (
	topMismatches: { dial: string; playerWants: 1 | -1 }[],
	seed: number,
): string => {
	const top = topMismatches[0];
	if (!top) {
		return pick(TEAM_GOOD_FIT, seed);
	}
	const pool = TEAM_MISMATCH[top.dial]?.[top.playerWants];
	return pool ? pick(pool, seed) : pick(TEAM_GOOD_FIT, seed);
};
