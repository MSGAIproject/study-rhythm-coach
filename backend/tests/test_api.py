import asyncio
import json
from typing import Any

from app.main import app


def request(method: str, path: str) -> tuple[int, bytes]:
    messages: list[dict[str, Any]] = []
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": method, "scheme": "http", "path": path, "raw_path": path.encode(),
        "query_string": b"", "root_path": "", "headers": [],
        "client": ("testclient", 50000), "server": ("testserver", 80), "state": {},
    }

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        messages.append(message)

    asyncio.run(app(scope, receive, send))
    start = next(message for message in messages if message["type"] == "http.response.start")
    body = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return start["status"], body


def test_health() -> None:
    status, body = request("GET", "/health")
    assert status == 200
    assert json.loads(body) == {"status": "ok"}


def test_study_template_has_core_subjects() -> None:
    status, body = request("GET", "/api/study-template")
    subjects = {item["subject"] for item in json.loads(body)}
    assert status == 200
    assert {"국어", "수학", "영어", "한국사", "탐구"} <= subjects
