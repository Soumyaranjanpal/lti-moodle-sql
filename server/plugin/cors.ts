export default defineEventHandler((event) => {
  appendResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });

  if (event.method === "OPTIONS") {
    return ""; // allow all OPTIONS preflight
  }
});
