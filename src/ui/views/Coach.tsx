import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";
import { PlayerPicture } from "../components/PlayerPicture.tsx";
import { RatingWithChange } from "../components/RatingWithChange.tsx";
import CoachDials from "../components/CoachDials.tsx";
import type { View } from "../../common/types.ts";

const RATING_FIELDS = [
	{ key: "development", label: "Development" },
	{ key: "tactics", label: "Tactics" },
	{ key: "adaptability", label: "Adaptability" },
	{ key: "motivation", label: "Motivation" },
] as const;

const fmtDelta = (delta: number) => {
	const rounded = delta.toFixed(1);
	return delta >= 0 ? `+${rounded}` : rounded;
};

// A labeled 0-100 rating bar with the year-over-year change when known.
const RatingBar = ({
	label,
	value,
	change,
}: {
	label: string;
	value: number;
	change?: number;
}) => (
	<div className="mb-2">
		<div className="d-flex justify-content-between small">
			<span>{label}</span>
			<span>
				{change !== undefined && change !== 0 ? (
					<RatingWithChange change={change}>{value}</RatingWithChange>
				) : (
					value
				)}
			</span>
		</div>
		<div className="progress" style={{ height: 8 }}>
			<div
				className="progress-bar"
				style={{ width: `${value}%` }}
				role="progressbar"
				aria-valuenow={value}
				aria-valuemin={0}
				aria-valuemax={100}
			/>
		</div>
	</div>
);

const Coach = ({
	career,
	coach,
	godMode,
	seasons,
	team,
	teamCoaching,
	teamColors,
	teamJersey,
}: View<"coach">) => {
	useTitleBar({
		title: `${coach.firstName} ${coach.lastName}`,
	});

	const coyCount = coach.awards.filter(
		(a) => a.type === "Coach of the Year",
	).length;

	// Year-over-year rating changes from the two most recent history snapshots.
	const history = [...(coach.ratingsHistory ?? [])].sort(
		(a, b) => b.season - a.season,
	);
	const changes =
		history.length >= 2
			? {
					development: history[0]!.development - history[1]!.development,
					tactics: history[0]!.tactics - history[1]!.tactics,
					adaptability: history[0]!.adaptability - history[1]!.adaptability,
					motivation: history[0]!.motivation - history[1]!.motivation,
					ovr: history[0]!.ovr - history[1]!.ovr,
				}
			: undefined;

	const retired = coach.tid < -1;

	return (
		<>
			<div className="row">
				<div className="col-md-6 d-flex gap-2">
					<div className="player-picture" style={{ marginTop: -20 }}>
						<PlayerPicture
							face={coach.face}
							colors={teamColors}
							jersey={teamJersey}
						/>
					</div>
					<div>
						<h2 className="d-flex align-items-center gap-2 flex-wrap">
							Overview
							{coyCount > 0 ? (
								<span
									className="badge text-bg-warning"
									title="Coach of the Year awards"
								>
									{coyCount}× COY
								</span>
							) : null}
							{retired ? (
								<span className="badge text-bg-secondary">Retired</span>
							) : null}
						</h2>
						<p>
							<b>Team:</b>{" "}
							{team ? (
								<a
									href={helpers.leagueUrl([
										"roster",
										`${team.abbrev}_${team.tid}`,
									])}
								>
									{team.region} {team.name}
								</a>
							) : retired ? (
								"Retired"
							) : (
								"Free agent"
							)}
							<br />
							<b>Age:</b> {coach.age}
							<br />
							<b>Overall:</b>{" "}
							{changes && changes.ovr !== 0 ? (
								<RatingWithChange change={changes.ovr}>
									{coach.ratings.ovr}
								</RatingWithChange>
							) : (
								coach.ratings.ovr
							)}
							<br />
							<b>Salary:</b>{" "}
							{helpers.formatCurrency(coach.contract.amount / 1000, "M")}{" "}
							through {coach.contract.exp}
							{coach.fromPid !== undefined ? (
								<>
									<br />
									<b>Former player:</b>{" "}
									<a href={helpers.leagueUrl(["player", coach.fromPid])}>
										view playing career
									</a>
								</>
							) : null}
						</p>

						{godMode ? (
							<a
								className="btn btn-god-mode mb-3"
								href={helpers.leagueUrl(["customize_coach", String(coach.cid)])}
							>
								Edit coach
							</a>
						) : null}
					</div>
				</div>

				<div className="col-md-6">
					<h2>Ratings</h2>
					<div style={{ maxWidth: 420 }}>
						{RATING_FIELDS.map(({ key, label }) => (
							<RatingBar
								key={key}
								label={label}
								value={coach.ratings[key]}
								change={changes?.[key]}
							/>
						))}
					</div>
				</div>
			</div>

			<div className="row mt-3">
				<div className="col-md-6">
					<h2>Philosophy</h2>
					<p className="text-body-secondary">
						Their preferred style. The team's actual style blends this with the
						roster (adaptability) and adjusts per opponent (tactics).
						{teamCoaching ? (
							<>
								{" "}
								The hollow marker is this season's effective dial for{" "}
								{team?.abbrev}.
							</>
						) : null}
					</p>
					<CoachDials
						values={coach.philosophy}
						nowValues={teamCoaching ?? undefined}
					/>
				</div>

				<div className="col-md-6">
					<h2>Coaching record</h2>
					{seasons.length > 0 ? (
						<div className="table-responsive">
							<table className="table table-striped table-borderless table-sm">
								<thead>
									<tr>
										<th>Season</th>
										<th>Team</th>
										<th>W</th>
										<th>L</th>
										<th title="Expected wins (talent-based, injury & trade aware)">
											Exp W
										</th>
										<th title="Wins above expectation">Δ</th>
									</tr>
								</thead>
								<tbody>
									{seasons.map((s) => (
										<tr key={s.season}>
											<td>
												<a href={helpers.leagueUrl(["history", s.season])}>
													{s.season}
												</a>
											</td>
											<td>
												<a
													href={helpers.leagueUrl([
														"roster",
														`${s.abbrev}_${s.tid}`,
														s.season,
													])}
												>
													{s.abbrev}
												</a>
											</td>
											<td>{s.won}</td>
											<td>{s.lost}</td>
											<td>{s.expectedWins.toFixed(1)}</td>
											<td
												className={
													s.delta > 0
														? "text-success"
														: s.delta < 0
															? "text-danger"
															: undefined
												}
											>
												{fmtDelta(s.delta)}
											</td>
										</tr>
									))}
								</tbody>
								<tfoot>
									<tr className="fw-bold">
										<td>Career</td>
										<td />
										<td>{career.won}</td>
										<td>{career.lost}</td>
										<td>{career.expectedWins.toFixed(1)}</td>
										<td>{fmtDelta(career.won - career.expectedWins)}</td>
									</tr>
								</tfoot>
							</table>
						</div>
					) : (
						<p>No completed seasons yet.</p>
					)}
				</div>
			</div>

			{history.length > 1 ? (
				<>
					<h2>Ratings history</h2>
					<div className="table-responsive">
						<table
							className="table table-striped table-borderless table-sm"
							style={{ maxWidth: 400 }}
						>
							<thead>
								<tr>
									<th>Season</th>
									<th className="text-end">Ovr</th>
									<th className="text-end" title="Development">
										Dev
									</th>
									<th className="text-end" title="Tactics">
										Tac
									</th>
									<th className="text-end" title="Adaptability">
										Adp
									</th>
									<th className="text-end" title="Motivation">
										Mot
									</th>
								</tr>
							</thead>
							<tbody>
								{history.map((row) => (
									<tr key={row.season}>
										<td>{row.season}</td>
										<td className="text-end">{row.ovr}</td>
										<td className="text-end">{row.development}</td>
										<td className="text-end">{row.tactics}</td>
										<td className="text-end">{row.adaptability}</td>
										<td className="text-end">{row.motivation}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			) : null}

			<h2>Awards</h2>
			{coach.awards.length > 0 ? (
				<ul>
					{coach.awards.map((a, i) => (
						<li key={i}>
							{a.season}: {a.type}
						</li>
					))}
				</ul>
			) : (
				<p>None</p>
			)}
		</>
	);
};

export default Coach;
