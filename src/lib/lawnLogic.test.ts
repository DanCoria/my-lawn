import { describe, expect, it } from "vitest";

import { getScheduleTasks } from "@/lib/lawnLogic";

describe("getScheduleTasks", () => {
    it("builds task dates and completion keys for the requested year", () => {
        const tasks = getScheduleTasks("bermuda", 2027);
        const preEmergent = tasks.find((task) => task.label === "Pre-Emergent");

        expect(preEmergent?.key).toBe("pre-emergent-2027");
        expect(preEmergent?.startDate).toEqual(new Date(2027, 1, 1));
        expect(preEmergent?.endDate).toEqual(new Date(2027, 2, 15));
    });

    it("does not reuse completion keys from a previous year", () => {
        const taskKeys = getScheduleTasks("bermuda", 2027).map((task) => task.key);

        expect(taskKeys).not.toContain("pre-emergent-2026");
        expect(taskKeys).toContain("pre-emergent-2027");
    });
});
