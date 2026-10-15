import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Keeps one bad record from blanking the whole app: the failing region shows the error and the rest keeps working. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label ?? 'ui'}]`, error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200" role="alert">
          <div className="font-semibold">{this.props.label ?? 'This section'} could not be shown</div>
          <div className="mt-1 break-words">{this.state.error.message}</div>
          <button type="button" className="mt-2 underline" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      )
    }
    return this.props.children
  }
}
