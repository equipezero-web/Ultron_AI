export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return Response.json(
        {
          status: "online",
          service: "ultron-ai-cloudflare-worker",
         gemini: Boolean(env.GEMINI_API_KEY),
geminiBindingPresent: Object.prototype.hasOwnProperty.call(
  env,
  "GEMINI_API_KEY"
),
geminiValueLength: String(env.GEMINI_API_KEY || "").length,

elevenlabs: Boolean(
  env.ELEVENLABS_API_KEY &&
  env.ELEVENLABS_VOICE_ID
),
          deviceBridge: Boolean(env.DEVICE_BRIDGE_URL),
          message: "Cloudflare Worker funcionando."
        },
        {
          headers: corsHeaders
        }
      );
    }

    return Response.json(
      {
        status: "online",
        service: "ultron-ai-cloudflare-worker",
        routes: [
          "GET /api/health"
        ]
      },
      {
        headers: corsHeaders
      }
    );
  }
};
