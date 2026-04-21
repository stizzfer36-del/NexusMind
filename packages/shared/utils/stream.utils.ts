export async function collectStream(stream: AsyncIterable<string>): Promise<string> {
  const chunks: string[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks.join('')
}

export async function* streamToLines(stream: AsyncIterable<string>): AsyncIterable<string> {
  let buffer = ''
  for await (const chunk of stream) {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      yield line
    }
  }
  if (buffer.length > 0) {
    yield buffer
  }
}

export async function* mergeStreams(
  ...streams: AsyncIterable<string>[]
): AsyncIterable<string> {
  const iterators = streams.map((s) => s[Symbol.asyncIterator]())
  const pending = new Map<number, Promise<IteratorResult<string, undefined>>>()

  iterators.forEach((it, idx) => {
    pending.set(idx, it.next())
  })

  while (pending.size > 0) {
    const [idx, promise] = (await Promise.race(
      Array.from(pending.entries()).map(async ([i, p]) => [i, await p] as const)
    )) as [number, IteratorResult<string, undefined>]

    pending.delete(idx)

    if (!promise.done) {
      yield promise.value
      pending.set(idx, iterators[idx].next())
    }
  }
}
