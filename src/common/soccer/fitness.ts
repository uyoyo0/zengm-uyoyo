export const recoverSoccerFitness = ({
	day,
	endurance,
	fitness = 1,
	lastMatchDay,
}: {
	day: number | undefined;
	endurance: number;
	fitness?: number;
	lastMatchDay: number | undefined;
}) => {
	if (day === undefined || lastMatchDay === undefined) {
		return fitness;
	}
	const restDays = Math.max(0, day - lastMatchDay - 1);
	const recoveryPerDay = 0.065 + endurance * 0.025;
	return Math.max(0.35, Math.min(1, fitness + restDays * recoveryPerDay));
};
