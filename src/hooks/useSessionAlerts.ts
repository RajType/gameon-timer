import { useEffect, useRef } from 'react'
import { computeAlerts, createAlertMemory } from '@/lib/alerts'
import { formatNumber } from '@/lib/currency'
import { playSound } from '@/lib/sound'
import { useSettingsStore } from '@/store/settingsStore'
import { useStationStore } from '@/store/stationStore'
import { useUiStore } from '@/store/uiStore'
import { useNow } from './useNow'

/** Plays the configured warning sound and shows a toast for session alerts. */
export function useSessionAlerts() {
  const now = useNow()
  const sessions = useStationStore((s) => s.sessions)
  const stations = useStationStore((s) => s.stations)
  const settings = useSettingsStore((s) => s.settings)
  const memory = useRef(createAlertMemory())

  useEffect(() => {
    if (!settings) return
    const alerts = computeAlerts(Object.values(sessions), settings, now, memory.current)
    if (alerts.length === 0) return
    if (settings.soundEnabled) playSound(settings.soundPreset, settings.soundVolume)
    const push = useUiStore.getState().pushToast
    for (const alert of alerts) {
      const name = stations.find((s) => s.id === alert.stationId)?.name ?? ''
      push(
        alert.kind === 'interval'
          ? { tone: 'info', title: `${name}: ${formatNumber(alert.minutes)} دقیقه بازی` }
          : { tone: 'warning', title: `${name}: ${formatNumber(alert.minutes)} دقیقه در مکث`, detail: 'جلسه هنوز باز است.' },
      )
    }
  }, [now, sessions, stations, settings])
}
