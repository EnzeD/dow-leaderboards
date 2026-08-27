"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TournamentPromo } from "@/app/_components/TournamentPromo";
import type {
  PublicTournament,
  Tournament,
  TournamentDraft,
} from "@/lib/tournaments/types";

type ManagerPayload = {
  tournaments: Tournament[];
  activeTournamentId: string | null;
};

type FormState = TournamentDraft;

const demoTournament: Tournament = {
  id: "preview-tournament",
  name: "Dawn of War Community Championship",
  description: "A community tournament bringing together the strongest commanders.",
  tournamentDate: "2026-09-12",
  startTimeLabel: "13:00",
  timezoneLabel: "CEST",
  prizePoolLabel: "Prize pool: $3,000",
  imageUrl: "https://www.dow-de.com/assets/world-championship.png",
  ctaLabel: "Join the Discord",
  ctaUrl: "https://discord.gg/p6WNEuhgvV",
  state: "draft",
  createdAt: "2026-08-27T12:00:00.000Z",
  updatedAt: "2026-08-27T12:00:00.000Z",
};

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  tournamentDate: new Date().toISOString().slice(0, 10),
  startTimeLabel: "",
  timezoneLabel: "",
  prizePoolLabel: "",
  imageUrl: "",
  ctaLabel: "Join the tournament",
  ctaUrl: "",
});

const formFromTournament = (tournament: Tournament): FormState => ({
  name: tournament.name,
  description: tournament.description ?? "",
  tournamentDate: tournament.tournamentDate,
  startTimeLabel: tournament.startTimeLabel ?? "",
  timezoneLabel: tournament.timezoneLabel ?? "",
  prizePoolLabel: tournament.prizePoolLabel ?? "",
  imageUrl: tournament.imageUrl,
  ctaLabel: tournament.ctaLabel,
  ctaUrl: tournament.ctaUrl,
});

const fieldClassName =
  "mt-1.5 w-full rounded-lg border border-neutral-700/70 bg-neutral-950/70 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-400/20 disabled:cursor-not-allowed disabled:opacity-60";

const formatUpdatedAt = (value: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));

const requestJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || "Request failed.");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload as T;
};

const statusFor = (
  tournament: Tournament,
  activeTournamentId: string | null,
): { label: string; className: string } => {
  if (tournament.state === "archived") {
    return { label: "Archived", className: "border-neutral-600/60 bg-neutral-700/30 text-neutral-300" };
  }
  if (tournament.tournamentDate < new Date().toISOString().slice(0, 10)) {
    return { label: "Expired", className: "border-amber-500/40 bg-amber-500/10 text-amber-200" };
  }
  if (tournament.id === activeTournamentId) {
    return { label: "Active", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" };
  }
  return { label: "Draft", className: "border-blue-500/40 bg-blue-500/10 text-blue-200" };
};

export function TournamentManager({ previewMode = false }: { previewMode?: boolean }) {
  const [tournaments, setTournaments] = useState<Tournament[]>(
    previewMode ? [demoTournament] : [],
  );
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(
    previewMode ? demoTournament.id : null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    previewMode ? demoTournament.id : null,
  );
  const [form, setForm] = useState<FormState>(
    previewMode ? formFromTournament(demoTournament) : emptyForm,
  );
  const [loading, setLoading] = useState(!previewMode);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const selectedTournament = useMemo(
    () => tournaments.find((tournament) => tournament.id === selectedId) ?? null,
    [selectedId, tournaments],
  );
  const editingArchived = selectedTournament?.state === "archived";

  const load = useCallback(async (preferredId?: string | null) => {
    if (previewMode) return;
    setLoading(true);
    try {
      const payload = await requestJson<ManagerPayload>("/api/tournaments/manage");
      setTournaments(payload.tournaments);
      setActiveTournamentId(payload.activeTournamentId);
      const nextId =
        preferredId && payload.tournaments.some((item) => item.id === preferredId)
          ? preferredId
          : null;
      if (nextId) {
        const nextTournament = payload.tournaments.find((item) => item.id === nextId)!;
        setSelectedId(nextId);
        setForm(formFromTournament(nextTournament));
      }
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Unable to load tournaments." });
    } finally {
      setLoading(false);
    }
  }, [previewMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginCreate = () => {
    setSelectedId(null);
    setForm(emptyForm());
    setMessage(null);
  };

  const beginEdit = (tournament: Tournament) => {
    setSelectedId(tournament.id);
    setForm(formFromTournament(tournament));
    setMessage(null);
  };

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (previewMode) {
        const timestamp = new Date().toISOString();
        if (selectedTournament) {
          const updated: Tournament = {
            ...selectedTournament,
            ...form,
            description: form.description || null,
            startTimeLabel: form.startTimeLabel || null,
            timezoneLabel: form.timezoneLabel || null,
            prizePoolLabel: form.prizePoolLabel || null,
            updatedAt: timestamp,
          };
          setTournaments((current) => current.map((item) => item.id === updated.id ? updated : item));
          setMessage({ tone: "success", text: "Preview tournament saved locally." });
        } else {
          const created: Tournament = {
            id: `preview-${Date.now()}`,
            ...form,
            description: form.description || null,
            startTimeLabel: form.startTimeLabel || null,
            timezoneLabel: form.timezoneLabel || null,
            prizePoolLabel: form.prizePoolLabel || null,
            state: "draft",
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          setTournaments((current) => [created, ...current]);
          setSelectedId(created.id);
          setMessage({ tone: "success", text: "Preview draft created locally." });
        }
        return;
      }
      if (selectedTournament) {
        const payload = await requestJson<{ tournament: Tournament }>(
          `/api/tournaments/manage/${selectedTournament.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ ...form, updatedAt: selectedTournament.updatedAt }),
          },
        );
        setMessage({ tone: "success", text: "Tournament saved." });
        await load(payload.tournament.id);
      } else {
        const payload = await requestJson<{ tournament: Tournament }>(
          "/api/tournaments/manage",
          { method: "POST", body: JSON.stringify(form) },
        );
        setMessage({ tone: "success", text: "Tournament created as a draft." });
        await load(payload.tournament.id);
      }
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      setMessage({
        tone: "error",
        text:
          status === 409
            ? "This tournament changed since you opened it. Reload it before saving again."
            : error instanceof Error
              ? error.message
              : "Unable to save the tournament.",
      });
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: "activate" | "deactivate" | "archive") => {
    if (!selectedTournament) return;
    if (action === "archive" && !window.confirm("Archive this tournament? Its database history will be preserved.")) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (previewMode) {
        if (action === "activate") setActiveTournamentId(selectedTournament.id);
        if (action === "deactivate") setActiveTournamentId(null);
        if (action === "archive") {
          setTournaments((current) => current.map((item) =>
            item.id === selectedTournament.id ? { ...item, state: "archived" } : item,
          ));
          if (activeTournamentId === selectedTournament.id) setActiveTournamentId(null);
        }
        setMessage({ tone: "success", text: `Preview action applied locally: ${action}.` });
        return;
      }
      await requestJson(`/api/tournaments/manage/${selectedTournament.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(
          action === "archive" ? { updatedAt: selectedTournament.updatedAt } : {},
        ),
      });
      setMessage({
        tone: "success",
        text:
          action === "activate"
            ? "Tournament activated on the homepage."
            : action === "deactivate"
              ? "Tournament removed from the homepage."
              : "Tournament archived.",
      });
      await load(selectedTournament.id);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : `Unable to ${action} tournament.` });
    } finally {
      setSaving(false);
    }
  };

  const preview = useMemo<PublicTournament | null>(() => {
    if (!form.name || !form.tournamentDate || !form.imageUrl || !form.ctaLabel || !form.ctaUrl) {
      return null;
    }
    return {
      id: selectedId ?? "preview",
      name: form.name,
      description: form.description || null,
      tournamentDate: form.tournamentDate,
      startTimeLabel: form.startTimeLabel || null,
      timezoneLabel: form.timezoneLabel || null,
      prizePoolLabel: form.prizePoolLabel || null,
      imageUrl: form.imageUrl,
      ctaLabel: form.ctaLabel,
      ctaUrl: form.ctaUrl,
    };
  }, [form, selectedId]);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-8 text-neutral-100 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/" className="text-sm font-medium text-neutral-400 transition hover:text-white">
            ← Back to leaderboards
          </Link>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
            Tournament tools
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Manage tournament spotlight</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Create promotions, preview the homepage banner, and choose the single active tournament.
          </p>
          {previewMode && (
            <p className="mt-3 inline-flex rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-200">
              Development UI preview — changes stay in this browser session
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={beginCreate}
          className="rounded-lg border border-indigo-400/40 bg-indigo-500/80 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Create tournament
        </button>
      </header>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${message.tone === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-red-500/40 bg-red-500/10 text-red-200"}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-neutral-700/60 bg-neutral-900/80 p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Tournaments</h2>
            <span className="text-xs text-neutral-500">{tournaments.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {loading && <p className="py-6 text-center text-sm text-neutral-500">Loading…</p>}
            {!loading && tournaments.length === 0 && (
              <p className="rounded-lg border border-dashed border-neutral-700/70 px-4 py-6 text-center text-sm text-neutral-500">
                No tournaments yet.
              </p>
            )}
            {tournaments.map((tournament) => {
              const status = statusFor(tournament, activeTournamentId);
              return (
                <button
                  type="button"
                  key={tournament.id}
                  onClick={() => beginEdit(tournament)}
                  className={`w-full rounded-xl border p-3 text-left transition ${selectedId === tournament.id ? "border-indigo-400/60 bg-indigo-500/10" : "border-neutral-700/60 bg-neutral-950/40 hover:bg-neutral-800/60"}`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{tournament.name}</span>
                      <span className="mt-1 block text-xs text-neutral-500">{tournament.tournamentDate}</span>
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${status.className}`}>
                      {status.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-2xl border border-neutral-700/60 bg-neutral-900/80 p-5 shadow-lg sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {selectedTournament ? "Edit tournament" : "New tournament"}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  {editingArchived ? "Archived tournaments are read-only." : "Activation is a separate manual action after saving."}
                </p>
              </div>
              {selectedTournament && (
                <span className="text-xs text-neutral-500">
                  Updated {formatUpdatedAt(selectedTournament.updatedAt)}
                </span>
              )}
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="sm:col-span-2 text-sm font-medium text-neutral-300">
                Tournament name
                <input disabled={editingArchived} className={fieldClassName} value={form.name} onChange={(event) => updateField("name", event.target.value)} maxLength={120} />
              </label>
              <label className="sm:col-span-2 text-sm font-medium text-neutral-300">
                Short description <span className="text-neutral-600">(optional)</span>
                <textarea disabled={editingArchived} className={`${fieldClassName} min-h-24 resize-y`} value={form.description ?? ""} onChange={(event) => updateField("description", event.target.value)} maxLength={280} />
              </label>
              <label className="text-sm font-medium text-neutral-300">
                Tournament date
                <input disabled={editingArchived} type="date" className={fieldClassName} value={form.tournamentDate} onChange={(event) => updateField("tournamentDate", event.target.value)} />
              </label>
              <label className="text-sm font-medium text-neutral-300">
                Start time <span className="text-neutral-600">(optional)</span>
                <input disabled={editingArchived} className={fieldClassName} value={form.startTimeLabel ?? ""} onChange={(event) => updateField("startTimeLabel", event.target.value)} placeholder="13:00" maxLength={80} />
              </label>
              <label className="text-sm font-medium text-neutral-300">
                Timezone <span className="text-neutral-600">(optional)</span>
                <input disabled={editingArchived} className={fieldClassName} value={form.timezoneLabel ?? ""} onChange={(event) => updateField("timezoneLabel", event.target.value)} placeholder="Moscow time" maxLength={80} />
              </label>
              <label className="text-sm font-medium text-neutral-300">
                Prize pool <span className="text-neutral-600">(optional)</span>
                <input disabled={editingArchived} className={fieldClassName} value={form.prizePoolLabel ?? ""} onChange={(event) => updateField("prizePoolLabel", event.target.value)} placeholder="Prize pool: $3,000" maxLength={80} />
              </label>
              <label className="sm:col-span-2 text-sm font-medium text-neutral-300">
                Image URL
                <input disabled={editingArchived} type="url" className={fieldClassName} value={form.imageUrl} onChange={(event) => updateField("imageUrl", event.target.value)} placeholder="https://example.com/tournament-logo.webp" />
              </label>
              <label className="text-sm font-medium text-neutral-300">
                Button label
                <input disabled={editingArchived} className={fieldClassName} value={form.ctaLabel} onChange={(event) => updateField("ctaLabel", event.target.value)} maxLength={60} />
              </label>
              <label className="text-sm font-medium text-neutral-300">
                Button URL
                <input disabled={editingArchived} type="url" className={fieldClassName} value={form.ctaUrl} onChange={(event) => updateField("ctaUrl", event.target.value)} placeholder="https://discord.gg/…" />
              </label>
            </div>

            {!editingArchived && (
              <div className="mt-6 flex flex-wrap gap-3 border-t border-neutral-700/60 pt-5">
                <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50">
                  {saving ? "Saving…" : selectedTournament ? "Save changes" : "Create draft"}
                </button>
                {selectedTournament && selectedTournament.id !== activeTournamentId && (
                  <button type="button" disabled={saving} onClick={() => void runAction("activate")} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50">
                    Activate on homepage
                  </button>
                )}
                {selectedTournament?.id === activeTournamentId && (
                  <button type="button" disabled={saving} onClick={() => void runAction("deactivate")} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50">
                    Remove from homepage
                  </button>
                )}
                {selectedTournament && (
                  <button type="button" disabled={saving} onClick={() => void runAction("archive")} className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50">
                    Archive
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-700/60 bg-neutral-900/60 p-4 sm:p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">Homepage preview</h2>
            {preview ? (
              <TournamentPromo tournament={preview} preview />
            ) : (
              <p className="rounded-xl border border-dashed border-neutral-700/70 px-4 py-8 text-center text-sm text-neutral-500">
                Complete the required fields to preview the banner.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
