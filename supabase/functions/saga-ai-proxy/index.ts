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

    const modelsToTry = [
      "gemini-1.5-flash",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro"
    ];

    // Handle API Key Test Action
    if (action === "test") {
      let lastError = null;
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
            lastError = data?.error?.message || `HTTP ${res.status}`;
          }
        } catch (e) {
          lastError = e.message;
        }
      }
      return new Response(
        JSON.stringify({ error: `Verification failed: ${lastError}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default Chat Generation Action
    let lastError = null;
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
          lastError = data?.error?.message || `HTTP ${response.status}`;
        }
      } catch (e) {
        lastError = e.message;
      }
    }

    return new Response(
      JSON.stringify({ error: `SAGA AI Error: ${lastError || 'Unable to generate response'}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
