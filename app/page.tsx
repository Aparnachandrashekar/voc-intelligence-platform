async function fetchHealth() {
  try {
    const base =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");
    const res = await fetch(`${base}/api/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const health = await fetchHealth();

  return (
    <main>
      <h1>Voice of Customer Intelligence</h1>
      <p className="subtitle">Phase 0 — Foundation</p>

      <div className="card">
        <h2>System Status</h2>
        {!health ? (
          <p className="status-warn">
            Start the dev server and run <code>npm run db:migrate</code> to see
            health status.
          </p>
        ) : (
          <ul className="links">
            <li>
              Database:{" "}
              <span
                className={
                  health.checks.database.ok ? "status-ok" : "status-error"
                }
              >
                {health.checks.database.ok ? "connected" : "disconnected"}
              </span>
            </li>
            <li>
              pgvector:{" "}
              <span
                className={
                  health.checks.pgvector.ok ? "status-ok" : "status-error"
                }
              >
                {health.checks.pgvector.ok ? "enabled" : "missing"}
              </span>
            </li>
            <li>
              Groq:{" "}
              <span
                className={
                  health.checks.groq.ok
                    ? "status-ok"
                    : health.checks.groq.configured
                      ? "status-error"
                      : "status-warn"
                }
              >
                {health.checks.groq.ok
                  ? "connected"
                  : health.checks.groq.configured
                    ? "error"
                    : "not configured"}
              </span>
            </li>
            <li>
              Hugging Face:{" "}
              <span
                className={
                  health.checks.huggingface.ok
                    ? "status-ok"
                    : "status-warn"
                }
              >
                {health.checks.huggingface.message}
              </span>
            </li>
            <li>
              Feedback items in DB:{" "}
              <strong>{health.checks.database.feedback_count}</strong>
            </li>
          </ul>
        )}
      </div>

      <div className="card">
        <h2>API Endpoints</h2>
        <ul className="links">
          <li>
            <a href="/api/health">GET /api/health</a>
          </li>
          <li>
            <a href="/api/ingest/huggingface">GET /api/ingest/huggingface</a>{" "}
            — status
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Next Steps</h2>
        <ul className="links">
          <li>
            Copy <code>.env.example</code> to <code>.env.local</code> and add
            API keys
          </li>
          <li>
            Run <code>docker compose up -d</code> for PostgreSQL + n8n
          </li>
          <li>
            Run <code>npm run db:migrate</code>
          </li>
          <li>n8n UI: http://localhost:5678</li>
        </ul>
      </div>
    </main>
  );
}
