// If the mini canvas cannot load or start (chunk fetch failure, lost or refused WebGL context),
// the page carries on with flat minis instead of failing as a whole.

import { Component, type ReactNode } from "react";

export class CanvasBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn("[home] mini canvas unavailable, using flat minis", error);
    this.props.onError();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
