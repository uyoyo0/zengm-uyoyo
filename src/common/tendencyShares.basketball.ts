// Mapping between shot-mix tendencies (0-100, 50 = neutral) and the shot shares
// they encode. Each tendency is a linear rescaling of a share around a
// league-typical pivot: tendency = 50 + (share - pivot) * slope.
//
// deriveTendencies (worker/core/realRosters) uses the forward direction to turn
// a real player's career shot mix into tendencies; GameSim inverts it to turn a
// tendency back into a target share when picking shots. Keeping both directions
// here guarantees they stay exact inverses, which is what makes a real player's
// simulated shot mix match his actual career mix.
//
// Pivots are modern-league-typical values (a tendency of 50 = "shoots like a
// league-average modern player"), so shares derived from real stats are
// absolute, not era-relative.

type ShareMapping = {
	pivot: number;
	slope: number;
};

export const TENDENCY_SHARE = {
	// 3PA share of all FGA. ~35% is a league-typical modern share; it takes a
	// ~63%+ share (true volume-shooting outlier) to approach 100.
	three: { pivot: 0.35, slope: 130 },
	// At-rim share of 2P attempts.
	atRim: { pivot: 0.4, slope: 110 },
	// Low-post share of 2P attempts (mid-range is the remainder).
	post: { pivot: 0.1, slope: 150 },
	// Usage: share of team possessions used while on court (usg% as a
	// fraction). 20% is league average by construction; ~34% is an MVP-level
	// ball-dominant scorer, and the all-time record seasons are ~38-41%.
	usage: { pivot: 0.2, slope: 180 },
	// Pass-first: assist ratio - the share of a player's used possessions
	// (FGA + 0.44*FTA + AST + TOV) that end in an assist rather than his own
	// shot. ~17% is league-typical; a pure point guard runs ~35-45%, and a
	// 100 tendency decodes to ~41% (all-time distributor seasons).
	pass: { pivot: 0.17, slope: 210 },
} satisfies Record<string, ShareMapping>;

export const tendencyFromShare = (share: number, mapping: ShareMapping) =>
	50 + (share - mapping.pivot) * mapping.slope;

export const shareFromTendency = (
	tendency: number,
	mapping: ShareMapping,
	minShare = 0.02,
) => Math.max(minShare, mapping.pivot + (tendency - 50) / mapping.slope);
