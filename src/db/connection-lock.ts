export type LockMode = "shared" | "exclusive";

/** Call once to give the lock back. Further calls are no-ops. */
export type LockRelease = () => void;

interface Waiter {
	mode: LockMode;
	grant: (release: LockRelease) => void;
}

/**
 * A readers/writer lock over a single database connection.
 *
 * Everything the app sends to tauri-plugin-sql lands on one sqlx connection
 * (see `src-tauri/src/db.rs`), and a raw BEGIN owns that connection until its
 * COMMIT: a statement issued meanwhile joins the transaction — rolled back
 * with it — and a second BEGIN is rejected outright. Holding the lock
 * exclusively for a transaction and shared for a lone statement is what keeps
 * the sync engine and the UI repository off each other's writes.
 *
 * Waiters are granted strictly in arrival order, so a stream of reads cannot
 * starve a queued transaction.
 */
export class ConnectionLock {
	private readers = 0;
	private writing = false;
	private readonly queue: Waiter[] = [];

	acquire(mode: LockMode): Promise<LockRelease> {
		return new Promise((grant) => {
			this.queue.push({ mode, grant });
			this.pump();
		});
	}

	private pump(): void {
		while (this.queue.length > 0) {
			const next = this.queue[0];
			if (this.writing) return;
			if (next.mode === "exclusive" && this.readers > 0) return;
			this.queue.shift();
			if (next.mode === "exclusive") this.writing = true;
			else this.readers++;
			next.grant(this.releaser(next.mode));
		}
	}

	private releaser(mode: LockMode): LockRelease {
		let released = false;
		return () => {
			if (released) return;
			released = true;
			if (mode === "exclusive") this.writing = false;
			else this.readers--;
			this.pump();
		};
	}
}
