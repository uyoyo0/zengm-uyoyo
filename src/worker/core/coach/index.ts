import generate from "./generate.ts";
import fromPlayer from "./fromPlayer.ts";
import ovr from "./ovr.ts";
import genContract from "./genContract.ts";
import genPhilosophy from "./genPhilosophy.ts";
import ensureCoaches from "./ensureCoaches.ts";
import updateTeamCoaching from "./updateTeamCoaching.ts";
import hire from "./hire.ts";
import fire from "./fire.ts";
import processCoachMarket, {
	coachDemand,
	philosophyFit,
	scoreCandidate,
} from "./market.ts";
import developCoach from "./develop.ts";
import { availabilityAdjust, matchupAdjust, opponentProfile } from "./style.ts";

export default {
	generate,
	fromPlayer,
	ovr,
	genContract,
	genPhilosophy,
	ensureCoaches,
	updateTeamCoaching,
	hire,
	fire,
	processCoachMarket,
	coachDemand,
	philosophyFit,
	scoreCandidate,
	developCoach,
	availabilityAdjust,
	matchupAdjust,
	opponentProfile,
};
