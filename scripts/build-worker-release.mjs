import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { digest, dependencyDigest, normalize, releaseName } from '../worker/update-protocol.mjs'

const files = {}
for (const name of (await readdir(new URL('../worker/', import.meta.url))).sort()) {
  if (releaseName(name)) files[name] = normalize(await readFile(new URL('../worker/' + name, import.meta.url), 'utf8'))
}
const dependencies = dependencyDigest(await readFile(new URL('../worker/package.json', import.meta.url), 'utf8'), await readFile(new URL('../worker/package-lock.json', import.meta.url), 'utf8'))
const bytes = JSON.stringify({ protocol: 1, dependencies, files })
const revision = digest(bytes)
const target = new URL('../dist/worker-updates/', import.meta.url)
await mkdir(target, { recursive: true })
await writeFile(new URL(revision + '.json', target), bytes)
await writeFile(new URL('channel.json', target), JSON.stringify({ protocol: 1, revision }))
console.log('Worker release: ' + revision)
