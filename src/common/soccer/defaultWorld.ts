import type { TeamBasic } from "../types.ts";

const clubs = [
	["Arsenal", "ARS", ["#ef0107", "#ffffff", "#063672"], 9.0],
	["Aston Villa", "AVL", ["#670e36", "#95bfe5", "#f9e32d"], 3.2],
	["Bournemouth", "BOU", ["#da291c", "#000000", "#ffffff"], 1.8],
	["Brentford", "BRE", ["#e30613", "#ffffff", "#1d1d1b"], 1.8],
	["Brighton & Hove Albion", "BHA", ["#0057b8", "#ffffff", "#ffcd00"], 2.1],
	["Chelsea", "CHE", ["#034694", "#ffffff", "#dbd7d2"], 8.2],
	["Coventry City", "COV", ["#69b3e7", "#ffffff", "#1b365d"], 1.7],
	["Crystal Palace", "CRY", ["#1b458f", "#c4122e", "#ffffff"], 2.2],
	["Everton", "EVE", ["#003399", "#ffffff", "#ffed00"], 3.5],
	["Fulham", "FUL", ["#ffffff", "#000000", "#cc0000"], 2.4],
	["Hull City", "HUL", ["#f5a12d", "#000000", "#ffffff"], 1.6],
	["Ipswich Town", "IPS", ["#3a64a3", "#ffffff", "#e31b23"], 1.7],
	["Leeds United", "LEE", ["#ffffff", "#1d428a", "#ffcd00"], 3.8],
	["Liverpool", "LIV", ["#c8102e", "#00b2a9", "#f6eb61"], 8.9],
	["Manchester City", "MCI", ["#6cabdd", "#ffffff", "#1c2c5b"], 8.8],
	["Manchester United", "MUN", ["#da291c", "#fbe122", "#000000"], 9.2],
	["Newcastle United", "NEW", ["#241f20", "#ffffff", "#41b6e6"], 3.8],
	["Nottingham Forest", "NFO", ["#e53233", "#ffffff", "#000000"], 2.1],
	["Sunderland", "SUN", ["#eb172b", "#ffffff", "#211e1f"], 2.3],
	["Tottenham Hotspur", "TOT", ["#ffffff", "#132257", "#00a6d6"], 7.1],
] as const;

export const getSoccerTeamsDefault = (): TeamBasic[] =>
	clubs.map(([name, abbrev, colors, pop], tid) => ({
		tid,
		cid: 0,
		did: 0,
		region: "",
		name,
		abbrev,
		pop,
		colors: [...colors],
		jersey: "soccer",
		imgURL: `/img/logos-primary/${abbrev}.png`,
		imgURLSmall: `/img/logos-primary/${abbrev}.png`,
	}));
