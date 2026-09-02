import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildDetectDump, detectDumpFilename, detectDumpRoot, type DetectDumpInput } from '@blueprint3d/vision/detect-dump'

export async function saveDetectDump(
  input: DetectDumpInput,
  extras?: { imageBase64?: string }
): Promise<{ file: string; latest: string } | null> {
  try {
    const dir = detectDumpRoot(process.cwd())
    await mkdir(dir, { recursive: true })
    const name = detectDumpFilename()
    const body = `${JSON.stringify(buildDetectDump(input), null, 2)}\n`
    await writeFile(path.join(dir, name), body, 'utf8')
    await writeFile(path.join(dir, 'latest.json'), body, 'utf8')
    if (extras?.imageBase64) {
      await writeFile(path.join(dir, 'latest.jpg'), Buffer.from(extras.imageBase64, 'base64'))
    }
    return {
      file: `tmp/ai-detect/${name}`,
      latest: 'tmp/ai-detect/latest.json'
    }
  } catch (error) {
    console.warn('Detect dump skipped:', error)
    return null
  }
}
