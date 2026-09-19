from typing import Any


# 대입정보포털 어디가의 전년도 공개 결과를 옮긴 시작 데이터입니다.
# 대학별 환산 방식이 달라 대학 간 직접 비교에는 사용할 수 없습니다.
ADMISSION_RESULTS: list[dict[str, Any]] = [
    {
        "university": "서울과학기술대학교",
        "department": "컴퓨터공학과",
        "year": 2025,
        "selection": "정시 수능위주 일반전형",
        "cut_type": "최종등록자 70% cut",
        "percentile_average": 83.83,
        "converted_score": 921.29,
        "total_score": 1000,
        "source": "대입정보포털 어디가",
        "source_url": "https://m.adiga.kr/mob/ucp/uvt/uni/univDetailSelection.do?menuId=MOUVTINF1001&searchSyr=2026&unvCd=0000036",
    },
    {
        "university": "서울과학기술대학교", "department": "전기정보공학과", "year": 2025,
        "selection": "정시 수능위주 일반전형", "cut_type": "최종등록자 70% cut",
        "percentile_average": 85.00, "converted_score": 917.31, "total_score": 1000,
        "source": "대입정보포털 어디가", "source_url": "https://m.adiga.kr/mob/ucp/uvt/uni/univDetailSelection.do?menuId=MOUVTINF1001&searchSyr=2026&unvCd=0000036",
    },
    {
        "university": "서울과학기술대학교", "department": "신소재공학과", "year": 2025,
        "selection": "정시 수능위주 일반전형", "cut_type": "최종등록자 70% cut",
        "percentile_average": 83.83, "converted_score": 913.87, "total_score": 1000,
        "source": "대입정보포털 어디가", "source_url": "https://m.adiga.kr/mob/ucp/uvt/uni/univDetailSelection.do?menuId=MOUVTINF1001&searchSyr=2026&unvCd=0000036",
    },
    {
        "university": "서울과학기술대학교", "department": "기계시스템디자인공학과", "year": 2025,
        "selection": "정시 수능위주 일반전형", "cut_type": "최종등록자 70% cut",
        "percentile_average": 83.33, "converted_score": 911.11, "total_score": 1000,
        "source": "대입정보포털 어디가", "source_url": "https://m.adiga.kr/mob/ucp/uvt/uni/univDetailSelection.do?menuId=MOUVTINF1001&searchSyr=2026&unvCd=0000036",
    },
    {
        "university": "서울과학기술대학교", "department": "안전공학과", "year": 2025,
        "selection": "정시 수능위주 일반전형", "cut_type": "최종등록자 70% cut",
        "percentile_average": 82.17, "converted_score": 905.97, "total_score": 1000,
        "source": "대입정보포털 어디가", "source_url": "https://m.adiga.kr/mob/ucp/uvt/uni/univDetailSelection.do?menuId=MOUVTINF1001&searchSyr=2026&unvCd=0000036",
    },
    {
        "university": "서울과학기술대학교", "department": "건설시스템공학과", "year": 2025,
        "selection": "정시 수능위주 일반전형", "cut_type": "최종등록자 70% cut",
        "percentile_average": 82.17, "converted_score": 906.01, "total_score": 1000,
        "source": "대입정보포털 어디가", "source_url": "https://m.adiga.kr/mob/ucp/uvt/uni/univDetailSelection.do?menuId=MOUVTINF1001&searchSyr=2026&unvCd=0000036",
    },
    {
        "university": "서울과학기술대학교", "department": "전자공학과", "year": 2025,
        "selection": "정시 수능위주 일반전형", "cut_type": "최종등록자 70% cut",
        "percentile_average": 85.00, "converted_score": 917.31, "total_score": 1000,
        "source": "대입정보포털 어디가", "source_url": "https://m.adiga.kr/mob/ucp/uvt/uni/univDetailSelection.do?menuId=MOUVTINF1001&searchSyr=2026&unvCd=0000036",
    },
    {
        "university": "성결대학교", "department": "컴퓨터공학과", "year": 2025,
        "selection": "정시 수능위주 일반전형", "cut_type": "최종등록자 70% cut",
        "percentile_average": 78.60, "converted_score": 786.00, "total_score": 1000,
        "source": "대입정보포털 어디가", "source_url": "https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do?menuId=PCUVTINF2000&searchSyr=2026&unvCd=0000131",
    },
    {
        "university": "전북대학교", "department": "컴퓨터인공지능학부", "year": 2024,
        "selection": "정시 수능위주 일반전형", "cut_type": "최종등록자 70% cut",
        "percentile_average": 76.17, "converted_score": 316.39, "total_score": 500,
        "source": "대입정보포털 어디가", "source_url": "https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do?menuId=PCUVTINF2000&searchSyr=2025&unvCd=0000025",
    },
    {
        "university": "전북대학교", "department": "전자공학부", "year": 2024,
        "selection": "정시 수능위주 일반전형", "cut_type": "최종등록자 70% cut",
        "percentile_average": 69.83, "converted_score": 317.76, "total_score": 500,
        "source": "대입정보포털 어디가", "source_url": "https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do?menuId=PCUVTINF2000&searchSyr=2025&unvCd=0000025",
    },
    {
        "university": "전북대학교", "department": "전기공학과", "year": 2024,
        "selection": "정시 수능위주 일반전형", "cut_type": "최종등록자 70% cut",
        "percentile_average": 77.17, "converted_score": 324.89, "total_score": 500,
        "source": "대입정보포털 어디가", "source_url": "https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do?menuId=PCUVTINF2000&searchSyr=2025&unvCd=0000025",
    },
]


def search_admission_results(university: str, department: str) -> list[dict[str, Any]]:
    university = university.strip().lower()
    department = department.strip().lower()
    return [
        result for result in ADMISSION_RESULTS
        if university in result["university"].lower()
        and department in result["department"].lower()
    ]
