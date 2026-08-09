// Per-zone shot accuracy model shared by the sim and real-player tendency
// derivation. GameSim computes probMake = mult * compositeRating + base for
// each shot zone; deriveTendencies inverts the same model to estimate what
// rim/mid shot mix reproduces a real player's career 2P%, and to compute
// per-player accuracy corrections (real career zone FG% minus what the model
// predicts). Keeping both directions on these constants guarantees they stay
// in sync, like tendencyShares.basketball.ts does for shot shares.
//
// realizedOffset is the measured average gap between raw probMake and the
// realized FG% the sim produces in that zone (team defense, fatigue, blocks,
// rushed shots; smaller at the rim because fouled misses don't count as FGA).
// Measured with the effects-test harness; re-measure if the probMake pipeline
// changes.

export const ZONE_ACCURACY = {
	atRim: { mult: 0.41, base: 0.57, realizedOffset: 0.11 },
	lowPost: { mult: 0.32, base: 0.37, realizedOffset: 0.09 },
	midRange: { mult: 0.32, base: 0.42, realizedOffset: 0.13 },
	threePointer: { mult: 0.3, base: 0.36, realizedOffset: 0.155 },
} as const;

// Free throws: probMake = mult * shootingFT composite + base (no defense, so
// realized = raw).
export const FT_ACCURACY = { mult: 0.6, base: 0.45 } as const;

// Per-player accuracy corrections (real players only): bounded delta added to
// probMake so a player's simulated percentages track his real career ones
// even where the linear ratings model misses him (a Jokic outshoots his
// ratings; other players' ratings flatter them). Shrunk toward 0 for small
// samples and clamped so a correction can never dominate the ratings model.
export const ACC_SHRINK_ATT = 250; // shrink factor = att / (att + this)
export const ACC_MAX = 0.12;
