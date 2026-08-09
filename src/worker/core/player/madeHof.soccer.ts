import { g } from "../../util/index.ts";
import type { PlayerWithoutKey } from "../../../common/types.ts";

const madeHof = (p: PlayerWithoutKey) => {
	let score = 0;
	for (const stats of p.stats) {
		score += (stats.g ?? 0) * 3 + (stats.a ?? 0) * 2 + (stats.cs ?? 0) * 1.2 + (stats.gp ?? 0) * 0.08;
	}
	return score > 450 * g.get("hofFactor");
};

export default madeHof;
