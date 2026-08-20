import "@testing-library/jest-dom";

// This file runs for every test file via the global `setupFiles` config, including
// ones that opt into `// @vitest-environment node` (e.g. tests using better-sqlite3),
// where DOM globals like `Element` don't exist. Guard so those files don't crash here.
if (typeof Element !== "undefined" && !Element.prototype.getAnimations) {
	Element.prototype.getAnimations = () => [];
}
