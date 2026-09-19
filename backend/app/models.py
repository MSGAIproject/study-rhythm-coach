from datetime import date, time
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator


class Subject(StrEnum):
    KOREAN = "국어"
    MATH = "수학"
    ENGLISH = "영어"
    KOREAN_HISTORY = "한국사"
    INQUIRY = "탐구"
    OTHER = "기타"


class Priority(StrEnum):
    HIGH = "높음"
    NORMAL = "보통"
    LOW = "낮음"


class LearningPreference(StrEnum):
    VISUAL_ORGANIZATION = "그림·도표로 정리"
    PRACTICE = "직접 문제 풀기"
    EXPLAINING = "말로 설명하기"
    READING_SUMMARY = "읽고 요약하기"
    SPACED_SHORT_REVIEW = "짧게 자주 반복"
    EXAM_SIMULATION = "실전처럼 연습"


class TaskPlanningAction(StrEnum):
    COMPLETED = "completed"
    RESUMED = "resumed"


class TaskPlanningEvent(BaseModel):
    action: TaskPlanningAction
    event_date: date


class StudyTaskCreate(BaseModel):
    subject: Subject
    title: str = Field(min_length=1, max_length=120)
    estimated_minutes: int = Field(ge=10, le=60000)
    target_date: date
    start_date: date | None = None
    priority: Priority = Priority.NORMAL
    notes: str = Field(default="", max_length=1000)
    start_page: int | None = Field(default=None, ge=1)
    end_page: int | None = Field(default=None, ge=1)
    book_isbn13: str | None = Field(default=None, pattern=r"^\d{13}$")
    book_publisher: str = Field(default="", max_length=120)
    book_cover: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def validate_page_range(self) -> "StudyTaskCreate":
        if self.start_date is not None and self.start_date > self.target_date:
            raise ValueError("시작 날짜는 목표 날짜보다 늦을 수 없습니다.")
        if (self.start_page is None) != (self.end_page is None):
            raise ValueError("시작 페이지와 끝 페이지를 모두 입력해 주세요.")
        if self.start_page is not None and self.end_page is not None and self.end_page < self.start_page:
            raise ValueError("끝 페이지는 시작 페이지보다 앞설 수 없습니다.")
        return self


class StudyTask(StudyTaskCreate):
    id: str
    completed: bool = False
    completed_minutes: int = Field(default=0, ge=0)
    created_at: str
    planning_events: list[TaskPlanningEvent] = Field(default_factory=list)


class StudyTaskUpdate(BaseModel):
    subject: Subject | None = None
    title: str | None = Field(default=None, min_length=1, max_length=120)
    estimated_minutes: int | None = Field(default=None, ge=10, le=60000)
    target_date: date | None = None
    start_date: date | None = None
    priority: Priority | None = None
    notes: str | None = Field(default=None, max_length=1000)
    completed: bool | None = None
    completed_minutes: int | None = Field(default=None, ge=0)
    start_page: int | None = Field(default=None, ge=1)
    end_page: int | None = Field(default=None, ge=1)
    book_isbn13: str | None = Field(default=None, pattern=r"^\d{13}$")
    book_publisher: str | None = Field(default=None, max_length=120)
    book_cover: str | None = Field(default=None, max_length=500)


class StudyBlock(BaseModel):
    subject: Subject
    start_time: time
    end_time: time
    label: str


class FocusSessionUpdate(BaseModel):
    active: bool
    posture_monitoring: bool = False
    drowsiness_monitoring: bool = False


class StudentProfile(BaseModel):
    goal_type: str = Field(min_length=1, max_length=40)
    goal_description: str = Field(min_length=1, max_length=300)
    hope_university: str = Field(default="", max_length=120)
    hope_department: str = Field(default="", max_length=120)
    current_grades: str = Field(default="", max_length=200)
    required_grades: str = Field(default="", max_length=200)
    current_subject_grades: dict[str, str] = Field(default_factory=dict)
    required_subject_grades: dict[str, str] = Field(default_factory=dict)
    target_date: date | None = None
    current_level: str = Field(min_length=1, max_length=100)
    learning_preferences: list[LearningPreference] = Field(default_factory=list, max_length=6)
    managed_subjects: list[Subject] = Field(min_length=1)
    difficult_subjects: list[Subject] = Field(default_factory=list)
    school_end_time: time | None = None
    fixed_schedule_notes: str = Field(default="", max_length=1000)
    sleep_time: time
    wake_time: time
    weekday_study_start: time
    weekday_study_end: time
    weekend_availability: str = Field(min_length=1, max_length=100)
    focus_minutes: int = Field(ge=20, le=120)
    break_minutes: int = Field(ge=5, le=30)
    plan_intensity: int = Field(ge=50, le=100)
    updated_at: str | None = None


class PlannedSession(BaseModel):
    task_id: str
    subject: Subject
    title: str
    start_time: time
    end_time: time
    planned_minutes: int
    reason: str
    start_page: int | None = None
    end_page: int | None = None


class PageGoal(BaseModel):
    task_id: str
    subject: Subject
    title: str
    start_page: int
    end_page: int


class DailyPlan(BaseModel):
    plan_date: date
    available_minutes: int
    planned_minutes: int
    sessions: list[PlannedSession]
    unscheduled_task_ids: list[str]
    page_goals: list[PageGoal] = Field(default_factory=list)
