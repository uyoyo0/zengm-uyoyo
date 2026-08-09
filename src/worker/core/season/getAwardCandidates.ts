import { bySport } from "../../../common/sportFunctions.ts";
import getAwardCandidatesBaseball from "./getAwardCandidates.baseball.ts";
import getAwardCandidatesBasketball from "./getAwardCandidates.basketball.ts";
import getAwardCandidatesFootball from "./getAwardCandidates.football.ts";
import getAwardCandidatesHockey from "./getAwardCandidates.hockey.ts";
import getAwardCandidatesSoccer from "./getAwardCandidates.soccer.ts";

const getAwardCandidates = (
	season: number,
): Promise<
	{
		asterisk?: string;
		name: string;
		players: any[];
		stats: string[];
	}[]
> => {
	return bySport({
		baseball: getAwardCandidatesBaseball(season),
		basketball: getAwardCandidatesBasketball(season),
		football: getAwardCandidatesFootball(season),
		hockey: getAwardCandidatesHockey(season),
		soccer: getAwardCandidatesSoccer(season),
	});
};

export default getAwardCandidates;
