/**
 * Decoupled Pre-Request Event Bus Pattern & State Synchronization
 * Provides real-time lifecycle event broadcasting for LLM request start, progress, and outcomes.
 */

export interface RequestStartEvent {
  requestId: string;
  provider: string;
  model: string;
  timestamp: number;
  expectedDurationMs: number;
  isAutoRouting: boolean;
  action?: string;
  abortController?: AbortController;
}

export interface RequestEndEvent {
  requestId: string;
  provider: string;
  model: string;
  durationMs: number;
  status: 'success' | 'error' | 'aborted';
  errorReason?: string;
  action?: string;
}

type StartListener = (event: RequestStartEvent) => void;
type EndListener = (event: RequestEndEvent) => void;

class LLMEventBus {
  private startListeners = new Set<StartListener>();
  private endListeners = new Set<EndListener>();
  private activeRequest: RequestStartEvent | null = null;

  public subscribeStart(listener: StartListener): () => void {
    this.startListeners.add(listener);
    // If there is currently an active request, immediately notify the new listener
    if (this.activeRequest) {
      try {
        listener(this.activeRequest);
      } catch (err) {
        console.error("Error in initial startListener notification:", err);
      }
    }
    return () => {
      this.startListeners.delete(listener);
    };
  }

  public subscribeEnd(listener: EndListener): () => void {
    this.endListeners.add(listener);
    return () => {
      this.endListeners.delete(listener);
    };
  }

  public emitStart(event: RequestStartEvent): void {
    this.activeRequest = event;
    for (const listener of this.startListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in startListener:", err);
      }
    }
  }

  public emitEnd(event: RequestEndEvent): void {
    if (this.activeRequest?.requestId === event.requestId) {
      this.activeRequest = null;
    }
    for (const listener of this.endListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in endListener:", err);
      }
    }
  }

  public getActiveRequest(): RequestStartEvent | null {
    return this.activeRequest;
  }

  public abortActiveRequest(reason = "User aborted"): boolean {
    if (this.activeRequest?.abortController) {
      this.activeRequest.abortController.abort(reason);
      this.emitEnd({
        requestId: this.activeRequest.requestId,
        provider: this.activeRequest.provider,
        model: this.activeRequest.model,
        durationMs: Date.now() - this.activeRequest.timestamp,
        status: 'aborted',
        errorReason: reason,
        action: this.activeRequest.action
      });
      return true;
    }
    return false;
  }
}

export const llmEventBus = new LLMEventBus();
