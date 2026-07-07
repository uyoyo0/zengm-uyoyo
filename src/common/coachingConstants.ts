import { helpers } from "./helpers.ts";
import { isSport } from "./sportFunctions.ts";
import { DEFAULT_LEVEL } from "./budgetLevels.ts";

// Coaching style dials are signed levels in [-1, 1] (0 = neutral). These
// constants translate a level into a multiplier/delta applied in the sim, and
// are the single source of truth for both GameSim and the UI's projected-impact
// text (Roster > CoachingSettings). Tuning happens here and nowhere else.
export const COACHING = {
	THREE_PT_TENDENCY: 0.4, // max +/-40% to 3PT tendency
	PACE: 0.12, // max +/-12% to pace
	PACE_FATIGUE: 0.15, // faster tempo is more tiring per minute
	CRASH_GLASS: 0.25, // max +/-25% to orbFactor
	TRANSITION_BONUS: 0.18, // crashing concedes easier transition shots
	PAINT_PUSH_3S: 0.2, // packing the paint nudges opponents toward 3s
	PAINT_INTERIOR_DELTA: 0.04, // probMake delta on interior shots vs paint D
	PAINT_THREE_DELTA: 0.04, // probMake delta on 3s vs paint D
	AGGRESSION_TOV: 0.2, // steals/blocks/turnovers forced
	AGGRESSION_FOUL: 0.6, // tradeoff: more fouls when gambling

	// Lineup fit (coach-managed): per-player sub-value nudge for spacing /
	// avoiding redundant ball-dominant players, scaled by coach tactics.
	LINEUP_SPACE_W: 0.02,
	LINEUP_BALLDOM_W: 0.015,
	LINEUP_FIT_MIN: 0.9,
	LINEUP_FIT_MAX: 1.1,

	// Maximum weight (at tactics = 100) given to re-optimizing the style for
	// the players actually available tonight.
	AVAILABILITY_MAX: 0.4,
	// Maximum per-matchup dial tweak (at tactics = 100) vs the opponent profile.
	MATCHUP_MAX: 0.5,

	// Coach motivation (0-100, 50 = neutral) scales how fast benched players
	// recover energy: motivated teams stay fresh late in games.
	MOTIVATION_RECOVERY: 0.3,
} as const;

// How much a coach's development rating (0-100, 50 = league average) scales a
// player's annual rating change. Linear and centered at 50, unlike the legacy
// budget-level tanh mapping (neutral at 34), which silently boosted development
// for average coaches.
export const COACH_DEV_EFFECT_MAX = 0.25; // dev 0 => -25%, dev 100 => +25%

export const coachDevEffect = (devRating: number) =>
	(COACH_DEV_EFFECT_MAX * (helpers.bound(devRating, 0, 100) - 50)) / 50;

// The "no information" coaching input for player development: basketball
// passes a coach's development rating (neutral 50); other sports still use
// budget levels (neutral DEFAULT_LEVEL).
export const getNeutralCoachingLevel = () =>
	isSport("basketball") ? 50 : DEFAULT_LEVEL;

// Player-vs-system fit (philosophyFit output, 0..1) mapped to a signed effect.
// philosophyFit clusters high (dials are coarse, in [-1, 1]): typical values
// run ~0.7-0.9, so the effect is centered on the C-grade midpoint of the
// Coaches page letter scale rather than 0.5. Tune FIT_NEUTRAL/FIT_HALF_RANGE
// against the distribution guard in coach/style.test.ts.
export const FIT_NEUTRAL = 0.78;
export const FIT_HALF_RANGE = 0.16; // FIT_NEUTRAL ± this maps to ±1

export const fitEffect = (fit01: number) =>
	helpers.bound((fit01 - FIT_NEUTRAL) / FIT_HALF_RANGE, -1, 1);

// Mood component = FIT_MOOD_SCALE * fitEffect -> [-2, 2], like marketSize.
export const FIT_MOOD_SCALE = 2;

// Max shift of the effective coaching (development) level from system fit:
// ±10 rating points = ±5% development via coachDevEffect.
export const FIT_DEV_SHIFT = 10;

export const fitAdjustedCoachingLevel = (level: number, fit01: number) =>
	helpers.bound(level + FIT_DEV_SHIFT * fitEffect(fit01), 0, 100);
