export type Effort = 'S' | 'M' | 'L' | 'XL'

export type DepType = 'build' | 'runtime' | 'optional'

export type Task = {
  id: string
  label: string
  done: boolean
}

export type Dep = {
  id: string
  reason: string
  type: DepType
}

export type Feature = {
  id: string
  label: string
  description?: string
  effort: Effort
  ms: string
  ganttStart: number
  ganttEnd: number
  deps: Dep[]
  tasks: Task[]
}

export type Module = {
  id: string
  label: string
  color: string
  features: Feature[]
}

export type Milestone = {
  id: string
  label: string
}

export type ProjectMeta = {
  name: string
  description: string
  version: string
  schemaVersion: number
  milestones: Milestone[]
  today?: number
}

export type Project = {
  meta: ProjectMeta
  modules: Module[]
}

export type ViewId = 'scope' | 'roadmap' | 'kanban' | 'mindmap' | 'gantt' | 'validate'

export type FeatureStatus = 'backlog' | 'progress' | 'done'

export type DepStatus = 'done' | 'conflict' | 'same' | 'open' | 'unknown'
