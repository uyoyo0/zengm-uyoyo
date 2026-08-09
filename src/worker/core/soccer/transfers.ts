import { PHASE, PLAYER } from "../../../common/constants.ts";
import { FORMATIONS } from "../../../common/constants.soccer.ts";
import { normalizeSoccerTactics } from "../../../common/soccer/tactics.ts";
import { removePlayerFromSoccerLineup } from "../../../common/soccer/lineup.ts";
import type {
	PlayerWithoutKey,
	SoccerTactics,
	SoccerTransferOffer,
} from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { player, team } from "../index.ts";

export const isTransferWindowOpen = () => {
	const phase = g.get("phase");
	return phase !== PHASE.PRESEASON &&
		phase !== PHASE.REGULAR_SEASON &&
		phase !== PHASE.RESIGN_PLAYERS &&
		phase !== PHASE.FREE_AGENCY
		? false
		: true;
};

const assertTransferWindow = () => {
	if (!isTransferWindowOpen()) {
		throw new Error("The transfer window is closed");
	}
};

export const getInitialSoccerBudgets = (pop: number) => ({
	// Transfer fees are stored in millions. Wages use the existing contract
	// convention of thousands per year.
	transferBudget: Math.round(28 + pop * 13),
	wageBudget: Math.round((95 + pop * 22) * 1000),
	maxDebt: Math.round(20 + pop * 5),
});

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

export const getSoccerMarketValue = (
	p: Pick<PlayerWithoutKey, "born" | "contract" | "ratings" | "tid">,
) => {
	const ratings = p.ratings.at(-1)!;
	const age = g.get("season") - p.born.year;
	const quality = clamp((ratings.ovr - 45) / 45, 0, 1.15);
	const potential = clamp((ratings.pot - ratings.ovr) / 20, 0, 1);
	const ageFactor =
		age <= 21
			? 1.24
			: age <= 25
				? 1.15
				: age <= 29
					? 1
					: age <= 32
						? 0.72
						: 0.46;
	const contractYears = Math.max(0, p.contract.exp - g.get("season"));
	const contractFactor = clamp(0.72 + contractYears * 0.11, 0.72, 1.16);
	const positionFactor = ratings.pos === "GK" ? 0.78 : 1;
	const elitePremium = Math.max(0, ratings.ovr - 82) * 5.5;
	return (
		Math.round(
			clamp(
				(1.5 + quality ** 2.35 * 92 + potential * 24 + elitePremium) *
					ageFactor *
					contractFactor *
					positionFactor,
				0.2,
				200,
			) * 10,
		) / 10
	);
};

export const getSoccerAskingPrice = (
	p: Pick<PlayerWithoutKey, "born" | "contract" | "pid" | "ratings" | "tid">,
) => {
	if (p.tid === PLAYER.FREE_AGENT) {
		return 0;
	}
	const premium = 1.08 + ((p.pid ?? 0) % 7) * 0.025;
	return Math.round(getSoccerMarketValue(p) * premium * 10) / 10;
};

export const getRecommendedSoccerContract = (
	p: Pick<PlayerWithoutKey, "born" | "contract" | "ratings" | "tid">,
) =>
	Math.round(
		clamp(
			Math.max(p.contract.amount * 1.08, 600 + getSoccerMarketValue(p) * 125),
			g.get("minContract"),
			g.get("maxContract"),
		),
	);

export const getSoccerTeamSeason = async (tid: number) => {
	const row = await idb.cache.teamSeasons.indexGet("teamSeasonsBySeasonTid", [
		g.get("season"),
		tid,
	]);
	if (!row) {
		throw new Error("Team season not found");
	}
	// Upgrade the original prototype budgets in existing soccer saves.
	if (
		row.transferBudget === undefined ||
		row.transferBudget > 1000 ||
		row.wageBudget === undefined ||
		row.wageBudget === 36000
	) {
		const club = await idb.cache.teams.get(tid);
		const budgets = getInitialSoccerBudgets(club?.pop ?? 1);
		if (row.transferBudget === undefined || row.transferBudget > 1000) {
			row.transferBudget = budgets.transferBudget;
		}
		if (row.wageBudget === undefined || row.wageBudget === 36000) {
			row.wageBudget = budgets.wageBudget;
		}
		row.maxDebt ??= budgets.maxDebt;
		await idb.cache.teamSeasons.put(row);
	}
	return row;
};

const assertControlledTeam = (tid: number) => {
	if (!g.get("userTids").includes(tid)) {
		throw new Error("You do not control this club");
	}
};

export const submitTransferOffer = async ({
	pid,
	buyingTid,
	fee,
	contractAmount,
	contractExp,
}: {
	pid: number;
	buyingTid: number;
	fee: number;
	contractAmount?: number;
	contractExp?: number;
}) => {
	assertTransferWindow();
	assertControlledTeam(buyingTid);
	const p = await idb.cache.players.get(pid);
	if (!p || (p.tid < 0 && p.tid !== PLAYER.FREE_AGENT)) {
		throw new Error("Player is not available");
	}
	if (p.tid === buyingTid) {
		throw new Error("Player is already at this club");
	}
	if (p.tid >= 0) {
		const sellerRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			p.tid,
		);
		if (sellerRoster.length <= g.get("minRosterSize")) {
			throw new Error("The selling club does not have enough squad depth");
		}
	}
	if (
		!Number.isFinite(fee) ||
		(contractAmount !== undefined && !Number.isFinite(contractAmount))
	) {
		throw new Error("Enter a valid fee and contract");
	}
	const buyerSeason = await getSoccerTeamSeason(buyingTid);
	const isFreeAgent = p.tid === PLAYER.FREE_AGENT;
	if (
		(isFreeAgent && fee !== 0) ||
		(!isFreeAgent && (fee <= 0 || fee > (buyerSeason.transferBudget ?? 0)))
	) {
		throw new Error("Offer exceeds the club's transfer budget");
	}
	const askingPrice = getSoccerAskingPrice(p);
	const marketValue = getSoccerMarketValue(p);
	const recommendedContract = getRecommendedSoccerContract(p);
	const requestedContractAmount = Math.round(
		recommendedContract * (0.96 + ((p.pid ?? 0) % 5) * 0.02),
	);
	const years = (contractExp ?? g.get("season") + 4) - g.get("season");
	const offeredContract = contractAmount ?? recommendedContract;
	let status: SoccerTransferOffer["status"];
	if (isFreeAgent || fee >= askingPrice * 0.98) {
		status =
			offeredContract >= requestedContractAmount * 0.94 &&
			years >= 2 &&
			years <= 5
				? "playerAccepted"
				: "clubAccepted";
	} else if (fee >= askingPrice * 0.82) {
		status = "countered";
	} else {
		status = "rejected";
	}
	const offer: SoccerTransferOffer = {
		pid,
		buyingTid,
		sellingTid: p.tid,
		fee: Math.round(fee * 10) / 10,
		contractAmount: offeredContract,
		contractExp: contractExp ?? g.get("season") + 4,
		marketValue,
		askingPrice,
		requestedContractAmount,
		status,
		createdDay: g.get("daysLeft"),
		expiresDay: g.get("daysLeft") - 7,
	};
	if (offer.status === "countered") {
		offer.fee = askingPrice;
	}
	offer.offerId = await idb.league.add("soccerTransferOffers", offer);
	return offer;
};

export const completeTransfer = async (offerId: number) => {
	assertTransferWindow();
	const offer = await idb.league.get("soccerTransferOffers", offerId);
	if (!offer || offer.status !== "playerAccepted") {
		throw new Error("This offer cannot be completed");
	}
	if (g.get("daysLeft") < offer.expiresDay) {
		throw new Error("This offer has expired");
	}
	if (
		!g.get("userTids").includes(offer.buyingTid) &&
		!g.get("userTids").includes(offer.sellingTid)
	) {
		throw new Error("You do not control either club in this transfer");
	}
	const p = await idb.cache.players.get(offer.pid);
	if (!p || p.tid !== offer.sellingTid) {
		throw new Error("Player is no longer available");
	}
	const buyerSeason = await getSoccerTeamSeason(offer.buyingTid);
	const sellerSeason =
		offer.sellingTid >= 0
			? await getSoccerTeamSeason(offer.sellingTid)
			: undefined;
	if (offer.fee > (buyerSeason.transferBudget ?? 0)) {
		throw new Error("Insufficient transfer budget");
	}
	const buyerRoster = await idb.cache.players.indexGetAll(
		"playersByTid",
		offer.buyingTid,
	);
	if (buyerRoster.length >= g.get("maxRosterSize")) {
		throw new Error("The buying club has no open squad places");
	}
	if (offer.sellingTid >= 0) {
		const sellerRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			offer.sellingTid,
		);
		if (sellerRoster.length <= g.get("minRosterSize")) {
			throw new Error(
				"The selling club cannot fall below the minimum squad size",
			);
		}
	}
	const newWage = offer.contractAmount ?? getRecommendedSoccerContract(p);
	const payrollAfter =
		buyerRoster.reduce((sum, player) => sum + player.contract.amount, 0) +
		newWage;
	if (payrollAfter > (buyerSeason.wageBudget ?? Infinity)) {
		throw new Error("The contract would exceed the club's wage budget");
	}
	buyerSeason.transferBudget = (buyerSeason.transferBudget ?? 0) - offer.fee;
	if (sellerSeason) {
		sellerSeason.transferBudget =
			(sellerSeason.transferBudget ?? 0) + offer.fee;
	}
	p.tid = offer.buyingTid;
	p.contract.amount = newWage;
	p.contract.exp = offer.contractExp ?? g.get("season") + 3;
	p.transactions ??= [];
	if (offer.sellingTid === PLAYER.FREE_AGENT) {
		p.transactions.push({
			season: g.get("season"),
			phase: g.get("phase"),
			tid: offer.buyingTid,
			type: "freeAgent",
		});
	} else {
		p.transactions.push({
			season: g.get("season"),
			phase: g.get("phase"),
			tid: offer.buyingTid,
			fromTid: offer.sellingTid,
			type: "transfer",
		});
	}
	offer.status = "completed";
	const writes = [
		idb.cache.players.put(p),
		idb.cache.teamSeasons.put(buyerSeason),
		idb.league.put("soccerTransferOffers", offer),
	];
	if (sellerSeason) {
		writes.push(idb.cache.teamSeasons.put(sellerSeason));
	}
	const sellerTeam =
		offer.sellingTid >= 0
			? await idb.cache.teams.get(offer.sellingTid)
			: undefined;
	if (sellerTeam?.soccerTactics) {
		sellerTeam.soccerTactics.starting = removePlayerFromSoccerLineup(
			sellerTeam.soccerTactics.starting,
			p.pid,
		);
		sellerTeam.soccerTactics.bench = sellerTeam.soccerTactics.bench.filter(
			(pid) => pid !== p.pid,
		);
		delete sellerTeam.soccerTactics.duties[p.pid];
		writes.push(idb.cache.teams.put(sellerTeam));
	}
	await Promise.all(writes);
	const buyerTeam = await idb.cache.teams.get(offer.buyingTid);
	const sortPromises = [
		team.rosterAutoSort(
			offer.buyingTid,
			g.get("userTids").includes(offer.buyingTid) &&
				buyerTeam?.keepRosterSorted !== true,
		),
	];
	if (offer.sellingTid >= 0) {
		sortPromises.push(
			team.rosterAutoSort(
				offer.sellingTid,
				g.get("userTids").includes(offer.sellingTid) &&
					sellerTeam?.keepRosterSorted !== true,
			),
		);
	}
	await Promise.all(sortPromises);
	return offer;
};

export const getTransferMarket = async () => {
	const players = await idb.cache.players.getAll();
	const rosterCounts = new Map<number, number>();
	for (const p of players) {
		if (p.tid >= 0) {
			rosterCounts.set(p.tid, (rosterCounts.get(p.tid) ?? 0) + 1);
		}
	}
	return players
		.filter((p) => p.tid >= 0 || p.tid === PLAYER.FREE_AGENT)
		.map((p) => ({
			pid: p.pid,
			name: `${p.firstName} ${p.lastName}`,
			pos: p.ratings.at(-1)!.pos,
			age: g.get("season") - p.born.year,
			tid: p.tid,
			ovr: p.ratings.at(-1)!.ovr,
			pot: p.ratings.at(-1)!.pot,
			marketValue: getSoccerMarketValue(p),
			askingPrice: getSoccerAskingPrice(p),
			recommendedContract: getRecommendedSoccerContract(p),
			available:
				p.tid === PLAYER.FREE_AGENT ||
				(rosterCounts.get(p.tid) ?? 0) > g.get("minRosterSize"),
			contract: p.contract,
		}))
		.toSorted((a, b) => b.marketValue - a.marketValue);
};

export const requestTransferOffers = async (pid: number) => {
	assertTransferWindow();
	const p = await idb.cache.players.get(pid);
	if (!p || !g.get("userTids").includes(p.tid)) {
		throw new Error("You can only seek offers for your own players");
	}
	const sellerRoster = await idb.cache.players.indexGetAll(
		"playersByTid",
		p.tid,
	);
	if (sellerRoster.length <= g.get("minRosterSize")) {
		throw new Error("Your squad cannot fall below the minimum size");
	}
	const teams = (await idb.cache.teams.getAll()).filter(
		(t) => !t.disabled && t.tid !== p.tid,
	);
	const marketValue = getSoccerMarketValue(p);
	const contractAmount = getRecommendedSoccerContract(p);
	const existingOffers = await idb.league.getAllFromIndex(
		"soccerTransferOffers",
		"pid",
		pid,
	);
	if (
		existingOffers.some(
			(offer) =>
				offer.sellingTid === p.tid && offer.status === "playerAccepted",
		)
	) {
		throw new Error("There is already an active offer for this player");
	}
	const candidates = [];
	for (const club of teams) {
		const [clubSeason, roster] = await Promise.all([
			getSoccerTeamSeason(club.tid),
			idb.cache.players.indexGetAll("playersByTid", club.tid),
		]);
		const interest = 0.84 + ((p.pid + club.tid * 3) % 18) / 100;
		const fee = Math.round(marketValue * interest * 10) / 10;
		const payroll = roster.reduce(
			(sum, player) => sum + player.contract.amount,
			0,
		);
		if (
			fee <= (clubSeason.transferBudget ?? 0) &&
			payroll + contractAmount <= (clubSeason.wageBudget ?? Infinity) &&
			roster.length < g.get("maxRosterSize")
		) {
			candidates.push({ club, fee });
		}
	}
	const candidate = candidates.toSorted((a, b) => b.fee - a.fee)[0];
	if (!candidate) {
		throw new Error("No club is prepared to make an offer right now");
	}
	const offer: SoccerTransferOffer = {
		pid,
		buyingTid: candidate.club.tid,
		sellingTid: p.tid,
		fee: candidate.fee,
		contractAmount,
		contractExp: g.get("season") + 4,
		marketValue,
		askingPrice: marketValue,
		requestedContractAmount: contractAmount,
		status: "playerAccepted",
		createdDay: g.get("daysLeft"),
		expiresDay: g.get("daysLeft") - 7,
	};
	offer.offerId = await idb.league.add("soccerTransferOffers", offer);
	return offer;
};

export const withdrawTransferOffer = async (offerId: number) => {
	const offer = await idb.league.get("soccerTransferOffers", offerId);
	if (!offer || offer.status === "completed") {
		throw new Error("This offer cannot be withdrawn");
	}
	if (
		!g.get("userTids").includes(offer.buyingTid) &&
		!g.get("userTids").includes(offer.sellingTid)
	) {
		throw new Error("You do not control either club in this offer");
	}
	offer.status = "withdrawn";
	await idb.league.put("soccerTransferOffers", offer);
	return offer;
};

export const updateSoccerTactics = async ({
	tid,
	tactics,
}: {
	tid: number;
	tactics: SoccerTactics;
}) => {
	assertControlledTeam(tid);
	const t = await idb.cache.teams.get(tid);
	if (!t) {
		throw new Error("Invalid team");
	}
	const normalized = normalizeSoccerTactics(tactics);
	if (!Object.hasOwn(FORMATIONS, normalized.formation)) {
		throw new Error("Invalid formation");
	}
	if (
		normalized.starting.length !== 11 ||
		new Set(normalized.starting).size !== 11
	) {
		throw new Error("Select 11 unique starters");
	}
	const roster = await idb.cache.players.indexGetAll("playersByTid", tid);
	const rosterPids = new Set(roster.map((p) => p.pid));
	if (normalized.starting.some((pid) => !rosterPids.has(pid))) {
		throw new Error("Starting XI contains a player outside the club");
	}
	if (
		normalized.bench.length > 9 ||
		new Set(normalized.bench).size !== normalized.bench.length ||
		normalized.bench.some(
			(pid) => !rosterPids.has(pid) || normalized.starting.includes(pid),
		)
	) {
		throw new Error(
			"Select up to 9 unique substitutes outside the Starting XI",
		);
	}
	const dials = [
		"mentality",
		"tempo",
		"pressing",
		"defensiveLine",
		"width",
		"directness",
		"transition",
		"marking",
	] as const;
	if (dials.some((key) => ![-2, -1, 0, 1, 2].includes(normalized[key]))) {
		throw new Error("Invalid team instruction");
	}
	if (![-1, 0, 1].includes(normalized.substitutionTiming)) {
		throw new Error("Invalid substitution timing");
	}
	normalized.duties = Object.fromEntries(
		Object.entries(normalized.duties).filter(
			([pid, duty]) =>
				rosterPids.has(Number(pid)) &&
				["defend", "support", "attack"].includes(duty),
		),
	);
	t.soccerTactics = normalized;
	// A saved formation is a manual lineup. Do not let the pre-game automatic
	// roster check immediately replace it.
	t.keepRosterSorted = false;
	await idb.cache.teams.put(t);
	return normalized;
};

export const generateAcademyIntake = async (tid: number) => {
	const t = await idb.cache.teams.get(tid);
	if (!t) {
		throw new Error("Invalid team");
	}
	if (t.soccerAcademyIntakeSeason === g.get("season")) {
		throw new Error("This season's academy intake has already been generated");
	}
	const currentRoster = await idb.cache.players.indexGetAll(
		"playersByTid",
		tid,
	);
	const intakeSize = Math.min(
		6,
		Math.max(0, g.get("maxRosterSize") - currentRoster.length),
	);
	if (intakeSize === 0) {
		throw new Error(
			"Release or transfer players before promoting academy prospects",
		);
	}
	const country = t.cid === 0 ? "England" : t.cid === 1 ? "Spain" : "Italy";
	const added = [];
	for (let i = 0; i < intakeSize; i++) {
		const bio = await player.name(country);
		const prospect = player.generate(
			tid,
			16 + (i % 3),
			g.get("season"),
			false,
			50,
			bio,
		);
		await player.develop(prospect, -1 + Math.random() * 2);
		prospect.contract.amount = g.get("minContract");
		prospect.contract.exp = g.get("season") + 3;
		const pid = await idb.cache.players.add(prospect);
		added.push({
			pid,
			name: `${prospect.firstName} ${prospect.lastName}`,
			pos: prospect.ratings.at(-1)!.pos,
		});
	}
	t.soccerAcademyIntakeSeason = g.get("season");
	await idb.cache.teams.put(t);
	await team.rosterAutoSort(tid, true);
	return added;
};
