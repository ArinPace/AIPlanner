import { useEffect, type RefObject } from 'react'
import { PINCH_SCALE_STEP, PINCH_WHEEL_THRESHOLD, zoomDateView } from './zoom'
import type { CalendarView } from '../types'

type GestureEventLike = Event & { scale: number }

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

export function useDatePinch(
  nodeRef: RefObject<HTMLElement | null>,
  onViewChange: (update: (current: CalendarView) => CalendarView) => void,
  enabled = true,
) {
  useEffect(() => {
    const node = nodeRef.current
    if (!enabled || !node) return

    let wheelAccum = 0
    let startDistance = 0
    let lastScale = 1

    function step(direction: -1 | 1) {
      onViewChange((current) => zoomDateView(current, direction))
    }

    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey) return
      event.preventDefault()
      wheelAccum += event.deltaY
      if (wheelAccum >= PINCH_WHEEL_THRESHOLD) {
        wheelAccum = 0
        step(1)
      } else if (wheelAccum <= -PINCH_WHEEL_THRESHOLD) {
        wheelAccum = 0
        step(-1)
      }
    }

    function onTouchStart(event: TouchEvent) {
      const first = event.touches[0]
      const second = event.touches[1]
      if (!first || !second) return
      startDistance = touchDistance(first, second)
    }

    function onTouchMove(event: TouchEvent) {
      const first = event.touches[0]
      const second = event.touches[1]
      if (!first || !second || startDistance <= 0) return
      event.preventDefault()
      const current = touchDistance(first, second)
      const scale = current / startDistance
      if (scale >= PINCH_SCALE_STEP) {
        startDistance = current
        step(-1)
      } else if (scale <= 1 / PINCH_SCALE_STEP) {
        startDistance = current
        step(1)
      }
    }

    function onTouchEnd(event: TouchEvent) {
      if (event.touches.length < 2) startDistance = 0
    }

    function onGestureStart(event: Event) {
      event.preventDefault()
      lastScale = 1
    }

    function onGestureChange(event: Event) {
      event.preventDefault()
      const scale = (event as GestureEventLike).scale
      if (scale / lastScale >= PINCH_SCALE_STEP) {
        lastScale = scale
        step(-1)
      } else if (lastScale / scale >= PINCH_SCALE_STEP) {
        lastScale = scale
        step(1)
      }
    }

    const wheelOpts: AddEventListenerOptions = { passive: false }
    node.addEventListener('wheel', onWheel, wheelOpts)
    node.addEventListener('touchstart', onTouchStart, { passive: true })
    node.addEventListener('touchmove', onTouchMove, wheelOpts)
    node.addEventListener('touchend', onTouchEnd)
    node.addEventListener('touchcancel', onTouchEnd)
    node.addEventListener('gesturestart', onGestureStart)
    node.addEventListener('gesturechange', onGestureChange)

    return () => {
      node.removeEventListener('wheel', onWheel)
      node.removeEventListener('touchstart', onTouchStart)
      node.removeEventListener('touchmove', onTouchMove)
      node.removeEventListener('touchend', onTouchEnd)
      node.removeEventListener('touchcancel', onTouchEnd)
      node.removeEventListener('gesturestart', onGestureStart)
      node.removeEventListener('gesturechange', onGestureChange)
    }
  }, [enabled, nodeRef, onViewChange])
}
