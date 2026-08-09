import { describe, expect, test } from "vitest";
import { DRAFT_BY_TEAM_OVR, POSITIONS, RATINGS } from "./constants.ts";
import { getCols } from "./getCols.ts";
import { posRatings } from "./posRatings.ts";

describe("soccer UI schema", () => {
	test("uses the fast value-sorted roster assignment path", () => {
		expect(DRAFT_BY_TEAM_OVR).toBe(false);
	});

	test("defines columns for every rating and position", () => {
		const columnNames = [
			...RATINGS.map((rating) => `rating:${rating}`),
			...POSITIONS.flatMap((position) => [
				`rating:ovr${position}`,
				`rating:pot${position}`,
			]),
		];
		expect(() => getCols(columnNames)).not.toThrow();
	});

	test("uses soccer ratings for position highlighting", () => {
		expect(posRatings("GK")).toContain("gkr");
		expect(posRatings("ST")).toContain("fin");
		expect(posRatings("ST")).not.toContain("glk");
	});
});
