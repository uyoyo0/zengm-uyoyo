import { bySport } from "../../common/sportFunctions.ts";
import GameSimBaseball from "./GameSim.baseball/index.ts";
import GameSimBasketball from "./GameSim.basketball/index.ts";
import GameSimFootball from "./GameSim.football/index.ts";
import GameSimHockey from "./GameSim.hockey/index.ts";
import GameSimSoccer from "./GameSim.soccer/index.ts";

const GameSim = bySport<
	| typeof GameSimBaseball
	| typeof GameSimFootball
	| typeof GameSimBasketball
	| typeof GameSimHockey
	| typeof GameSimSoccer
>({
	baseball: GameSimBaseball,
	basketball: GameSimBasketball,
	football: GameSimFootball,
	hockey: GameSimHockey,
	soccer: GameSimSoccer,
});

export default GameSim;
