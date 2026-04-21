import { ServiceRegistry, SERVICE_TOKENS } from '../../ServiceRegistry.js'
import type { DatabaseService } from '../DatabaseService.js'
import type { WorkflowDAG, WorkflowTemplate } from '@nexusmind/shared'
import { GRAPH_TEMPLATES } from './GraphTemplates.js'
import { GraphExecutor } from './GraphExecutor.js'

export class GraphService {
  private db!: DatabaseService
  private executor!: GraphExecutor

  init(): void {
    const registry = ServiceRegistry.getInstance()
    this.db = registry.resolve<DatabaseService>(SERVICE_TOKENS.DB)
    this.db.getDb().prepare(`
      CREATE TABLE IF NOT EXISTS workflow_graphs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        dag_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run()
    this.executor = new GraphExecutor()
    registry.register(SERVICE_TOKENS.GraphService, this)
  }

  list(): WorkflowDAG[] {
    const rows = this.db.getDb().prepare(
      'SELECT * FROM workflow_graphs ORDER BY updated_at DESC'
    ).all() as any[]
    return rows.map(row => JSON.parse(row.dag_json) as WorkflowDAG)
  }

  load(id: string): WorkflowDAG | null {
    const row = this.db.getDb().prepare(
      'SELECT * FROM workflow_graphs WHERE id = ?'
    ).get(id) as any
    if (!row) return null
    return JSON.parse(row.dag_json) as WorkflowDAG
  }

  save(dag: WorkflowDAG): void {
    this.db.getDb().prepare(
      'INSERT OR REPLACE INTO workflow_graphs (id, name, description, dag_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(dag.id, dag.name, dag.description ?? null, JSON.stringify(dag), dag.createdAt, dag.updatedAt)
  }

  delete(id: string): void {
    this.db.getDb().prepare(
      'DELETE FROM workflow_graphs WHERE id = ?'
    ).run(id)
  }

  getTemplates(): WorkflowTemplate[] {
    return GRAPH_TEMPLATES
  }

  async execute(dagId: string, input?: string): Promise<{ runId: string }> {
    const dag = this.load(dagId)
    if (!dag) throw new Error(`DAG not found: ${dagId}`)
    return this.executor.execute(dag, input)
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'graph:list': (_event: any) => this.list(),
      'graph:load': (_event: any, dagId: string) => this.load(dagId),
      'graph:save': (_event: any, dag: WorkflowDAG) => this.save(dag),
      'graph:delete': (_event: any, dagId: string) => this.delete(dagId),
      'graph:templates': (_event: any) => this.getTemplates(),
      'graph:execute': (_event: any, payload: { dagId: string; input?: string }) => this.execute(payload.dagId, payload.input),
    }
  }
}
