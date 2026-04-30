import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./ErrorState";
import { reportError } from "@/lib/errorReporter";

type Props = {
  children: ReactNode;
  section?: string;
  /** Если true — рендерит компактный fallback (для встроенных блоков) */
  compact?: boolean;
};

type State = { error: unknown };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    void reportError(error, {
      section: this.props.section ?? "ui",
      action: "render",
      severity: "critical",
      code: "boundary",
    });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const fallback = (
        <ErrorState
          error={this.state.error}
          section={this.props.section}
          action="render"
          onRetry={this.reset}
          compact={this.props.compact}
          silent
        />
      );
      if (this.props.compact) return fallback;
      return (
        <div className="min-h-[60vh] bg-background px-4 py-10">
          <div className="mx-auto max-w-2xl">{fallback}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
