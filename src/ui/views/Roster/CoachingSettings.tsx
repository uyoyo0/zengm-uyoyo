import { AnimatePresence, m } from "framer-motion";
import { useState } from "react";
import type { TeamCoaching } from "../../../common/types.ts";
import { DEFAULT_COACHING } from "../../../common/constants.ts";
import { COACHING } from "../../../common/coachingConstants.ts";
import CoachDials from "../../components/CoachDials.tsx";
import { HelpPopover } from "../../components/HelpPopover.tsx";
import CollapseArrow from "../../components/CollapseArrow.tsx";
import { helpers } from "../../util/helpers.ts";

const titleText = "Coaching Style";

const signedPct = (level: number, strength: number) => {
	const pct = Math.round(level * strength * 100);
	return `${pct > 0 ? "+" : ""}${pct}%`;
};

// Plain-language summary of how the current (coach-set) dials change games.
// Magnitudes come straight from the sim constants so retuning propagates here.
const projectedEffects = (coaching: TeamCoaching): string[] => {
	const effects: string[] = [];

	if (coaching.threePointTendency !== 0) {
		effects.push(
			`${signedPct(
				coaching.threePointTendency,
				COACHING.THREE_PT_TENDENCY,
			)} three-point attempt rate`,
		);
	}
	if (coaching.pace !== 0) {
		const faster = coaching.pace > 0;
		effects.push(
			`${signedPct(coaching.pace, COACHING.PACE)} possessions · ${signedPct(
				coaching.pace,
				COACHING.PACE_FATIGUE,
			)} fatigue rate · injury risk ${faster ? "up" : "down"}`,
		);
	}
	if (coaching.crashOffensiveGlass !== 0) {
		const crashing = coaching.crashOffensiveGlass > 0;
		effects.push(
			`${signedPct(
				coaching.crashOffensiveGlass,
				COACHING.CRASH_GLASS,
			)} offensive-rebound rate · transition defense ${
				crashing ? "more exposed" : "more protected"
			}`,
		);
	}
	if (coaching.paintDefense !== 0) {
		const mag = Math.abs(coaching.paintDefense);
		const pushPct = Math.round(mag * COACHING.PAINT_PUSH_3S * 100);
		const interiorPp = Math.round(mag * COACHING.PAINT_INTERIOR_DELTA * 100);
		const threePp = Math.round(mag * COACHING.PAINT_THREE_DELTA * 100);
		if (coaching.paintDefense > 0) {
			effects.push(
				`Pack the paint: +${pushPct}% opponent 3PA, −${interiorPp} pp interior FG, +${threePp} pp opponent 3PT`,
			);
		} else {
			effects.push(
				`Guard the perimeter: −${pushPct}% opponent 3PA, +${interiorPp} pp interior FG, −${threePp} pp opponent 3PT`,
			);
		}
	}
	if (coaching.defensiveAggression !== 0) {
		effects.push(
			`${signedPct(
				coaching.defensiveAggression,
				COACHING.AGGRESSION_TOV,
			)} steals / blocks / forced turnovers · ${signedPct(
				coaching.defensiveAggression,
				COACHING.AGGRESSION_FOUL,
			)} fouls`,
		);
	}

	if (effects.length === 0) {
		return ["Neutral — no adjustments to how your team plays."];
	}
	return effects;
};

type CoachCard = {
	cid: number;
	firstName: string;
	lastName: string;
	age: number;
	ratings: {
		ovr: number;
		development: number;
		tactics: number;
		adaptability: number;
		motivation: number;
	};
};

// Read-only: the team's style is set by its head coach (see the Coaches page).
const CoachingSettings = ({
	t,
	coach,
}: {
	t: {
		tid: number;
		coaching?: TeamCoaching;
	};
	coach?: CoachCard;
}) => {
	const [expanded, setExpanded] = useState(!window.mobile);

	const coaching: TeamCoaching = { ...DEFAULT_COACHING, ...t.coaching };

	return (
		<div className="coaching-style">
			<div className="d-flex align-items-center">
				{window.mobile ? (
					<button
						className="btn btn-link p-0 fw-bold"
						type="button"
						onClick={() => setExpanded((prev) => !prev)}
					>
						<CollapseArrow open={expanded} /> {titleText}
					</button>
				) : (
					<b>{titleText}</b>
				)}
				<HelpPopover className="ms-1" title={titleText}>
					<p>
						This team's playing style is set by its head coach — their
						philosophy, how much they adapt it to the roster, and how they
						adjust for each opponent. Manage coaches on the{" "}
						<a href={helpers.leagueUrl(["coaches"])}>Coaches</a> page.
					</p>
				</HelpPopover>
			</div>
			<AnimatePresence initial={false}>
				{expanded ? (
					<m.div
						className="mt-2"
						initial="collapsed"
						animate="open"
						exit="collapsed"
						variants={{
							open: { opacity: 1, height: "auto" },
							collapsed: { opacity: 0, height: 0 },
						}}
						transition={{ duration: 0.3, type: "tween" }}
					>
						{coach ? (
							<div className="mb-2">
								<a href={helpers.leagueUrl(["coach", String(coach.cid)])}>
									{coach.firstName} {coach.lastName}
								</a>{" "}
								<span className="text-body-secondary">
									(age {coach.age}, {coach.ratings.ovr} ovr)
								</span>
								<div className="small text-body-secondary">
									Dev {coach.ratings.development} · Tac {coach.ratings.tactics}{" "}
									· Adp {coach.ratings.adaptability} · Mot{" "}
									{coach.ratings.motivation}
								</div>
							</div>
						) : null}
						<div className="mb-2">
							<CoachDials values={coaching} />
						</div>
						<div className="fw-bold mb-1">Projected impact</div>
						<ul className="list-unstyled mb-0 small text-body-secondary">
							{projectedEffects(coaching).map((effect, i) => (
								<li key={i}>{effect}</li>
							))}
						</ul>
					</m.div>
				) : null}
			</AnimatePresence>
		</div>
	);
};

export default CoachingSettings;
