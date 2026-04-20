const KST_OFFSET_MINUTES = 9 * 60

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function isoDateFromUtcMs(utcMs: number): string {
  const d = new Date(utcMs)
  const y = d.getUTCFullYear()
  const m = pad2(d.getUTCMonth() + 1)
  const day = pad2(d.getUTCDate())
  return `${y}-${m}-${day}`
}

export function getLogicalDateFromUtcMs(
  utcMs: number,
  dayStartHour = 6,
  tzOffsetMinutes = KST_OFFSET_MINUTES,
): string {
  const localMs = utcMs + tzOffsetMinutes * 60_000
  const local = new Date(localMs)
  const localHour = local.getUTCHours()
  const logicalUtcMs =
    localHour < dayStartHour ? localMs - 24 * 60 * 60_000 : localMs
  return isoDateFromUtcMs(logicalUtcMs)
}

export function getLocalHourFromUtcMs(
  utcMs: number,
  tzOffsetMinutes = KST_OFFSET_MINUTES,
): number {
  const localMs = utcMs + tzOffsetMinutes * 60_000
  const local = new Date(localMs)
  return local.getUTCHours()
}

export function getNowKstLogicalDate(dayStartHour = 6): string {
  return getLogicalDateFromUtcMs(Date.now(), dayStartHour, KST_OFFSET_MINUTES)
}

