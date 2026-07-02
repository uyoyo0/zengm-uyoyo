import type { Settings } from "../../../worker/views/settings.ts";
import SettingsForm from "../Settings/SettingsForm.tsx";

const CustomizeSettings = ({
	onCancel,
	onSave,
	initial,
	saveText,
	hasPlayers,
	realPlayers,
	crossEra,
}: {
	onCancel: () => void;
	onSave: (settings: Settings) => void;
	initial: Settings;
	saveText: string;
	hasPlayers: boolean;
	realPlayers: boolean;
	crossEra: boolean;
}) => {
	return (
		<>
			<p>
				Find yourself making the same changes here in every league? Go to Tools
				&gt; Global Settings &gt; Default New League Settings and set them once
				for every league you make in the future.
			</p>
			<SettingsForm
				onSave={onSave}
				saveText={saveText}
				onCancel={onCancel}
				initialSettings={initial}
				newLeague
				hasPlayers={hasPlayers}
				realPlayers={realPlayers}
				crossEra={crossEra}
			/>
		</>
	);
};

export default CustomizeSettings;
