import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
type RequiredEnv = typeof requiredEnv[number];

function getEnv(name: RequiredEnv) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }
  return value;
}

const SUPABASE_URL = getEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (_req) => {
  try {
    const { error } = await supabase.rpc("stats_refresh_global");
    if (error) {
      console.error("stats_refresh_global failed", error);
      throw error;
    }

    return new Response(
      JSON.stringify(
        { status: "ok", refreshedAt: new Date().toISOString() },
        null,
        2,
      ),
      {
        headers: { "content-type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Stats refresh failed", err);
    return new Response(
      JSON.stringify(
        {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        },
        null,
        2,
      ),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
});
