import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  label: string
  children: ReactNode
}

type State = {
  error: Error | null
  stack: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, stack: error.stack ?? null }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary: ${this.props.label}]`, error, info)
  }

  reset = () => {
    this.setState({ error: null, stack: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    const { error, stack } = this.state
    return (
      <div className="m-6 rounded border border-red-500/30 bg-red-500/5 p-6 font-mono text-sm text-red-200">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-red-300 font-semibold">
            {this.props.label} crashed
          </div>
          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="rounded border border-red-500/40 px-3 py-1 text-xs hover:bg-red-500/10"
            >
              Reload view
            </button>
            <a
              href="https://github.com/McMarius11/lodestar/issues/new"
              target="_blank"
              rel="noreferrer"
              className="rounded border border-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/5"
            >
              Report issue
            </a>
          </div>
        </div>
        <div className="mb-2 text-red-200/90">{error.message}</div>
        {stack && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-red-100/60">
            {stack}
          </pre>
        )}
        <div className="mt-3 text-xs text-white/50">
          Other views remain operational — switch tabs or reload this one.
        </div>
      </div>
    )
  }
}
