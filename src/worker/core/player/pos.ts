import posBaseball from "./pos.baseball.ts";
import posBasketball from "./pos.basketball.ts";
import posFootball from "./pos.football.ts";
import posHockey from "./pos.hockey.ts";
import posSoccer from "./pos.soccer.ts";
import type { MinimalPlayerRatings } from "../../../common/types.ts";
import { bySport } from "../../../common/sportFunctions.ts";

const pos = (ratings: MinimalPlayerRatings) => {
	return bySport<(ratings: any) => string>({
		baseball: posBaseball,
		basketball: posBasketball,
		football: posFootball,
		hockey: posHockey,
		soccer: posSoccer,
	})(ratings as any);
};

export default pos;
