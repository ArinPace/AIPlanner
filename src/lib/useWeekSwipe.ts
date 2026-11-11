import {useEffect, useRef, type RefObject} from 'react'

const gesturePause = 220
const swipeDistance = 70

/** One week per horizontal trackpad gesture, including its momentum tail. */
export function useWeekSwipe(
 nodeRef: RefObject<HTMLElement | null>,
 enabled: boolean,
 onNavigate?: (direction: -1 | 1) => void,
) {
 const navigate = useRef(onNavigate)
 navigate.current = onNavigate
 useEffect(() => {
  const node = nodeRef.current
  if (!enabled || !node) return
  let lastWheel = 0
  let distance = 0
  let wheelFinished = false
  let touchStart: {x: number; y: number; span: number} | undefined
  let touchFinished = false

  function editing(target: EventTarget | null) {
   return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  }
  function onWheel(event: WheelEvent) {
   if (event.ctrlKey || event.metaKey || editing(event.target)) return
   const now = performance.now()
   if (now - lastWheel > gesturePause) {
    distance = 0
    wheelFinished = false
   }
   lastWheel = now
   if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.25) return
   event.preventDefault()
   if (wheelFinished) return
   const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node!.clientWidth : 1
   distance += event.deltaX * unit
   if (Math.abs(distance) < swipeDistance) return
   wheelFinished = true
   navigate.current?.(distance > 0 ? 1 : -1)
  }
  function midpoint(touches: TouchList) {
   if (touches.length !== 2) return undefined
   const [first, second] = [touches[0], touches[1]]
   return {x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2,
    span: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)}
  }
  function onTouchStart(event: TouchEvent) {
   touchStart = editing(event.target) ? undefined : midpoint(event.touches)
   touchFinished = false
  }
  function onTouchMove(event: TouchEvent) {
   const current = midpoint(event.touches)
   if (!touchStart || !current || touchFinished) return
   // Changing finger separation belongs to the existing pinch-to-change-view gesture.
   if (!touchStart.span || Math.abs(current.span / touchStart.span - 1) > 0.1) {
    touchStart = undefined
    return
   }
   const dx = current.x - touchStart.x
   const dy = current.y - touchStart.y
   if (Math.abs(dx) < swipeDistance || Math.abs(dx) <= Math.abs(dy) * 1.25) return
   event.preventDefault()
   touchFinished = true
   navigate.current?.(dx < 0 ? 1 : -1)
  }
  function onTouchEnd() { touchStart = undefined }
  const options = {passive: false}
  node.addEventListener('wheel', onWheel, options)
  node.addEventListener('touchstart', onTouchStart, {passive: true})
  node.addEventListener('touchmove', onTouchMove, options)
  node.addEventListener('touchend', onTouchEnd)
  node.addEventListener('touchcancel', onTouchEnd)
  return () => {
   node.removeEventListener('wheel', onWheel)
   node.removeEventListener('touchstart', onTouchStart)
   node.removeEventListener('touchmove', onTouchMove)
   node.removeEventListener('touchend', onTouchEnd)
   node.removeEventListener('touchcancel', onTouchEnd)
  }
 }, [nodeRef, enabled])
}
