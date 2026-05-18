import "@testing-library/jest-dom";

// happy-dom does not implement the Web Animations API; stub it so Base UI's
// ScrollAreaViewport (which calls getAnimations() in a setTimeout) doesn't throw.
if (!Element.prototype.getAnimations) {
	Element.prototype.getAnimations = () => [];
}
