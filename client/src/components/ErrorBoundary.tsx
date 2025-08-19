import React from "react";

type ErrorBoundaryState = { hasError: boolean; error?: any };

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    // eslint-disable-next-line no-console
    console.error("App crashed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || String(this.state.error);
      return (
        <div style={{ padding: 24, color: "#fff", background: "#111", minHeight: "100vh" }}>
          <h1 style={{ color: "#f87171" }}>Something went wrong</h1>
          <p style={{ color: "#ddd" }}>{message}</p>
          <pre style={{ whiteSpace: "pre-wrap", color: "#aaa" }}>
            {this.state.error?.stack || "(no stack)"}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
