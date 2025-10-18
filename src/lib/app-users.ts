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
  // Check if user already exists
  const { data: existing } = await supabase
    .from("app_users")
    .select("auth0_sub, primary_profile_id")
    .eq("auth0_sub", auth0Sub)
    .maybeSingle();

  if (existing) {
    // User exists - only update what's provided
    const updatePayload: Record<string, unknown> = {
      email,
      email_verified: emailVerified,
    };

    // Only include additionalFields if explicitly provided
    if (additionalFields && Object.keys(additionalFields).length > 0) {
      Object.assign(updatePayload, additionalFields);
    }

    const { error } = await supabase
      .from("app_users")
      .update(updatePayload)
      .eq("auth0_sub", auth0Sub);

    return { error: error ?? null };
  }

  // User doesn't exist - insert new record
  const insertPayload = {
    auth0_sub: auth0Sub,
    email,
    email_verified: emailVerified,
    ...(additionalFields ?? {}),
  };

  const { error: insertError } = await supabase
    .from("app_users")
    .insert(insertPayload);

  if (!insertError) {
    return { error: null };
  }

  // Handle email conflict (user switching auth providers)
  if (insertError.code === "23505" && email) {
    const { data: existingByEmail } = await supabase
      .from("app_users")
      .select("auth0_sub")
      .eq("email", email)
      .maybeSingle();

    if (existingByEmail) {
      const { error } = await supabase
        .from("app_users")
        .update({
          auth0_sub: auth0Sub,
          email,
          email_verified: emailVerified,
          ...(additionalFields ?? {}),
        })
        .eq("auth0_sub", existingByEmail.auth0_sub);

      if (!error) {
        console.info("[app_users] re-associated login providers for email", {
          email,
          previousSub: existingByEmail.auth0_sub,
          nextSub: auth0Sub,
        });
      }

      return { error: error ?? null };
    }
  }

  return { error: insertError };
};
