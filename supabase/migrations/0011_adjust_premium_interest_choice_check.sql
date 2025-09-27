-- Allow premium interest survey to capture flexible price strings while keeping "No" explicit
alter table public.premium_interest_leads
  drop constraint if exists premium_interest_leads_survey_choice_check;

alter table public.premium_interest_leads
  add constraint premium_interest_leads_survey_choice_check
  check (
    survey_choice is null
    or survey_choice = 'No'
    or survey_choice ~ '^(Yes|Maybe)'
    or survey_choice ~ '^\$?\d+(\.\d{1,2})?/month$'
  );
