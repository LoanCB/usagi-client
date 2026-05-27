import { AlertCircle, ArrowUp, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdaterContext } from "@/hooks/useUpdater";

export function UpdateBanner() {
	const {
		status,
		update,
		progress,
		error,
		downloadAndInstall,
		dismiss,
		relaunchApp,
		checkForUpdate,
	} = useUpdaterContext();

	if (status === "idle" || !update) return null;

	return (
		<div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg min-w-80">
			{status === "available" && (
				<>
					<ArrowUp className="h-4 w-4 text-primary shrink-0" />
					<span className="text-sm flex-1">
						Bunly v{update.version} est disponible
					</span>
					<Button variant="ghost" size="sm" onClick={dismiss}>
						Plus tard
					</Button>
					<Button size="sm" onClick={downloadAndInstall}>
						Mettre à jour
					</Button>
				</>
			)}
			{status === "downloading" && (
				<>
					<Loader2 className="h-4 w-4 animate-spin shrink-0" />
					<span className="text-sm flex-1">Téléchargement...</span>
					<div
						role="progressbar"
						aria-valuenow={progress}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-label="Progression du téléchargement"
						className="w-32 h-1.5 bg-muted rounded-full overflow-hidden"
					>
						<div
							className="h-full bg-primary transition-all"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<span className="text-sm text-muted-foreground w-10 text-right">
						{progress}%
					</span>
				</>
			)}
			{status === "ready" && (
				<>
					<CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
					<span className="text-sm flex-1">Mise à jour installée</span>
					<Button size="sm" onClick={relaunchApp}>
						Redémarrer maintenant
					</Button>
				</>
			)}
			{status === "error" && (
				<>
					<AlertCircle className="h-4 w-4 text-destructive shrink-0" />
					<div className="flex flex-col flex-1 min-w-0">
						<span className="text-sm text-destructive">
							Échec de la mise à jour
						</span>
						{error && (
							<span
								className="text-xs text-muted-foreground truncate"
								title={error}
							>
								{error}
							</span>
						)}
					</div>
					<Button variant="ghost" size="sm" onClick={dismiss}>
						Fermer
					</Button>
					<Button size="sm" onClick={checkForUpdate}>
						Réessayer
					</Button>
				</>
			)}
		</div>
	);
}
