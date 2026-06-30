export default function AppSectionLoading() {
  return (
    <div className="app-loading" aria-live="polite" aria-busy="true">
      <div className="app-loading-bar" />
      <p className="app-loading-text">Loading…</p>
    </div>
  );
}
