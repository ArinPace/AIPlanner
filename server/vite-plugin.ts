import type { Plugin } from 'vite'
import { handleApi } from './api.ts'

export function calendarApiPlugin(): Plugin {
  return {
    name: 'calendar-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleApi(req, res)
        if (!handled) next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleApi(req, res)
        if (!handled) next()
      })
    },
  }
}
