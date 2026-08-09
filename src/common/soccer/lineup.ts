export type SoccerLineupCandidate = {
	id: number;
	naturalPosition: string;
	overall?: number;
	positionRatings: Record<string, number>;
	availability?: number;
};

const relatedPositionGroups = [
	["CB", "LB", "RB", "DM"],
	["DM", "CM", "AM"],
	["AM", "LW", "RW", "ST"],
];

/**
 * Position ratings already contain most of the information needed to judge a
 * player in a role. This small familiarity adjustment breaks close calls in
 * favor of sensible assignments without making emergency cover impossible.
 */
export const getSoccerPositionFamiliarity = (
	naturalPosition: string,
	slot: string,
) => {
	if (naturalPosition === slot) {
		return 8;
	}
	if (naturalPosition === "GK" || slot === "GK") {
		return -50;
	}
	if (
		(naturalPosition === "LB" && slot === "RB") ||
		(naturalPosition === "RB" && slot === "LB") ||
		(naturalPosition === "LW" && slot === "RW") ||
		(naturalPosition === "RW" && slot === "LW")
	) {
		return 4;
	}
	if (
		relatedPositionGroups.some(
			(group) => group.includes(naturalPosition) && group.includes(slot),
		)
	) {
		return 0;
	}
	return -12;
};

const bitCount = (value: number) => {
	let count = 0;
	while (value !== 0) {
		value &= value - 1;
		count += 1;
	}
	return count;
};

type LineupState = {
	assignments: number[];
	score: number;
};

/**
 * Finds the best assignment for the entire formation at once. `locked` is
 * indexed by formation slot, so a missing left back never causes the striker
 * and every player after them to slide into the wrong position.
 */
export const optimizeSoccerLineup = ({
	candidates,
	locked,
	slots,
}: {
	candidates: SoccerLineupCandidate[];
	locked?: readonly number[];
	slots: readonly string[];
}) => {
	const lineup = slots.map(() => -1);
	const byId = new Map(
		candidates.map((candidate) => [candidate.id, candidate]),
	);
	const used = new Set<number>();
	const openSlotIndexes: number[] = [];

	for (let index = 0; index < slots.length; index++) {
		const id = locked?.[index];
		if (id !== undefined && id >= 0 && byId.has(id) && !used.has(id)) {
			lineup[index] = id;
			used.add(id);
		} else {
			openSlotIndexes.push(index);
		}
	}

	if (openSlotIndexes.length === 0) {
		return lineup;
	}

	const available = candidates.filter((candidate) => !used.has(candidate.id));
	let states = new Map<number, LineupState>([
		[0, { assignments: openSlotIndexes.map(() => -1), score: 0 }],
	]);

	for (const [candidateIndex, candidate] of available.entries()) {
		const next = new Map(states);
		for (const [mask, state] of states) {
			for (let openIndex = 0; openIndex < openSlotIndexes.length; openIndex++) {
				const bit = 1 << openIndex;
				if ((mask & bit) !== 0) {
					continue;
				}
				const slot = slots[openSlotIndexes[openIndex]!]!;
				const positionRating =
					candidate.positionRatings[slot] ?? candidate.overall ?? 0;
				const score =
					state.score +
					positionRating * (candidate.availability ?? 1) +
					getSoccerPositionFamiliarity(candidate.naturalPosition, slot) -
					candidateIndex * 0.000001;
				const newMask = mask | bit;
				const previous = next.get(newMask);
				if (!previous || score > previous.score) {
					const assignments = [...state.assignments];
					assignments[openIndex] = candidate.id;
					next.set(newMask, { assignments, score });
				}
			}
		}
		states = next;
	}

	const fullMask = (1 << openSlotIndexes.length) - 1;
	let best = states.get(fullMask);
	if (!best) {
		let bestMask = 0;
		for (const [mask, state] of states) {
			if (
				bitCount(mask) > bitCount(bestMask) ||
				(bitCount(mask) === bitCount(bestMask) &&
					(!best || state.score > best.score))
			) {
				bestMask = mask;
				best = state;
			}
		}
	}

	if (best) {
		for (let openIndex = 0; openIndex < openSlotIndexes.length; openIndex++) {
			lineup[openSlotIndexes[openIndex]!] = best.assignments[openIndex] ?? -1;
		}
	}
	return lineup;
};

export const removePlayerFromSoccerLineup = (
	lineup: readonly number[],
	pid: number,
) => lineup.map((candidatePid) => (candidatePid === pid ? -1 : candidatePid));
