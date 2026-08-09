import { useState, type Dispatch, type SetStateAction } from "react";
import type {
	SoccerFormation,
	SoccerTactics as SoccerTacticsType,
} from "../../common/types.ts";
import {
	DEFAULT_SOCCER_TACTICS,
	getDefaultSoccerDuty,
	normalizeSoccerTactics,
	SOCCER_TACTICAL_PRESETS,
} from "../../common/soccer/tactics.ts";
import { optimizeSoccerLineup } from "../../common/soccer/lineup.ts";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";
import { realtimeUpdate } from "../util/realtimeUpdate.ts";
import { toWorker } from "../util/toWorker.ts";
import {
	dialLabels,
	dialNames,
	dials,
	formationRows,
} from "./Roster/soccerTacticsUi.ts";

type TacticsPlayer = {
	fitness: number;
	injury: {
		gamesRemaining: number;
	};
	name: string;
	ovr: number;
	ovrs: Record<string, number>;
	pid: number;
	pos: string;
};

const instructionValues = [-2, -1, 0, 1, 2] as const;

const PlayerEditor = ({
	index,
	players,
	selected,
	setTactics,
	slot,
	tactics,
}: {
	index: number;
	players: TacticsPlayer[];
	selected: number[];
	setTactics: Dispatch<SetStateAction<SoccerTacticsType>>;
	slot: string;
	tactics: SoccerTacticsType;
}) => {
	const pid = selected[index] ?? -1;
	const player = players.find((candidate) => candidate.pid === pid);
	const duty = pid >= 0 ? (tactics.duties[pid] ?? "support") : "support";

	return (
		<div className="soccer-tactics-player-slot px-1">
			<div
				className={`soccer-tactics-player-card${player?.injury.gamesRemaining ? " is-injured" : ""}`}
			>
				<div className="d-flex align-items-center gap-2 mb-1">
					<strong className="soccer-tactics-slot">{slot}</strong>
					{player ? (
						<span className="text-truncate small text-body-secondary">
							Natural: {player.pos}
						</span>
					) : null}
					{player ? (
						<strong className="soccer-tactics-rating">
							{player.ovrs[slot] ?? player.ovr}
						</strong>
					) : null}
				</div>
				<select
					aria-label={`${slot} player`}
					className="form-select form-select-sm mb-1"
					value={pid}
					onChange={(event) => {
						const newPid = Number(event.target.value);
						setTactics((current) => {
							const newPlayer = players.find(
								(candidate) => candidate.pid === newPid,
							);
							const starting = current.starting.map((value, currentIndex) =>
								currentIndex === index ? newPid : value,
							);
							while (starting.length <= index) {
								starting.push(-1);
							}
							starting[index] = newPid;
							return {
								...current,
								starting,
								bench: current.bench.filter((value) => value !== newPid),
								duties:
									newPid >= 0 && current.duties[newPid] === undefined
										? {
												...current.duties,
												[newPid]: getDefaultSoccerDuty(newPlayer?.pos ?? slot),
											}
										: current.duties,
							};
						});
					}}
				>
					<option value={-1}>Select player</option>
					{players.map((candidate) => (
						<option
							disabled={
								selected.includes(candidate.pid) && pid !== candidate.pid
							}
							value={candidate.pid}
							key={candidate.pid}
						>
							{candidate.name} · {candidate.pos} ·{" "}
							{candidate.ovrs[slot] ?? candidate.ovr}
						</option>
					))}
				</select>
				<div className="d-flex align-items-center gap-2">
					<span className="small text-body-secondary">Duty</span>
					<select
						aria-label={`${slot} duty`}
						className="form-select form-select-sm"
						disabled={pid < 0}
						value={duty}
						onChange={(event) => {
							const newDuty = event.target.value as
								| "defend"
								| "support"
								| "attack";
							setTactics((current) => ({
								...current,
								duties: { ...current.duties, [pid]: newDuty },
							}));
						}}
					>
						<option value="defend">Defend</option>
						<option value="support">Support</option>
						<option value="attack">Attack</option>
					</select>
				</div>
				{player?.injury.gamesRemaining ? (
					<div className="text-danger small mt-1">Currently injured</div>
				) : player && player.fitness < 0.98 ? (
					<div
						className={`small mt-1 ${player.fitness < 0.75 ? "text-warning" : "text-body-secondary"}`}
					>
						Match fitness: {Math.round(player.fitness * 100)}%
					</div>
				) : null}
			</div>
		</div>
	);
};

const SoccerTactics = ({
	formations,
	players,
	tactics: initialTactics,
	team,
	tid,
}: {
	formations: Record<SoccerFormation, readonly string[]>;
	players: TacticsPlayer[];
	tactics?: SoccerTacticsType;
	team: { name: string; region: string };
	tid: number;
}) => {
	useTitleBar({ title: "Tactics" });
	const [message, setMessage] = useState<string>();
	const [saving, setSaving] = useState(false);
	const [tactics, setTactics] = useState<SoccerTacticsType>(() =>
		normalizeSoccerTactics(initialTactics),
	);
	const [preset, setPreset] =
		useState<keyof typeof SOCCER_TACTICAL_PRESETS>("balanced");
	const slots = formations[tactics.formation];
	const selected = slots.map((_slot, index) => tactics.starting[index] ?? -1);
	const selectedSet = new Set(selected);
	const byPid = new Map(players.map((player) => [player.pid, player]));
	const bench = tactics.bench
		.map((pid) => byPid.get(pid))
		.filter((player): player is TacticsPlayer => player !== undefined)
		.filter((player) => !selectedSet.has(player.pid))
		.slice(0, 9);
	const benchSet = new Set(bench.map((player) => player.pid));
	const reserves = players.filter(
		(player) => !selectedSet.has(player.pid) && !benchSet.has(player.pid),
	);

	const autoPick = (formation: SoccerFormation = tactics.formation) => {
		const starting = optimizeSoccerLineup({
			candidates: players.map((player) => ({
				id: player.pid,
				naturalPosition: player.pos,
				overall: player.ovr,
				positionRatings: player.ovrs,
			})),
			slots: formations[formation],
		});
		const used = new Set(starting.filter((pid) => pid >= 0));
		setTactics((current) => {
			const duties = { ...current.duties };
			for (const pid of starting) {
				if (pid >= 0) {
					const selectedPlayer = players.find((player) => player.pid === pid);
					duties[pid] ??= getDefaultSoccerDuty(selectedPlayer?.pos ?? "CM");
				}
			}
			return {
				...current,
				formation,
				starting,
				duties,
				bench: players
					.filter((player) => !used.has(player.pid))
					.slice(0, 9)
					.map((player) => player.pid),
			};
		});
	};

	const applyPreset = () => {
		const values = SOCCER_TACTICAL_PRESETS[preset].values;
		setTactics((current) => ({
			...current,
			mentality: DEFAULT_SOCCER_TACTICS.mentality,
			tempo: DEFAULT_SOCCER_TACTICS.tempo,
			pressing: DEFAULT_SOCCER_TACTICS.pressing,
			defensiveLine: DEFAULT_SOCCER_TACTICS.defensiveLine,
			width: DEFAULT_SOCCER_TACTICS.width,
			directness: DEFAULT_SOCCER_TACTICS.directness,
			transition: DEFAULT_SOCCER_TACTICS.transition,
			marking: DEFAULT_SOCCER_TACTICS.marking,
			substitutionTiming: DEFAULT_SOCCER_TACTICS.substitutionTiming,
			...values,
		}));
	};

	const save = async () => {
		setSaving(true);
		setMessage(undefined);
		try {
			await toWorker("main", "updateSoccerTactics", { tid, tactics });
			await realtimeUpdate([], helpers.leagueUrl(["roster"]));
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
			setSaving(false);
		}
	};

	const academy = async () => {
		const prospects = await toWorker("main", "generateAcademyIntake", tid);
		setMessage(`${prospects.length} academy players joined the senior squad.`);
	};

	return (
		<>
			<div className="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
				<div>
					<h1 className="mb-0">
						{team.region} {team.name}
					</h1>
					<div className="text-body-secondary">
						Formation and match instructions
					</div>
				</div>
				<a
					className="btn btn-light-bordered"
					href={helpers.leagueUrl(["roster"])}
				>
					Back to roster
				</a>
			</div>

			{message ? <div className="alert alert-info">{message}</div> : null}

			<section className="card soccer-tactics-editor overflow-hidden">
				<div className="card-header d-flex flex-wrap align-items-center gap-2 px-3 py-2">
					<label className="visually-hidden" htmlFor="soccer-formation">
						Formation
					</label>
					<select
						className="form-select form-select-sm w-auto"
						id="soccer-formation"
						value={tactics.formation}
						onChange={(event) =>
							autoPick(event.target.value as SoccerFormation)
						}
					>
						{Object.keys(formations).map((formation) => (
							<option key={formation}>{formation}</option>
						))}
					</select>
					<button
						className="btn btn-secondary btn-sm"
						onClick={() => autoPick()}
					>
						Best XI
					</button>
					<select
						aria-label="Tactical preset"
						className="form-select form-select-sm w-auto"
						onChange={(event) =>
							setPreset(
								event.target.value as keyof typeof SOCCER_TACTICAL_PRESETS,
							)
						}
						value={preset}
					>
						{Object.entries(SOCCER_TACTICAL_PRESETS).map(([key, info]) => (
							<option value={key} key={key}>
								{info.name}
							</option>
						))}
					</select>
					<button
						className="btn btn-light-bordered btn-sm"
						onClick={applyPreset}
					>
						Apply style
					</button>
					<button className="btn btn-outline-primary btn-sm" onClick={academy}>
						Academy intake
					</button>
					<button
						className="btn btn-primary btn-sm ms-auto"
						disabled={saving}
						onClick={save}
					>
						{saving ? "Saving…" : "Save & return to roster"}
					</button>
				</div>

				<div className="row g-0">
					<div className="col-12 col-xl-8 p-2 p-md-3">
						<div className="soccer-tactics-pitch-scroll">
							<div className="soccer-pitch soccer-tactics-pitch position-relative overflow-hidden rounded-3">
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
								<div className="soccer-tactics-lineup position-relative d-flex flex-column justify-content-around py-3">
									{formationRows[tactics.formation].map((row, rowIndex) => (
										<div
											className="d-flex justify-content-evenly align-items-center px-2"
											key={rowIndex}
										>
											{row.map((index) => (
												<PlayerEditor
													index={index}
													key={`${slots[index]}-${index}`}
													players={players}
													selected={selected}
													setTactics={setTactics}
													slot={slots[index]!}
													tactics={tactics}
												/>
											))}
										</div>
									))}
								</div>
							</div>
						</div>
					</div>

					<aside className="soccer-squad-sidebar col-12 col-xl-4 p-3">
						<h2 className="soccer-section-heading">Team instructions</h2>
						<div className="row g-2 mb-4">
							{dials.map((dial) => (
								<div className="col-6" key={dial}>
									<label className="soccer-instruction-card">
										<span>{dialNames[dial]}</span>
										<select
											className="form-select form-select-sm"
											value={tactics[dial]}
											onChange={(event) =>
												setTactics((current) => ({
													...current,
													[dial]: Number(event.target.value) as
														| -2
														| -1
														| 0
														| 1
														| 2,
												}))
											}
										>
											{instructionValues.map((value, index) => (
												<option value={value} key={value}>
													{dialLabels[dial][index]}
												</option>
											))}
										</select>
									</label>
								</div>
							))}
						</div>
						<label className="soccer-instruction-card mb-4">
							<span>Substitutions</span>
							<select
								className="form-select form-select-sm"
								onChange={(event) =>
									setTactics((current) => ({
										...current,
										substitutionTiming: Number(event.target.value) as
											| -1
											| 0
											| 1,
									}))
								}
								value={tactics.substitutionTiming}
							>
								<option value={-1}>Early</option>
								<option value={0}>Balanced</option>
								<option value={1}>Late</option>
							</select>
						</label>

						<div className="d-flex align-items-center justify-content-between mb-2">
							<h2 className="soccer-section-heading mb-0">Substitutes</h2>
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
									<div
										className={`soccer-bench-card${player.injury.gamesRemaining ? " is-injured" : ""}`}
									>
										<span className="soccer-bench-pos">{player.pos}</span>
										<a
											className="soccer-bench-name"
											href={helpers.leagueUrl(["player", player.pid])}
										>
											{player.name}
										</a>
										{player.injury.gamesRemaining ? (
											<span className="text-danger small">Inj</span>
										) : null}
										<strong>{player.ovr}</strong>
										<button
											aria-label={`Remove ${player.name} from substitutes`}
											className="btn btn-xs btn-outline-danger"
											onClick={() =>
												setTactics((current) => ({
													...current,
													bench: current.bench.filter(
														(pid) => pid !== player.pid,
													),
												}))
											}
										>
											×
										</button>
									</div>
								</div>
							))}
						</div>
						{reserves.length > 0 && bench.length < 9 ? (
							<>
								<h2 className="soccer-section-heading mt-4">Reserves</h2>
								<div className="d-grid gap-1">
									{reserves.slice(0, 10).map((player) => (
										<button
											className="btn btn-sm btn-light-bordered d-flex justify-content-between"
											key={player.pid}
											onClick={() =>
												setTactics((current) => ({
													...current,
													bench: [...current.bench, player.pid].slice(0, 9),
												}))
											}
										>
											<span>{player.name}</span>
											<span>
												{player.pos} · {player.ovr}
											</span>
										</button>
									))}
								</div>
							</>
						) : null}
					</aside>
				</div>
			</section>
		</>
	);
};

export default SoccerTactics;
