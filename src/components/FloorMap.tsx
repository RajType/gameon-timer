import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cn } from '@/lib/cn'
import { boardExtent, displayPosition, fitScale, FLOOR, readingOrder, snapPosition, type Point } from '@/lib/station'
import { useStationStore } from '@/store/stationStore'
import type { Station } from '@/types'
import { StationCard } from './StationCard'

interface FloorMapProps {
  stations: Station[]
  /**
   * `true` — layout editor (Stations page): cards are draggable, their buttons inert.
   * `false` (default) — live floor view: cards are fully interactive, nothing can move.
   */
  editable?: boolean
}

const FALLBACK_BOARD_WIDTH = 1100

/**
 * 2D floor plan. Positions are physical room coordinates (px from the
 * board's top-left), so the board itself is LTR and never mirrored; each
 * card restores RTL for its own text and numbers.
 */
export function FloorMap({ stations, editable = false }: FloorMapProps) {
  return editable ? <EditableFloor stations={stations} /> : <LiveFloor stations={stations} />
}

// ---- shared layout ---------------------------------------------------------------

function useFloorLayout(stations: Station[]) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [boardWidth, setBoardWidth] = useState(FALLBACK_BOARD_WIDTH)

  // Window resizes reach us as size changes of the scroll container.
  useEffect(() => {
    const element = scrollRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setBoardWidth(element.clientWidth || FALLBACK_BOARD_WIDTH))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const positions = useMemo(
    () => new Map<string, Point>(stations.map((s, index) => [s.id, displayPosition(s, index, boardWidth)])),
    [stations, boardWidth],
  )
  // Tab follows the picture, not the database order.
  const ordered = useMemo(() => readingOrder(stations, positions), [stations, positions])
  const extent = useMemo(() => boardExtent(positions.values(), boardWidth), [positions, boardWidth])
  return { scrollRef, boardWidth, positions, ordered, extent }
}

interface FloorFrameProps {
  scrollRef: RefObject<HTMLDivElement | null>
  extent: { width: number; height: number }
  scale: number
  label: string
  children: ReactNode
}

function FloorFrame({ scrollRef, extent, scale, label, children }: FloorFrameProps) {
  return (
    <div
      ref={scrollRef}
      dir="ltr"
      role="region"
      aria-label={label}
      // Focusable so keyboard users can scroll a board wider than the window.
      tabIndex={0}
      className="overflow-auto rounded-2xl border border-separator bg-black/25"
    >
      {/* Sizer: occupies the scaled size so scrolling and page height stay correct. */}
      <div className="relative" style={{ width: extent.width * scale, height: extent.height * scale }}>
        <div
          data-testid="floor-board"
          data-scale={scale}
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: extent.width,
            height: extent.height,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            backgroundImage: 'radial-gradient(circle, rgb(255 255 255 / 0.07) 1px, transparent 1px)',
            backgroundSize: `${FLOOR.grid * 2}px ${FLOOR.grid * 2}px`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

const cardFrameClass = 'absolute rounded-[20px] bg-surface' // opaque: cards may overlap on a map

// ---- live (read-only) ------------------------------------------------------------

/**
 * Live view: the same `StationCard` as the dashboard (shared clock, store,
 * billing and checkout flow). Nothing here writes positions, and the clock
 * only re-renders — no backend call happens on a tick.
 */
function LiveFloor({ stations }: { stations: Station[] }) {
  const { scrollRef, boardWidth, positions, ordered, extent } = useFloorLayout(stations)
  const scale = fitScale(extent.width, boardWidth)
  return (
    <FloorFrame scrollRef={scrollRef} extent={extent} scale={scale} label="نقشه‌ی زنده‌ی سالن">
      {ordered.map((station) => {
        const p = positions.get(station.id)
        return p ? (
          <div
            key={station.id}
            dir="rtl"
            data-station-id={station.id}
            className={cardFrameClass}
            style={{ left: p.x, top: p.y, width: FLOOR.cardWidth }}
          >
            <StationCard station={station} />
          </div>
        ) : null
      })}
    </FloorFrame>
  )
}

// ---- layout editor -------------------------------------------------------------

const instructions: ScreenReaderInstructions = {
  draggable:
    'برای برداشتن ایستگاه، کلید فاصله یا Enter را بزنید. با کلیدهای جهت جابه‌جا کنید و برای رها کردن دوباره فاصله یا Enter را بزنید. Escape جابه‌جایی را لغو می‌کند.',
}

function EditableFloor({ stations }: { stations: Station[] }) {
  const moveStation = useStationStore((s) => s.moveStation)
  const { scrollRef, positions, ordered, extent } = useFloorLayout(stations)

  const sensors = useSensors(
    // A small threshold keeps a plain click from counting as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const names = useMemo(() => new Map(stations.map((s) => [s.id, s.name])), [stations])
  const announcements: Announcements = {
    onDragStart: ({ active }) => `«${names.get(String(active.id))}» برداشته شد.`,
    onDragOver: () => undefined,
    onDragEnd: ({ active }) => `«${names.get(String(active.id))}» در جای جدید قرار گرفت.`,
    onDragCancel: ({ active }) => `جابه‌جایی «${names.get(String(active.id))}» لغو شد.`,
  }

  const onDragEnd = ({ active, delta }: DragEndEvent) => {
    const id = String(active.id)
    const from = positions.get(id)
    if (!from || (delta.x === 0 && delta.y === 0)) return
    const to = snapPosition({ x: from.x + delta.x, y: from.y + delta.y })
    if (to.x === from.x && to.y === from.y) return
    void moveStation(id, to.x, to.y)
  }

  // Editing is always 1:1 so a drop lands exactly under the pointer.
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} accessibility={{ announcements, screenReaderInstructions: instructions }}>
      <FloorFrame scrollRef={scrollRef} extent={extent} scale={1} label="ویرایش چیدمان سالن">
        {ordered.map((station) => {
          const p = positions.get(station.id)
          return p ? <DraggableStation key={station.id} station={station} position={p} /> : null
        })}
      </FloorFrame>
    </DndContext>
  )
}

function DraggableStation({ station, position }: { station: Station; position: Point }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: station.id,
    attributes: { roleDescription: 'قابل جابه‌جایی' },
  })

  return (
    <div
      ref={setNodeRef}
      dir="rtl"
      data-station-id={station.id}
      style={{
        left: position.x,
        top: position.y,
        width: FLOOR.cardWidth,
        transform: CSS.Translate.toString(transform),
      }}
      className={cn(cardFrameClass, 'cursor-grab touch-none select-none', isDragging && 'z-30 cursor-grabbing')}
      {...attributes}
      {...listeners}
      aria-label={`جابه‌جایی ${station.name}`}
    >
      {/* While arranging, the card is a picture of itself: no accidental start/checkout. */}
      <div
        inert
        className={cn(
          'pointer-events-none transition-[transform,box-shadow] duration-150',
          isDragging && 'scale-[1.02] rounded-[20px] shadow-2xl shadow-black/70',
        )}
      >
        <StationCard station={station} />
      </div>
    </div>
  )
}
