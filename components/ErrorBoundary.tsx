"use client";
import { Component, type ReactNode } from "react";
import { Button } from "./ui/button";

/**
 * Catches render-time crashes so one broken row can't blank the whole app —
 * before this, a single unrenderable value (e.g. an invalid stored date
 * reaching `format()`) took the entire screen down with it. The Shell keys
 * this by view, so navigating to another screen resets the boundary.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[error-boundary]", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="surface px-6 py-10 text-center">
        <p className="text-lg font-medium text-ink">This screen hit a snag ✳</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Something on this screen couldn’t render. Your data is safe — try reloading, and if
          it keeps happening the error below is the clue.
        </p>
        <p className="mt-3 break-all font-mono text-xs text-muted-soft">
          {this.state.error.message}
        </p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}
