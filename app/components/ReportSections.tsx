import type { QuoteEvidence } from "@/lib/types/reports";
import { reviewDisplaySummary } from "@/lib/intelligence/display";
import { formatLabel, formatSentiment, formatSource } from "@/lib/intelligence/format";

export function QuoteList({ quotes }: { quotes: QuoteEvidence[] }) {
  if (!quotes.length) {
    return null;
  }
  return (
    <ul className="quote-list">
      {quotes.map((q) => (
        <li key={q.feedback_item_id} className="quote-item">
          <p className="quote-summary">
            {reviewDisplaySummary(q.content, q.sentiment)}
          </p>
          <div className="quote-meta">
            <span className="badge">{formatSource(q.source)}</span>
            <span className="badge">{formatSentiment(q.sentiment)}</span>
            {q.author && <span>{q.author}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StatGrid({
  items,
}: {
  items: { label: string; count: number; percentage?: number }[];
}) {
  if (!items.length) return null;
  return (
    <div className="stat-grid">
      {items.map((item) => (
        <div key={item.label} className="stat-card">
          <div className="stat-label">{formatLabel(item.label)}</div>
          <div className="stat-value">{item.count}</div>
          {item.percentage !== undefined && (
            <div className="stat-pct">{item.percentage}%</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function RankedList({
  items,
}: {
  items: { label: string; count: number; quotes: QuoteEvidence[] }[];
}) {
  if (!items.length) return <p className="muted">No items found for current filters.</p>;
  return (
    <div className="ranked-list">
      {items.map((item) => (
        <section key={item.label} className="card">
          <div className="ranked-header">
            <h3>{item.label}</h3>
            <span className="count-badge">{item.count} mentions</span>
          </div>
          <QuoteList quotes={item.quotes} />
        </section>
      ))}
    </div>
  );
}
