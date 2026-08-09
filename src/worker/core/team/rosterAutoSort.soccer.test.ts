import { beforeEach, describe, expect, test } from "vitest";
import { resetG } from "../../../test/helpers.ts";
import { getAiSoccerPreset } from "./rosterAutoSort.soccer.ts";

const squad = (ratings: Record<string, number>) =>
	Array.from({ length: 16 }, () => ({ ratings: [{ ovr: 72, ...ratings }] }));

describe("AI soccer tactics", () => {
	beforeEach(resetG);

	test("selects a style that fits the squad", () => {
		expect(
			getAiSoccerPreset(squad({ pas: 92, ftc: 90, cmp: 91, oiq: 85 })),
		).toBe("possession");
		expect(
			getAiSoccerPreset(squad({ spd: 94, acc: 93, fin: 90, oiq: 82 })),
		).toBe("counter");
	});
});
