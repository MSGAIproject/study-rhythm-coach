from datetime import date, time

from app import store
from app.models import StudentProfile, StudyTaskCreate, StudyTaskUpdate, Subject


def sample_profile() -> StudentProfile:
    return StudentProfile(
        goal_type="수능 준비",
        goal_description="수능 수학 2등급",
        target_date=date(2026, 11, 1),
        current_level="개념 적용이 어려워요",
        learning_preferences=["직접 문제 풀기", "짧게 자주 반복"],
        managed_subjects=[Subject.MATH, Subject.ENGLISH],
        difficult_subjects=[Subject.MATH],
        school_end_time=time(16, 30),
        fixed_schedule_notes="화·목 수학 학원",
        sleep_time=time(0, 0),
        wake_time=time(7, 0),
        weekday_study_start=time(19, 0),
        weekday_study_end=time(23, 0),
        weekend_availability="오전",
        focus_minutes=50,
        break_minutes=10,
        plan_intensity=85,
    )


def test_profile_round_trip(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(store, "PROFILE_FILE", tmp_path / "profile.json")

    saved = store.save_profile(sample_profile())
    loaded = store.load_profile()

    assert saved.updated_at
    assert loaded == saved
    assert loaded.managed_subjects == [Subject.MATH, Subject.ENGLISH]
    assert loaded.learning_preferences == ["직접 문제 풀기", "짧게 자주 반복"]


def test_old_profile_without_learning_preferences_is_compatible(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(store, "PROFILE_FILE", tmp_path / "profile.json")
    payload = sample_profile().model_dump_json(exclude={"learning_preferences"})
    (tmp_path / "profile.json").write_text(payload, encoding="utf-8")

    assert store.load_profile().learning_preferences == []


def test_task_completion_and_resume_history_is_saved(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(store, "TASKS_FILE", tmp_path / "tasks.json")
    task = store.add_task(StudyTaskCreate(
        subject=Subject.MATH, title="기출 교재", estimated_minutes=300,
        start_date=date.today(), target_date=date.today(),
    ))

    completed = store.update_task(task.id, StudyTaskUpdate(completed=True))
    assert completed.completed is True
    assert completed.planning_events[-1].action == "completed"
    assert completed.planning_events[-1].event_date == date.today()

    resumed = store.update_task(task.id, StudyTaskUpdate(completed=False, completed_minutes=0))
    assert resumed.completed is False
    assert [event.action for event in resumed.planning_events] == ["completed", "resumed"]
    assert all(event.event_date == date.today() for event in resumed.planning_events)
    assert len(store.list_tasks()[0].planning_events) == 2
