import path from 'node:path'

// MCP subprocesses inherit only selected environment variables. Keep browser
// installation/profile paths explicit, without putting credentials in CLI args.
export function browserRuntimeEnv(dataDir, env=process.env) {
  return {
    PLANNER_DATA_DIR: dataDir,
    PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH || path.join(dataDir,'browsers'),
    DISPLAY: env.DISPLAY || ':99',
  }
}
