import { beforeEach, describe, expect, test } from "vitest";
import { resetG } from "../../../test/helpers.ts";
import checkStatisticalFeat from "./checkStatisticalFeat.soccer.ts";

const player = (stat: Record<string, number>, pos = "ST") =>
	({ stat, pos }) as any;

describe("soccer statistical feats", () => {
	beforeEach(resetG);

	test("recognizes hat tricks and four goal contributions", () => {
		expect(checkStatisticalFeat(player({ g: 3, a: 1, gs: 1 }))).toEqual({
			feats: { goals: 3, assists: 1 },
			score: 18,
		});
	});

	test("recognizes goalkeeper and defensive masterclasses", () => {
		expect(checkStatisticalFeat(player({ cs: 1, sv: 11 }, "GK")).feats).toEqual(
			{ saves: 11, "clean sheets": 1 },
		);
		expect(
			checkStatisticalFeat(player({ int: 5, tkl: 6 }, "DM")).feats,
		).toEqual({ tackles: 6, interceptions: 5 });
	});

	test("ignores ordinary performances", () => {
		expect(checkStatisticalFeat(player({ g: 1, a: 1 }))).toEqual({ score: 0 });
	});

	test("recognizes an efficient dribbling masterclass", () => {
		expect(
			checkStatisticalFeat(player({ drbAtt: 10, drbCmp: 8 }, "LW")),
		).toEqual({ feats: { "successful dribbles": 8 }, score: 12 });
	});
});
