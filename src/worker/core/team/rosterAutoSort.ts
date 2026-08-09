import { bySport } from "../../../common/sportFunctions.ts";
import rosterAutoSortBaseball from "./rosterAutoSort.baseball.ts";
import rosterAutoSortBasketball from "./rosterAutoSort.basketball.ts";
import rosterAutoSortFootball from "./rosterAutoSort.football.ts";
import rosterAutoSortHockey from "./rosterAutoSort.hockey.ts";
import rosterAutoSortSoccer from "./rosterAutoSort.soccer.ts";

const rosterAutoSort = async (
	tid: number,
	onlyNewPlayers?: boolean,
	pos?: string,
) => {
	await bySport<any>({
		baseball: rosterAutoSortBaseball,
		basketball: rosterAutoSortBasketball,
		football: rosterAutoSortFootball,
		hockey: rosterAutoSortHockey,
		soccer: rosterAutoSortSoccer,
	})(tid, onlyNewPlayers, pos as any);
};

export default rosterAutoSort;
