#!/usr/bin/env bash
# ==============================================================================
# 오름 - 백엔드/프론트엔드 동시 실행 스크립트
# ==============================================================================
set -e

# 색상 정의
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/backend"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"
VENV_PYTHON="${BACKEND_DIR}/.venv/bin/python3"

# Node 경로 확보
export PATH="$HOME/.local/bin:$PATH"

# 가상환경 존재 여부 확인
if [ ! -f "$VENV_PYTHON" ]; then
    echo -e "${RED}[오류] 가상환경이 설정되지 않았습니다.${NC}"
    echo -e "먼저 아래 명령어로 초기 설정을 완료해 주세요:"
    echo -e "  ${YELLOW}./setup.sh${NC}"
    exit 1
fi

# 라즈베리파이 IP 주소 감지
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="localhost"
fi

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   오름 서비스를 시작합니다                           ${NC}"
echo -e "${BLUE}======================================================${NC}"

# 백그라운드 프로세스 종료 핸들러
cleanup() {
    echo -e "\n${YELLOW}서비스를 종료하는 중입니다...${NC}"
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 1. 백엔드 실행 (백그라운드, 포트 8100)
echo -e "${CYAN}[1/2] 백엔드(FastAPI) 서버 시작 중 (포트 8100)...${NC}"
cd "$BACKEND_DIR"
"${BACKEND_DIR}/.venv/bin/uvicorn" app.main:app --reload --host 0.0.0.0 --port 8100 &
BACKEND_PID=$!
sleep 1

# 2. 프론트엔드 실행 (포그라운드, 포트 5173)
echo -e "${CYAN}[2/2] 프론트엔드(React/Vite) 개발 서버 시작 중 (포트 5173)...${NC}"
cd "$FRONTEND_DIR"

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}✓ 서비스가 정상적으로 시작되었습니다! 🎉${NC}"
echo -e "  - 웹 브라우저 접속 주소: ${YELLOW}http://${LOCAL_IP}:5173${NC}"
echo -e "  - 로컬 브라우저 접속:   ${YELLOW}http://localhost:5173${NC}"
echo -e "  - 백엔드 API 문서:       ${YELLOW}http://${LOCAL_IP}:8100/docs${NC}"
echo -e "  - 종료하려면 ${RED}Ctrl + C${NC} 를 누르세요."
echo -e "${GREEN}======================================================${NC}\n"

npm run dev -- --host 0.0.0.0
