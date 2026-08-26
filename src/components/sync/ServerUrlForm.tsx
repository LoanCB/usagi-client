import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeServerUrl, type ServerUrlError } from "@/sync/server-url";
import { CLIENT_PROTOCOL_VERSION, type ServerInfo } from "@/sync/types";

export interface ServerUrlFormProps {
	/** Injected so tests need no network; the panel passes getServerInfo bound to fetch. */
	probe: (url: string) => Promise<ServerInfo>;
	/** Called with the normalised URL and the server's answer once it checks out. */
	onVerified: (url: string, info: ServerInfo) => void;
	disabled?: boolean;
	disabledHint?: string;
}

type Probe =
	| { kind: "idle" }
	| { kind: "testing" }
	| { kind: "ok"; info: ServerInfo }
	| { kind: "unreachable" }
	| { kind: "not-usagi" }
	| { kind: "protocol"; server: number };

/** A reachable non-usagi host answers 200 with arbitrary JSON, so the shape is
 * checked rather than trusted — otherwise protocolVersion would be undefined
 * and the mismatch branch would report "version undefined". */
function isServerInfo(value: unknown): value is ServerInfo {
	if (!value || typeof value !== "object") return false;
	const info = value as Partial<ServerInfo>;
	return (
		typeof info.name === "string" &&
		typeof info.version === "string" &&
		typeof info.protocolVersion === "number" &&
		typeof info.registrationEnabled === "boolean"
	);
}

export function ServerUrlForm({
	probe,
	onVerified,
	disabled = false,
	disabledHint,
}: ServerUrlFormProps) {
	const { t } = useTranslation();
	const [raw, setRaw] = useState("");
	const [urlError, setUrlError] = useState<ServerUrlError | null>(null);
	const [insecure, setInsecure] = useState(false);
	const [state, setState] = useState<Probe>({ kind: "idle" });

	async function handleTest() {
		const parsed = normalizeServerUrl(raw);
		setUrlError(parsed.error);
		setInsecure(parsed.insecureWarning);
		setState({ kind: "idle" });
		if (!parsed.url) return;

		setState({ kind: "testing" });
		let info: unknown;
		try {
			info = await probe(parsed.url);
		} catch {
			// §6.2 wants three distinguishable failures; this is "unreachable".
			setState({ kind: "unreachable" });
			return;
		}
		if (!isServerInfo(info)) {
			setState({ kind: "not-usagi" });
			return;
		}
		if (info.protocolVersion !== CLIENT_PROTOCOL_VERSION) {
			setState({ kind: "protocol", server: info.protocolVersion });
			return;
		}
		setState({ kind: "ok", info });
		onVerified(parsed.url, info);
	}

	return (
		<div className="flex flex-col gap-2">
			<label className="text-sm" htmlFor="sync-server-url">
				{t("sync.serverUrl")}
			</label>
			<div className="flex gap-2">
				<Input
					id="sync-server-url"
					value={raw}
					disabled={disabled}
					placeholder={t("sync.serverUrlPlaceholder")}
					onChange={(e) => {
						setRaw(e.target.value);
						setUrlError(null);
						// The warning describes the URL that was tested, not the one being typed.
						setInsecure(false);
						setState({ kind: "idle" });
					}}
				/>
				<Button
					type="button"
					variant="outline"
					disabled={disabled || state.kind === "testing"}
					onClick={handleTest}
				>
					{state.kind === "testing"
						? t("sync.testing")
						: t("sync.testConnection")}
				</Button>
			</div>

			{disabled && disabledHint && (
				<p className="text-xs text-muted-foreground">{disabledHint}</p>
			)}
			{urlError && (
				<p className="text-xs text-destructive">
					{t(`sync.urlError.${urlError}`)}
				</p>
			)}
			{insecure && !urlError && (
				<p className="flex items-center gap-1.5 text-xs text-destructive">
					<AlertTriangle className="h-3.5 w-3.5 shrink-0" />
					{t("sync.insecureWarning")}
				</p>
			)}
			{state.kind === "ok" && (
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
					{t("sync.serverFound", {
						name: state.info.name,
						version: state.info.version,
					})}
				</p>
			)}
			{state.kind === "unreachable" && (
				<p className="text-xs text-destructive">{t("sync.unreachable")}</p>
			)}
			{state.kind === "not-usagi" && (
				<p className="text-xs text-destructive">{t("sync.notUsagi")}</p>
			)}
			{state.kind === "protocol" && (
				<p className="text-xs text-destructive">
					{t("sync.protocolMismatch", {
						server: state.server,
						client: CLIENT_PROTOCOL_VERSION,
					})}
				</p>
			)}
		</div>
	);
}
