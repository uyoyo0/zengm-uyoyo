import { helpers } from "./helpers.ts";
import type { TeamCoaching } from "./types.ts";

// Role-demand model for player-coach chemistry. A coaching system doesn't
// want five copies of its identity - it demands COMPLEMENTARY roles: a
// three-heavy offense wants shooters plus a screener/rim-runner to punish the
// spaced floor; a gambling perimeter defense wants a rim protector erasing
// mistakes behind it. Systems map to a demand profile over role needs (in
// on-floor slots), players supply capabilities toward those needs, and team
// cohesion is coverage of demand.

export type RoleNeed =
	| "spacing"
	| "rimGravity"
	| "rimProtection"
	| "ballPressure"
	| "rebounding"
	| "playmaking"
	| "transition";

export const ROLE_NEEDS: RoleNeed[] = [
	"spacing",
	"rimGravity",
	"rimProtection",
	"ballPressure",
	"rebounding",
	"playmaking",
	"transition",
];

const ramp = (x: number, lo: number, hi: number) =>
	helpers.bound((x - lo) / (hi - lo), 0, 1);

type AnyRatings = { [key: string]: unknown };

const r = (ratings: AnyRatings, key: string) =>
	typeof ratings[key] === "number" ? (ratings[key] as number) : 50;

// How much a player supplies of each role need, 0..1. Thresholds are chosen
// to be consistent with getRole.basketball.ts archetype boundaries and the
// GameSim isSpacer predicate.
export const roleCapabilities = (
	ratings: AnyRatings,
): Record<RoleNeed, number> => {
	const tp = r(ratings, "tp");
	const t3 = r(ratings, "tendencyThree");

	return {
		spacing: ramp(tp, 40, 70) * ramp(t3, 30, 60),
		rimGravity:
			ramp(0.6 * r(ratings, "dnk") + 0.4 * r(ratings, "ins"), 50, 75) *
			ramp(r(ratings, "hgt"), 50, 68) *
			(1 - 0.5 * ramp(t3, 45, 75)),
		rimProtection:
			ramp(r(ratings, "hgt"), 52, 70) *
			ramp(0.6 * r(ratings, "diq") + 0.4 * r(ratings, "jmp"), 45, 68),
		ballPressure: ramp(
			0.55 * r(ratings, "spd") + 0.45 * r(ratings, "diq"),
			50,
			72,
		),
		rebounding: ramp(
			0.6 * r(ratings, "reb") +
				0.25 * r(ratings, "hgt") +
				0.15 * r(ratings, "stre"),
			50,
			72,
		),
		playmaking:
			ramp(0.7 * r(ratings, "pss") + 0.3 * r(ratings, "drb"), 45, 70) *
			ramp(r(ratings, "tendencyPass"), 30, 60),
		transition: ramp(
			0.6 * r(ratings, "spd") + 0.4 * r(ratings, "endu"),
			48,
			70,
		),
	};
};

// Ball-dominance, used only for surplus detection ("three primary options,
// one basketball") - not a coverage need.
export const creationCapability = (ratings: AnyRatings) =>
	ramp(r(ratings, "tendencyUsage"), 55, 75);

// What the system demands of each need, in on-floor slots (players out of 5).
// A neutral coach demands the baseline column; every demand scales with |dial|.
export const systemRoleDemands = (
	coaching: TeamCoaching,
): Record<RoleNeed, number> => {
	const pos = (x: number) => Math.max(0, x);
	const d3 = coaching.threePointTendency;
	const pc = coaching.pace;
	const cr = coaching.crashOffensiveGlass;
	const pd = coaching.paintDefense; // + = pack the paint, - = guard the arc
	const ag = coaching.defensiveAggression;

	return {
		spacing: Math.max(0.5, 1.5 + 2.0 * pos(d3) - 0.75 * pos(-d3) + 0.3 * pos(pc)),
		// The complement: heavy spacing wants a screener/rim-runner to punish it;
		// paint-first systems want even more interior presence.
		rimGravity: 0.7 + 0.5 * pos(d3) + 0.8 * pos(-d3) + 0.3 * pos(cr),
		// Pack-paint schemes are built on rim protection; perimeter/aggressive
		// schemes need the backline eraser behind the gambles.
		rimProtection: 1.0 + 1.0 * pos(pd) + 0.4 * pos(-pd) + 0.4 * pos(ag),
		ballPressure: Math.max(
			0.4,
			1.0 + 1.2 * pos(-pd) + 0.8 * pos(ag) - 0.3 * pos(pd),
		),
		rebounding: 1.0 + 1.2 * pos(cr) + 0.3 * pos(pd),
		playmaking: 1.5 + 0.5 * pos(pc) + 0.3 * pos(d3),
		transition: 0.5 + 1.5 * pos(pc),
	};
};

// "Does this system have a job for me": the player's best supplied need,
// weighted by how much the system wants it. Context-free (teammate saturation
// lives at the team level, in teamRoleCoverage).
export const playerRoleScore = (
	ratings: AnyRatings,
	coaching: TeamCoaching,
): { need: RoleNeed; score: number } => {
	const caps = roleCapabilities(ratings);
	const demands = systemRoleDemands(coaching);

	let best: RoleNeed = "spacing";
	let bestScore = 0;
	for (const need of ROLE_NEEDS) {
		const relevance = Math.min(1, demands[need] / 1.5);
		const score = relevance * caps[need];
		if (score > bestScore) {
			bestScore = score;
			best = need;
		}
	}

	return { need: best, score: bestScore };
};

// Diminishing weights for the top-9 rotation, best players first.
export const ROTATION_WEIGHTS = [1, 1, 1, 1, 1, 0.8, 0.65, 0.5, 0.4];

export type TeamRoleCoverage = {
	coverageMean: number;
	needs: {
		need: RoleNeed;
		demand: number;
		supply: number;
		coverage: number;
	}[];
	shortages: { need: RoleNeed; severity: number }[];
	surpluses: { kind: "spacing" | "creation"; severity: number }[];
};

// Coverage of the system's role demands by a rotation (players sorted best
// first; weights applied positionally). Supply is on the same on-floor-slots
// scale as demand.
export const teamRoleCoverage = (
	rotation: { ratings: AnyRatings }[],
	coaching: TeamCoaching,
): TeamRoleCoverage => {
	const demands = systemRoleDemands(coaching);
	const players = rotation.slice(0, ROTATION_WEIGHTS.length);
	const weights = ROTATION_WEIGHTS.slice(0, players.length);
	const weightSum = weights.reduce((a, b) => a + b, 0);

	const capsList = players.map((p) => roleCapabilities(p.ratings));

	const needs = ROLE_NEEDS.map((need) => {
		let supplySum = 0;
		for (const [i, caps] of capsList.entries()) {
			supplySum += weights[i]! * caps[need];
		}
		const supply = weightSum > 0 ? (5 * supplySum) / weightSum : 0;
		const demand = demands[need];
		return {
			need,
			demand,
			supply,
			coverage: demand > 0 ? Math.min(1, supply / demand) : 1,
		};
	});

	const demandTotal = needs.reduce((sum, row) => sum + row.demand, 0);
	const coverageMean =
		demandTotal > 0
			? needs.reduce((sum, row) => sum + row.demand * row.coverage, 0) /
				demandTotal
			: 1;

	const shortages = needs
		.filter((row) => row.demand >= 0.8 && row.coverage <= 0.65)
		.map((row) => ({
			need: row.need,
			severity: row.demand * (1 - row.coverage),
		}))
		.filter((row) => row.severity >= 0.35)
		.sort((a, b) => b.severity - a.severity)
		.slice(0, 2);

	const surpluses: TeamRoleCoverage["surpluses"] = [];
	const spacingRow = needs.find((row) => row.need === "spacing")!;
	if (spacingRow.supply >= 4.5) {
		surpluses.push({
			kind: "spacing",
			severity: spacingRow.supply - 4.5,
		});
	}
	const creationTop5 = players
		.slice(0, 5)
		.reduce((sum, p) => sum + creationCapability(p.ratings), 0);
	if (creationTop5 > 2.2) {
		surpluses.push({ kind: "creation", severity: creationTop5 - 2.2 });
	}
	surpluses.sort((a, b) => b.severity - a.severity);

	return { coverageMean, needs, shortages, surpluses };
};

// Tendency-driven identity conflicts: the cases where a player's own game
// actively fights the system (not merely fails to serve it). Used to gate the
// misfit minutes reduction - a low-skill player is not a "misfit", he's just
// bad. severity is 0..1.
export const identityConflict = (
	ratings: AnyRatings,
	coaching: TeamCoaching,
): number => {
	const t3 = r(ratings, "tendencyThree");
	const tPost = r(ratings, "tendencyPost");
	const d3 = coaching.threePointTendency;

	let severity = 0;

	// Committed chucker in a paint-first system.
	if (t3 >= 70 && d3 <= -0.5) {
		severity = Math.max(severity, ramp(t3, 70, 95) * ramp(-d3, 0.5, 1));
	}
	// Never-shoots player in a five-out system.
	if (t3 <= 30 && d3 >= 0.5) {
		severity = Math.max(severity, ramp(30 - t3, 0, 25) * ramp(d3, 0.5, 1));
	}
	// Post hub in a five-out system.
	if (tPost >= 65 && d3 >= 0.7) {
		severity = Math.max(severity, ramp(tPost, 65, 90) * ramp(d3, 0.7, 1));
	}

	return helpers.bound(severity, 0, 1);
};
