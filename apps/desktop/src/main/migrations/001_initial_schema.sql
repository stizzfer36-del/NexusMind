CREATE TABLE IF NOT EXISTS migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  model_id TEXT,
  system_prompt TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  role TEXT,
  content TEXT,
  created_at INTEGER,
  token_count INTEGER,
  cost_real REAL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS kanban_tasks (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  column_id TEXT,
  position INTEGER,
  agent_id TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  tags TEXT,
  priority TEXT
);

CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  type TEXT,
  content TEXT,
  embedding_json TEXT,
  source TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  relevance_score REAL
);

CREATE TABLE IF NOT EXISTS bench_tasks (
  id TEXT PRIMARY KEY,
  dimension TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  input TEXT NOT NULL,
  expected_behavior TEXT,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS bench_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd REAL,
  success_score REAL NOT NULL,
  notes TEXT,
  raw_response_preview TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bench_runs_task ON bench_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_bench_runs_model ON bench_runs(model_id);

CREATE TABLE IF NOT EXISTS guard_runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL,
  total_findings INTEGER NOT NULL DEFAULT 0,
  low_count INTEGER NOT NULL DEFAULT 0,
  medium_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS guard_findings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source TEXT NOT NULL,
  severity TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line INTEGER,
  col INTEGER,
  message TEXT NOT NULL,
  recommendation TEXT,
  snippet TEXT,
  FOREIGN KEY (run_id) REFERENCES guard_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_guard_findings_run ON guard_findings(run_id);
