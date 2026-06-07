import { useState } from "react";
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  BookOpen,
} from "lucide-react";
import { WORKFLOWS, type Workflow } from "./guideData";
import { cn } from "../../app/components/ui/utils";

export function WorkflowGuide({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [activeTab, setActiveTab] = useState<"steps" | "errors" | "tips">("steps");

  function openWorkflow(wf: Workflow) {
    setSelected(wf);
    setActiveTab("steps");
  }

  function back() {
    setSelected(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Workflow Guide"
        className="relative z-10 flex flex-col w-full max-w-[480px] bg-background border-l border-border shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            {selected && (
              <button
                type="button"
                onClick={back}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Back to workflow list"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <BookOpen size={15} className="text-primary" />
                <h2 className="text-sm font-bold text-foreground">
                  {selected ? selected.title : "Workflow Guide"}
                </h2>
              </div>
              {!selected && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Step-by-step guides for every workflow
                </p>
              )}
              {selected && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selected.subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close guide"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <WorkflowDetail workflow={selected} activeTab={activeTab} setActiveTab={setActiveTab} />
          ) : (
            <WorkflowList onSelect={openWorkflow} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Workflow list ──────────────────────────────────────────────────────── */

function WorkflowList({ onSelect }: { onSelect: (wf: Workflow) => void }) {
  return (
    <div className="p-4 space-y-2">
      <p className="text-xs text-muted-foreground px-1 pb-1 font-medium uppercase tracking-wide">
        Select a workflow
      </p>
      {WORKFLOWS.map((wf) => (
        <button
          key={wf.id}
          type="button"
          onClick={() => onSelect(wf)}
          className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all text-left group"
        >
          <span className="text-2xl shrink-0">{wf.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              {wf.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {wf.subtitle}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock size={10} />
              {wf.estimatedTime}
            </span>
            <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </button>
      ))}
    </div>
  );
}

/* ─── Workflow detail ────────────────────────────────────────────────────── */

function WorkflowDetail({
  workflow,
  activeTab,
  setActiveTab,
}: {
  workflow: Workflow;
  activeTab: "steps" | "errors" | "tips";
  setActiveTab: (t: "steps" | "errors" | "tips") => void;
}) {
  const hasTips = (workflow.tips?.length ?? 0) > 0;
  const hasErrors = workflow.errors.length > 0;

  return (
    <div className="flex flex-col">
      {/* Meta bar */}
      <div className="px-5 py-3 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock size={11} />
            <span>{workflow.estimatedTime}</span>
          </span>
          <span className="text-muted-foreground/40 text-xs">·</span>
          <span className="text-xs text-muted-foreground">
            {workflow.steps.length} steps
          </span>
          {hasErrors && (
            <>
              <span className="text-muted-foreground/40 text-xs">·</span>
              <span className="text-xs text-muted-foreground">
                {workflow.errors.length} known errors
              </span>
            </>
          )}
        </div>
      </div>

      {/* Prerequisites */}
      <div className="px-5 pt-4 pb-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
            <Info size={12} />
            Before you start
          </p>
          <ul className="space-y-1.5">
            {workflow.prerequisites.map((pre, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 size={12} className="text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
                <span
                  className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: pre }}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 pb-1">
        <div className="flex gap-1 p-1 rounded-lg bg-muted">
          {(
            [
              { id: "steps", label: `Steps (${workflow.steps.length})` },
              ...(hasErrors ? [{ id: "errors", label: `Errors (${workflow.errors.length})` }] : []),
              ...(hasTips ? [{ id: "tips", label: `Tips (${workflow.tips!.length})` }] : []),
            ] as { id: "steps" | "errors" | "tips"; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 py-1.5 rounded-md text-xs font-medium transition-all",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-5 py-4">
        {activeTab === "steps" && <StepsTab workflow={workflow} />}
        {activeTab === "errors" && <ErrorsTab workflow={workflow} />}
        {activeTab === "tips" && <TipsTab workflow={workflow} />}
      </div>
    </div>
  );
}

/* ─── Steps tab ─────────────────────────────────────────────────────────── */

function StepsTab({ workflow }: { workflow: Workflow }) {
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <div className="space-y-2">
      {workflow.steps.map((step, i) => {
        const isOpen = expanded === i;
        return (
          <div
            key={i}
            className={cn(
              "rounded-xl border transition-all",
              isOpen
                ? "border-primary/30 bg-primary/5 dark:bg-primary/10"
                : "border-border bg-card hover:border-border/80"
            )}
          >
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : i)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <span
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors",
                  isOpen
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  "flex-1 text-sm font-medium transition-colors",
                  isOpen ? "text-primary" : "text-foreground"
                )}
              >
                {step.title}
              </span>
              <ChevronRight
                size={14}
                className={cn(
                  "text-muted-foreground transition-transform shrink-0",
                  isOpen && "rotate-90"
                )}
              />
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                <div
                  className="text-sm text-foreground/80 leading-relaxed guide-content"
                  dangerouslySetInnerHTML={{ __html: step.description }}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Progress footer */}
      <div className="pt-2">
        <div className="rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/40 px-4 py-3">
          <p className="text-xs font-semibold text-green-700 dark:text-green-400 flex items-center gap-1.5">
            <CheckCircle2 size={12} />
            All {workflow.steps.length} steps completed → you're done!
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Errors tab ─────────────────────────────────────────────────────────── */

function ErrorsTab({ workflow }: { workflow: Workflow }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        If you encounter any of these, here's what they mean and how to fix them.
      </p>
      {workflow.errors.map((err, i) => (
        <div
          key={i}
          className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 overflow-hidden"
        >
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-red-200 dark:border-red-900/40 bg-red-100/50 dark:bg-red-900/20">
            <AlertTriangle size={13} className="text-red-500 shrink-0" />
            <code className="text-xs font-bold text-red-700 dark:text-red-400">
              {err.code}
            </code>
          </div>
          <div className="px-4 py-3 space-y-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                What it means
              </p>
              <p className="text-xs text-foreground/80 leading-relaxed">{err.meaning}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 mb-0.5">
                How to fix
              </p>
              <p
                className="text-xs text-foreground/80 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: err.fix }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Tips tab ───────────────────────────────────────────────────────────── */

function TipsTab({ workflow }: { workflow: Workflow }) {
  return (
    <div className="space-y-3">
      {workflow.tips?.map((tip, i) => (
        <div
          key={i}
          className="flex items-start gap-3 px-4 py-3 rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20"
        >
          <Info size={13} className="text-blue-500 shrink-0 mt-0.5" />
          <p
            className="text-xs text-foreground/80 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: tip }}
          />
        </div>
      ))}
    </div>
  );
}
