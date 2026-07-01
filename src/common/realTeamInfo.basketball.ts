import type { RealTeamInfo } from "./types.ts";

// Real NBA names for "Real Players" / "Legends" leagues, keyed by Sports
// Reference franchise id (srID). Used as the default when the user hasn't pasted
// their own real-team-info JSON in Settings → Real Data (see
// worker/core/league/create/getRealTeamPlayerData.ts).
//
// Region + name only — logos already resolve from the local
// /img/logos-primary/{abbrev}.svg files that the roster data points at.
//
// These are applied at the root level (all seasons), so historical/legends
// seasons show the current franchise name (e.g. a 2005 Seattle team shows as
// Oklahoma City Thunder). Per-season accuracy would require `seasons` entries.
const realTeamInfo: RealTeamInfo = {
	ATL: { region: "Atlanta", name: "Hawks" },
	BOS: { region: "Boston", name: "Celtics" },
	BRK: { region: "Brooklyn", name: "Nets" },
	CHO: { region: "Charlotte", name: "Hornets" },
	CHI: { region: "Chicago", name: "Bulls" },
	CLE: { region: "Cleveland", name: "Cavaliers" },
	DAL: { region: "Dallas", name: "Mavericks" },
	DEN: { region: "Denver", name: "Nuggets" },
	DET: { region: "Detroit", name: "Pistons" },
	GSW: { region: "Golden State", name: "Warriors" },
	HOU: { region: "Houston", name: "Rockets" },
	IND: { region: "Indiana", name: "Pacers" },
	LAC: { region: "Los Angeles", name: "Clippers" },
	LAL: { region: "Los Angeles", name: "Lakers" },
	MEM: { region: "Memphis", name: "Grizzlies" },
	MIA: { region: "Miami", name: "Heat" },
	MIL: { region: "Milwaukee", name: "Bucks" },
	MIN: { region: "Minnesota", name: "Timberwolves" },
	NOP: { region: "New Orleans", name: "Pelicans" },
	NYK: { region: "New York", name: "Knicks" },
	OKC: { region: "Oklahoma City", name: "Thunder" },
	ORL: { region: "Orlando", name: "Magic" },
	PHI: { region: "Philadelphia", name: "76ers" },
	PHO: { region: "Phoenix", name: "Suns" },
	POR: { region: "Portland", name: "Trail Blazers" },
	SAC: { region: "Sacramento", name: "Kings" },
	SAS: { region: "San Antonio", name: "Spurs" },
	TOR: { region: "Toronto", name: "Raptors" },
	UTA: { region: "Utah", name: "Jazz" },
	WAS: { region: "Washington", name: "Wizards" },
};

export default realTeamInfo;
