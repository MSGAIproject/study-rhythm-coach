export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function timerIntervals(timer, now) {
  if (!timer) return []
  return [...timer.intervals, ...(timer.runningSince && now > Date.parse(timer.runningSince) ? [{ start: timer.runningSince, end: new Date(now).toISOString() }] : [])]
}

export function elapsedSeconds(intervals) {
  return intervals.reduce((sum, interval) => sum + Math.max(0, (Date.parse(interval.end) - Date.parse(interval.start)) / 1000), 0)
}

export function pauseTimer(timer, now) {
  return { ...timer, intervals: timerIntervals(timer, now), runningSince: null }
}

export function formatDuration(seconds) {
  const value = Math.floor(seconds)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor(value % 3600 / 60)
  return hours ? `${hours}시간 ${minutes}분` : minutes ? `${minutes}분` : `${value}초`
}

export function periodBuckets(mode, selected) {
  const start = new Date(`${selected}T00:00:00`)
  if (mode === 'week') start.setDate(start.getDate() - (start.getDay() + 6) % 7)
  if (mode === 'month') start.setDate(1)
  const count = mode === 'day' ? 24 : mode === 'week' ? 7 : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  return Array.from({ length: count }, (_, index) => {
    const from = new Date(start)
    const to = new Date(start)
    if (mode === 'day') { from.setHours(index); to.setHours(index + 1) }
    else { from.setDate(start.getDate() + index); to.setDate(start.getDate() + index + 1) }
    return { start: from.getTime(), end: to.getTime(), label: mode === 'day' ? `${index}시` : mode === 'week' ? ['월', '화', '수', '목', '금', '토', '일'][index] : `${index + 1}일`, date: dateKey(from), seconds: 0 }
  })
}

export function aggregateSessions(sessions, buckets, subject = 'all') {
  return buckets.map((bucket) => ({ ...bucket, seconds: sessions.filter((session) => subject === 'all' || session.subject === subject).reduce((sum, session) => sum + session.intervals.reduce((subtotal, interval) => subtotal + Math.max(0, Math.min(bucket.end, Date.parse(interval.end)) - Math.max(bucket.start, Date.parse(interval.start))) / 1000, 0), 0) }))
}

export function movePeriod(selected, mode, offset) {
  const day = new Date(`${selected}T12:00:00`)
  if (mode === 'month') { day.setDate(1); day.setMonth(day.getMonth() + offset) }
  else day.setDate(day.getDate() + offset * (mode === 'week' ? 7 : 1))
  return dateKey(day)
}
