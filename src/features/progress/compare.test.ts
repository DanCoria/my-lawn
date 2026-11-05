import { describe, expect, test } from "vitest";

import { comparisonPresentation, proposeComparison } from "./compare";

describe("comparison presentation", () => {
    test.each([
        ["improving", "Improving"],
        ["unchanged", "About the same"],
        ["worsening", "Getting worse"],
        ["resolved", "Resolved"],
        ["unable_to_determine", "Needs a clearer photo"],
    ] as const)("maps %s to plain language", (status, label) => {
        expect(comparisonPresentation(status).label).toBe(label);
    });

    test("unable_to_determine asks for a clearer comparable photo", () => {
        expect(comparisonPresentation("unable_to_determine").guidance).toMatch(/clearer.*same angle/i);
    });

    test("a model proposal is immutable display data and does not mutate a case", () => {
        const lawnCase = { id: "case-1", status: "active" } as const;
        const proposal = proposeComparison("improving", "More green blades are visible.", ["Denser coverage"]);
        expect(proposal).toEqual({ status: "improving", summary: "More green blades are visible.", evidence: ["Denser coverage"] });
        expect(lawnCase.status).toBe("active");
        expect(Object.isFrozen(proposal)).toBe(true);
    });
});
