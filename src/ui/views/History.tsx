import { bySport } from "../../common/sportFunctions.ts";
import HistoryBaseball from "./History.baseball/index.tsx";
import HistoryBasketball from "./History.basketball/index.tsx";
import HistoryFootball from "./History.football/index.tsx";
import HistoryHockey from "./History.hockey/index.tsx";
import HistorySoccer from "./History.soccer/index.tsx";

const History = bySport({
	baseball: HistoryBaseball,
	basketball: HistoryBasketball,
	football: HistoryFootball,
	hockey: HistoryHockey,
	soccer: HistorySoccer,
});

export default History;
