import type { TeamCoaching } from "../../common/types.ts";

// Shared metadata for the five coaching style dials.
export const DIAL_INFO: {
	key: keyof TeamCoaching;
	label: string;
	low: string;
	high: string;
}[] = [
	{
		key: "threePointTendency",
		label: "Three-point volume",
		low: "Fewer 3s",
		high: "More 3s",
	},
	{ key: "pace", label: "Tempo", low: "Slow it down", high: "Push the pace" },
	{
		key: "crashOffensiveGlass",
		label: "Offensive rebounding",
		low: "Get back on D",
		high: "Crash the glass",
	},
	{
		key: "paintDefense",
		label: "Defensive focus",
		low: "Guard the perimeter",
		high: "Pack the paint",
	},
	{
		key: "defensiveAggression",
		label: "Defensive aggression",
		low: "Play it safe",
		high: "Force turnovers",
	},
];

// Sign-aware short labels for a coach's strongest tendencies.
export const tendencyChips = (
	philosophy: TeamCoaching,
	max = 3,
	threshold = 0.3,
): string[] => {
	const CHIP_LABELS: Record<keyof TeamCoaching, [string, string]> = {
		threePointTendency: ["Fewer 3s", "More 3s"],
		pace: ["Slow pace", "Fast pace"],
		crashOffensiveGlass: ["Get back", "Crash glass"],
		paintDefense: ["Guard arc", "Pack paint"],
		defensiveAggression: ["Safe D", "Aggressive D"],
	};
	return DIAL_INFO.map(({ key }) => ({ key, value: philosophy[key] }))
		.filter(({ value }) => Math.abs(value) >= threshold)
		.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
		.slice(0, max)
		.map(({ key, value }) => CHIP_LABELS[key][value > 0 ? 1 : 0]);
};

// Position a dial level in [-1, 1] as a percentage across the track.
const toPct = (value: number) => `${((value + 1) / 2) * 100}%`;

const Marker = ({
	value,
	secondary,
	title,
}: {
	value: number;
	secondary?: boolean;
	title: string;
}) => (
	<div
		title={title}
		style={{
			position: "absolute",
			left: toPct(value),
			top: "50%",
			transform: "translate(-50%, -50%)",
			width: secondary ? 10 : 12,
			height: secondary ? 10 : 12,
			borderRadius: "50%",
			zIndex: secondary ? 1 : 2,
		}}
		className={secondary ? "border border-2 border-warning" : "bg-primary"}
	/>
);

// Visualizes the five style dials as -1..+1 tracks. `values` gets the filled
// marker; `nowValues` (optional, e.g. the team's effective in-season dials vs
// the coach's raw preference) gets a hollow second marker.
const CoachDials = ({
	values,
	nowValues,
	nowLabel = "now",
}: {
	values: TeamCoaching;
	nowValues?: TeamCoaching;
	nowLabel?: string;
}) => {
	return (
		<div style={{ maxWidth: 420 }}>
			{DIAL_INFO.map(({ key, label, low, high }) => (
				<div key={key} className="mb-2">
					<div className="d-flex justify-content-between small">
						<span>{label}</span>
						<span className="text-body-secondary">
							{values[key] > 0 ? "+" : ""}
							{values[key].toFixed(1)}
							{nowValues && nowValues[key] !== values[key]
								? ` (${nowLabel} ${nowValues[key] > 0 ? "+" : ""}${nowValues[
										key
									].toFixed(1)})`
								: null}
						</span>
					</div>
					<div
						className="position-relative bg-body-secondary rounded"
						style={{ height: 8 }}
					>
						{/* center tick = neutral */}
						<div
							className="position-absolute bg-secondary"
							style={{
								left: "50%",
								top: -2,
								bottom: -2,
								width: 1,
								opacity: 0.6,
							}}
						/>
						{nowValues && nowValues[key] !== values[key] ? (
							<Marker
								value={nowValues[key]}
								secondary
								title={`${label}: ${nowLabel} ${nowValues[key].toFixed(1)}`}
							/>
						) : null}
						<Marker
							value={values[key]}
							title={`${label}: ${values[key].toFixed(1)}`}
						/>
					</div>
					<div
						className="d-flex justify-content-between text-body-secondary"
						style={{ fontSize: "0.7rem" }}
					>
						<span>{low}</span>
						<span>{high}</span>
					</div>
				</div>
			))}
		</div>
	);
};

export default CoachDials;
