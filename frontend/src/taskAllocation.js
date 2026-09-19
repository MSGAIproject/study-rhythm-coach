import { dateKey } from './studyTime.js'

const ordinal = (key) => Date.parse(`${key}T00:00:00Z`) / 86400000
const dateFromOrdinal = (value) => new Date(value * 86400000).toISOString().slice(0, 10)
export function taskStart(task) {
  return task.start_date || [task.created_at.slice(0, 10), task.target_date].sort()[0]
}
export function periodDays(start, end) {
  return Math.max(0, ordinal(end) - ordinal(start) + 1)
}

function planningSegments(task) {
  const originalStart = taskStart(task)
  const target = task.target_date
  let activeStart = originalStart
  let remainingMinutes = task.estimated_minutes
  let remainingPages = task.start_page != null && task.end_page != null ? task.end_page - task.start_page + 1 : 0
  let nextPage = task.start_page
  const segments = []
  const events = [...(task.planning_events || [])].sort((left, right) =>
    left.event_date.localeCompare(right.event_date))

  function closeActive(visibleEnd) {
    if (!activeStart || activeStart > target || visibleEnd < activeStart) return
    const end = visibleEnd < target ? visibleEnd : target
    const allocationDays = periodDays(activeStart, target)
    const visibleDays = periodDays(activeStart, end)
    segments.push({
      start: activeStart, end, allocationDays,
      minutes: remainingMinutes, pages: remainingPages, startPage: nextPage,
    })
    const usedMinutes = Math.floor(remainingMinutes * visibleDays / allocationDays)
    const usedPages = Math.floor(remainingPages * visibleDays / allocationDays)
    remainingMinutes -= usedMinutes
    remainingPages -= usedPages
    if (nextPage != null) nextPage += usedPages
  }

  for (const [eventIndex, event] of events.entries()) {
    if (event.action === 'completed' && activeStart) {
      const nextEvent = events[eventIndex + 1]
      const resumesSameDay = nextEvent?.action === 'resumed' && nextEvent.event_date === event.event_date
      closeActive(resumesSameDay ? dateFromOrdinal(ordinal(event.event_date) - 1) : event.event_date)
      activeStart = null
    } else if (event.action === 'resumed' && !activeStart) {
      activeStart = event.event_date > originalStart ? event.event_date : originalStart
    }
  }
  if (activeStart) closeActive(target)
  return segments
}

function allocationForDate(task, key) {
  const segment = planningSegments(task).find((item) => key >= item.start && key <= item.end)
  if (!segment) return null
  const index = ordinal(key) - ordinal(segment.start)
  const minutes = Math.floor(segment.minutes * (index + 1) / segment.allocationDays)
    - Math.floor(segment.minutes * index / segment.allocationDays)
  let startPage = null, endPage = null
  if (segment.startPage != null && segment.pages > 0) {
    const left = Math.floor(segment.pages * index / segment.allocationDays)
    const right = Math.floor(segment.pages * (index + 1) / segment.allocationDays)
    if (right > left) {
      startPage = segment.startPage + left
      endPage = segment.startPage + right - 1
    }
  }
  return { minutes, startPage, endPage }
}

export function goalsForDate(tasks, key) {
  return tasks.flatMap((task) => {
    const allocation = allocationForDate(task, key)
    if (!allocation) return []
    const { minutes, startPage, endPage } = allocation
    return minutes || startPage !== null ? [{ task, key: `${task.id}:${key}`, minutes, startPage, endPage }] : []
  })
}
export function habitWeek(selected, tasks) {
  const monday = new Date(`${selected}T12:00:00`)
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + index)
    const key = dateKey(day)
    return { key, label: ['월', '화', '수', '목', '금', '토', '일'][index], date: day, goals: goalsForDate(tasks, key) }
  })
}

export function applyAcceptedPlan(days, acceptedPlan, tasks = null) {
  const acceptedGoals = acceptedPlan?.goals || []
  if (!acceptedGoals.length || !acceptedPlan.plan_start_date || !acceptedPlan.plan_end_date) return days
  const replacedTaskIds = new Set(acceptedGoals.map((goal) => goal.source_task_id).filter(Boolean))
  const taskById = new Map((tasks || []).map((task) => [task.id, task]))
  return days.map((day) => {
    const inPlanRange = day.key >= acceptedPlan.plan_start_date && day.key <= acceptedPlan.plan_end_date
    const automaticGoals = inPlanRange
      ? day.goals.filter((goal) => !replacedTaskIds.has(goal.task.id))
      : day.goals
    const plannedGoals = acceptedGoals.filter((goal) => {
      if (goal.date !== day.key) return false
      if (!tasks || !goal.source_task_id) return true
      const source = taskById.get(goal.source_task_id)
      return Boolean(source && allocationForDate(source, day.key))
    }).map((goal) => ({
      key: `coach:${goal.id}`,
      minutes: goal.minutes,
      startPage: goal.start_page,
      endPage: goal.end_page,
      task: { id: goal.source_task_id || goal.id, subject: goal.subject, title: goal.title },
      fromCoach: true,
    }))
    return { ...day, goals: [...automaticGoals, ...plannedGoals] }
  })
}

export function taskGoalKeysForDate(tasks, acceptedPlan, taskId, key) {
  const [day] = applyAcceptedPlan([{ key, goals: goalsForDate(tasks, key) }], acceptedPlan, tasks)
  return day.goals
    .filter((goal) => goal.task.id === taskId && !goal.fromSchedule)
    .map((goal) => goal.key)
}

export function taskGoalKeysThroughDate(tasks, acceptedPlan, taskId, throughKey) {
  const task = tasks.find((item) => item.id === taskId)
  if (!task) return []
  const end = throughKey < task.target_date ? throughKey : task.target_date
  const keys = []
  for (let day = ordinal(taskStart(task)); day <= ordinal(end); day += 1) {
    keys.push(...taskGoalKeysForDate(tasks, acceptedPlan, taskId, dateFromOrdinal(day)))
  }
  return keys
}

function clockMinutes(value) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  return (hour === 24 ? 1440 : hour * 60) + minute
}

export function applyTimetableEntries(days, timetableByDate) {
  return days.map((day) => {
    const scheduleGoals = (timetableByDate[day.key] || []).map((entry) => ({
      key: `schedule:${day.key}:${entry.id}`,
      minutes: Math.max(0, clockMinutes(entry.end_time) - clockMinutes(entry.start_time)),
      startPage: null,
      endPage: null,
      task: { id: entry.id, subject: entry.subject, title: entry.title },
      fromSchedule: true,
      completed: entry.completed,
      startTime: entry.start_time.slice(0, 5),
      endTime: entry.end_time.slice(0, 5),
    }))
    return { ...day, goals: [...day.goals, ...scheduleGoals] }
  })
}
