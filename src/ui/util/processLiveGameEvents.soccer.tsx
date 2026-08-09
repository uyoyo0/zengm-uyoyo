let playersByPidGid: number | undefined;
let playersByPid: Record<number, any> = {};

const processLiveGameEventsSoccer = ({
	boxScore,
	events,
	overtimes,
	quarters,
}: {
	boxScore: any;
	events: any[];
	overtimes: number;
	quarters: any[];
}) => {
	if (boxScore.gid !== playersByPidGid || events[0]?.type === "init") {
		playersByPidGid = boxScore.gid;
		playersByPid = {};
		for (const team of boxScore.teams) {
			for (const p of team.players) {
				playersByPid[p.pid] = p;
				p.inGame = false;
			}
		}
	}

	let text;
	let t: 0 | 1 | undefined;
	let textOnly = false;
	let stop = false;

	while (!stop && events.length > 0) {
		const event = events.shift();
		if (!event) {continue;}
		const actualT = event.t === 0 ? 1 : event.t === 1 ? 0 : undefined;

		if (event.type === "init") {
			for (const [rawT, pids] of event.lineups.entries()) {
				const displayT = rawT === 0 ? 1 : 0;
				for (const p of boxScore.teams[displayT].players) {
					p.inGame = pids.includes(p.pid);
				}
			}
			boxScore.quarter = "First half";
			boxScore.quarterShort = "1H";
			boxScore.time = "0:00";
		} else if (event.type === "finalStats") {
			for (const [rawT, finalTeam] of event.teams.entries()) {
				const displayT = rawT === 0 ? 1 : 0;
				Object.assign(boxScore.teams[displayT], finalTeam.stat);
				for (const finalPlayer of finalTeam.players) {
					const p = playersByPid[finalPlayer.id];
					if (p) {Object.assign(p, finalPlayer.stat);}
				}
			}
		} else {
			t = actualT;
			if (typeof event.clock === "number") {
				const minute = 90 - event.clock;
				boxScore.time = `${minute}:00`;
				boxScore.quarter = minute <= 45 ? "First half" : "Second half";
				boxScore.quarterShort = minute <= 45 ? "1H" : "2H";
			}

			if (event.type === "goal" && actualT !== undefined) {
				const team = boxScore.teams[actualT];
				team.pts = (team.pts ?? 0) + 1;
				team.g = (team.g ?? 0) + 1;
				team.ptsQtrs ??= [0, 0];
				while (team.ptsQtrs.length < 2) {team.ptsQtrs.push(0);}
				team.ptsQtrs[event.quarter === 1 ? 0 : 1] += 1;
				const scorer = playersByPid[event.pids[0]];
				if (scorer) {scorer.g = (scorer.g ?? 0) + 1;}
				const assister = event.pids[1]
					? playersByPid[event.pids[1]]
					: undefined;
				if (assister) {assister.a = (assister.a ?? 0) + 1;}
				text = `${event.names[0]} scores${event.names[1] ? `, assisted by ${event.names[1]}` : ""}.`;
				boxScore.scoringSummary.push({ ...event, t: actualT });
			} else if (event.type === "substitution") {
				const incoming = playersByPid[event.pids[0]];
				const outgoing = playersByPid[event.pids[1]];
				if (incoming) {incoming.inGame = true;}
				if (outgoing) {outgoing.inGame = false;}
				text = `${event.names[0]} replaces ${event.names[1]}.`;
			} else if (event.type === "injury") {
				const p = playersByPid[event.pids[0]];
				if (p) {p.injury = { type: "Injured", gamesRemaining: -1 };}
				text = `${event.names[0]} is injured and cannot continue.`;
			} else if (event.type === "gameOver") {
				boxScore.gameOver = true;
				boxScore.time = "90:00";
				text = "Full time";
				textOnly = true;
			}
			stop = text !== undefined;
		}
	}

	return { overtimes, quarters, t, text, textOnly };
};

export default processLiveGameEventsSoccer;
