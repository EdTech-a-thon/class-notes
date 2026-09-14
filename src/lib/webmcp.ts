export interface ParticipationToolInput {
  student: string
  timely: boolean
  prepared: boolean
  attentive: boolean
  contribution: boolean
  collaboration: boolean
}

interface ToolDefinition {
  name: string
  title: string
  description: string
  inputSchema: object
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }
  execute: (input: unknown) => Promise<unknown>
}

declare global {
  interface Document {
    readonly modelContext?: {
      registerTool: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => void | Promise<void>
    }
  }
}

function validate(input: unknown): ParticipationToolInput {
  if (!input || typeof input !== 'object') throw new Error('A grade object is required.')
  const value = input as Record<string, unknown>
  if (typeof value.student !== 'string' || !value.student.trim()) {
    throw new Error('student must be a non-empty name.')
  }

  for (const key of ['timely', 'prepared', 'attentive', 'contribution', 'collaboration']) {
    if (typeof value[key] !== 'boolean') throw new Error(`${key} must be true or false.`)
  }
  return value as unknown as ParticipationToolInput
}

export function registerParticipationTool(
  handler: (input: ParticipationToolInput) => Promise<unknown>,
): () => void {
  const context = document.modelContext
  if (!context?.registerTool) return () => undefined

  const lifecycle = new AbortController()
  const registration = context.registerTool(
    {
      name: 'set_student_participation',
      title: 'Set student participation',
      description:
        'Save all five participation marks for one student in the currently open grade book. Google must already be connected in the page.',
      inputSchema: {
        type: 'object',
        properties: {
          student: { type: 'string', description: 'Student name exactly as shown in the roster.' },
          timely: { type: 'boolean' },
          prepared: { type: 'boolean' },
          attentive: { type: 'boolean' },
          contribution: { type: 'boolean' },
          collaboration: { type: 'boolean' },
        },
        required: ['student', 'timely', 'prepared', 'attentive', 'contribution', 'collaboration'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => handler(validate(input)),
    },
    { signal: lifecycle.signal },
  )

  void Promise.resolve(registration).catch((caught) => {
    console.warn('Could not register the participation tool.', caught)
  })
  return () => lifecycle.abort()
}
