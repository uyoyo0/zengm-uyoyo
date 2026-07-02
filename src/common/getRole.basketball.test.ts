import { assert, test } from "vitest";
import getRole from "./getRole.basketball.ts";

// Ratings + tendencies sketches of recognizable archetypes. Tendency values
// use the share mappings (usage 58 ~ 24 usg%, three 59 ~ 42% 3PA share, etc.),
// approximating what deriveTendencies produces for the real player.

const base = {
	hgt: 50,
	tp: 50,
	pss: 50,
	diq: 50,
	ins: 50,
	reb: 50,
	tendencyUsage: 50,
	tendencyThree: 50,
	tendencyAtRim: 50,
	tendencyPost: 50,
	tendencyPass: 50,
};

test("high-usage wing scorer is not a Role Player (the Tatum case)", () => {
	const tatum = {
		...base,
		hgt: 58,
		tp: 72,
		pss: 58,
		diq: 55,
		tendencyUsage: 65, // ~28.5 usg%
		tendencyThree: 59,
		tendencyAtRim: 40,
		tendencyPass: 48,
	};
	assert.equal(getRole(tatum), "Go-To Scorer");

	// Even with league variation pulling usage below the old 62 cliff, he must
	// still read as a creator of some kind, never "Role Player".
	const noisy = { ...tatum, tendencyUsage: 56 };
	assert.notEqual(getRole(noisy), "Role Player");

	// Older save files have tendencies at the neutral 50 default until
	// rederiveTendencies is run. A star-level skill rating (tp=72) must still
	// prevent the Role Player fallback.
	const neutralTendencies = { ...base, hgt: 58, tp: 72, pss: 55, diq: 55 };
	assert.equal(getRole(neutralTendencies), "Shot Creator");
});

test("high-usage playmaking hub is an Offensive Engine", () => {
	const luka = {
		...base,
		tp: 70,
		pss: 88,
		tendencyUsage: 72,
		tendencyThree: 57,
		tendencyPass: 68,
	};
	assert.equal(getRole(luka), "Offensive Engine");

	// A big hub (Jokic-like) must be caught here, not by the big ladder.
	const jokic = {
		...base,
		hgt: 73,
		tp: 60,
		pss: 92,
		diq: 62,
		ins: 80,
		reb: 80,
		tendencyUsage: 65,
		tendencyThree: 37,
		tendencyPost: 65,
		tendencyPass: 72,
	};
	assert.equal(getRole(jokic), "Offensive Engine");
});

test("volume sniper is an Elite Shooter; low-usage marksman is a specialist", () => {
	const curry = {
		...base,
		tp: 90,
		pss: 75,
		tendencyUsage: 66,
		tendencyThree: 76,
		tendencyPass: 56,
	};
	assert.equal(getRole(curry), "Elite Shooter");

	const spotUp = {
		...base,
		tp: 70,
		tendencyUsage: 46,
		tendencyThree: 62,
	};
	assert.equal(getRole(spotUp), "3-Point Specialist");
});

test("high-usage bigs split by how they score", () => {
	const shaq = {
		...base,
		hgt: 75,
		ins: 90,
		reb: 75,
		tendencyUsage: 68,
		tendencyThree: 5,
		tendencyAtRim: 70,
		tendencyPost: 85,
	};
	assert.equal(getRole(shaq), "Post Scorer");

	const giannis = {
		...base,
		hgt: 70,
		ins: 80,
		reb: 75,
		tendencyUsage: 68,
		tendencyThree: 25,
		tendencyAtRim: 78,
		tendencyPost: 56,
	};
	assert.equal(getRole(giannis), "Slasher");
});

test("non-star archetypes still resolve sensibly", () => {
	const gobert = {
		...base,
		hgt: 74,
		diq: 75,
		ins: 55,
		reb: 80,
		tendencyUsage: 42,
		tendencyAtRim: 80,
	};
	assert.equal(getRole(gobert), "Rim Protector");

	const stockton = {
		...base,
		pss: 90,
		diq: 60,
		tendencyUsage: 48,
		tendencyPass: 90,
	};
	assert.equal(getRole(stockton), "Floor General");

	const threeAndD = {
		...base,
		tp: 60,
		diq: 68,
		tendencyUsage: 44,
		tendencyThree: 54,
	};
	assert.equal(getRole(threeAndD), "3&D Wing");

	const benchGuy = {
		...base,
		tp: 45,
		tendencyUsage: 44,
		tendencyThree: 40,
	};
	assert.equal(getRole(benchGuy), "Role Player");
});
