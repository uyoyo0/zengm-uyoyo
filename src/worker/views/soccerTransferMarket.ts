import type { UpdateEvents } from "../../common/types.ts";
import {
	getTransferMarket,
	getSoccerTeamSeason,
	isTransferWindowOpen,
} from "../core/soccer/transfers.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";

const updateSoccerTransferMarket = async (
	_inputs: unknown,
	updateEvents: UpdateEvents,
) => {
	if (
		!updateEvents.includes("firstRun") &&
		!updateEvents.includes("playerMovement") &&
		!updateEvents.includes("teamFinances")
	) {
		return;
	}

	const tid = g.get("userTid");
	const [teamSeason, market, offers, roster] = await Promise.all([
		getSoccerTeamSeason(tid),
		getTransferMarket(),
		idb.league.getAll("soccerTransferOffers"),
		idb.cache.players.indexGetAll("playersByTid", tid),
	]);
	const teamInfo = g.get("teamInfoCache");
	const clubName = (clubTid: number) => {
		if (clubTid < 0) {return "Free agent";}
		const club = teamInfo[clubTid];
		return club ? `${club.region} ${club.name}`.trim() : "Unknown club";
	};
	const playerByPid = new Map(market.map((p) => [p.pid, p]));

	return {
		tid,
		season: g.get("season"),
		transferBudget: teamSeason?.transferBudget ?? 0,
		wageBudget: teamSeason?.wageBudget ?? 0,
		currentPayroll: roster.reduce((sum, p) => sum + p.contract.amount, 0),
		maxRosterSize: g.get("maxRosterSize"),
		minRosterSize: g.get("minRosterSize"),
		windowOpen: isTransferWindowOpen(),
		players: market
			.filter((p) => p.tid !== tid)
			.map((p) => ({
				...p,
				club: clubName(p.tid),
				abbrev: p.tid >= 0 ? teamInfo[p.tid]?.abbrev : "FA",
			})),
		roster: market
			.filter((p) => p.tid === tid)
			.map((p) => ({ ...p, club: clubName(tid) })),
		offers: offers
			.filter((offer) => offer.buyingTid === tid || offer.sellingTid === tid)
			.toSorted((a, b) => (b.offerId ?? 0) - (a.offerId ?? 0))
			.slice(0, 30)
			.map((offer) => ({
				...offer,
				playerName:
					playerByPid.get(offer.pid)?.name ??
					roster
						.filter((p) => p.pid === offer.pid)
						.map((p) => `${p.firstName} ${p.lastName}`)[0] ??
					"Unknown player",
				buyingClub: clubName(offer.buyingTid),
				sellingClub: clubName(offer.sellingTid),
				direction: offer.buyingTid === tid ? "in" : "out",
			})),
	};
};

export default updateSoccerTransferMarket;
