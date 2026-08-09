import { assert, test } from "vitest";
import { routeInfos } from "./routeInfos.ts";

test("soccer tactics and legacy depth URLs use the tactics view", () => {
	assert.equal(routeInfos["/l/:lid/tactics"], "soccerTactics");
	assert.equal(routeInfos["/l/:lid/depth"], "soccerTactics");
	assert.equal(routeInfos["/l/:lid/depth/:pos"], "soccerTactics");
	assert.equal(routeInfos["/l/:lid/depth/:pos/:abbrev"], "soccerTactics");
	assert.equal(
		routeInfos["/l/:lid/depth/:pos/:abbrev/:playoffs"],
		"soccerTactics",
	);
});
