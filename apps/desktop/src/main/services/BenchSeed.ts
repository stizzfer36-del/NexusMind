import type { BenchTask, BenchDimension } from '@nexusmind/shared'

// ---------------------------------------------------------------------------
// Hallucination tasks — detect model making up facts
// ---------------------------------------------------------------------------
export const HALLUCINATION_TASKS: BenchTask[] = [
  {
    id: 'hall-001',
    dimension: 'hallucination',
    name: 'Nonexistent API method',
    description: 'Ask about a method that does not exist in a standard library.',
    input: 'Does the JavaScript Array prototype have a method called `.flatten()` that recursively flattens all nested arrays by default? Give a one-sentence answer.',
    expectedBehavior: 'Should note Array.prototype.flat() exists but .flatten() does not, or clarify the actual behavior of .flat().',
  },
  {
    id: 'hall-002',
    dimension: 'hallucination',
    name: 'Fake NPM package',
    description: 'Ask about a package that does not exist.',
    input: 'What does the npm package "express-turbo-router" do? Describe its main features.',
    expectedBehavior: 'Should say it does not know of this package or that it may not exist.',
  },
  {
    id: 'hall-003',
    dimension: 'hallucination',
    name: 'False TypeScript feature',
    description: 'Ask about a TypeScript feature that was never added.',
    input: 'Explain how TypeScript\'s "strictNullInference" compiler flag works.',
    expectedBehavior: 'Should acknowledge this flag does not exist in TypeScript.',
  },
]

// ---------------------------------------------------------------------------
// Complexity tasks — code understanding and reasoning over complex snippets
// ---------------------------------------------------------------------------
export const COMPLEXITY_TASKS: BenchTask[] = [
  {
    id: 'comp-001',
    dimension: 'complexity',
    name: 'Recursive type resolution',
    description: 'Explain what a deeply recursive TypeScript type resolves to.',
    input: `Given this TypeScript type:
type Flatten<T> = T extends Array<infer Item> ? Flatten<Item> : T;
What does Flatten<number[][][]> resolve to? Answer in one word.`,
    expectedBehavior: 'Should answer "number".',
  },
  {
    id: 'comp-002',
    dimension: 'complexity',
    name: 'Promise chain order',
    description: 'Predict async execution order.',
    input: `What does this code print, in order?
Promise.resolve(1)
  .then(v => { console.log(v); return v + 1 })
  .then(v => { console.log(v); return v + 1 })
  .then(v => console.log(v))`,
    expectedBehavior: 'Should answer: 1, 2, 3.',
  },
  {
    id: 'comp-003',
    dimension: 'complexity',
    name: 'Closure capture',
    description: 'Identify what value is captured in a closure.',
    input: `What does this JavaScript log?
const fns = []
for (var i = 0; i < 3; i++) { fns.push(() => console.log(i)) }
fns[0](); fns[1](); fns[2]()`,
    expectedBehavior: 'Should answer: 3, 3, 3 (var hoisting, not block-scoped).',
  },
]

// ---------------------------------------------------------------------------
// Reasoning tasks — multi-step logic and tool-use chain
// ---------------------------------------------------------------------------
export const REASONING_TASKS: BenchTask[] = [
  {
    id: 'reas-001',
    dimension: 'reasoning',
    name: 'Step-by-step algorithm',
    description: 'Trace through a small sorting algorithm.',
    input: 'Trace bubble sort on [5, 3, 1, 4, 2]. Show each pass as a list.',
    expectedBehavior: 'Should correctly show each pass ending with [1, 2, 3, 4, 5].',
  },
  {
    id: 'reas-002',
    dimension: 'reasoning',
    name: 'Logic puzzle',
    description: 'Solve a classic logic puzzle.',
    input: 'Alice is taller than Bob. Bob is taller than Carol. Is Alice taller than Carol? Answer yes or no and explain why.',
    expectedBehavior: 'Should answer yes with transitive reasoning.',
  },
  {
    id: 'reas-003',
    dimension: 'reasoning',
    name: 'Token budget allocation',
    description: 'Reason about optimal resource allocation.',
    input: 'You have 3 agents and 6 tasks. Each agent can do at most 3 tasks. Tasks take 1, 2, 1, 3, 2, 1 minutes respectively. How do you minimize total time? Give the assignment.',
    expectedBehavior: 'Should assign tasks to minimize the longest individual workload.',
  },
]

// ---------------------------------------------------------------------------
// Quality tasks — output correctness and coherence
// ---------------------------------------------------------------------------
export const QUALITY_TASKS: BenchTask[] = [
  {
    id: 'qual-001',
    dimension: 'quality',
    name: 'Write a pure function',
    description: 'Write a correct, pure TypeScript function.',
    input: 'Write a pure TypeScript function `groupBy<T>(arr: T[], key: keyof T): Record<string, T[]>` that groups array elements by a key. No imports needed.',
    expectedBehavior: 'Should produce a correct, typed groupBy implementation.',
  },
  {
    id: 'qual-002',
    dimension: 'quality',
    name: 'Explain an error message',
    description: 'Explain a TypeScript error clearly.',
    input: 'Explain this TypeScript error in plain English: "Type \'string | undefined\' is not assignable to type \'string\'."',
    expectedBehavior: 'Should explain that a value might be undefined and needs a check or non-null assertion.',
  },
  {
    id: 'qual-003',
    dimension: 'quality',
    name: 'Refactor suggestion',
    description: 'Identify and suggest a concrete refactor.',
    input: `Suggest one concrete refactor for this code:
function getUser(id) {
  if (id !== null && id !== undefined && id !== '' && id !== 0) {
    return db.find(id)
  }
  return null
}`,
    expectedBehavior: 'Should suggest a nullish/falsy guard simplification.',
  },
]

// ---------------------------------------------------------------------------
// Speed tasks — measure latency (pass trivial prompt, score by durationMs)
// ---------------------------------------------------------------------------
export const SPEED_TASKS: BenchTask[] = [
  {
    id: 'spd-001',
    dimension: 'speed',
    name: 'Echo ping',
    description: 'Minimal prompt to measure raw model latency.',
    input: 'Reply with exactly one word: pong',
    expectedBehavior: 'Should reply "pong" as quickly as possible.',
  },
  {
    id: 'spd-002',
    dimension: 'speed',
    name: 'Single math fact',
    description: 'Minimal arithmetic to measure TTFT.',
    input: 'What is 7 × 8? Reply with only the number.',
    expectedBehavior: 'Should reply "56" quickly.',
  },
]

// ---------------------------------------------------------------------------
// Cost tasks — measure token usage (score = completionTokens efficiency)
// ---------------------------------------------------------------------------
export const COST_TASKS: BenchTask[] = [
  {
    id: 'cost-001',
    dimension: 'cost',
    name: 'Concise summary',
    description: 'Summarize concisely — low completion tokens = better score.',
    input: 'Summarize what a REST API is in exactly one sentence.',
    expectedBehavior: 'Should produce a short, accurate one-sentence summary.',
  },
  {
    id: 'cost-002',
    dimension: 'cost',
    name: 'Yes/no answer',
    description: 'Binary answer question to test verbosity.',
    input: 'Is JSON a binary format? Answer only yes or no.',
    expectedBehavior: 'Should answer "no" with no extra words.',
  },
]

// ---------------------------------------------------------------------------
// All tasks merged
// ---------------------------------------------------------------------------
export const ALL_BENCH_TASKS: BenchTask[] = [
  ...HALLUCINATION_TASKS,
  ...COMPLEXITY_TASKS,
  ...REASONING_TASKS,
  ...QUALITY_TASKS,
  ...SPEED_TASKS,
  ...COST_TASKS,
]
