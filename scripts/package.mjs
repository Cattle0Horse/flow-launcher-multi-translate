import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = path.join(root, 'release')
const pluginDir = path.join(output, 'MultiTranslate')
const manifest = JSON.parse(await readFile(path.join(root, 'plugin.json'), 'utf8'))
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
if (manifest.Version !== pkg.version)
  throw new Error('package.json and plugin.json versions must match')
const archiveName = `MultiTranslate-${pkg.version}.zip`
const archive = path.join(output, archiveName)

// Only clean the generated staging directory and this version's archive.
await rm(pluginDir, { recursive: true, force: true })
await rm(archive, { force: true })
await mkdir(pluginDir, { recursive: true })
for (const file of ['dist', 'plugin.json', 'SettingsTemplate.yaml', 'LICENSE', 'package.json', 'pnpm-lock.yaml'])
  await cp(path.join(root, file), path.join(pluginDir, file), { recursive: true })
await cp(path.join(root, 'assets'), path.join(pluginDir, 'assets'), {
  recursive: true,
  filter: source => path.basename(source) !== 'example1.png',
})

// A flat installation makes the folder portable without workspace/store symlinks.
const pnpmCli = process.env.npm_execpath
if (!pnpmCli || !path.basename(pnpmCli).includes('pnpm'))
  throw new Error('Run packaging with pnpm package')
const installArgs = ['install', '--prod', '--frozen-lockfile', '--ignore-scripts', '--config.node-linker=hoisted']
const nativeCli = path.extname(pnpmCli) === '.exe'
execFileSync(nativeCli ? pnpmCli : process.execPath, nativeCli ? installArgs : [pnpmCli, ...installArgs], {
  cwd: pluginDir,
  stdio: 'inherit',
  windowsHide: true,
})
await rm(path.join(pluginDir, 'pnpm-lock.yaml'))
await writeFile(path.join(pluginDir, 'package.json'), `${JSON.stringify({
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  main: pkg.main,
  license: pkg.license,
  dependencies: pkg.dependencies,
}, null, 2)}\n`)

if (process.platform === 'win32') {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Compress-Archive -Path (Join-Path $env:MULTITRANSLATE_STAGE "*") -DestinationPath $env:MULTITRANSLATE_ARCHIVE -Force'], {
    env: { ...process.env, MULTITRANSLATE_STAGE: pluginDir, MULTITRANSLATE_ARCHIVE: archive },
    stdio: 'inherit',
    windowsHide: true,
  })
}
else {
  execFileSync('zip', ['-qr', archive, '.'], { cwd: pluginDir, stdio: 'inherit' })
}
console.log(`Plugin folder: ${pluginDir}\nArchive: ${archive}`)
