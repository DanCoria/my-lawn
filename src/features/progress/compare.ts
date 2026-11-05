export type ComparisonStatus =
    | "improving"
    | "unchanged"
    | "worsening"
    | "resolved"
    | "unable_to_determine";

export interface ComparisonProposal {
    status: ComparisonStatus;
    summary: string;
    evidence: string[];
}

export interface ComparisonPresentation {
    label: string;
    guidance: string;
    tone: "positive" | "neutral" | "warning";
}

const presentations: Record<ComparisonStatus, ComparisonPresentation> = {
    improving: {
        label: "Improving",
        guidance: "Keep following the current plan and compare again at the next check.",
        tone: "positive",
    },
    unchanged: {
        label: "About the same",
        guidance: "Give the current step its full response window before changing course.",
        tone: "neutral",
    },
    worsening: {
        label: "Getting worse",
        guidance: "Return to the active plan and review the next verification step.",
        tone: "warning",
    },
    resolved: {
        label: "Resolved",
        guidance: "Confirm this to close the rescue plan and return to maintenance mode.",
        tone: "positive",
    },
    unable_to_determine: {
        label: "Needs a clearer photo",
        guidance: "Take a clearer photo from the same angle and distance as the original.",
        tone: "neutral",
    },
};

export function comparisonPresentation(status: ComparisonStatus): ComparisonPresentation {
    return presentations[status];
}

export function proposeComparison(
    status: ComparisonStatus,
    summary: string,
    evidence: string[],
): Readonly<ComparisonProposal> {
    return Object.freeze({ status, summary, evidence: Object.freeze([...evidence]) as unknown as string[] });
}
