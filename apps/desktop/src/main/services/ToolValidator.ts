import { z } from 'zod'

const ToolCallSchema = z.object({
  name: z.string(),
  args: z.record(z.unknown()),
})

const ReadFileArgsSchema = z.object({
  path: z.string().min(1),
})

const WriteFileArgsSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})

const ListDirArgsSchema = z.object({
  path: z.string().min(1),
})

const RunShellArgsSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
})

const WebFetchArgsSchema = z.object({
  url: z.string().url(),
})

const SearchMemoryArgsSchema = z.object({
  query: z.string().min(1),
})

const ToolSchemas: Record<string, z.ZodSchema> = {
  read_file: ReadFileArgsSchema,
  write_file: WriteFileArgsSchema,
  list_dir: ListDirArgsSchema,
  run_shell: RunShellArgsSchema,
  web_fetch: WebFetchArgsSchema,
  search_memory: SearchMemoryArgsSchema,
}

export interface ValidatedToolCall {
  name: string
  args: Record<string, unknown>
  valid: true
}

export interface InvalidToolCall {
  name: string
  rawArgs: unknown
  valid: false
  errors: string[]
}

export type ToolCallResult = ValidatedToolCall | InvalidToolCall

export function parseAndValidateToolCalls(response: string): ToolCallResult[] {
  const results: ToolCallResult[] = []
  const seen = new Set<string>()
  
  const pattern = /```tool\s*\n(\{[\s\S]*?\})\s*\n```/g
  let match: RegExpExecArray | null
  
  while ((match = pattern.exec(response)) !== null) {
    const rawJson = match[1]
    const callKey = rawJson.trim()
    
    if (seen.has(callKey)) {
      continue
    }
    seen.add(callKey)
    
    try {
      const parsed = JSON.parse(rawJson)
      const validation = ToolCallSchema.safeParse(parsed)
      
      if (!validation.success) {
        results.push({
          name: parsed.name || 'unknown',
          rawArgs: parsed.args,
          valid: false,
          errors: validation.error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`),
        })
        continue
      }
      
      const { name, args } = validation.data
      const schema = ToolSchemas[name]
      
      if (!schema) {
        results.push({
          name,
          rawArgs: args,
          valid: false,
          errors: [`Unknown tool: ${name}`],
        })
        continue
      }
      
      const argsValidation = schema.safeParse(args)
      
      if (!argsValidation.success) {
        results.push({
          name,
          rawArgs: args,
          valid: false,
          errors: argsValidation.error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`),
        })
        continue
      }
      
      results.push({
        name,
        args: argsValidation.data,
        valid: true,
      })
    } catch (err) {
      results.push({
        name: 'parse-error',
        rawArgs: rawJson,
        valid: false,
        errors: [`JSON parse error: ${err}`],
      })
    }
  }
  
  return results
}

export function getToolDefinition(toolName: string): { name: string; args: string[] } | null {
  const schema = ToolSchemas[toolName]
  if (!schema) return null
  
  const shape = (schema as any).shape
  if (!shape) return { name: toolName, args: [] }
  
  return {
    name: toolName,
    args: Object.keys(shape),
  }
}

export function listAvailableTools(): string[] {
  return Object.keys(ToolSchemas)
}
