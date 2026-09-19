from datetime import date, time

from app.models import Priority, StudentProfile, StudyTask, Subject
from app.scheduler import generate_daily_plan


def test_plan_prioritizes_urgent_weak_subject() -> None:
    profile = StudentProfile(
        goal_type="수능 준비", goal_description="수능 준비", current_level="보통",
        managed_subjects=[Subject.MATH, Subject.ENGLISH], difficult_subjects=[Subject.MATH],
        sleep_time=time(0), wake_time=time(7), weekday_study_start=time(19),
        weekday_study_end=time(21), weekend_availability="오전",
        focus_minutes=50, break_minutes=10, plan_intensity=85,
    )
    tasks = [
        StudyTask(id="TASK-1", subject=Subject.ENGLISH, title="단어", estimated_minutes=50,
                  target_date=date(2026, 9, 20), priority=Priority.NORMAL, created_at="2026-09-01"),
        StudyTask(id="TASK-2", subject=Subject.MATH, title="미적분", estimated_minutes=80,
                  target_date=date(2026, 9, 5), priority=Priority.HIGH, created_at="2026-09-01"),
    ]

    plan = generate_daily_plan(profile, tasks, date(2026, 9, 4))

    assert plan.sessions[0].task_id == "TASK-2"
    assert plan.available_minutes == 102
    assert plan.planned_minutes == 92
    assert "우선순위" in plan.sessions[0].reason


def test_page_task_is_split_across_the_remaining_period() -> None:
    profile = StudentProfile(
        goal_type="수능 준비", goal_description="수능 준비", current_level="보통",
        managed_subjects=[Subject.MATH], difficult_subjects=[],
        sleep_time=time(0), wake_time=time(7), weekday_study_start=time(19),
        weekday_study_end=time(23), weekend_availability="오전",
        focus_minutes=50, break_minutes=10, plan_intensity=100,
    )
    task = StudyTask(
        id="TASK-PAGES", subject=Subject.MATH, title="개념서", estimated_minutes=200,
        start_date=date(2026, 9, 12), target_date=date(2026, 9, 15), priority=Priority.NORMAL, created_at="2026-09-01",
        start_page=1, end_page=100,
    )

    plan = generate_daily_plan(profile, [task], date(2026, 9, 12))

    assert plan.planned_minutes == 50
    assert plan.page_goals[0].start_page == 1
    assert plan.page_goals[0].end_page == 25
