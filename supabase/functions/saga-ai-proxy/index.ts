// Supabase Edge Function: saga-ai-proxy
// Securely proxies AI requests to Gemini API without exposing API keys to client browsers

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, prompt, apiKey } = await req.json();
    const activeKey = apiKey || GEMINI_API_KEY;

    if (!activeKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API Key is not configured on the Edge Function server or in Admin Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Helper to dynamically get models supported by activeKey
    const getDynamicModels = async (key: string) => {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (res.ok) {
          const data = await res.json();
          const models = data.models || [];
          const valid = models
            .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
            .map((m: any) => m.name ? m.name.replace(/^models\//, "") : "")
            .filter(Boolean);
          if (valid.length > 0) return valid;
        }
      } catch (e) {
        console.warn("Dynamic model fetch failed:", e);
      }
      return [
        "gemini-3.6-flash",
        "gemini-3-flash",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-1.5-flash",
        "gemini-2.0-flash-lite"
      ];
    };

    const modelsToTry = await getDynamicModels(activeKey);
    const errorDetails: string[] = [];

    // Handle API Key Test Action
    if (action === "test") {
      for (const model of modelsToTry) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: "Hello, confirm connection." }] }]
              })
            }
          );
          const data = await res.json();
          if (res.ok) {
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Connection verified successfully.";
            return new Response(
              JSON.stringify({ success: true, modelUsed: model, text }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } else {
            const msg = data?.error?.message || `HTTP ${res.status}`;
            errorDetails.push(`[${model}]: ${msg}`);
          }
        } catch (e: any) {
          errorDetails.push(`[${model}]: ${e.message}`);
        }
      }

      const summaryError = errorDetails.length > 0 ? errorDetails.join(" | ") : "Invalid API Key or Quota issue";
      return new Response(
        JSON.stringify({ error: `API Key verification failed: ${summaryError}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default Chat Generation Action
    for (const model of modelsToTry) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
            })
          }
        );

        const data = await response.json();
        if (response.ok) {
          const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) {
            return new Response(
              JSON.stringify({ reply: replyText, modelUsed: model }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          const msg = data?.error?.message || `HTTP ${response.status}`;
          errorDetails.push(`[${model}]: ${msg}`);
        }
      } catch (e: any) {
        errorDetails.push(`[${model}]: ${e.message}`);
      }
    }

    const chatSummaryError = errorDetails.length > 0 ? errorDetails.join(" | ") : "Unable to generate response";
    return new Response(
      JSON.stringify({ error: `SAGA AI Error: ${chatSummaryError}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
