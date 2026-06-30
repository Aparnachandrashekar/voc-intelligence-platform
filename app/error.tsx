"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = error.message?.toLowerCase() ?? "";
  const likelyDatabase =
    message.includes("econnrefused") ||
    message.includes("connect") ||
    error.digest === "1796734002";

  return (
    <main className="page" style={{ maxWidth: 640, margin: "4rem auto" }}>
      <h1>Something went wrong</h1>
      {likelyDatabase ? (
        <>
          <p className="subtitle">
            The app could not connect to PostgreSQL. Reports and other pages
            need the database running first.
          </p>
          <section className="card">
            <h2>Start the database</h2>
            <ol style={{ lineHeight: 1.8, paddingLeft: "1.25rem" }}>
              <li>Open Docker Desktop and wait until it is running.</li>
              <li>
                In a terminal, from the project folder:
                <pre style={{ marginTop: "0.5rem", overflow: "auto" }}>
{`cd "/Users/aparna/Graduation Project"
docker compose up -d
npm run db:migrate
npm run db:seed-demo`}
                </pre>
              </li>
              <li>
                Open the app at{" "}
                <a href="http://localhost:3001">http://localhost:3001</a>{" "}
                (this project uses port 3001).
              </li>
            </ol>
          </section>
        </>
      ) : (
        <p className="subtitle">
          {error.message || "A server-side error occurred."}
        </p>
      )}
      <button type="button" onClick={() => reset()} style={{ marginTop: "1rem" }}>
        Try again
      </button>
    </main>
  );
}
