import { afterEach, describe, expect, test, vi } from "vitest";
import type { League } from "../../common/types.ts";
import { idb } from "./index.ts";
import {
	detectLegacyLeagueSport,
	getLeagueForCurrentSport,
	getLeaguesForCurrentSport,
} from "./leagueSport.ts";

const league = (lid: number, sport: League["sport"]): League => ({
	lid,
	sport,
	name: `League ${lid}`,
	tid: 0,
	phaseText: "",
	teamName: "Team",
	teamRegion: "Region",
});

describe("league sport isolation", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("recognizes legacy saves by sport-specific player ratings", () => {
		expect(
			detectLegacyLeagueSport({
				player: { ratings: [{ fin: 80, gkr: 5, pos: "ST" }] },
			}),
		).toBe("soccer");
		expect(
			detectLegacyLeagueSport({
				player: { ratings: [{ dnk: 80, fg: 75, pos: "SG" }] },
			}),
		).toBe("basketball");
		expect(
			detectLegacyLeagueSport({
				player: { ratings: [{ thp: 80, thv: 75, pos: "QB" }] },
			}),
		).toBe("football");
		expect(
			detectLegacyLeagueSport({
				player: { ratings: [{ con: 80, hpw: 75, pos: "1B" }] },
			}),
		).toBe("baseball");
		expect(
			detectLegacyLeagueSport({
				player: { ratings: [{ glk: 80, wst: 75, pos: "G" }] },
			}),
		).toBe("hockey");
	});

	test("only returns soccer leagues to the soccer build", async () => {
		vi.spyOn(idb.meta, "getAll").mockResolvedValue([
			league(1, "basketball"),
			league(2, "soccer"),
			league(3, "football"),
		]);

		await expect(getLeaguesForCurrentSport()).resolves.toEqual([
			league(2, "soccer"),
		]);
	});

	test("blocks direct access to a basketball league", async () => {
		vi.spyOn(idb.meta, "get").mockResolvedValue(league(1, "basketball"));

		await expect(getLeagueForCurrentSport(1)).resolves.toBeUndefined();
	});
});
