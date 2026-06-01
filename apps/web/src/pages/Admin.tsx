import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Check,
  X,
  Play,
  Clock,
  Inbox,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.ts";
import { api } from "../lib/api.ts";

interface QuarantineRow {
  id: string;
  profile_id: string;
  course_id: string;
  semester: number;
  academic_year: number;
  grade: string;
  created_at: string;
  courses: { code: string; title: string } | null;
}

interface AdminStats {
  submissions: { quarantine: number; approved: number; rejected: number };
  lastMiningRun: {
    id: string;
    started_at: string;
    finished_at: string | null;
    status: "running" | "completed" | "failed";
    row_count_input: number | null;
  } | null;
}

interface AuditEntry {
  id: string;
  actor_id: string;
  action: string;
  target_id: string;
  notes: string | null;
  created_at: string;
}

export default function Admin() {
  const { user, loading } = useAuth();
  const isAdmin = user?.app_metadata?.["role"] === "admin";

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-4 text-center">
        <ShieldCheck className="text-gray-300" size={40} />
        <p className="font-semibold text-gray-900">Admin access required</p>
        <p className="text-sm text-gray-500">You don't have permission to view this page.</p>
        <Link to="/dashboard" className="text-primary text-sm font-semibold hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return <AdminConsole />;
}

function AdminConsole() {
  const qc = useQueryClient();

  const stats = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get<AdminStats>("/api/admin/stats"),
  });

  const queue = useQuery({
    queryKey: ["admin", "quarantine"],
    queryFn: () => api.get<QuarantineRow[]>("/api/admin/quarantine"),
  });

  const audit = useQuery({
    queryKey: ["admin", "audit-log"],
    queryFn: () => api.get<AuditEntry[]>("/api/admin/audit-log"),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
  };

  const runPipeline = useMutation({
    mutationFn: () => api.post<unknown>("/api/admin/mining/run", {}),
    onSuccess: refreshAll,
  });

  return (
    <div className="min-h-screen bg-background pb-8">
      <header className="sticky top-0 z-10 bg-white border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="text-primary shrink-0" size={20} />
            <p className="font-semibold text-primary truncate">Admin Console</p>
          </div>
          <Link
            to="/dashboard"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary shrink-0"
          >
            <ArrowLeft size={14} /> Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={Inbox}
            label="Quarantine"
            value={stats.data?.submissions.quarantine ?? "—"}
            tone="accent"
          />
          <StatCard
            icon={CheckCircle2}
            label="Approved"
            value={stats.data?.submissions.approved ?? "—"}
            tone="success"
          />
          <StatCard
            icon={XCircle}
            label="Rejected"
            value={stats.data?.submissions.rejected ?? "—"}
            tone="danger"
          />
        </div>

        {/* Mining pipeline */}
        <section className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-900">Mining pipeline</p>
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                <Clock size={12} />
                {stats.data?.lastMiningRun
                  ? `Last run ${formatDate(stats.data.lastMiningRun.started_at)} · ${stats.data.lastMiningRun.status}`
                  : "Never run"}
              </p>
            </div>
            <button
              onClick={() => runPipeline.mutate()}
              disabled={runPipeline.isPending}
              className="flex items-center gap-1.5 bg-primary text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors shrink-0"
            >
              {runPipeline.isPending ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Play size={14} />
              )}
              Run now
            </button>
          </div>
          {runPipeline.isError && (
            <p className="text-xs text-danger mt-2">
              {(runPipeline.error as Error).message || "Pipeline run failed."}
            </p>
          )}
          {runPipeline.isSuccess && (
            <p className="text-xs text-success mt-2">Pipeline run triggered.</p>
          )}
        </section>

        {/* Quarantine queue */}
        <section className="bg-white border border-border rounded-xl p-4 space-y-3">
          <p className="font-semibold text-sm text-gray-900">Quarantine queue</p>
          {queue.isLoading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : queue.data && queue.data.length > 0 ? (
            <ul className="space-y-2">
              {queue.data.map((row) => (
                <QueueItem key={row.id} row={row} onDone={refreshAll} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 py-2">Queue is empty — nothing to review.</p>
          )}
        </section>

        {/* Audit log */}
        <section className="bg-white border border-border rounded-xl p-4 space-y-3">
          <p className="font-semibold text-sm text-gray-900">Recent admin actions</p>
          {audit.data && audit.data.length > 0 ? (
            <ul className="space-y-1.5">
              {audit.data.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-border last:border-0"
                >
                  <span
                    className={`font-medium ${
                      entry.action.startsWith("approve") ? "text-success" : "text-danger"
                    }`}
                  >
                    {entry.action.replace("_submission", "")}
                  </span>
                  <span className="text-gray-400 tabular-nums shrink-0">
                    {formatDate(entry.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 py-1">No actions logged yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}

function QueueItem({ row, onDone }: { row: QuarantineRow; onDone: () => void }) {
  const [notes, setNotes] = useState("");

  const act = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      api.post<unknown>(`/api/admin/quarantine/${row.id}/${decision}`, {
        notes: notes || undefined,
      }),
    onSuccess: onDone,
  });

  return (
    <li className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {row.courses?.code ?? "—"}{" "}
            <span className="font-normal text-gray-500">· {row.grade}</span>
          </p>
          <p className="text-xs text-gray-500 truncate">{row.courses?.title}</p>
          <p className="text-xs text-gray-400">
            Sem {row.semester} · {row.academic_year}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => act.mutate("approve")}
            disabled={act.isPending}
            aria-label="Approve"
            className="flex items-center gap-1 bg-success/10 text-success text-xs font-semibold px-2.5 py-1.5 rounded-md hover:bg-success/20 disabled:opacity-60"
          >
            <Check size={14} /> Approve
          </button>
          <button
            onClick={() => act.mutate("reject")}
            disabled={act.isPending}
            aria-label="Reject"
            className="flex items-center gap-1 bg-danger/10 text-danger text-xs font-semibold px-2.5 py-1.5 rounded-md hover:bg-danger/20 disabled:opacity-60"
          >
            <X size={14} /> Reject
          </button>
        </div>
      </div>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional note…"
        className="w-full text-xs border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {act.isError && (
        <p className="text-xs text-danger">{(act.error as Error).message || "Action failed."}</p>
      )}
    </li>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Inbox;
  label: string;
  value: number | string;
  tone: "accent" | "success" | "danger";
}) {
  const toneClass = {
    accent: "text-accent",
    success: "text-success",
    danger: "text-danger",
  }[tone];
  return (
    <div className="bg-white border border-border rounded-xl p-3 text-center">
      <Icon className={`mx-auto ${toneClass}`} size={18} />
      <p className="font-bold text-xl text-primary tabular-nums mt-1">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
