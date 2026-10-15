export function connectionProgress(status: string | undefined, power: string, cold: boolean, seconds: number) {
  const stage = status === 'running' ? 'Opening your secure sign-in browser'
    : power !== 'online' ? 'Starting your private computer'
    : status === 'queued' ? 'Waiting for your private browser'
    : 'Requesting your connection'
  const estimate = cold ? 'Usually 1–3 minutes when your computer is asleep.' : 'Usually 15–60 seconds when your computer is online.'
  const elapsed = seconds < 60 ? `${seconds}s elapsed` : `${Math.floor(seconds / 60)}m ${seconds % 60}s elapsed`
  const detail = seconds > (cold ? 180 : 60)
    ? 'Taking longer than usual. Your request is still pending; you do not need to click Connect again.'
    : 'This tab will open your sign-in page automatically when it is ready. Recordings are off.'
  return { stage, estimate, elapsed, detail }
}

// Static markup only. Labels and progress are inserted with textContent.
export const connectionLoadingPage = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preparing your secure sign-in</title><style>
body{margin:0;background:#f7f8fa;color:#202124;font:16px/1.6 system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}main{box-sizing:border-box;width:min(480px,calc(100% - 32px));padding:32px;background:white;border:1px solid #e5e7eb;border-radius:20px;box-shadow:0 10px 45px #00000008}h1{font-size:22px;margin:16px 0 8px}p{color:#626873;margin:10px 0}small{display:block;color:#777}#elapsed{font-variant-numeric:tabular-nums}.spinner{width:26px;height:26px;border:3px solid #e8e8e8;border-top-color:#333;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}
</style></head><body><main><div class="spinner" aria-hidden="true"></div><h1 id="connection-title">Preparing your connection</h1><p id="connection-stage" role="status">Requesting your connection</p><p id="connection-estimate"></p><small id="connection-elapsed">0s elapsed</small><p id="connection-detail">Your sign-in page will open here automatically. Recordings are off.</p></main></body></html>`
