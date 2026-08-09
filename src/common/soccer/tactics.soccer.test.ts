import { describe, expect, test } from "vitest";
import {
	getDefaultSoccerDuty,
	normalizeSoccerTactics,
	SOCCER_TACTICAL_PRESETS,
} from "./tactics.ts";

describe("soccer tactics", () => {
	test("upgrades tactics saved before advanced instructions existed", () => {
		const tactics = normalizeSoccerTactics({
			formation: "4-4-2",
			starting: [1, 2],
		});
		expect(tactics.formation).toBe("4-4-2");
		expect(tactics.starting).toEqual([1, 2]);
		expect(tactics.transition).toBe(0);
		expect(tactics.marking).toBe(0);
		expect(tactics.substitutionTiming).toBe(0);
	});

	test("assigns sensible default duties by position", () => {
		expect(getDefaultSoccerDuty("CB")).toBe("defend");
		expect(getDefaultSoccerDuty("CM")).toBe("support");
		expect(getDefaultSoccerDuty("ST")).toBe("attack");
	});

	test("includes distinct tactical presets", () => {
		expect(SOCCER_TACTICAL_PRESETS.gegenpress.values.pressing).toBe(2);
		expect(SOCCER_TACTICAL_PRESETS.lowBlock.values.defensiveLine).toBe(-2);
	});
});
