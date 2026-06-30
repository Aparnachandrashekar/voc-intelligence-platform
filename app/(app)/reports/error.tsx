"use client";

export default function ReportsError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page" style={{ maxWidth: 640, margin: "4rem auto" }}>
      <h1>Reports unavailable</h1>
      <p className="subtitle">
        PostgreSQL is not running or migrations have not been applied yet.
      </p>
      <section className="card">
        <h2>Fix</h2>
        <ol style={{ lineHeight: 1.8, paddingLeft: "1.25rem" }}>
          <li>Start Docker Desktop.</li>
          <li>
            Run:
            <pre style={{ marginTop: "0.5rem", overflow: "auto" }}>
{`docker compose up -d
npm run db:migrate
npm run db:seed-demo`}
            </pre>
          </li>
          <li>
            Reload{" "}
            <a href="http://localhost:3001/dashboard">
              http://localhost:3001/dashboard
            </a>
          </li>
        </ol>
      </section>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
