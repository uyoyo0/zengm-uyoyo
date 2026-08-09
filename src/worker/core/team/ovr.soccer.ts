import { FORMATIONS } from "../../../common/constants.soccer.ts";

const ovr = (
	players: {
		value: number;
		ratings: { ovr: number; ovrs?: Record<string, number>; pos: string };
	}[],
	options: { onlyPos?: string; wholeRoster?: boolean } = {},
) => {
	if (options.onlyPos) {
		const values = players
			.map((player) => player.ratings.ovrs?.[options.onlyPos!] ?? 0)
			.toSorted((a, b) => b - a);
		return values.slice(0, 2).reduce((sum, value) => sum + value, 0);
	}
	if (options.wholeRoster) {
		return players.reduce((sum, player) => sum + player.value, 0);
	}

	const remaining = [...players];
	const selected: number[] = [];
	for (const slot of FORMATIONS["4-3-3"]) {
		let bestIndex = -1;
		let best = -Infinity;
		for (let i = 0; i < remaining.length; i++) {
			const value = remaining[i]!.ratings.ovrs?.[slot] ?? remaining[i]!.ratings.ovr;
			if (value > best) {
				best = value;
				bestIndex = i;
			}
		}
		if (bestIndex >= 0) {
			selected.push(best);
			remaining.splice(bestIndex, 1);
		} else {
			selected.push(0);
		}
	}
	const average = selected.reduce((sum, value) => sum + value, 0) / selected.length;
	const bench = remaining
		.map((player) => player.ratings.ovr)
		.toSorted((a, b) => b - a)
		.slice(0, 5);
	const benchAverage = bench.length > 0 ? bench.reduce((sum, value) => sum + value, 0) / bench.length : 0;
	return Math.round(average * 0.9 + benchAverage * 0.1);
};

export default ovr;
