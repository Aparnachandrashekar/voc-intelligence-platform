import type { PipelineStatusResponse } from "@/lib/types/dashboard";

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PipelineUtilityBar({
  status,
  totalReviews,
}: {
  status: PipelineStatusResponse;
  totalReviews: number;
}) {
  const isLive = status.global_status === "online";
  const sources = status.sources.map((s) => s.label).join(" · ");

  return (
    <div className="pipeline-utility" aria-label="Data status">
      <span className="pipeline-utility-status">
        <span
          className={`pipeline-utility-dot ${isLive ? "live" : "degraded"}`}
          aria-hidden
        />
        {isLive ? "Live" : "Degraded"}
      </span>
      <span className="pipeline-utility-divider" aria-hidden>
        ·
      </span>
      <span className="pipeline-utility-meta">
        {totalReviews.toLocaleString()} reviews indexed
      </span>
      {status.last_refresh && (
        <>
          <span className="pipeline-utility-divider" aria-hidden>
            ·
          </span>
          <span className="pipeline-utility-meta">
            Last refresh {formatRelative(status.last_refresh)}
          </span>
        </>
      )}
      {sources && (
        <>
          <span className="pipeline-utility-divider" aria-hidden>
            ·
          </span>
          <span className="pipeline-utility-meta">
            Sources: {sources}
          </span>
        </>
      )}
    </div>
  );
}

/** @deprecated Use PipelineUtilityBar on dashboard */
export function PipelineStatusBar({
  status,
}: {
  status: PipelineStatusResponse;
}) {
  return (
    <section className="pipeline-bar" aria-label="Pipeline status">
      <div className="pipeline-bar-top">
        <span className="pipeline-global">
          Pipelines:{" "}
          <strong
            className={
              status.global_status === "online" ? "status-ok" : "status-warn"
            }
          >
            {status.global_status === "online" ? "Online" : "Degraded"}
          </strong>
        </span>
        {status.last_refresh && (
          <span className="pipeline-refresh muted">
            Last refresh {formatRelative(status.last_refresh)}
          </span>
        )}
      </div>
      <div className="pipeline-chips">
        {status.sources.map((source) => (
          <div key={source.label} className="pipeline-chip">
            <span
              className={`status-dot status-dot-${source.health}`}
              aria-hidden
            />
            <div className="pipeline-chip-body">
              <span className="pipeline-chip-label">{source.label}</span>
              <span className="pipeline-chip-meta muted">
                {formatRelative(source.last_updated)}
                {source.inserted_count > 0 &&
                  ` · +${source.inserted_count.toLocaleString()}`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
