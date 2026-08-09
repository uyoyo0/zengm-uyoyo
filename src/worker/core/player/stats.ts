import { bySport } from "../../../common/sportFunctions.ts";
import statsBaseball from "./stats.baseball.ts";
import statsBasketball from "./stats.basketball.ts";
import statsFootball from "./stats.football.ts";
import statsHockey from "./stats.hockey.ts";
import statsSoccer from "./stats.soccer.ts";

const stats = bySport<unknown>({
	baseball: statsBaseball,
	basketball: statsBasketball,
	football: statsFootball,
	hockey: statsHockey,
	soccer: statsSoccer,
}) as {
	derived: string[];
	max: string[];
	raw: string[];
	byPos?: string[];
};
export default stats;
