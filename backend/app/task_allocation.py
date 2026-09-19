"""Stable, inclusive calendar allocation for study tasks."""
from datetime import date
from app.models import StudyTask


def effective_start(task: StudyTask) -> date:
    if task.start_date is not None:
        return task.start_date
    # Old records have no start date: use their creation date, never today's date.
    return min(date.fromisoformat(task.created_at[:10]), task.target_date)


def daily_allocation(task: StudyTask, plan_date: date) -> tuple[int, int | None, int | None]:
    start = effective_start(task)
    if plan_date < start or plan_date > task.target_date:
        return 0, None, None
    days = (task.target_date - start).days + 1
    index = (plan_date - start).days
    minutes = task.estimated_minutes * (index + 1) // days - task.estimated_minutes * index // days
    first = last = None
    if task.start_page is not None and task.end_page is not None:
        pages = task.end_page - task.start_page + 1
        left, right = pages * index // days, pages * (index + 1) // days
        if right > left:
            first, last = task.start_page + left, task.start_page + right - 1
    return minutes, first, last
