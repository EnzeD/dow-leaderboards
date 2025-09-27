import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const CHOICE_NO = 'No';
const PRICE_CHOICE_PATTERN = /^\$?\d+(\.\d{1,2})?\/month$/;
const LEGACY_TEXT_CHOICE_PATTERN = /^(Yes|Maybe)/i;

const isValidSurveyChoice = (choice: string): boolean => {
  if (choice === CHOICE_NO) return true;
  if (LEGACY_TEXT_CHOICE_PATTERN.test(choice)) return true;
  return PRICE_CHOICE_PATTERN.test(choice);
};

type PremiumInterestPayload = {
  alias: string;
  profileId?: string | number | null;
  playerName?: string | null;
  choice?: string | null;
  email?: string | null;
  responseId?: string | null;
  source?: string | null;
};

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
  }

  let payload: PremiumInterestPayload;
  try {
    payload = await req.json();
  } catch (error) {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const aliasRaw = typeof payload.alias === 'string' ? payload.alias.trim() : '';
  if (!aliasRaw) {
    return NextResponse.json({ error: 'missing_alias' }, { status: 400 });
  }

  const choiceInput = typeof payload.choice === 'string' ? payload.choice.trim() : '';
  const choiceRaw = choiceInput && choiceInput.toLowerCase() === CHOICE_NO.toLowerCase()
    ? CHOICE_NO
    : choiceInput;
  const responseId = typeof payload.responseId === 'string' ? payload.responseId : null;
  const emailRaw = typeof payload.email === 'string' ? payload.email.trim() : '';
  const sourceRaw = typeof payload.source === 'string' && payload.source.trim().length > 0 ? payload.source.trim() : 'search_teaser';
  const profileId = payload.profileId !== undefined && payload.profileId !== null ? String(payload.profileId) : null;
  const playerName = typeof payload.playerName === 'string' ? payload.playerName.trim() : null;

  if (!choiceRaw && !responseId) {
    return NextResponse.json({ error: 'missing_choice' }, { status: 400 });
  }

  if (choiceRaw && !isValidSurveyChoice(choiceRaw)) {
    return NextResponse.json({ error: 'invalid_choice' }, { status: 400 });
  }

  if (emailRaw && !EMAIL_REGEX.test(emailRaw)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  let resolvedResponseId = responseId;

  if (!resolvedResponseId && profileId) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('premium_interest_leads')
      .select('id')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (existingError) {
      console.error('Failed to query existing premium interest lead', existingError);
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
    }

    if (existing?.id) {
      resolvedResponseId = existing.id;
    }
  }

  if (!resolvedResponseId) {
    const { data, error } = await supabaseAdmin
      .from('premium_interest_leads')
      .insert({
        alias_submitted: aliasRaw,
        profile_id: profileId,
        player_name: playerName,
        survey_choice: choiceRaw,
        email: emailRaw || null,
        source: sourceRaw,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to insert premium interest lead', error);
      return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
    }

    return NextResponse.json({ id: data?.id }, { status: 201 });
  }

  const updatePayload: Record<string, unknown> = {
    alias_submitted: aliasRaw,
    profile_id: profileId,
    player_name: playerName,
    source: sourceRaw,
  };

  if (choiceRaw) {
    updatePayload.survey_choice = choiceRaw;
  }
  if (payload.email !== undefined) {
    updatePayload.email = emailRaw || null;
  }

  const { data, error } = await supabaseAdmin
    .from('premium_interest_leads')
    .update(updatePayload)
    .eq('id', resolvedResponseId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Failed to update premium interest lead', error);
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  if (data?.id) {
    return NextResponse.json({ id: data.id }, { status: 200 });
  }

  const { data: inserted, error: insertOnUpdateError } = await supabaseAdmin
    .from('premium_interest_leads')
    .insert({
      alias_submitted: aliasRaw,
      profile_id: profileId,
      player_name: playerName,
      survey_choice: choiceRaw || null,
      email: emailRaw || null,
      source: sourceRaw,
    })
    .select('id')
    .single();

  if (insertOnUpdateError) {
    console.error('Failed to upsert premium interest lead', insertOnUpdateError);
    return NextResponse.json({ error: 'upsert_failed' }, { status: 500 });
  }

  return NextResponse.json({ id: inserted?.id }, { status: 201 });
}
