import { assert, describe, test } from "vitest";
import { roundRobin } from "./scheduleSeason.ts";

describe("soccer league schedule", () => {
	test("creates a balanced double round robin", () => {
		const tids = Array.from({ length: 20 }, (_value, index) => index);
		const rounds = roundRobin(tids);
		assert.strictEqual(rounds.length, 38);
		assert.ok(rounds.every((round) => round.length === 10));
		const matchups = rounds.flat();
		for (const home of tids) {
			for (const away of tids) {
				if (home !== away) {
					assert.strictEqual(
						matchups.filter((game) => game[0] === home && game[1] === away)
							.length,
						1,
					);
				}
			}
		}
	});
});
