"""YES24 book search proxy that keeps API credentials on the server."""
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Path as ApiPath, Query
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_URL = "https://apis.yes24.com/v1/goods"


class Yes24Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore")
    yes24_api_key: SecretStr = SecretStr("")


router = APIRouter(prefix="/api/books", tags=["books"])


def _key() -> str:
    key = Yes24Settings().yes24_api_key.get_secret_value().strip()
    if not key:
        raise HTTPException(503, "YES24 API 연결 설정이 필요합니다.")
    return key


async def yes24_get(endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(
                f"{BASE_URL}/{endpoint}",
                params=params,
                headers={"X-Api-Key": _key()},
            )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success", False):
            raise ValueError("YES24 returned an unsuccessful response")
        return payload
    except httpx.TimeoutException:
        raise HTTPException(504, "YES24 응답 시간이 길어지고 있습니다. 잠시 후 다시 시도해 주세요.") from None
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 429:
            raise HTTPException(429, "YES24 API 사용 한도에 도달했습니다.") from None
        raise HTTPException(502, "YES24 API 요청에 실패했습니다. 서버의 연결 설정을 확인해 주세요.") from None
    except (httpx.RequestError, ValueError, TypeError):
        raise HTTPException(502, "YES24에서 도서 정보를 받지 못했습니다.") from None


def _book(item: dict[str, Any], include_content: bool = False) -> dict[str, Any]:
    result = {
        "itemId": item.get("itemId"),
        "title": item.get("title") or "제목 없음",
        "subTitle": item.get("subTitle"),
        "author": item.get("author"),
        "publisher": item.get("publisher"),
        "isbn13": item.get("isbn13"),
        "pages": item.get("pages"),
        "publishDate": item.get("publishDate"),
        "cover": item.get("cover"),
        "link": item.get("link"),
    }
    if include_content:
        content = item.get("contentDetail") or {}
        result["bookIntroduction"] = content.get("bookIntroduction")
        result["tableOfContents"] = content.get("tableOfContents")
    return result


@router.get("/status")
async def status() -> dict[str, bool]:
    return {"configured": bool(Yes24Settings().yes24_api_key.get_secret_value().strip())}


@router.get("/search")
async def search_books(query: str = Query(min_length=1, max_length=120)) -> dict[str, Any]:
    payload = await yes24_get("itemList", {
        "query": query.strip(), "category": "BOOK", "page": 1, "pageSize": 20, "detail": "Y",
    })
    items = payload.get("data", {}).get("items", [])
    return {"items": [_book(item) for item in items if isinstance(item, dict)]}


@router.get("/detail/{isbn13}")
async def book_detail(isbn13: str = ApiPath(pattern=r"^\d{13}$")) -> dict[str, Any]:
    payload = await yes24_get("itemDetail", {
        "searchType": "ISBN13", "query": isbn13, "detail": "Y",
    })
    items = payload.get("data", {}).get("items", [])
    if not items or not isinstance(items[0], dict):
        raise HTTPException(404, "도서 상세정보를 찾을 수 없습니다.")
    return _book(items[0], include_content=True)
