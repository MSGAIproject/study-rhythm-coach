"""Measured study intervals, stored separately from task estimates."""
import json
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from app import store


class StudyInterval(BaseModel):
    start: AwareDatetime
    end: AwareDatetime

    @model_validator(mode='after')
    def valid_range(self):
        if self.end <= self.start:
            raise ValueError('종료 시각은 시작 시각보다 늦어야 합니다.')
        return self


class TimedStudySession(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    id: UUID
    subject: str = Field(min_length=1, max_length=40)
    intervals: list[StudyInterval] = Field(min_length=1, max_length=10000)

    @model_validator(mode='after')
    def ordered_intervals(self):
        for previous, current in zip(self.intervals, self.intervals[1:]):
            if current.start < previous.end:
                raise ValueError('공부 시간 구간이 겹치거나 순서가 잘못되었습니다.')
        return self


router = APIRouter(prefix='/api/study-sessions', tags=['study-time'])


def load_sessions():
    path = store.data_dir() / 'study-sessions.json'
    if not path.exists():
        return []
    return [TimedStudySession.model_validate(item) for item in json.loads(path.read_text(encoding='utf-8'))]


@router.get('', response_model=list[TimedStudySession])
async def get_sessions():
    return load_sessions()


@router.post('', response_model=TimedStudySession)
async def save_session(session: TimedStudySession):
    # No await between read and atomic replace: serialized in the app event loop.
    sessions = load_sessions()
    for existing in sessions:
        if existing.id == session.id:
            if existing != session:
                raise HTTPException(409, '이미 저장된 기록과 내용이 다릅니다.')
            return existing
    sessions.append(session)
    store.data_dir().mkdir(parents=True, exist_ok=True)
    path = store.data_dir() / 'study-sessions.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps([item.model_dump(mode='json') for item in sessions], ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)
    return session
