from datetime import date, datetime, time, timedelta

from app.task_allocation import daily_allocation, effective_start
from app.models import DailyPlan, PageGoal, PlannedSession, Priority, StudentProfile, StudyTask


PRIORITY_SCORE = {Priority.HIGH: 0, Priority.NORMAL: 1, Priority.LOW: 2}
WEEKEND_WINDOWS = {
    "오전": (time(9, 0), time(12, 0)),
    "오후": (time(13, 0), time(18, 0)),
    "저녁": (time(18, 0), time(22, 0)),
    "종일 가능": (time(9, 0), time(21, 0)),
    "주말에는 쉬고 싶어요": (time(9, 0), time(9, 0)),
}


def minutes_between(start: time, end: time) -> int:
    start_minutes = start.hour * 60 + start.minute
    end_minutes = end.hour * 60 + end.minute
    return max(0, end_minutes - start_minutes)


def add_minutes(value: time, minutes: int) -> time:
    return (datetime.combine(date.today(), value) + timedelta(minutes=minutes)).time()


def generate_daily_plan(profile: StudentProfile, tasks: list[StudyTask], plan_date: date) -> DailyPlan:
    if plan_date.weekday() >= 5:
        start, end = WEEKEND_WINDOWS.get(profile.weekend_availability, (time(9, 0), time(18, 0)))
    else:
        start, end = profile.weekday_study_start, profile.weekday_study_end

    raw_available = minutes_between(start, end)
    available = int(raw_available * profile.plan_intensity / 100)
    active_tasks = [task for task in tasks if not task.completed and effective_start(task) <= plan_date <= task.target_date]
    difficult = set(profile.difficult_subjects)
    active_tasks.sort(key=lambda task: (
        PRIORITY_SCORE[task.priority],
        task.target_date,
        0 if task.subject in difficult else 1,
        task.created_at,
    ))

    # Page goals depend only on the page range and the calendar period. The
    # estimated minutes are used solely to place study time on the timetable.
    page_goals: list[PageGoal] = []
    for task in active_tasks:
        if task.start_page is None or task.end_page is None:
            continue
        _, first, last = daily_allocation(task, plan_date)
        if first is not None:
            page_goals.append(PageGoal(
                task_id=task.id, subject=task.subject, title=task.title,
                start_page=first, end_page=last,
            ))

    sessions: list[PlannedSession] = []
    cursor = start
    remaining_capacity = available
    task_remaining = {
        task.id: max(0, task.estimated_minutes - task.completed_minutes) for task in active_tasks
    }
    # Explicit periods split the total once, so changing today's date cannot
    # move page ranges or inflate the daily allocation.
    daily_limits = {
        task.id: min(task_remaining[task.id], daily_allocation(task, plan_date)[0])
        if task.start_date is not None or task.start_page is not None
        else task_remaining[task.id]
        for task in active_tasks
    }
    scheduled_by_task = {task.id: 0 for task in active_tasks}
    queue = active_tasks.copy()

    while queue and remaining_capacity > 0:
        task = queue.pop(0)
        remaining = task_remaining[task.id]
        remaining_today = daily_limits[task.id] - scheduled_by_task[task.id]
        if remaining <= 0 or remaining_today <= 0:
            continue
        minutes = min(profile.focus_minutes, remaining, remaining_today, remaining_capacity)
        if minutes <= 0:
            continue
        end_time = add_minutes(cursor, minutes)
        reasons = []
        if task.priority == Priority.HIGH:
            reasons.append("우선순위가 높은 작업")
        if task.subject in difficult:
            reasons.append("보완이 필요한 과목")
        days_left = (task.target_date - plan_date).days
        if days_left <= 3:
            reasons.append("마감이 가까운 작업")
        sessions.append(PlannedSession(
            task_id=task.id, subject=task.subject, title=task.title,
            start_time=cursor, end_time=end_time, planned_minutes=minutes,
            reason=" · ".join(reasons) or "남은 학습량과 목표일을 고려해 배치",
        ))
        task_remaining[task.id] -= minutes
        scheduled_by_task[task.id] += minutes
        remaining_capacity -= minutes
        if task_remaining[task.id] > 0 and scheduled_by_task[task.id] < daily_limits[task.id]:
            queue.append(task)
        if queue and remaining_capacity > profile.break_minutes:
            cursor = add_minutes(end_time, profile.break_minutes)
            remaining_capacity -= profile.break_minutes
        else:
            cursor = end_time

    unscheduled = [task.id for task in active_tasks if scheduled_by_task[task.id] < daily_limits[task.id]]
    return DailyPlan(
        plan_date=plan_date,
        available_minutes=available,
        planned_minutes=sum(session.planned_minutes for session in sessions),
        sessions=sessions,
        unscheduled_task_ids=unscheduled,
        page_goals=page_goals,
    )
