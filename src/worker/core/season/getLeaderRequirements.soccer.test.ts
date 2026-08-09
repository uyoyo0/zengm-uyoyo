import { beforeEach, describe, expect, test } from "vitest";
import { PLAYER_STATS_TABLES } from "../../../common/constants.ts";
import { resetG } from "../../../test/helpers.ts";
import getLeaderRequirements from "./getLeaderRequirements.ts";

describe("soccer leader requirements", () => {
	beforeEach(resetG);

	test("defines a requirement for every player profile statistic", () => {
		const requirements = getLeaderRequirements();
		const profileStats = new Set(
			Object.values(PLAYER_STATS_TABLES).flatMap((table) => table.stats),
		);
		const missing = [...profileStats].filter(
			(stat) => requirements[stat] === undefined,
		);

		expect(missing).toEqual([]);
	});
});
