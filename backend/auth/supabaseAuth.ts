import { createClient } from "@supabase/supabase-js";
import { Header, Cookie, APIError, Gateway } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { secret } from "encore.dev/config";

const supabaseUrl = secret("SupabaseUrl");
const supabaseServiceKey = secret("SupabaseServiceKey");

interface AuthParams {
  authorization?: Header<"Authorization">;
  session?: Cookie<"session">;
}

export interface AuthData {
  userID: string;
  imageUrl: string;
  email: string | null;
}

export const auth = authHandler<AuthParams, AuthData>(async (data) => {
  const token =
    data.authorization?.replace("Bearer ", "") ?? data.session?.value;
  if (!token) {
    throw APIError.unauthenticated("missing token");
  }

  const supabaseAdmin = createClient(supabaseUrl(), supabaseServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData.user) {
    throw APIError.unauthenticated("invalid token", error as Error);
  }

  const user = userData.user;
  return {
    userID: user.id,
    imageUrl: user.user_metadata?.avatar_url ?? "",
    email: user.email ?? null,
  };
});

export const gw = new Gateway({ authHandler: auth });
