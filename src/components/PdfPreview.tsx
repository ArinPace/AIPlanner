import {useEffect, useRef, useState} from 'react'
import type {PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {downloadPdf, loadPdfSource} from '../lib/api'
import {CloseIcon} from './Icons'

async function openPdf(id: string, signal: AbortSignal) {
  const [source, pdfjs] = await Promise.all([loadPdfSource(id, signal), import('pdfjs-dist')])
  signal.throwIfAborted()
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs.getDocument({...source, disableAutoFetch: true, disableStream: true})
}

function usePdf(id: string, enabled: boolean) {
  const [pdf, setPdf] = useState<PDFDocumentProxy>()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let task: PDFDocumentLoadingTask | undefined
    void openPdf(id, controller.signal).then(async loading => {
      task = loading
      if (controller.signal.aborted) { await task.destroy(); return }
      const document = await task.promise
      if (!controller.signal.aborted) setPdf(document)
    }).catch(() => {
      if (!controller.signal.aborted) setError('Could not preview this PDF.')
    })
    return () => {
      controller.abort()
      void task?.destroy().catch(() => {})
    }
  }, [id, enabled])
  return {pdf, error}
}

function PdfPage({pdf, pageNumber, width, onError}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  width: number
  onError?: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    let render: RenderTask | undefined
    void pdf.getPage(pageNumber).then(page => {
      const canvas = ref.current
      if (cancelled || !canvas) return
      const viewport = page.getViewport({scale: width / page.getViewport({scale: 1}).width})
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      render = page.render({canvas, viewport, background: '#fff'})
      return render.promise
    }).catch(() => { if (!cancelled) onError?.() })
    return () => { cancelled = true; render?.cancel() }
  }, [pdf, pageNumber, width, onError])
  return <canvas ref={ref} role="img" aria-label={`Page ${pageNumber}`} />
}

export function PdfThumbnail({id}: {id: string}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const {pdf, error} = usePdf(id, visible)
  useEffect(() => {
    if (visible || !ref.current) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect() }
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [visible])
  return <span ref={ref} className="document-kind pdf-thumbnail" aria-hidden="true">
    {pdf && !error ? <PdfPage pdf={pdf} pageNumber={1} width={100} /> : <span>PDF</span>}
  </span>
}

export function PdfPreview({id, name, onClose}: {id: string; name: string; onClose: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const {pdf, error} = usePdf(id, true)
  const [page, setPage] = useState(1)
  const [renderError, setRenderError] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [downloading, setDownloading] = useState(false)
  useEffect(() => { dialog.current?.showModal() }, [])
  async function download() {
    setDownloading(true)
    setDownloadError('')
    try { await downloadPdf(id, name) }
    catch { setDownloadError('Could not download this PDF.') }
    finally { setDownloading(false) }
  }
  return <dialog ref={dialog} className="files-dialog content-preview" aria-label={name} onClose={onClose}>
    <header className="files-dialog-head">
      <h2>{name}</h2>
      <button type="button" className="text-btn" disabled={downloading} onClick={() => void download()}>{downloading ? 'Downloading…' : 'Download PDF'}</button>
      <button type="button" className="icon-btn" aria-label="Close PDF" onClick={() => dialog.current?.close()}><CloseIcon /></button>
    </header>
    {downloadError && <p role="alert">{downloadError}</p>}
    <div key={page} className="pdf-preview-page">
      {error || renderError ? <p role="alert">{error || 'Could not render this page.'}</p> : pdf ?
        <PdfPage key={page} pdf={pdf} pageNumber={page} width={1400} onError={() => setRenderError(true)} /> :
        <p role="status">Opening PDF…</p>}
    </div>
    {pdf && pdf.numPages > 1 && <nav className="pdf-preview-pages" aria-label="PDF pages">
      <button type="button" className="today-btn" disabled={page === 1} onClick={() => { setRenderError(false); setPage(page - 1) }}>Previous</button>
      <span aria-live="polite">{page} / {pdf.numPages}</span>
      <button type="button" className="today-btn" disabled={page === pdf.numPages} onClick={() => { setRenderError(false); setPage(page + 1) }}>Next</button>
    </nav>}
  </dialog>
}
