import { assert, beforeEach, describe, test } from "vitest";
import moodComponents from "./moodComponents.ts";
import { player, team } from "../index.ts";
import { g, helpers } from "../../util/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { DEFAULT_COACHING } from "../../../common/constants.ts";

const setup = async (coaching: any) => {
	resetG();
	g.setWithoutSavingToDB("season", 2020);

	const teamsDefault = helpers.getTeamsDefault().slice(0, 2);
	const teams = teamsDefault.map(team.generate);
	if (coaching !== undefined) {
		(teams[0] as any).coaching = coaching;
	} else {
		delete (teams[0] as any).coaching;
	}

	await resetCache({
		teams,
		teamSeasons: teamsDefault.map((t) => team.genSeasonRow(t)),
		teamStats: teamsDefault.map((t) => team.genStatsRow(t.tid)),
	});
};

// A player whose comparative advantage is unambiguous: an elite shooter.
const makeShooter = () => {
	const p: any = player.generate(0, 25, 2010, true, 50);
	const r = p.ratings.at(-1);
	Object.assign(r, {
		tp: 90,
		spd: 50,
		dnk: 40,
		reb: 35,
		hgt: 40,
		diq: 45,
		tendencyThree: 90,
	});
	return p;
};

describe("moodComponents systemFit", () => {
	beforeEach(() => {
		resetG();
	});

	test("positive in a matching system, negative in an opposing one", async () => {
		const shooterSystem = {
			...DEFAULT_COACHING,
			threePointTendency: 1,
			pace: 0.3,
		};
		await setup(shooterSystem);
		const p = makeShooter();
		p.tid = 0;
		const matching = await moodComponents(p, 0);
		assert(matching.systemFit > 0, `expected > 0: ${matching.systemFit}`);
		assert(matching.systemFit <= 2);

		const paintSystem = {
			...DEFAULT_COACHING,
			threePointTendency: -1,
			pace: -0.5,
			crashOffensiveGlass: 1,
			paintDefense: 1,
		};
		await setup(paintSystem);
		const p2 = makeShooter();
		p2.tid = 0;
		const opposing = await moodComponents(p2, 0);
		assert(opposing.systemFit < 0, `expected < 0: ${opposing.systemFit}`);
		assert(opposing.systemFit >= -2);
		assert(matching.systemFit > opposing.systemFit);
	});

	test("exactly 0 when the team has no coaching dials", async () => {
		await setup(undefined);
		const p = makeShooter();
		p.tid = 0;
		const components = await moodComponents(p, 0);
		assert.strictEqual(components.systemFit, 0);
	});
});
