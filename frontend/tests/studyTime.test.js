import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateSessions, elapsedSeconds, movePeriod, pauseTimer, periodBuckets, timerIntervals } from '../src/studyTime.js'

process.env.TZ = 'Asia/Seoul'

const session = { subject: '수학', intervals: [
  { start: '2026-09-13T23:50:00+09:00', end: '2026-09-14T00:10:00+09:00' },
  { start: '2026-09-14T00:20:00+09:00', end: '2026-09-14T00:30:00+09:00' },
] }

test('midnight split and paused time excluded in daily/weekly/monthly charts', () => {
  assert.equal(elapsedSeconds(session.intervals), 1800)
  const sunday = aggregateSessions([session], periodBuckets('day', '2026-09-13'))
  const monday = aggregateSessions([session], periodBuckets('day', '2026-09-14'))
  assert.equal(sunday[23].seconds, 600)
  assert.equal(monday[0].seconds, 1200)
  const week = aggregateSessions([session], periodBuckets('week', '2026-09-14'))
  assert.equal(week[0].seconds, 1200)
  assert.equal(week.reduce((sum, bucket) => sum + bucket.seconds, 0), 1200)
  const month = aggregateSessions([session], periodBuckets('month', '2026-09-13'))
  assert.equal(month[12].seconds, 600)
  assert.equal(month[13].seconds, 1200)
  assert.equal(aggregateSessions([session], month, '국어').reduce((sum, bucket) => sum + bucket.seconds, 0), 0)
})

test('period navigation crosses year boundaries and leap February', () => {
  assert.equal(movePeriod('2026-12-31', 'month', 1), '2027-01-01')
  assert.equal(movePeriod('2026-01-01', 'day', -1), '2025-12-31')
  assert.equal(periodBuckets('month', '2028-02-15').length, 29)
  assert.equal(periodBuckets('week', '2026-09-13')[0].date, '2026-09-07')
})

test('reload and pause/resume use timestamps rather than interval tick counts', () => {
  let timer = { intervals: [], runningSince: '2026-09-13T01:00:00Z' }
  timer = JSON.parse(JSON.stringify(timer))
  assert.equal(elapsedSeconds(timerIntervals(timer, Date.parse('2026-09-13T01:10:00Z'))), 600)
  timer = pauseTimer(timer, Date.parse('2026-09-13T01:10:00Z'))
  assert.equal(elapsedSeconds(timerIntervals(timer, Date.parse('2026-09-13T01:30:00Z'))), 600)
  timer = { ...timer, runningSince: '2026-09-13T01:30:00Z' }
  timer = pauseTimer(timer, Date.parse('2026-09-13T01:35:00Z'))
  assert.equal(elapsedSeconds(timer.intervals), 900)
})
