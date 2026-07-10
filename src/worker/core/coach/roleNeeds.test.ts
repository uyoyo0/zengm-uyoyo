import { assert, describe, test } from "vitest";
import {
	creationCapability,
	identityConflict,
	playerRoleScore,
	roleCapabilities,
	systemRoleDemands,
	teamRoleCoverage,
} from "../../../common/roleNeeds.basketball.ts";
import { playerCoachFit } from "./style.ts";
import { DEFAULT_COACHING } from "../../../common/constants.ts";
import {
	COVERAGE_C0,
	COVERAGE_GAIN,
	FIT_NEUTRAL,
} from "../../../common/coachingConstants.ts";

const NEUTRAL = {
	hgt: 50,
	stre: 50,
	spd: 50,
	jmp: 50,
	endu: 50,
	ins: 50,
	dnk: 50,
	tp: 50,
	oiq: 50,
	diq: 50,
	drb: 50,
	pss: 50,
	reb: 50,
};

const SHOOTER = {
	...NEUTRAL,
	tp: 80,
	tendencyThree: 80,
	spd: 60,
};

const RIM_BIG = {
	...NEUTRAL,
	hgt: 72,
	dnk: 78,
	ins: 65,
	reb: 68,
	stre: 70,
	tp: 30,
	tendencyThree: 20,
};

const RIM_PROTECTOR = {
	...NEUTRAL,
	hgt: 75,
	diq: 70,
	jmp: 62,
	reb: 68,
	spd: 38,
	tp: 25,
	tendencyThree: 15,
};

const ROLE_PLAYER = { ...NEUTRAL, tp: 55, tendencyThree: 55 };

describe("roleCapabilities", () => {
	test("archetype boundaries produce sensible capabilities", () => {
		const shooterCaps = roleCapabilities(SHOOTER);
		assert(shooterCaps.spacing > 0.8, `shooter spacing: ${shooterCaps.spacing}`);
		assert(shooterCaps.rimProtection < 0.2);

		const protectorCaps = roleCapabilities(RIM_PROTECTOR);
		assert(
			protectorCaps.rimProtection > 0.8,
			`rim protection: ${protectorCaps.rimProtection}`,
		);
		assert.strictEqual(protectorCaps.spacing, 0);

		// A stretch big's rim gravity is suppressed by his shooting inclination.
		const stretchBig = { ...RIM_BIG, tp: 65, tendencyThree: 70 };
		assert(
			roleCapabilities(stretchBig).rimGravity <
				roleCapabilities(RIM_BIG).rimGravity,
		);

		// No-shooting player supplies zero spacing.
		assert.strictEqual(
			roleCapabilities({ ...NEUTRAL, tp: 30 }).spacing,
			0,
		);
	});
});

describe("systemRoleDemands", () => {
	test("directions: complements included", () => {
		const neutral = systemRoleDemands({ ...DEFAULT_COACHING });
		const maxThree = systemRoleDemands({
			...DEFAULT_COACHING,
			threePointTendency: 1,
		});
		const perimeterAggressive = systemRoleDemands({
			...DEFAULT_COACHING,
			paintDefense: -0.8,
			defensiveAggression: 0.8,
		});

		// A 3PT-heavy system wants lots of shooters AND more rim gravity than a
		// neutral one (the screener/dive man complement).
		assert(maxThree.spacing >= 3);
		assert(maxThree.rimGravity > neutral.rimGravity);

		// A gambling perimeter defense wants MORE rim protection than neutral
		// (the backline eraser) plus ball pressure.
		assert(perimeterAggressive.rimProtection > neutral.rimProtection);
		assert(perimeterAggressive.ballPressure > neutral.ballPressure);

		// Monotonic in |dial|.
		const halfThree = systemRoleDemands({
			...DEFAULT_COACHING,
			threePointTendency: 0.5,
		});
		assert(maxThree.spacing > halfThree.spacing);
		assert(halfThree.spacing > neutral.spacing);
	});
});

describe("teamRoleCoverage / cohesion ordering", () => {
	const threeSystem = { ...DEFAULT_COACHING, threePointTendency: 1 };

	const cohesionOf = (roster: { [key: string]: number }[]) => {
		const rotation = roster.map((ratings) => ({ ratings }));
		const coverage = teamRoleCoverage(rotation, threeSystem);
		const meanFit =
			roster.reduce(
				(sum, ratings) => sum + playerCoachFit(ratings, threeSystem),
				0,
			) / roster.length;
		return {
			cohesion:
				0.5 * meanFit +
				0.5 *
					(FIT_NEUTRAL + (coverage.coverageMean - COVERAGE_C0) * COVERAGE_GAIN),
			coverage,
		};
	};

	test("4 shooters + rim-running big beats 5 shooters", () => {
		const rolePlayers = [
			ROLE_PLAYER,
			ROLE_PLAYER,
			{ ...NEUTRAL, pss: 70, tendencyPass: 70 },
			ROLE_PLAYER,
		];
		const fiveShooters = cohesionOf([
			SHOOTER,
			SHOOTER,
			SHOOTER,
			SHOOTER,
			SHOOTER,
			...rolePlayers,
		]);
		const fourPlusBig = cohesionOf([
			SHOOTER,
			SHOOTER,
			SHOOTER,
			SHOOTER,
			RIM_BIG,
			...rolePlayers,
		]);

		assert(
			fourPlusBig.cohesion > fiveShooters.cohesion,
			`complementary roster should cohere better: ${fourPlusBig.cohesion.toFixed(3)} vs ${fiveShooters.cohesion.toFixed(3)}`,
		);

		// And the all-shooter roster's top shortage is the missing dive man.
		assert.strictEqual(fiveShooters.coverage.shortages[0]?.need, "rimGravity");
	});

	test("shortage and surplus triggers", () => {
		// Gambling perimeter coach + no rim protection -> rimProtection shortage.
		const gambling = { ...DEFAULT_COACHING, paintDefense: -0.8, defensiveAggression: 0.8 };
		const guards = Array.from({ length: 9 }, () => ({
			ratings: { ...NEUTRAL, spd: 65, diq: 60, hgt: 40 },
		}));
		const coverage = teamRoleCoverage(guards, gambling);
		assert(
			coverage.shortages.some((s) => s.need === "rimProtection"),
			JSON.stringify(coverage.shortages),
		);

		// Three high-usage stars in the top 5 -> creation surplus.
		const star = { ...NEUTRAL, tendencyUsage: 80 };
		assert(creationCapability(star) > 0.9);
		const logjam = teamRoleCoverage(
			[
				{ ratings: star },
				{ ratings: star },
				{ ratings: star },
				{ ratings: NEUTRAL },
				{ ratings: NEUTRAL },
			],
			{ ...DEFAULT_COACHING },
		);
		assert(logjam.surpluses.some((s) => s.kind === "creation"));
	});
});

describe("identityConflict", () => {
	test("only tendency-driven clashes register", () => {
		const chucker = { ...NEUTRAL, tendencyThree: 90 };
		const paintSystem = { ...DEFAULT_COACHING, threePointTendency: -0.9 };
		assert(identityConflict(chucker, paintSystem) > 0.5);

		// Same low skill without the tendency: no conflict.
		assert.strictEqual(
			identityConflict({ ...NEUTRAL, tp: 20 }, paintSystem),
			0,
		);

		// Neutral system: no conflicts.
		assert.strictEqual(
			identityConflict(chucker, { ...DEFAULT_COACHING }),
			0,
		);
	});
});

describe("playerRoleScore", () => {
	test("finds the demanded job", () => {
		const gambling = {
			...DEFAULT_COACHING,
			paintDefense: -0.8,
			defensiveAggression: 0.8,
		};
		const { need, score } = playerRoleScore(RIM_PROTECTOR, gambling);
		assert.strictEqual(need, "rimProtection");
		assert(score > 0.8, `${score}`);
	});
});
