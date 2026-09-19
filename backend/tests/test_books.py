import asyncio

import httpx
import pytest
from pydantic import SecretStr

from app import books
from app.main import app


def call(path):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.get(path)
    return asyncio.run(run())


@pytest.fixture
def configured(monkeypatch):
    class Settings:
        yes24_api_key = SecretStr("test-key")
    monkeypatch.setattr(books, "Yes24Settings", Settings)


def test_status(configured):
    assert call("/api/books/status").json() == {"configured": True}


def test_search_and_detail(configured, monkeypatch):
    original_get = httpx.AsyncClient.get
    async def get(client, url, **kwargs):
        if not str(url).startswith(books.BASE_URL):
            return await original_get(client, url, **kwargs)
        assert kwargs["headers"] == {"X-Api-Key": "test-key"}
        if url.endswith("/itemList"):
            assert kwargs["params"]["category"] == "BOOK"
            return httpx.Response(200, json={"success": True, "data": {"items": [{
                "itemId": 1, "title": "수능특강 수학", "isbn13": "9781234567890",
                "author": "저자", "publisher": "출판사", "ignored": "secret",
            }]}}, request=httpx.Request("GET", url))
        assert url.endswith("/itemDetail")
        assert kwargs["params"] == {"searchType": "ISBN13", "query": "9781234567890", "detail": "Y"}
        return httpx.Response(200, json={"success": True, "data": {"items": [{
            "itemId": 1, "title": "수능특강 수학", "isbn13": "9781234567890", "pages": 320,
            "contentDetail": {"bookIntroduction": "소개", "tableOfContents": "1강\n2강"},
        }]}}, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "get", get)
    result = call("/api/books/search?query=수능특강")
    assert result.status_code == 200
    assert result.json()["items"][0]["title"] == "수능특강 수학"
    assert "ignored" not in result.text
    detail = call("/api/books/detail/9781234567890")
    assert detail.status_code == 200
    assert detail.json()["tableOfContents"] == "1강\n2강"


@pytest.mark.parametrize("status,expected", [(401, 502), (429, 429), (504, 504)])
def test_provider_errors(configured, monkeypatch, status, expected):
    original_get = httpx.AsyncClient.get
    async def get(client, url, **kwargs):
        if not str(url).startswith(books.BASE_URL):
            return await original_get(client, url, **kwargs)
        if status == 504:
            raise httpx.ReadTimeout("timeout")
        return httpx.Response(status, json={"message": "upstream secret"}, request=httpx.Request("GET", url))
    monkeypatch.setattr(httpx.AsyncClient, "get", get)
    result = call("/api/books/search?query=수학")
    assert result.status_code == expected
    assert "upstream secret" not in result.text


def test_invalid_input(configured):
    assert call("/api/books/search?query=").status_code == 422
    assert call("/api/books/detail/not-an-isbn").status_code == 422
