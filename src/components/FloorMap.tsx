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
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { displayPosition, FLOOR, snapPosition, type Point } from '@/lib/station'
import { useStationStore } from '@/store/stationStore'
import type { Station } from '@/types'
import { StationCard } from './StationCard'

interface FloorMapProps {
  stations: Station[]
  /** Edit mode: cards are draggable and their buttons inert. */
  editable?: boolean
}

const MIN_BOARD_HEIGHT = 560
const FALLBACK_BOARD_WIDTH = 1100

const instructions: ScreenReaderInstructions = {
  draggable:
    'برای برداشتن ایستگاه، کلید فاصله یا Enter را بزنید. با کلیدهای جهت جابه‌جا کنید و برای رها کردن دوباره فاصله یا Enter را بزنید. Escape جابه‌جایی را لغو می‌کند.',
}

/**
 * 2D floor plan. Positions are physical room coordinates (px from the
 * board's top-left), so the board itself is LTR and never mirrored; each
 * card restores RTL for its own content.
 */
export function FloorMap({ stations, editable = true }: FloorMapProps) {
  const moveStation = useStationStore((s) => s.moveStation)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [boardWidth, setBoardWidth] = useState(FALLBACK_BOARD_WIDTH)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setBoardWidth(element.clientWidth || FALLBACK_BOARD_WIDTH))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const positions = useMemo(
    () => new Map<string, Point>(stations.map((s, index) => [s.id, displayPosition(s, index, boardWidth)])),
    [stations, boardWidth],
  )

  // The board grows to fit stations dragged beyond the visible area.
  let width = boardWidth
  let height = MIN_BOARD_HEIGHT
  for (const p of positions.values()) {
    width = Math.max(width, p.x + FLOOR.cardWidth + FLOOR.padding)
    height = Math.max(height, p.y + FLOOR.cardHeight + FLOOR.padding)
  }

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

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} accessibility={{ announcements, screenReaderInstructions: instructions }}>
      <div ref={scrollRef} dir="ltr" className="overflow-auto rounded-2xl border border-separator bg-black/25">
        <div
          data-testid="floor-board"
          className="relative"
          style={{
            width,
            height,
            backgroundImage: 'radial-gradient(circle, rgb(255 255 255 / 0.07) 1px, transparent 1px)',
            backgroundSize: `${FLOOR.grid * 2}px ${FLOOR.grid * 2}px`,
          }}
        >
          {stations.map((station) => {
            const position = positions.get(station.id)
            return position ? (
              <DraggableStation key={station.id} station={station} position={position} editable={editable} />
            ) : null
          })}
        </div>
      </div>
    </DndContext>
  )
}

function DraggableStation({ station, position, editable }: { station: Station; position: Point; editable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: station.id,
    disabled: !editable,
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
      className={cn(
        // Opaque backing: cards may overlap on a map, and glass would let the one below show through.
        'absolute rounded-[20px] bg-surface',
        editable && 'cursor-grab touch-none select-none',
        isDragging && 'z-30 cursor-grabbing',
      )}
      {...(editable ? { ...attributes, ...listeners, 'aria-label': `جابه‌جایی ${station.name}` } : {})}
    >
      {/* In edit mode the card is a picture of itself: no accidental start/checkout while arranging. */}
      <div
        inert={editable}
        className={cn(
          'transition-[transform,box-shadow] duration-150',
          editable && 'pointer-events-none',
          isDragging && 'scale-[1.02] rounded-[20px] shadow-2xl shadow-black/70',
        )}
      >
        <StationCard station={station} />
      </div>
    </div>
  )
}
