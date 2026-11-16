import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Server configuration is incomplete. Ask the administrator to configure the invitation service." }, { status: 500 });
    }

    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return NextResponse.json({ error: "Your session is invalid or expired." }, { status: 401 });

    const { data: caller, error: profileError } = await userClient
      .from("profiles")
      .select("role,is_active")
      .eq("id", authData.user.id)
      .single();
    if (profileError || caller?.role !== "admin" || caller?.is_active !== true) {
      return NextResponse.json({ error: "Only an active administrator can invite employees." }, { status: 403 });
    }

    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const full_name = String(body.full_name || "").trim();
    const position = String(body.position || "").trim();
    const role = String(body.role || "engineer");
    if (!email || !full_name) return NextResponse.json({ error: "Email address and full name are required." }, { status: 400 });
    if (!["admin", "engineer", "viewer"].includes(role)) return NextResponse.json({ error: "Invalid account role." }, { status: 400 });

    const adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const redirectTo = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo
    });
    if (inviteError || !inviteData.user) {
      return NextResponse.json({ error: inviteError?.message || "Unable to create invitation." }, { status: 400 });
    }

    const { error: upsertError } = await adminClient.from("profiles").upsert({
      id: inviteData.user.id,
      full_name,
      position: position || null,
      role,
      is_active: true
    }, { onConflict: "id" });

    if (upsertError) {
      return NextResponse.json({ error: `Invitation was created, but the employee profile could not be saved: ${upsertError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, user_id: inviteData.user.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected invitation error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
