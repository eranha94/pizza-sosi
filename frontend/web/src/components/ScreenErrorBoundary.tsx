import { Component, type ReactNode } from 'react';

/**
 * The TV screen must never stay blank. If something breaks, show what happened (so it can be reported)
 * and try again by itself after half a minute.
 */
export class ScreenErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch() {
    window.setTimeout(() => location.reload(), 30_000);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div dir="rtl" style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#1e1a1b', color: '#fff3d1', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
        <div>
          <p style={{ fontSize: 64, margin: 0 }}>🍕</p>
          <p style={{ fontSize: 28, fontWeight: 700 }}>המסך נטען מחדש בעוד רגע…</p>
          <p style={{ fontSize: 14, opacity: 0.6, direction: 'ltr' }}>{String(this.state.error.message).slice(0, 300)}</p>
        </div>
      </div>
    );
  }
}
