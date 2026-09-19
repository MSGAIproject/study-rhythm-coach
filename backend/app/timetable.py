"""Date-specific, editable study timetable."""
from datetime import date, time
import json

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app import store


class TimetableEntry(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    id: str = Field(min_length=1, max_length=80)
    subject: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=120)
    start_time: time
    end_time: str
    completed: bool = False

    @field_validator('end_time')
    @classmethod
    def normalize_end(cls, value):
        if value in ('24:00', '24:00:00'):
            return '24:00:00'
        parsed = time.fromisoformat(value)
        if parsed.tzinfo:
            raise ValueError('시간대 없는 현지 시간을 입력해 주세요.')
        return parsed.isoformat()

    @model_validator(mode='after')
    def validate_times(self):
        if self.start_time.tzinfo:
            raise ValueError('시간대 없는 현지 시간을 입력해 주세요.')
        if self.end_time <= self.start_time.isoformat():
            raise ValueError('종료 시간은 시작 시간보다 늦어야 합니다.')
        return self


class Timetable(BaseModel):
    entries: list[TimetableEntry] = Field(max_length=100)

    @model_validator(mode='after')
    def validate_entries(self):
        if len({entry.id for entry in self.entries}) != len(self.entries):
            raise ValueError('계획 ID가 중복되었습니다.')
        self.entries.sort(key=lambda entry: entry.start_time)
        for previous, current in zip(self.entries, self.entries[1:]):
            if previous.end_time > current.start_time.isoformat():
                raise ValueError('다른 계획과 시간이 겹칩니다. 시간을 조정해 주세요.')
        return self


router = APIRouter(prefix='/api/timetable', tags=['timetable'])


@router.get('/{plan_date}', response_model=Timetable)
async def get_timetable(plan_date: date) -> Timetable:
    path = store.data_dir() / f'timetable-{plan_date.isoformat()}.json'
    if path.exists():
        return Timetable.model_validate_json(path.read_text(encoding='utf-8'))
    return Timetable(entries=[])


@router.put('/{plan_date}', response_model=Timetable)
async def save_timetable(plan_date: date, timetable: Timetable) -> Timetable:
    store.data_dir().mkdir(parents=True, exist_ok=True)
    path = store.data_dir() / f'timetable-{plan_date.isoformat()}.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(timetable.model_dump(mode='json'), ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)
    return timetable
