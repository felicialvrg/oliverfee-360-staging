import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {safeAuthPath,confirmationOrigin} from "@/lib/account-flow";
import { authConfigured } from "@/lib/config";

// Landing spot for invite and password-reset links.
// Signs the user in from the one-time token, then sends them on (usually to /set-password).
export async function GET(request: NextRequest) {
  const origin=confirmationOrigin(request.nextUrl.origin,process.env.NEXT_PUBLIC_SITE_URL);
  if(!authConfigured())return NextResponse.redirect(new URL("/login?error=unavailable",origin));
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const nextParam = type==="signup" ? "/" : searchParams.get("next") ?? "/";
  // Only allow redirects within this site.
  const next = safeAuthPath(nextParam);

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  return NextResponse.redirect(new URL(ok ? next : "/login?error=link-expired", origin));
}
