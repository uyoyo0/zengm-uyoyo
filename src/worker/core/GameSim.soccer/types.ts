import type { PlayerInjury, SoccerTactics } from "../../../common/types.ts";

export type PlayerGameSim = {
	id: number;
	name: string;
	pos: string;
	stat: Record<string, number>;
	compositeRating: Record<string, number>;
	ovrs: Record<string, number>;
	injured: boolean;
	injury: PlayerInjury & { playingThrough: boolean };
};

export type TeamGameSim = {
	id: number;
	stat: Record<string, any>;
	player: PlayerGameSim[];
	soccerTactics?: SoccerTactics;
};
