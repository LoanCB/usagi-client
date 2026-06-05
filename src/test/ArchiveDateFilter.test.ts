import { describe, expect, it } from "vitest";
import { inRange } from "@/components/layout/ArchiveDateFilter";

const TODAY = "2026-06-02";

describe("inRange", () => {
  it("retourne true quand la plage est vide", () => {
    expect(inRange("2026-05-01", { from: null, to: null }, TODAY)).toBe(true);
  });

  it("retourne true quand date est null et plage vide", () => {
    expect(inRange(null, { from: null, to: null }, TODAY)).toBe(true);
  });

  it("retourne false quand date est null et plage définie", () => {
    expect(inRange(null, { from: "2026-05-01", to: "2026-05-31" }, TODAY)).toBe(
      false,
    );
  });

  it("retourne true quand date est dans la plage", () => {
    expect(
      inRange("2026-05-15", { from: "2026-05-01", to: "2026-05-31" }, TODAY),
    ).toBe(true);
  });

  it("retourne true sur les bornes exactes", () => {
    expect(
      inRange("2026-05-01", { from: "2026-05-01", to: "2026-05-31" }, TODAY),
    ).toBe(true);
    expect(
      inRange("2026-05-31", { from: "2026-05-01", to: "2026-05-31" }, TODAY),
    ).toBe(true);
  });

  it("retourne false quand date est avant la plage", () => {
    expect(
      inRange("2026-04-30", { from: "2026-05-01", to: "2026-05-31" }, TODAY),
    ).toBe(false);
  });

  it("retourne false quand date est après la plage", () => {
    expect(
      inRange("2026-06-01", { from: "2026-05-01", to: "2026-05-31" }, TODAY),
    ).toBe(false);
  });

  it("utilise today comme borne supérieure quand seulement from est défini", () => {
    expect(inRange("2026-05-01", { from: "2026-05-01", to: null }, TODAY)).toBe(
      true,
    );
    expect(inRange(TODAY, { from: "2026-05-01", to: null }, TODAY)).toBe(true);
    expect(inRange("2026-06-03", { from: "2026-05-01", to: null }, TODAY)).toBe(
      false,
    );
  });

  it("utilise borne inférieure ouverte quand seulement to est défini", () => {
    expect(inRange("2026-01-01", { from: null, to: "2026-05-31" }, TODAY)).toBe(
      true,
    );
    expect(inRange("2026-06-01", { from: null, to: "2026-05-31" }, TODAY)).toBe(
      false,
    );
  });
});
