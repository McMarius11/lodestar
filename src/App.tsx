import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useProjectStore } from '@/store/useProjectStore'
import { TopBar } from '@/components/TopBar'
import { TaskDrawer } from '@/components/TaskDrawer'
import { CommandPalette } from '@/components/CommandPalette'
import { HelpOverlay } from '@/components/HelpOverlay'
import { ValidationPanel } from '@/components/ValidationPanel'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import { ExternalChangeBanner } from '@/components/ExternalChangeBanner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useKeyboardNav } from '@/lib/useKeyboardNav'
import { useWebZoom } from '@/lib/useWebZoom'
import { ModuleScope } from '@/views/ModuleScope'
import { Roadmap } from '@/views/Roadmap'
import { Kanban } from '@/views/Kanban'
import { MindMap } from '@/views/MindMap'
import { Gantt } from '@/views/Gantt'

export default function App() {
  const init = useProjectStore((s) => s.init)
  const loaded = useProjectStore((s) => s.loaded)
  const source = useProjectStore((s) => s.source)
  const activeView = useProjectStore((s) => s.activeView)

  useEffect(() => {
    init()
  }, [init])

  useKeyboardNav()
  useWebZoom()

  if (!loaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="label-mono animate-accent-pulse">LOADING</div>
      </div>
    )
  }

  if (source === 'none') {
    return (
      <div className="h-full flex flex-col">
        <WelcomeScreen />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col grain">
      <TopBar />
      <ExternalChangeBanner />
      <main className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0"
          >
            {activeView === 'scope' && (
              <ErrorBoundary label="Module Scope"><ModuleScope /></ErrorBoundary>
            )}
            {activeView === 'roadmap' && (
              <ErrorBoundary label="Roadmap"><Roadmap /></ErrorBoundary>
            )}
            {activeView === 'kanban' && (
              <ErrorBoundary label="Kanban"><Kanban /></ErrorBoundary>
            )}
            {activeView === 'mindmap' && (
              <ErrorBoundary label="Mind Map"><MindMap /></ErrorBoundary>
            )}
            {activeView === 'gantt' && (
              <ErrorBoundary label="Gantt"><Gantt /></ErrorBoundary>
            )}
            {activeView === 'validate' && (
              <ErrorBoundary label="Validation"><ValidationPanel /></ErrorBoundary>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
      <TaskDrawer />
      <CommandPalette />
      <HelpOverlay />
    </div>
  )
}

function Footer() {
  const project = useProjectStore((s) => s.project)
  const source = useProjectStore((s) => s.source)
  const toggleHelp = useProjectStore((s) => s.toggleHelp)
  const allFeatures = project.modules.flatMap((m) => m.features)
  const allTasks = allFeatures.flatMap((f) => f.tasks)
  const done = allTasks.filter((t) => t.done).length

  return (
    <footer className="border-t border-line/60 bg-void/80 backdrop-blur-sm">
      <div className="flex items-center gap-6 px-5 py-2 label-mono overflow-x-auto scroll-thin">
        <span>
          <span className="text-fg-subtle">MOD</span>{' '}
          <span className="num-mono text-fg">
            {project.modules.length.toString().padStart(2, '0')}
          </span>
        </span>
        <span>
          <span className="text-fg-subtle">FEAT</span>{' '}
          <span className="num-mono text-fg">
            {allFeatures.length.toString().padStart(3, '0')}
          </span>
        </span>
        <span>
          <span className="text-fg-subtle">TASK</span>{' '}
          <span className="num-mono text-fg">
            {done.toString().padStart(3, '0')}
          </span>
          <span className="text-fg-subtle">/</span>
          <span className="num-mono">
            {allTasks.length.toString().padStart(3, '0')}
          </span>
        </span>
        <span className="ml-auto text-fg-subtle">
          {source === 'disk'
            ? 'STORED · data/project.json'
            : source === 'localStorage'
            ? 'STORED · localStorage'
            : 'SESSION · sample data'}
        </span>
        <span className="text-fg-subtle hidden md:inline">
          ⌘K palette · ⌘Z undo
        </span>
        <button
          onClick={() => toggleHelp(true)}
          className="label-mono text-fg-subtle hover:text-accent border border-line/60 px-1.5"
          title="Keyboard shortcuts (?)"
        >
          ?
        </button>
      </div>
    </footer>
  )
}
