/** tags.name is globally UNIQUE (migration 001), across every project. */
export class TagNameTakenError extends Error {
	constructor(readonly tagName: string) {
		super(`A tag is already named "${tagName}"`);
		this.name = "TagNameTakenError";
	}
}
