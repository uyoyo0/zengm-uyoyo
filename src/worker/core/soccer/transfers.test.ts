import { beforeEach, describe, expect, test } from "vitest";
import { PLAYER } from "../../../common/constants.ts";
import { resetG } from "../../../test/helpers.ts";
import {
	getInitialSoccerBudgets,
	getRecommendedSoccerContract,
	getSoccerAskingPrice,
	getSoccerMarketValue,
} from "./transfers.ts";

const makePlayer = ({
	age,
	contractYears = 4,
	ovr,
	pid = 1,
	pos = "ST",
	pot = ovr,
	tid = 0,
}: {
	age: number;
	contractYears?: number;
	ovr: number;
	pid?: number;
	pos?: string;
	pot?: number;
	tid?: number;
}) =>
	({
		pid,
		tid,
		born: { year: 2016 - age, loc: "England" },
		contract: { amount: 5000, exp: 2016 + contractYears },
		ratings: [{ ovr, pot, pos }],
	}) as any;

describe("soccer transfer valuation", () => {
	beforeEach(() => {
		resetG();
	});

	test("values elite young players above older average players", () => {
		const elite = makePlayer({ age: 23, ovr: 90, pot: 94 });
		const average = makePlayer({ age: 31, ovr: 70, pot: 70 });

		expect(getSoccerMarketValue(elite)).toBeGreaterThan(100);
		expect(getSoccerMarketValue(elite)).toBeGreaterThan(
			getSoccerMarketValue(average) * 3,
		);
	});

	test("does not charge transfer fees for free agents", () => {
		const freeAgent = makePlayer({
			age: 26,
			ovr: 78,
			tid: PLAYER.FREE_AGENT,
		});
		expect(getSoccerAskingPrice(freeAgent)).toBe(0);
		expect(getRecommendedSoccerContract(freeAgent)).toBeGreaterThan(0);
	});

	test("gives larger clubs larger but finite budgets", () => {
		const promotedClub = getInitialSoccerBudgets(1.6);
		const largeClub = getInitialSoccerBudgets(9);
		expect(largeClub.transferBudget).toBeGreaterThan(
			promotedClub.transferBudget,
		);
		expect(largeClub.wageBudget).toBeGreaterThan(promotedClub.wageBudget);
		expect(largeClub.transferBudget).toBeLessThan(200);
	});
});
