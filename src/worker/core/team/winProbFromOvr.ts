// Convert a team-ovr difference (teamA.ovr - teamB.ovr, on the 0-100 scale) into
// team A's win probability. Logistic, calibrated against the sim by
// winProbFromOvr.test.ts (clone rosters at known ovr gaps, many games, fit the
// logit slope). Measured points: ~7 ovr -> ~58%, ~17 -> ~67%, ~32 -> ~74%,
// ~52 -> ~90%. Re-run that harness before changing this.
const OVR_WINP_SCALE = 25;

const winProbFromOvr = (ovrDiff: number): number => {
	return 1 / (1 + Math.exp(-ovrDiff / OVR_WINP_SCALE));
};

export default winProbFromOvr;
