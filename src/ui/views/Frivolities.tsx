import { Fragment } from "react";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";
import type {
	MenuItemHeader,
	MenuItemLink,
	MenuItemText,
} from "../../common/types.ts";
import { GAME_NAME } from "../../common/constants.ts";
import { isSport } from "../../common/sportFunctions.ts";

const style = { maxWidth: 1000 };

type Frivolity = {
	urlParts: string[];
	name: string;
	description: string;
};

export const frivolities: Record<string, Frivolity[]> = {
	Draft: [
		{
			urlParts: ["draft_position"],
			name: "Best Player at Every Pick",
			description:
				"The best player ever drafted at each position in the draft.",
		},
		{
			urlParts: ["most", "busts"],
			name: "Biggest Busts",
			description: "Top 5 picks with the worst careers.",
		},
		{
			urlParts: ["most", "steals"],
			name: "Biggest Steals",
			description: "Late picks or undrafted players with the best careers.",
		},
		{
			urlParts: ["draft_classes"],
			name: "Draft Class Rankings",
			description: "All draft classes, ranked from best to worst.",
		},
	],
	"Player Bios": [
		{
			urlParts: ["colleges"],
			name: "Colleges",
			description:
				"See which colleges have had the most successful pro players.",
		},
		{
			urlParts: ["countries"],
			name: "Countries",
			description:
				"See which countries have had the most successful pro players.",
		},
		{
			urlParts: ["jersey_numbers"],
			name: "Jersey Numbers",
			description:
				"See which jersey numbers have been used by the most successful pro players.",
		},
		{
			urlParts: ["relatives"],
			name: "Relatives",
			description: "See the family relationships between players.",
		},
		{
			urlParts: ["tragic_deaths"],
			name: "Tragic Deaths",
			description:
				"View all the tragic deaths that have occurred in your league.",
		},
	],
	Teams: [
		{
			urlParts: ["roster_continuity"],
			name: "Roster Continuity",
			description:
				"Color-coded visualization of year-to-year changes in roster.",
		},
		{
			urlParts: ["teams", "best"],
			name: "Best Teams",
			description: "The greatest seasons of all time.",
		},
		{
			urlParts: ["teams", "worst"],
			name: "Worst Teams",
			description: "The worst seasons of all time.",
		},
		{
			urlParts: ["teams", "best_non_playoff"],
			name: "Best Non-Playoff Teams",
			description: "The best seasons from teams that missed the playoffs.",
		},
		{
			urlParts: ["teams", "worst_playoff"],
			name: "Worst Playoff Teams",
			description: "The worst seasons from teams that made the playoffs.",
		},
		{
			urlParts: ["teams", "worst_finals"],
			name: "Worst Finals Teams",
			description: "The worst seasons from teams that made the finals.",
		},
		{
			urlParts: ["teams", "worst_champ"],
			name: "Worst Championship Teams",
			description: "The worst seasons from teams that won the title.",
		},
		{
			urlParts: ["teams", "old_champ"],
			name: "Oldest Championship Teams",
			description: "The oldest teams that won the title.",
		},
		{
			urlParts: ["teams", "young_champ"],
			name: "Youngest Championship Teams",
			description: "The youngest teams that won the title.",
		},
	],
	Trades: [
		{
			urlParts: ["trades", "biggest"],
			name: "Biggest Trades",
			description: "Trades involving the best players and prospects.",
		},
		{
			urlParts: ["trades", "lopsided"],
			name: "Most Lopsided Trades",
			description:
				"Trades where one team's assets produced a lot more value than the other.",
		},
	],
	...(isSport("basketball")
		? {
				Lineups: [
					{
						urlParts: ["lineups", "best"],
						name: "Best Lineups",
						description:
							"The 5-man units with the highest single-season net rating.",
					},
					{
						urlParts: ["lineups", "duos"],
						name: "Best Duos",
						description:
							"The two-man combos with the highest career net rating together.",
					},
					{
						urlParts: ["lineups", "duos_season"],
						name: "Best Single-Season Duos",
						description:
							"The two-man combos with the highest net rating together in one season.",
					},
					{
						urlParts: ["lineups", "trios"],
						name: "Best Trios",
						description:
							"The three-man combos with the highest career net rating together.",
					},
					{
						urlParts: ["lineups", "duos_minutes"],
						name: "Most Minutes Together",
						description:
							"The two-man combos who spent the most career minutes on the floor together.",
					},
					{
						urlParts: ["lineups", "most_used"],
						name: "Most Used Lineups",
						description:
							"The 5-man units that played the most minutes together in a season.",
					},
					{
						urlParts: ["lineups", "on_off"],
						name: "On/Off Kings",
						description:
							"The biggest gaps between a team's net rating with a player on vs off the floor.",
					},
					{
						urlParts: ["lineups", "worst"],
						name: "Worst Lineups",
						description:
							"The 5-man units with the worst single-season net rating.",
					},
				],
				Coaches: [
					{
						urlParts: ["coaches", "best_seasons"],
						name: "Best Coaching Seasons",
						description:
							"The single seasons where a coach most outperformed the roster's expected wins.",
					},
					{
						urlParts: ["coaches", "no_ring"],
						name: "Best Coaches Without a Ring",
						description:
							"The winningest coaches who never won a championship.",
					},
					{
						urlParts: ["coaches", "ex_players"],
						name: "Ex-Player Coaches",
						description:
							"Former players who went on to the best coaching careers.",
					},
					{
						urlParts: ["coaches", "journeymen"],
						name: "Journeymen",
						description:
							"Coaches who worked the sidelines for the most teams.",
					},
					{
						urlParts: ["coaches", "lifers"],
						name: "Lifers",
						description:
							"Coaches with the most seasons coaching a single team.",
					},
					{
						urlParts: ["coaches", "overachievers"],
						name: "Miracle Workers",
						description:
							"Coaches whose teams won the most games above their talent-based expectation.",
					},
					{
						urlParts: ["coaches", "underachievers"],
						name: "Underachievers",
						description:
							"Coaches whose teams fell furthest short of their talent-based expectation.",
					},
					{
						urlParts: ["coaches", "worst_seasons"],
						name: "Worst Coaching Seasons",
						description:
							"The single seasons where a coach most underperformed the roster's expected wins.",
					},
				],
			}
		: {}),
	"Player Rankings": [
		{
			urlParts: ["most", "cut_short"],
			name: "Best Careers Cut Short",
			description:
				"The highest peaks from careers that lasted 5 seasons or fewer.",
		},
		{
			urlParts: ["most", "no_ring"],
			name: "Best Players Without a Ring",
			description: "The best players who never won a title.",
		},
		{
			urlParts: ["most", "no_mvp"],
			name: "Best Players Without an MVP",
			description: "The best players who never won an MVP award.",
		},
		{
			urlParts: ["most", "progs"],
			name: "Best Progs",
			description: "Largest single season ovr increases.",
		},
		{
			urlParts: ["most", "rookies"],
			name: "Best Rookies",
			description: "The best rookie seasons.",
		},
		{
			urlParts: ["most", "earnings"],
			name: "Career Earnings",
			description: "Players who made the most money.",
		},
		{
			urlParts: ["most", "progs_career"],
			name: "Career Progs",
			description: "The biggest improvements from draft prospect to peak.",
		},
		{
			urlParts: ["most", "goat"],
			name: "GOAT Lab",
			description:
				"Define your own formula to rank the greatest players of all time.",
		},
		{
			urlParts: ["most", "goat_season"],
			name: "GOAT Season",
			description:
				"Define your own formula to rank the greatest seasons of all time.",
		},
		{
			urlParts: ["most", "good_stats_bad_team"],
			name: "Good Stats, Bad Teams",
			description:
				"The players who produced the most while stuck on sub-.400 teams.",
		},
		{
			urlParts: ["most", "hall_of_good"],
			name: "Hall of Good",
			description: "The best retired players who didn't make the Hall of Fame.",
		},
		...(isSport("basketball")
			? [
					{
						urlParts: ["most", "hall_of_shame"],
						name: "Hall of Shame",
						description:
							"Worst players who actually got some playing time to show how bad they are.",
					},
				]
			: []),
		{
			urlParts: ["most", "iron_man"],
			name: "Iron Men",
			description:
				"The players who played the most career games without ever getting injured.",
		},
		{
			urlParts: ["most", "late_bloomers"],
			name: "Late Bloomers",
			description: "The oldest players to make their first All-Star team.",
		},
		...(isSport("basketball")
			? [
					{
						urlParts: ["most", "clutch"],
						name: "Most Clutch",
						description:
							"The players who scored the most career clutch points.",
					},
					{
						urlParts: ["most", "most_popular"],
						name: "Most Popular",
						description:
							"The players who reached the highest peak popularity with the fans.",
					},
				]
			: []),
		{
			urlParts: ["most", "games_injured"],
			name: "Most Games Injured",
			description: "Players with the most total games missed due to injury.",
		},
		{
			urlParts: ["most", "games_no_playoffs"],
			name: "Most Games, No Playoffs",
			description:
				"See the most accomplished players who never made the playoffs.",
		},
		{
			urlParts: ["most", "retired_jersey_numbers"],
			name: "Most Retired Jersey Numbers",
			description:
				"See the players who have the most different jerseys retired.",
		},
		{
			urlParts: ["most", "rings"],
			name: "Most Rings",
			description: "The players who won the most championships.",
		},
		{
			urlParts: ["most", "teams"],
			name: "Most Teams",
			description:
				"See the players who played for the largest number of teams.",
		},
		{
			urlParts: ["most", "traded"],
			name: "Most Times Traded",
			description:
				"Players who were passed around like... you fill in the blank.",
		},
		{
			urlParts: ["most", "one_team"],
			name: "Most Years on One Team",
			description: "Players who were loyal to one team for the longest.",
		},
		{
			urlParts: ["most", "oldest_former_players"],
			name: "Oldest Former Players",
			description: `As in reality, players die in ${GAME_NAME}, even after their careers end. See who made it the longest.`,
		},
		{
			urlParts: ["most", "oldest"],
			name: "Oldest to Play in a Game",
			description: "The oldest players who actually played.",
		},
		{
			urlParts: ["most", "oldest_mvp"],
			name: "Oldest MVPs",
			description: "The oldest players who won an MVP award.",
		},
		{
			urlParts: ["most", "oldest_peaks"],
			name: "Oldest Peaks",
			description: "The players who were the oldest when they peaked in ovr.",
		},
		{
			urlParts: ["most", "playoff_legends"],
			name: "Playoff Legends",
			description: "The players with the most valuable playoff careers.",
		},
		{
			urlParts: ["most", "youngest_mvp"],
			name: "Youngest MVPs",
			description: "The youngest players who won an MVP award.",
		},
		{
			urlParts: ["most", "youngest_peaks"],
			name: "Youngest Peaks",
			description: "The players who were the youngest when they peaked in ovr.",
		},
		{
			urlParts: ["most", "worst_injuries"],
			name: "Worst Injuries",
			description:
				"Players who experienced the largest ovr declines due to injuries.",
		},
	],
};

const children: (MenuItemLink | MenuItemText)[] = [];
for (const [name, array] of Object.entries(frivolities)) {
	children.push({
		type: "text",
		text: name,
	});

	for (const frivolitiy of array) {
		children.push({
			type: "link",
			league: true,
			path: ["frivolities", ...frivolitiy.urlParts],
			text: frivolitiy.name,
		});
	}
}

export const frivolitiesMenu: MenuItemHeader = {
	type: "header",
	long: "Frivolities",
	short: "Frivolities",
	league: true,
	children,
};

const Frivolities = () => {
	useTitleBar({
		title: "Frivolities",
		customMenu: frivolitiesMenu,
	});

	const columns: (keyof typeof frivolities)[][] = [
		["Draft", "Player Bios", "Teams", "Trades"],
		[
			...(isSport("basketball") ? ["Coaches", "Lineups"] : []),
			"Player Rankings",
		],
	];

	return (
		<>
			<p>
				In the spirit of{" "}
				<a href="https://www.basketball-reference.com/friv/">
					Basketball Reference
				</a>
				, here is some fun stuff.
			</p>

			<p>
				<span className="text-danger">Warning:</span> most of these will be slow
				if you've played hundreds of seasons in this league.
			</p>

			<div className="row" style={style}>
				{columns.map((categories, i) => (
					<div
						key={i}
						className={`col-12 col-md-6${i > 0 ? " mt-3 mt-md-0" : ""}`}
					>
						{categories.map((category, i) => (
							<Fragment key={category}>
								<h3 className={`ms-1${i > 0 ? " mt-3" : ""}`}>{category}</h3>
								<div className="list-group">
									{(frivolities[category] ?? []).map((frivolity) => (
										<a
											key={frivolity.name}
											href={helpers.leagueUrl([
												"frivolities",
												...frivolity.urlParts,
											])}
											className="list-group-item list-group-item-action"
										>
											<h3 className="mb-1">{frivolity.name}</h3>
											<p className="mb-1">{frivolity.description}</p>
										</a>
									))}
								</div>
							</Fragment>
						))}
					</div>
				))}
			</div>
		</>
	);
};

export default Frivolities;
