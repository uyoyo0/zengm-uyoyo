import { PHASE } from "../../../common/constants.ts";
import type { GamePlayer } from "../../../common/types.ts";
import { g } from "../../util/index.ts";

const checkStatisticalFeat = (p: GamePlayer) => {
	const goals = p.stat.g ?? 0;
	const assists = p.stat.a ?? 0;
	const saves = p.stat.sv ?? 0;
	const tackles = p.stat.tkl ?? 0;
	const interceptions = p.stat.int ?? 0;
	const passes = p.stat.pas ?? 0;
	const completedPasses = p.stat.pasCmp ?? 0;
	const dribblesAttempted = p.stat.drbAtt ?? 0;
	const dribblesCompleted = p.stat.drbCmp ?? 0;
	const feats: Record<string, number> = {};
	let score = 0;

	// Hat tricks, assist hat tricks, exceptional combined production, and a
	// brace from the bench are all rare enough to deserve a news item.
	if (goals >= 3 || (goals >= 2 && (p.stat.gs ?? 0) === 0)) {
		feats.goals = goals;
		score = Math.max(
			score,
			goals >= 5 ? 30 : goals === 4 ? 23 : goals === 3 ? 16 : 12,
		);
	}
	if (assists >= 3) {
		feats.assists = assists;
		score = Math.max(score, assists >= 4 ? 22 : 15);
	}
	if (goals + assists >= 4) {
		if (goals > 0) {feats.goals = goals;}
		if (assists > 0) {feats.assists = assists;}
		score = Math.max(score, goals + assists >= 5 ? 25 : 18);
	}

	// Goalkeeper masterclasses and high-volume shutouts.
	if (p.pos === "GK" && saves >= 12) {
		feats.saves = saves;
		score = Math.max(score, 18);
	}
	if (p.pos === "GK" && (p.stat.cs ?? 0) > 0 && saves >= 8) {
		feats.saves = saves;
		feats["clean sheets"] = 1;
		score = Math.max(score, saves >= 12 ? 22 : 15);
	}

	// Outfield masterclasses that do not rely on scoring.
	if (tackles + interceptions >= 10 && tackles >= 3 && interceptions >= 3) {
		feats.tackles = tackles;
		feats.interceptions = interceptions;
		score = Math.max(score, 13);
	}
	if (passes >= 90 && completedPasses / passes >= 0.95) {
		feats["passes completed"] = completedPasses;
		score = Math.max(score, passes >= 120 ? 14 : 11);
	}
	if (
		dribblesCompleted >= 7 &&
		dribblesCompleted / Math.max(1, dribblesAttempted) >= 0.7
	) {
		feats["successful dribbles"] = dribblesCompleted;
		score = Math.max(score, dribblesCompleted >= 10 ? 16 : 12);
	}

	if (Object.keys(feats).length === 0) {
		return { score: 0 };
	}
	if (g.get("phase") === PHASE.PLAYOFFS) {
		score += 10;
	}
	return { feats, score };
};

export default checkStatisticalFeat;
