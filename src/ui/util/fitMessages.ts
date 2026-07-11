// Scouting-report flavor text for player-vs-system and roster-vs-system
// chemistry. Message pools are keyed by dial mismatch, role need, or team
// shortage/surplus; a deterministic hash picks the variant so text is stable
// across renders but varies across players, teams, and seasons.

import type { RoleNeed } from "../../common/roleNeeds.basketball.ts";

type Direction = 1 | -1;

// playerWants: +1 = the player wants more of this dial than the system gives.
const PLAYER_MISMATCH: Record<string, Record<Direction, string[]>> = {
	threePointTendency: {
		1: [
			"His perimeter shooting is underutilized in an offense that hunts twos",
			"A three-point threat asked to operate inside the arc",
			"The scheme rarely creates the outside looks his game is built on",
			"His shooting gravity goes largely unused in this offense",
			"An offense this interior-focused leaves his range on the table",
		],
		[-1]: [
			"Asked to space the floor without the shooting profile to hold it",
			"The system demands perimeter volume his game doesn't provide",
			"Miscast as a floor-spacer in a shooting-heavy attack",
			"His interior game has little room to operate in a five-out offense",
			"The three-point volume this scheme requires isn't in his repertoire",
		],
	},
	pace: {
		1: [
			"An open-floor athlete slowed by a deliberate halfcourt system",
			"His transition game is wasted at this tempo",
			"Built to run, asked to walk it up",
			"The methodical pace mutes his best quality: speed",
			"A tempo pusher in an offense that grinds out possessions",
		],
		[-1]: [
			"His methodical halfcourt game is poorly served by the tempo this staff demands",
			"The pace runs him out of his comfort zone - and his legs",
			"A halfcourt operator asked to play in constant transition",
			"This tempo exposes his conditioning rather than his skill",
			"Better suited to a set offense than a track meet",
		],
	},
	crashOffensiveGlass: {
		1: [
			"An offensive rebounder in a scheme that retreats on every shot",
			"His second-chance instincts are designed out of this offense",
			"The early-retreat scheme wastes his work on the glass",
			"Told to get back when his value is on the offensive boards",
		],
		[-1]: [
			"Asked to battle inside for boards when his game leaks out early",
			"The crash-the-glass assignment doesn't match his profile",
			"Glass-crashing duty costs him the transition chances he thrives on",
			"Spending possessions in traffic where he contributes least",
		],
	},
	paintDefense: {
		1: [
			"An interior anchor stretched out to the perimeter",
			"His rim protection is marginalized by the perimeter-first scheme",
			"Asked to chase shooters when his value is at the rim",
			"The scheme pulls him away from the paint he's built to control",
		],
		[-1]: [
			"A perimeter defender stationed in the paint",
			"His foot speed is wasted packed inside",
			"The pack-the-paint scheme buries his perimeter instincts",
			"Built to pressure the arc, assigned to protect the rim",
		],
	},
	defensiveAggression: {
		1: [
			"His playmaking instincts on defense are restrained by a conservative scheme",
			"A havoc creator asked to stay home and contain",
			"The passive scheme leaves his hands and anticipation idle",
			"Wants to gamble for turnovers; the system prioritizes position",
		],
		[-1]: [
			"The pressure scheme leaves him on islands he struggles to hold",
			"An aggressive system that exposes his conservative instincts",
			"Gambling assignments lead to fouls and rotations he can't make",
			"Better in a sound positional scheme than this pressure defense",
		],
	},
};

const PLAYER_ROLE_FIT: Record<RoleNeed, string[]> = {
	spacing: [
		"Exactly the floor-spacing threat this offense is built to feature",
		"His shooting is the engine this system runs on",
		"A primary beneficiary of the perimeter looks this scheme generates",
		"The catch-and-shoot profile this offense rewards most",
	],
	rimGravity: [
		"The screen-and-dive presence who makes all this spacing pay off",
		"His rim pressure punishes defenses stretched thin by the shooters",
		"A vertical threat this offense needs to keep defenses honest",
		"The interior finisher who converts the openings this system creates",
	],
	rimProtection: [
		"The backline anchor this pressure scheme is built around",
		"His rim protection underwrites every gamble the perimeter takes",
		"The eraser who makes this defensive scheme viable",
		"Interior insurance for an aggressive system that needs it",
	],
	ballPressure: [
		"The point-of-attack defender this scheme asks the most of",
		"His on-ball pressure sets the table for the entire defense",
		"Exactly the perimeter disruptor this system deploys best",
		"The kind of ball hawk this scheme turns into transition offense",
	],
	rebounding: [
		"The board presence this crash-heavy scheme depends on",
		"His rebounding turns this system's aggression into extra possessions",
		"A glass specialist in a scheme that values every board",
	],
	playmaking: [
		"The table-setter this offense runs through",
		"His passing unlocks everything this system wants to create",
		"The connective playmaker this scheme requires",
	],
	transition: [
		"A perfect fit for the tempo this staff pushes",
		"His motor turns this system's pace into easy offense",
		"The open-floor athlete this running game is designed for",
	],
};

const PLAYER_GOOD_FIT = [
	"A natural fit for how this staff wants to play",
	"System and skill set in clear alignment",
	"Plays the style this scheme is designed around",
	"His game translates cleanly to this system",
	"Well cast in this role",
	"The scheme asks for exactly what he does well",
];

const TEAM_SHORTAGE: Record<RoleNeed, string[]> = {
	spacing: [
		"A perimeter-oriented scheme without the shooting to sustain it",
		"The system demands three-point volume this roster can't supply",
		"Spacing-dependent offense, shooting-poor personnel",
		"This offense needs shooters the rotation doesn't have",
		"The scheme generates open threes; the roster can't make them",
	],
	rimGravity: [
		"Elite spacing without an interior presence to collapse the defense",
		"All perimeter, no paint - defenses can chase shooters without consequence",
		"The offense lacks a dive man to punish the space it creates",
		"No screen-and-roll finisher to anchor the perimeter attack",
		"Five-out looks with nobody to make defenses pay inside",
	],
	rimProtection: [
		"An aggressive scheme with no rim protection behind it",
		"The defense gambles up front with nothing to erase mistakes at the rim",
		"Perimeter pressure without a backline anchor is a layup line",
		"This scheme requires an eraser the roster doesn't employ",
		"High-risk defense, no interior insurance",
	],
	ballPressure: [
		"A pressure scheme without the perimeter athletes to execute it",
		"The defense asks for ball pressure this personnel can't apply",
		"Aggressive intentions, insufficient foot speed on the perimeter",
		"The scheme's first line of defense is its weakest link",
	],
	rebounding: [
		"A crash-the-glass identity without the bodies to back it up",
		"The scheme hunts second chances the roster can't secure",
		"Offensive rebounding by design, defensive rebounding by hope",
		"This system's glass-first approach outstrips its personnel",
	],
	playmaking: [
		"Quality finishers with no one to create for them",
		"The offense lacks a primary organizer to run its sets",
		"Plenty of scorers, not enough passing to connect them",
		"This system needs a table-setter the rotation doesn't have",
	],
	transition: [
		"An up-tempo system without the legs to sustain it",
		"The pace this staff wants exceeds what the roster can run",
		"A running game on paper, a walking game in practice",
	],
};

const TEAM_SURPLUS: Record<"spacing" | "creation", string[]> = {
	spacing: [
		"Shooting everywhere, but someone has to screen and finish inside",
		"An overload of shooters competing for the same looks",
		"More spacing than one basketball can reward",
		"The roster's shooting is redundant where it needs balance",
	],
	creation: [
		"Three primary options and one basketball",
		"Too many possessions promised to too many primary scorers",
		"A hierarchy problem: multiple No. 1 options, no clear pecking order",
		"High-usage players stacked where the offense needs connectors",
	],
};

const TEAM_GOOD_A = [
	"A roster constructed precisely for this system",
	"Personnel and scheme in complete alignment",
	"Every role this system demands is accounted for",
	"The rare roster that fits its coach like a glove",
	"Scheme, talent, and roles all pulling in the same direction",
];

const TEAM_GOOD_B = [
	"Personnel and scheme largely aligned, with minor gaps",
	"A sound fit between roster and system, if not a perfect one",
	"The core roles are covered; the margins could be cleaner",
	"This roster executes the system with only small compromises",
	"Coach and personnel mostly speaking the same language",
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

export const playerRoleFitMessage = (
	fitRole: { need: RoleNeed } | undefined,
	seed: number,
): string | undefined => {
	if (!fitRole) {
		return undefined;
	}
	const pool = PLAYER_ROLE_FIT[fitRole.need];
	return pool ? pick(pool, seed) : undefined;
};

export const teamFitMessage = (
	chem: {
		cohesion: number;
		shortages: { need: RoleNeed; severity: number }[];
		surpluses: { kind: "spacing" | "creation"; severity: number }[];
	},
	seed: number,
): string => {
	const shortage = chem.shortages[0];
	if (shortage) {
		const pool = TEAM_SHORTAGE[shortage.need];
		if (pool) {
			return pick(pool, seed);
		}
	}
	const surplus = chem.surpluses[0];
	if (surplus) {
		const pool = TEAM_SURPLUS[surplus.kind];
		if (pool) {
			return pick(pool, seed);
		}
	}
	// No structural issues: tiered positive by grade.
	return pick(chem.cohesion >= 0.9 ? TEAM_GOOD_A : TEAM_GOOD_B, seed);
};

// Short labels for role needs, for coverage bars and player table chips.
export const ROLE_NEED_LABELS: Record<RoleNeed, string> = {
	spacing: "Spacing",
	rimGravity: "Rim gravity",
	rimProtection: "Rim protection",
	ballPressure: "Ball pressure",
	rebounding: "Rebounding",
	playmaking: "Playmaking",
	transition: "Transition",
};
