import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

export const sanitizeEmail = (email: string | undefined | null): string | null => {
  if (!email) return null;
  return email.trim().toLowerCase();
};

type UpsertAppUserOptions = {
  supabase: SupabaseClient;
  auth0Sub: string;
  email: string | null;
  emailVerified: boolean | null;
  additionalFields?: Record<string, unknown>;
};

type UpsertAppUserResult = {
  error: PostgrestError | null;
};

export const upsertAppUser = async ({
  supabase,
  auth0Sub,
  email,
  emailVerified,
  additionalFields,
}: UpsertAppUserOptions): Promise<UpsertAppUserResult> => {
  const payload = {
    auth0_sub: auth0Sub,
    email,
    email_verified: emailVerified,
    ...(additionalFields ?? {}),
  };

  const { error } = await supabase
    .from("app_users")
    .upsert(payload, { onConflict: "auth0_sub" });

  if (!error) {
    return { error: null };
  }

  const uniqueEmailViolation = error.code === "23505";

  if (!uniqueEmailViolation || !email) {
    return { error };
  }

  const { data: existingByEmail, error: lookupError } = await supabase
    .from("app_users")
    .select("auth0_sub")
    .eq("email", email)
    .maybeSingle();

  if (lookupError || !existingByEmail) {
    return { error };
  }

  const { error: updateError } = await supabase
    .from("app_users")
    .update(payload)
    .eq("auth0_sub", existingByEmail.auth0_sub);

  if (!updateError) {
    console.info("[app_users] re-associated login providers for email", {
      email,
      previousSub: existingByEmail.auth0_sub,
      nextSub: auth0Sub,
    });
  }

  return { error: updateError ?? null };
};
