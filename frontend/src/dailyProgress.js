import { goalsForDate } from './taskAllocation.js'

const SAYINGS = [
  '천 리 길도 한 걸음부터.',
  '시작이 반이다.',
  '티끌 모아 태산.',
  '공든 탑이 무너지랴.',
  '구슬이 서 말이라도 꿰어야 보배.',
  '뜻이 있는 곳에 길이 있다.',
  '가는 말이 고와야 오는 말이 곱다.',
]

export function dailyProgress(tasks, checks, day) {
  return progressForGoals(goalsForDate(tasks, day), checks)
}

export function progressForGoals(goals, checks) {
  const completed = goals.filter((goal) => goal.fromSchedule ? goal.completed : Boolean(checks[goal.key]))
  return {
    total: goals.length,
    completed: completed.length,
    targetSeconds: goals.reduce((sum, goal) => sum + goal.minutes * 60, 0),
    seconds: completed.reduce((sum, goal) => sum + goal.minutes * 60, 0),
    percent: goals.length ? Math.round(completed.length / goals.length * 100) : 0,
  }
}

export function dailySaying(day) {
  return SAYINGS[Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000) % SAYINGS.length]
}
