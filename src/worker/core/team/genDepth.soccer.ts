import { POSITIONS } from "../../../common/constants.soccer.ts";
import type { Player, Team } from "../../../common/types.ts";
import type { Position } from "../../../common/types.soccer.ts";
import { last } from "../../../common/utils.ts";

const genDepth = async (
	players: Player[],
	_initialDepth?: Team["depth"],
	_onlyNewPlayers?: boolean,
	_onlyPos?: Position,
) => {
	const depth = Object.fromEntries(POSITIONS.map((position) => [position, []])) as unknown as Record<Position, number[]>;
	for (const position of POSITIONS) {
		depth[position] = players
			.map((player) => ({
				pid: player.pid,
				value: last(player.ratings).ovrs?.[position] ?? 0,
			}))
			.toSorted((a, b) => b.value - a.value || b.pid - a.pid)
			.map((row) => row.pid);
	}
	return depth;
};

export default genDepth;
