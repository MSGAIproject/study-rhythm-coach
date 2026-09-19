import json
import os
import secrets
from contextvars import ContextVar
from datetime import date, datetime
from pathlib import Path

from app.models import StudentProfile, StudyTask, StudyTaskCreate, StudyTaskUpdate, TaskPlanningAction, TaskPlanningEvent


DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
TASKS_FILE = DATA_DIR / "tasks.json"
PROFILE_FILE = DATA_DIR / "profile.json"
CLIENT_ID: ContextVar[str | None] = ContextVar("client_id", default=None)


def data_dir() -> Path:
    """Return the request-scoped data directory for an anonymous browser."""
    client_id = CLIENT_ID.get()
    return DATA_DIR / "clients" / client_id if client_id else DATA_DIR


def profile_file() -> Path:
    return data_dir() / "profile.json" if CLIENT_ID.get() else PROFILE_FILE


def tasks_file() -> Path:
    return data_dir() / "tasks.json" if CLIENT_ID.get() else TASKS_FILE


def load_profile() -> StudentProfile | None:
    path = profile_file()
    if not path.exists():
        return None
    return StudentProfile.model_validate_json(path.read_text(encoding="utf-8"))


def save_profile(profile: StudentProfile) -> StudentProfile:
    saved = profile.model_copy(update={"updated_at": datetime.now().astimezone().isoformat()})
    path = profile_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(saved.model_dump_json(indent=2), encoding="utf-8")
    temporary.replace(path)
    return saved


def list_tasks() -> list[StudyTask]:
    path = tasks_file()
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    migrated = False
    for item in data:
        if item.get("completed") and "planning_events" not in item:
            item["planning_events"] = [{"action": "completed", "event_date": date.today().isoformat()}]
            migrated = True
    tasks = [StudyTask.model_validate(item) for item in data]
    if migrated:
        save_tasks(tasks)
    return tasks


def add_task(task: StudyTaskCreate) -> StudyTask:
    tasks = list_tasks()
    item = StudyTask(
        **{**task.model_dump(), "start_date": task.start_date or min(date.today(), task.target_date)},
        id=f"TASK-{secrets.token_hex(4).upper()}",
        created_at=datetime.now().astimezone().isoformat(),
    )
    tasks.append(item)
    path = tasks_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps([task.model_dump(mode="json") for task in tasks], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)
    return item


def save_tasks(tasks: list[StudyTask]) -> None:
    path = tasks_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps([task.model_dump(mode="json") for task in tasks], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)


def update_task(task_id: str, update: StudyTaskUpdate) -> StudyTask | None:
    tasks = list_tasks()
    for index, task in enumerate(tasks):
        if task.id != task_id:
            continue
        changes = update.model_dump(exclude_unset=True)
        planning_events = list(task.planning_events)
        requested_completed = changes.get("completed")
        today = date.today()
        if requested_completed is True and not task.completed:
            planning_events.append(TaskPlanningEvent(action=TaskPlanningAction.COMPLETED, event_date=today))
        elif requested_completed is False and task.completed:
            planning_events.append(TaskPlanningEvent(action=TaskPlanningAction.RESUMED, event_date=today))
        changes["planning_events"] = planning_events
        updated = task.model_copy(update=changes)
        if updated.completed:
            updated.completed_minutes = updated.estimated_minutes
        elif updated.completed_minutes >= updated.estimated_minutes:
            updated.completed = True
            updated.completed_minutes = updated.estimated_minutes
        tasks[index] = StudyTask.model_validate(updated.model_dump())
        save_tasks(tasks)
        return tasks[index]
    return None


def delete_task(task_id: str) -> bool:
    tasks = list_tasks()
    remaining = [task for task in tasks if task.id != task_id]
    if len(remaining) == len(tasks):
        return False
    save_tasks(remaining)
    return True
