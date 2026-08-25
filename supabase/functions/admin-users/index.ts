// Supabase Edge Function: admin-users
//
// Settings > User Management needs to create/edit/delete login accounts and
// reset other users' passwords. All of that requires the Supabase Admin Auth
// API (supabase.auth.admin.*), which only works with the service_role key —
// a key that must never reach the browser. This function is the one place
// that key is used: it runs server-side, verifies the CALLER is a logged-in
// admin, and only then performs the requested action.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to
// every deployed Edge Function by Supabase — nothing to configure manually
// for those two. Deploy with: supabase functions deploy admin-users

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Every call runs as the service role — RLS is bypassed entirely, so the
    // admin check below is the ONLY thing standing between an ordinary staff
    // login and full account-management power. Get this right.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return json({ error: "Not authenticated." }, 401);
    }

    const { data: callerData, error: callerErr } = await admin.auth.getUser(jwt);
    if (callerErr || !callerData?.user) {
      return json({ error: "Not authenticated." }, 401);
    }
    const callerId = callerData.user.id;

    const { data: callerProfile, error: profileErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();
    if (profileErr || callerProfile?.role !== "admin") {
      return json({ error: "Only administrators can manage user accounts." }, 403);
    }

    const body = await req.json();
    const { action } = body;

    // ---- CREATE ------------------------------------------------------
    if (action === "create") {
      const { email, username, fullName, password, role } = body;
      if (!email || !username || !password) {
        return json({ error: "Email, username and password are required." }, 400);
      }
      if (password.length < 6) {
        return json({ error: "Password must be at least 6 characters." }, 400);
      }
      if (role !== "admin" && role !== "user") {
        return json({ error: "Role must be 'admin' or 'user'." }, 400);
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || username,
          username,
          role,
        },
      });
      if (createErr) {
        // e.g. "A user with this email address has already been registered"
        return json({ error: createErr.message }, 400);
      }

      return json({ data: { id: created.user?.id } });
    }

    // ---- UPDATE --------------------------------------------------------
    if (action === "update") {
      const { id, email, username, fullName, password, role } = body;
      if (!id) return json({ error: "User id is required." }, 400);
      if (role && role !== "admin" && role !== "user") {
        return json({ error: "Role must be 'admin' or 'user'." }, 400);
      }
      if (password && password.length < 6) {
        return json({ error: "Password must be at least 6 characters." }, 400);
      }

      // Auth-side fields (email/password) only if actually changing — an
      // empty update call still triggers Supabase's own auth-change events
      // for that user, so it's skipped unless there's something to apply.
      if (email || password) {
        const authPayload: Record<string, string> = {};
        if (email) authPayload.email = email;
        if (password) authPayload.password = password;
        const { error: authErr } = await admin.auth.admin.updateUserById(id, authPayload);
        if (authErr) return json({ error: authErr.message }, 400);
      }

      // Profile-side fields.
      const profilePayload: Record<string, string> = {};
      if (username) profilePayload.username = username;
      if (fullName !== undefined) profilePayload.full_name = fullName || username || "";
      if (role) profilePayload.role = role;

      if (Object.keys(profilePayload).length > 0) {
        const { error: updateErr } = await admin
          .from("profiles")
          .update(profilePayload)
          .eq("id", id);
        if (updateErr) return json({ error: updateErr.message }, 400);
      }

      return json({ data: { id } });
    }

    // ---- DELETE ----------------------------------------------------------
    if (action === "delete") {
      const { id } = body;
      if (!id) return json({ error: "User id is required." }, 400);
      if (id === callerId) {
        return json({ error: "You can't delete your own account while signed in as it." }, 400);
      }

      const { error: deleteErr } = await admin.auth.admin.deleteUser(id);
      if (deleteErr) return json({ error: deleteErr.message }, 400);

      return json({ data: { id } });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("admin-users error:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected server error." }, 500);
  }
});
