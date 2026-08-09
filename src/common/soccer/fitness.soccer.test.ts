import { expect, test } from "vitest";
import { recoverSoccerFitness } from "./fitness.ts";

test("soccer fitness recovery respects rest days and endurance", () => {
	expect(
		recoverSoccerFitness({
			day: 2,
			endurance: 0.7,
			fitness: 0.7,
			lastMatchDay: 1,
		}),
	).toBe(0.7);
	const lowEndurance = recoverSoccerFitness({
		day: 4,
		endurance: 0.4,
		fitness: 0.7,
		lastMatchDay: 1,
	});
	const highEndurance = recoverSoccerFitness({
		day: 4,
		endurance: 0.9,
		fitness: 0.7,
		lastMatchDay: 1,
	});
	expect(highEndurance).toBeGreaterThan(lowEndurance);
	expect(highEndurance).toBeLessThanOrEqual(1);
});
