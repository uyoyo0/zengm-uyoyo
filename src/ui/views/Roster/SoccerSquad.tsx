import { FORMATIONS } from "../../../common/constants.soccer.ts";
import type { SoccerTactics, View } from "../../../common/types.ts";
import { helpers } from "../../util/helpers.ts";
import { dialLabels, dialNames, formationRows } from "./soccerTacticsUi.ts";
import { normalizeSoccerTactics } from "../../../common/soccer/tactics.ts";
import { optimizeSoccerLineup } from "../../../common/soccer/lineup.ts";

type RosterPlayer = View<"roster">["players"][number];

const getLineup = (players: RosterPlayer[], tactics: SoccerTactics) => {
	const slots = FORMATIONS[tactics.formation];
	const byPid = new Map(players.map((player) => [player.pid, player]));
	const lineup = optimizeSoccerLineup({
		candidates: players.map((player) => ({
			id: player.pid,
			naturalPosition: player.ratings.pos,
			overall: player.ratings.ovr,
			positionRatings: player.ratings.ovrs ?? {},
		})),
		locked: tactics.starting,
		slots,
	});
	return lineup.map((pid) => byPid.get(pid));
};

const PlayerTile = ({
	duty,
	player,
	showRatings,
	slot,
}: {
	duty: SoccerTactics["duties"][number] | undefined;
	player: RosterPlayer | undefined;
	showRatings: boolean;
	slot: string;
}) => (
	<div className="soccer-player-slot px-1 text-center">
		{player ? (
			<a
				className={`soccer-player-card${player.injury.gamesRemaining ? " is-injured" : ""}`}
				href={helpers.leagueUrl(["player", player.pid])}
				title={`${player.firstName} ${player.lastName}${duty ? ` · ${duty}` : ""}`}
			>
				<span className="soccer-player-card-meta">
					<span>{slot}</span>
					{duty ? <span className="soccer-player-duty">{duty[0]}</span> : null}
					{showRatings ? (
						<span className="soccer-player-rating">
							{player.ratings.ovrs?.[slot] ?? player.ratings.ovr}
						</span>
					) : null}
				</span>
				<span className="soccer-player-name">
					{player.firstNameShort ?? player.firstName} {player.lastName}
				</span>
				{player.injury.gamesRemaining ? (
					<span className="soccer-player-injury">Injured</span>
				) : (player as any).soccerFitness < 0.98 ? (
					<span className="soccer-player-injury">
						Fit {Math.round((player as any).soccerFitness * 100)}%
					</span>
				) : null}
			</a>
		) : (
			<div className="soccer-player-card is-empty">
				<span className="soccer-player-card-meta">{slot}</span>
				<span className="soccer-player-name">Open slot</span>
			</div>
		)}
	</div>
);

const Pitch = ({
	lineup,
	showRatings,
	tactics,
}: {
	lineup: (RosterPlayer | undefined)[];
	showRatings: boolean;
	tactics: SoccerTactics;
}) => {
	const slots = FORMATIONS[tactics.formation];

	return (
		<div className="soccer-pitch position-relative overflow-hidden rounded-3">
			<div
				className="position-absolute start-0 end-0 border-top border-light border-opacity-25"
				style={{ top: "50%" }}
			/>
			<div
				className="position-absolute top-50 start-50 translate-middle rounded-circle border border-light border-opacity-25"
				style={{ width: 104, height: 104 }}
			/>
			<div
				className="position-absolute start-50 translate-middle-x border border-top-0 border-light border-opacity-25"
				style={{ top: 0, width: "44%", height: "15%" }}
			/>
			<div
				className="position-absolute bottom-0 start-50 translate-middle-x border border-bottom-0 border-light border-opacity-25"
				style={{ width: "44%", height: "15%" }}
			/>
			<div className="soccer-pitch-lineup position-relative d-flex flex-column justify-content-around py-3">
				{formationRows[tactics.formation].map((row, rowIndex) => (
					<div
						className="d-flex justify-content-evenly align-items-center px-2"
						key={rowIndex}
					>
						{row.map((index) => (
							<PlayerTile
								duty={
									lineup[index] ? tactics.duties[lineup[index]!.pid] : undefined
								}
								key={`${slots[index]}-${index}`}
								player={lineup[index]}
								showRatings={showRatings}
								slot={slots[index]!}
							/>
						))}
					</div>
				))}
			</div>
		</div>
	);
};

const SoccerSquad = ({
	canEdit,
	players,
	showRatings,
	tactics,
}: {
	canEdit: boolean;
	players: RosterPlayer[];
	showRatings: boolean;
	tactics?: SoccerTactics;
}) => {
	const tactics2 = normalizeSoccerTactics(tactics);
	const lineup = getLineup(players, tactics2);
	const starters = new Set(
		lineup.flatMap((player) => (player ? [player.pid] : [])),
	);
	const byPid = new Map(players.map((player) => [player.pid, player]));
	const bench = [
		...tactics2.bench.map((pid) => byPid.get(pid)),
		...players
			.filter(
				(player) =>
					!starters.has(player.pid) && !tactics2.bench.includes(player.pid),
			)
			.toSorted((a, b) => b.ratings.ovr - a.ratings.ovr),
	]
		.filter((player): player is RosterPlayer => player !== undefined)
		.filter((player) => !starters.has(player.pid))
		.slice(0, 9);

	return (
		<section className="card soccer-squad mb-4 overflow-hidden">
			<div className="card-header soccer-squad-header d-flex flex-wrap align-items-center justify-content-between gap-2 px-3 py-2">
				<div>
					<div className="d-flex align-items-center gap-2">
						<h2 className="h5 mb-0">Starting XI</h2>
						<span className="badge text-bg-secondary">
							{tactics2.formation}
						</span>
					</div>
					<div className="small text-body-secondary">
						Matchday squad · {lineup.filter(Boolean).length} selected
					</div>
				</div>
				{canEdit ? (
					<a
						className="btn btn-outline-primary btn-sm"
						href={helpers.leagueUrl(["tactics"])}
					>
						Edit formation & tactics
					</a>
				) : null}
			</div>
			<div className="row g-0">
				<div className="col-12 col-xl-8 p-2 p-md-3">
					<Pitch lineup={lineup} showRatings={showRatings} tactics={tactics2} />
				</div>
				<div className="soccer-squad-sidebar col-12 col-xl-4 p-3">
					<h3 className="soccer-section-heading">Team approach</h3>
					<div className="row g-2 mb-4">
						{Object.keys(dialLabels).map((key) => {
							const dial = key as keyof typeof dialLabels;
							return (
								<div className="col-6" key={dial}>
									<div className="soccer-tactic-card">
										<span>{dialNames[dial]}</span>
										<strong
											className={tactics2[dial] === 0 ? "" : "text-primary"}
										>
											{dialLabels[dial][tactics2[dial] + 2]}
										</strong>
									</div>
								</div>
							);
						})}
					</div>

					<div className="d-flex align-items-center justify-content-between mb-2">
						<h3 className="soccer-section-heading mb-0">Substitutes</h3>
						<span className="small text-body-secondary">
							{bench.length} selected
						</span>
					</div>
					<div className="row g-2">
						{bench.map((player) => (
							<div
								className="col-12 col-sm-6 col-xl-12 col-xxl-6"
								key={player.pid}
							>
								<a
									className={`soccer-bench-card${player.injury.gamesRemaining ? " is-injured" : ""}`}
									href={helpers.leagueUrl(["player", player.pid])}
								>
									<span className="soccer-bench-pos">{player.ratings.pos}</span>
									<span className="soccer-bench-name">
										{player.firstNameShort ?? player.firstName}{" "}
										{player.lastName}
									</span>
									{player.injury.gamesRemaining ? (
										<span className="text-danger small">Inj</span>
									) : (player as any).soccerFitness < 0.98 ? (
										<span className="text-warning small">
											{Math.round((player as any).soccerFitness * 100)}%
										</span>
									) : null}
									{showRatings ? <strong>{player.ratings.ovr}</strong> : null}
								</a>
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
};

export default SoccerSquad;
