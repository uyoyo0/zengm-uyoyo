import { assert, describe, test } from "vitest";
import {
	playerFitMessage,
	playerGoodFitMessage,
	playerRoleFitMessage,
	teamFitMessage,
} from "./fitMessages.ts";
import { DEFAULT_COACHING } from "../../common/constants.ts";
import { ROLE_NEEDS } from "../../common/roleNeeds.basketball.ts";

const DIALS = Object.keys(DEFAULT_COACHING);

const chem = (
	overrides: Partial<Parameters<typeof teamFitMessage>[0]> = {},
): Parameters<typeof teamFitMessage>[0] => ({
	cohesion: 0.85,
	shortages: [],
	surpluses: [],
	...overrides,
});

describe("fitMessages", () => {
	test("every dial direction, role need, shortage, and surplus has a message", () => {
		for (const dial of DIALS) {
			for (const playerWants of [1, -1] as const) {
				assert(
					playerFitMessage([{ dial, playerWants }], 1) !== undefined,
					`${dial} ${playerWants}`,
				);
			}
		}
		for (const need of ROLE_NEEDS) {
			assert(playerRoleFitMessage({ need }, 1) !== undefined, need);
			assert(
				teamFitMessage(chem({ shortages: [{ need, severity: 1 }] }), 1).length >
					0,
				need,
			);
		}
		for (const kind of ["spacing", "creation"] as const) {
			assert(
				teamFitMessage(chem({ surpluses: [{ kind, severity: 1 }] }), 1).length >
					0,
				kind,
			);
		}
	});

	test("team message priority: shortage > surplus > tiered positive", () => {
		const both = chem({
			shortages: [{ need: "rimProtection", severity: 1 }],
			surpluses: [{ kind: "creation", severity: 1 }],
		});
		// Shortage wins - its message mentions the defense/rim theme, but assert
		// structurally: same result as shortage-only.
		assert.strictEqual(
			teamFitMessage(both, 7),
			teamFitMessage(
				chem({ shortages: [{ need: "rimProtection", severity: 1 }] }),
				7,
			),
		);

		// Positive tiers differ by cohesion grade.
		const aTier = teamFitMessage(chem({ cohesion: 0.95 }), 7);
		const bTier = teamFitMessage(chem({ cohesion: 0.84 }), 7);
		assert(aTier.length > 0 && bTier.length > 0);
		assert.notStrictEqual(aTier, bTier);
	});

	test("deterministic for a seed, varied across seeds", () => {
		const details = [{ dial: "pace", playerWants: 1 as const }];
		assert.strictEqual(
			playerFitMessage(details, 42),
			playerFitMessage(details, 42),
		);

		const variants = new Set(
			Array.from({ length: 50 }, (_, i) => playerFitMessage(details, i)),
		);
		assert(variants.size >= 2, "expected variety across seeds");

		const goodVariants = new Set(
			Array.from({ length: 50 }, (_, i) => playerGoodFitMessage(i)),
		);
		assert(goodVariants.size >= 2);

		const roleVariants = new Set(
			Array.from({ length: 50 }, (_, i) =>
				playerRoleFitMessage({ need: "rimProtection" }, i),
			),
		);
		assert(roleVariants.size >= 2);
	});

	test("fallbacks", () => {
		assert.strictEqual(playerFitMessage([], 7), undefined);
		assert.strictEqual(playerFitMessage(undefined, 7), undefined);
		assert.strictEqual(playerRoleFitMessage(undefined, 7), undefined);
		assert(teamFitMessage(chem(), 7).length > 0);
	});
});
