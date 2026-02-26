import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.24.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Handle CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { image, mimeType, dateStr } = await req.json();

        if (!image || !mimeType) {
            return new Response(
                JSON.stringify({ error: "Missing image or mimeType" }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 400,
                }
            );
        }

        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: "GEMINI_API_KEY is not set in Supabase secrets" }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 500,
                }
            );
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const systemPrompt = `
You are an expert Bermuda grass lawn care specialist analyzing a photo of a residential lawn.
Today's date is ${dateStr}.

Analyze the image provided and return a JSON diagnosis with this exact structure:
{
  "condition_score": <integer 1-10, where 1=severely damaged/dead, 10=perfect golf-course quality>,
  "condition_label": <short label like "Dormant", "Healthy", "Stressed", "Weed Infested", "Patchy", "Needs Fertilizer">,
  "summary": <2-3 sentence plain English summary of overall lawn health>,
  "observations": [<array of brief bullet-point observations about what you see>],
  "issues": [
    {
      "type": <issue type e.g. "Dormancy", "Broadleaf Weeds", "Grassy Weeds", "Bare Patches", "Fungal Disease", "Pest Damage", "Drought Stress", "Thatch Buildup">,
      "severity": <"low" | "medium" | "high">,
      "description": <one sentence describing this specific issue>
    }
  ],
  "recommendations": [
    {
      "action": <specific action to take>,
      "urgency": <"low" | "medium" | "high">,
      "product_suggestion": <specific product name or null if no product needed>
    }
  ]
}

Context clues to use in your analysis:
- This is a Bermuda grass lawn in the Southern US
- If the grass appears brown/tan in winter months (Nov–Feb), that is NORMAL dormancy, not dead grass
- Look carefully for: weeds (broadleaf vs grassy), bare spots, discoloration, disease patterns, thatch
- Be specific with product suggestions (e.g., "Prodiamine 65 WDG", "Scotts Turf Builder", "Spectracide Weed Stop")
- If you cannot clearly see the lawn (too dark, blurry, wrong subject), say so in the summary and return condition_score: null

Return ONLY valid JSON. No markdown, no explanation outside the JSON.
`.trim();

        const result = await model.generateContent([
            systemPrompt,
            {
                inlineData: {
                    mimeType,
                    data: image,
                },
            },
        ]);

        const text = result.response.text().trim();
        // Strip markdown code fences if Gemini wraps the JSON
        const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

        return new Response(cleaned, {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (e) {
        const error = e as any;
        console.error("Error in diagnose-lawn function:", error);

        let errorMessage = error.message;
        let status = 500;

        // Friendly quota error
        if (errorMessage.includes("429") || errorMessage.includes("quota")) {
            errorMessage = "Gemini API quota exceeded. Your free tier may be maxed out for this minute/day.";
            status = 429;
        }

        return new Response(
            JSON.stringify({ error: errorMessage }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status,
            }
        );
    }
});
