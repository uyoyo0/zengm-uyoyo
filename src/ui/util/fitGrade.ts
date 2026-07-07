// Letter grade for a philosophyFit value (0..1): how well one style suits
// another (coach vs roster on the Coaches page, player vs system on the
// Roster page). The C band (0.74-0.82) matches FIT_NEUTRAL in
// coachingConstants, so grade colors and mood/development signs agree.
export const fitGrade = (fit: number) => {
	if (fit >= 0.9) {
		return "A";
	}
	if (fit >= 0.82) {
		return "B";
	}
	if (fit >= 0.74) {
		return "C";
	}
	if (fit >= 0.66) {
		return "D";
	}
	return "F";
};

export const fitClass = (grade: string) =>
	grade === "A" || grade === "B"
		? "text-success"
		: grade === "D"
			? "text-warning"
			: grade === "F"
				? "text-danger"
				: undefined;
