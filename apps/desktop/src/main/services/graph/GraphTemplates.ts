import type { WorkflowTemplate } from '@nexusmind/shared'

// --- full-stack-feature ---

export const FULL_STACK_FEATURE_TEMPLATE: WorkflowTemplate = {
  id: 'full-stack-feature',
  name: 'Full-Stack Feature',
  description: 'End-to-end feature delivery: coordinate, build, review, test, and document.',
  dag: {
    id: 'full-stack-feature-dag',
    name: 'Full-Stack Feature',
    description: 'End-to-end feature delivery pipeline.',
    nodes: [
      { id: 'n1', type: 'start', label: 'Start', position: { x: 80, y: 200 } },
      { id: 'n2', type: 'agent', label: 'Coordinator', position: { x: 300, y: 200 }, config: { role: 'coordinator', prompt: 'analyze requirements' } },
      { id: 'n3', type: 'agent', label: 'Builder', position: { x: 520, y: 200 }, config: { role: 'builder', prompt: 'implement feature' } },
      { id: 'n4', type: 'agent', label: 'Reviewer', position: { x: 740, y: 200 }, config: { role: 'reviewer', prompt: 'code review' } },
      { id: 'n5', type: 'agent', label: 'Tester', position: { x: 960, y: 200 }, config: { role: 'tester', prompt: 'write & run tests' } },
      { id: 'n6', type: 'agent', label: 'Doc Writer', position: { x: 1180, y: 200 }, config: { role: 'docwriter', prompt: 'write docs' } },
      { id: 'n7', type: 'end', label: 'End', position: { x: 1400, y: 200 } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
      { id: 'e5', source: 'n5', target: 'n6' },
      { id: 'e6', source: 'n6', target: 'n7' },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
}

// --- bug-hunt ---

export const BUG_HUNT_TEMPLATE: WorkflowTemplate = {
  id: 'bug-hunt',
  name: 'Bug Hunt',
  description: 'Triage, fix, verify, and review a reported bug.',
  dag: {
    id: 'bug-hunt-dag',
    name: 'Bug Hunt',
    description: 'Bug triage and resolution pipeline.',
    nodes: [
      { id: 'n1', type: 'start', label: 'Start', position: { x: 80, y: 200 } },
      { id: 'n2', type: 'agent', label: 'Coordinator', position: { x: 300, y: 200 }, config: { role: 'coordinator', prompt: 'triage bug' } },
      { id: 'n3', type: 'agent', label: 'Builder', position: { x: 520, y: 200 }, config: { role: 'builder', prompt: 'implement fix' } },
      { id: 'n4', type: 'agent', label: 'Tester', position: { x: 740, y: 200 }, config: { role: 'tester', prompt: 'verify fix' } },
      { id: 'n5', type: 'agent', label: 'Reviewer', position: { x: 960, y: 200 }, config: { role: 'reviewer', prompt: 'review fix' } },
      { id: 'n6', type: 'end', label: 'End', position: { x: 1180, y: 200 } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
      { id: 'e5', source: 'n5', target: 'n6' },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
}

// --- documentation-run ---

export const DOCUMENTATION_RUN_TEMPLATE: WorkflowTemplate = {
  id: 'documentation-run',
  name: 'Documentation Run',
  description: 'Outline, write, and review project documentation.',
  dag: {
    id: 'documentation-run-dag',
    name: 'Documentation Run',
    description: 'Documentation authoring and review pipeline.',
    nodes: [
      { id: 'n1', type: 'start', label: 'Start', position: { x: 80, y: 200 } },
      { id: 'n2', type: 'agent', label: 'Coordinator', position: { x: 300, y: 200 }, config: { role: 'coordinator', prompt: 'outline docs' } },
      { id: 'n3', type: 'agent', label: 'Doc Writer', position: { x: 520, y: 200 }, config: { role: 'docwriter', prompt: 'write documentation' } },
      { id: 'n4', type: 'agent', label: 'Reviewer', position: { x: 740, y: 200 }, config: { role: 'reviewer', prompt: 'review docs' } },
      { id: 'n5', type: 'end', label: 'End', position: { x: 960, y: 200 } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
}

// --- security-audit ---

export const SECURITY_AUDIT_TEMPLATE: WorkflowTemplate = {
  id: 'security-audit',
  name: 'Security Audit',
  description: 'Plan, audit, remediate, and verify security across the codebase.',
  dag: {
    id: 'security-audit-dag',
    name: 'Security Audit',
    description: 'Security audit and remediation pipeline.',
    nodes: [
      { id: 'n1', type: 'start', label: 'Start', position: { x: 80, y: 200 } },
      { id: 'n2', type: 'agent', label: 'Coordinator', position: { x: 300, y: 200 }, config: { role: 'coordinator', prompt: 'plan audit' } },
      { id: 'n3', type: 'agent', label: 'Reviewer', position: { x: 520, y: 200 }, config: { role: 'reviewer', prompt: 'audit codebase and configuration for security vulnerabilities' } },
      { id: 'n4', type: 'agent', label: 'Builder', position: { x: 740, y: 200 }, config: { role: 'builder', prompt: 'implement fixes' } },
      { id: 'n5', type: 'agent', label: 'Tester', position: { x: 960, y: 200 }, config: { role: 'tester', prompt: 'verify security fixes' } },
      { id: 'n6', type: 'end', label: 'End', position: { x: 1180, y: 200 } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
      { id: 'e5', source: 'n5', target: 'n6' },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
}

// --- multi-sprint-planner ---

export const MULTI_SPRINT_PLANNER_TEMPLATE: WorkflowTemplate = {
  id: 'multi-sprint-planner',
  name: 'Multi-Sprint Planner',
  description: 'Plan, execute, review, test, and summarise a full sprint cycle.',
  dag: {
    id: 'multi-sprint-planner-dag',
    name: 'Multi-Sprint Planner',
    description: 'Sprint planning and delivery pipeline.',
    nodes: [
      { id: 'n1', type: 'start', label: 'Start', position: { x: 80, y: 200 } },
      { id: 'n2', type: 'agent', label: 'Coordinator', position: { x: 300, y: 200 }, config: { role: 'coordinator', prompt: 'sprint planning' } },
      { id: 'n3', type: 'agent', label: 'Builder', position: { x: 520, y: 200 }, config: { role: 'builder', prompt: 'sprint 1 implementation' } },
      { id: 'n4', type: 'agent', label: 'Reviewer', position: { x: 740, y: 200 }, config: { role: 'reviewer', prompt: 'sprint 1 review' } },
      { id: 'n5', type: 'agent', label: 'Tester', position: { x: 960, y: 200 }, config: { role: 'tester', prompt: 'sprint 1 testing' } },
      { id: 'n6', type: 'agent', label: 'Doc Writer', position: { x: 1180, y: 200 }, config: { role: 'docwriter', prompt: 'sprint summary' } },
      { id: 'n7', type: 'end', label: 'End', position: { x: 1400, y: 200 } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
      { id: 'e5', source: 'n5', target: 'n6' },
      { id: 'e6', source: 'n6', target: 'n7' },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
}

// --- registry ---

export const GRAPH_TEMPLATES: WorkflowTemplate[] = [
  FULL_STACK_FEATURE_TEMPLATE,
  BUG_HUNT_TEMPLATE,
  DOCUMENTATION_RUN_TEMPLATE,
  SECURITY_AUDIT_TEMPLATE,
  MULTI_SPRINT_PLANNER_TEMPLATE,
]
