/** Read a File as text, transparently decompressing gzip (.gz). */
export async function readFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.gz')) {
    const ds = new DecompressionStream('gzip');
    const decompressed = file.stream().pipeThrough(ds);
    const reader = decompressed.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const decoder = new TextDecoder();
    return chunks.map(c => decoder.decode(c, { stream: true })).join('') + decoder.decode();
  }
  return file.text();
}
