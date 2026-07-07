import { assert, describe, test } from "vitest";
import {
	playerFitMessage,
	playerGoodFitMessage,
	teamFitMessage,
} from "./fitMessages.ts";
import { DEFAULT_COACHING } from "../../common/constants.ts";

const DIALS = Object.keys(DEFAULT_COACHING);

describe("fitMessages", () => {
	test("every dial and direction has a message", () => {
		for (const dial of DIALS) {
			for (const playerWants of [1, -1] as const) {
				const details = [{ dial, playerWants }];
				assert(playerFitMessage(details, 1) !== undefined, `${dial}`);
				assert(teamFitMessage(details, 1).length > 0, `${dial}`);
			}
		}
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
	});

	test("no mismatches falls back to good-fit text", () => {
		assert(teamFitMessage([], 7).length > 0);
		assert.strictEqual(playerFitMessage([], 7), undefined);
		assert.strictEqual(playerFitMessage(undefined, 7), undefined);
	});
});
