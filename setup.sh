#!/usr/bin/env bash
# ==============================================================================
# 오름 - 자동 환경 구축 스크립트 (라즈베리파이 5용)
# ==============================================================================
set -e

# 색상 정의
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 사용자 로컬 바이너리 경로 추가
export PATH="$HOME/.local/bin:$PATH"

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   오름 자동 환경 구축을 시작합니다                  ${NC}"
echo -e "${BLUE}======================================================${NC}"
echo -e "작업 디렉터리: ${SCRIPT_DIR}\n"

# 1. 시스템 시계 확인 및 동기화 (라즈베리파이 시계 오차로 인한 apt/SSL 오류 방지)
echo -e "${YELLOW}[1/6] 시스템 시계 점검 및 동기화...${NC}"
CURRENT_YEAR=$(date +%Y 2>/dev/null || echo "1970")

if [ "$CURRENT_YEAR" -lt 2025 ] || ! timedatectl status 2>/dev/null | grep -q "System clock synchronized: yes"; then
    echo -e "${BLUE}시스템 시계 동기화 시도 중 (HTTP 헤더 활용)...${NC}"
    sudo timedatectl set-timezone Asia/Seoul 2>/dev/null || true
    sudo timedatectl set-ntp true 2>/dev/null || true
    sudo systemctl restart systemd-timesyncd 2>/dev/null || true

    HTTP_DATE=$(curl -sI --connect-timeout 3 --max-time 5 http://google.com 2>/dev/null | grep -i '^date:' | sed 's/^[Dd]ate: //')
    if [ -n "$HTTP_DATE" ]; then
        sudo date -s "$HTTP_DATE" >/dev/null 2>&1 || true
        echo -e "${GREEN}✓ 시스템 시간을 성공적으로 복구했습니다: $(date)${NC}"
    fi
else
    echo -e "${GREEN}✓ 시스템 시계 정상: $(date)${NC}"
fi

# 손상되었을 수 있는 apt 캐시 정리
sudo rm -rf /var/lib/apt/lists/partial/* 2>/dev/null || true

# 2. 시스템 필수 패키지 설치 (Python, venv, pip, curl 등)
echo -e "\n${YELLOW}[2/6] 시스템 필수 패키지 점검 및 설치...${NC}"
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip curl build-essential

# 3. Node.js 및 npm 점검 및 설치
echo -e "\n${YELLOW}[3/6] Node.js 및 npm 설치 점검...${NC}"
NEED_NODE=false
if ! command -v node &> /dev/null; then
    NEED_NODE=true
else
    NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        echo -e "${YELLOW}기존 Node.js 버전이 낮습니다: $(node -v). v20으로 업그레이드합니다.${NC}"
        NEED_NODE=true
    fi
fi

if [ "$NEED_NODE" = true ]; then
    echo -e "${BLUE}Node.js v20 LTS를 설치합니다 (NodeSource 저장소 등록)...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo -e "${GREEN}✓ Node.js 버전: $(node -v)${NC}"
echo -e "${GREEN}✓ npm 버전: $(npm -v)${NC}"

# 4. 백엔드 가상환경(venv) 생성 및 패키지 설치
echo -e "\n${YELLOW}[4/6] Python 가상환경 구성 및 백엔드 패키지 설치...${NC}"
BACKEND_DIR="${SCRIPT_DIR}/backend"
VENV_DIR="${BACKEND_DIR}/.venv"

# 기존 가상환경이 타 기기에서 복사되어 깨져있는 경우 대비
if [ -d "$VENV_DIR" ] && [ ! -f "$VENV_DIR/bin/python3" ]; then
    echo -e "${YELLOW}기존 .venv가 올바르지 않아 새로 생성합니다.${NC}"
    rm -rf "$VENV_DIR"
fi

if [ ! -d "$VENV_DIR" ]; then
    echo -e "${BLUE}새 Python 가상환경(.venv) 생성 중...${NC}"
    python3 -m venv "$VENV_DIR"
fi

echo -e "${BLUE}백엔드 패키지 설치 중 (pip install)...${NC}"
"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install -r "${BACKEND_DIR}/requirements.txt"
echo -e "${GREEN}✓ 백엔드 가상환경 준비 완료${NC}"

# 5. 프론트엔드 의존성 설치
echo -e "\n${YELLOW}[5/6] 프론트엔드 패키지 설치 (npm install)...${NC}"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"
cd "$FRONTEND_DIR"
npm install
cd "$SCRIPT_DIR"
echo -e "${GREEN}✓ 프론트엔드 패키지 준비 완료${NC}"

# 6. 환경설정(.env) 확인
echo -e "\n${YELLOW}[6/6] 환경 설정(.env) 점검...${NC}"
if [ ! -f "${SCRIPT_DIR}/.env" ]; then
    if [ -f "${SCRIPT_DIR}/.env.example" ]; then
        cp "${SCRIPT_DIR}/.env.example" "${SCRIPT_DIR}/.env"
        echo -e "${YELLOW}ℹ️  .env 파일이 없어 .env.example에서 복사 생성했습니다.${NC}"
    else
        echo -e "${YELLOW}⚠️  .env 파일이 없습니다. 필요 시 생성해 주세요.${NC}"
    fi
else
    echo -e "${GREEN}✓ .env 파일이 이미 존재합니다.${NC}"
fi

# 실행 스크립트 권한 부여
chmod +x "${SCRIPT_DIR}/setup.sh" 2>/dev/null || true
chmod +x "${SCRIPT_DIR}/start.sh" 2>/dev/null || true
chmod +x "${SCRIPT_DIR}/package_project.sh" 2>/dev/null || true
if [ -f "${SCRIPT_DIR}/setup_korean.sh" ]; then
    chmod +x "${SCRIPT_DIR}/setup_korean.sh" 2>/dev/null || true
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}   모든 환경 구축이 성공적으로 완료되었습니다! 🎉   ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "다음 명령어로 프로젝트를 한 번에 실행할 수 있습니다:\n"
echo -e "  ${BLUE}./start.sh${NC}\n"
if [ -f "${SCRIPT_DIR}/setup_korean.sh" ]; then
    echo -e "${YELLOW}※ 라즈베리파이 한글 입력(크로미움 한글 입력 포함) 설정이 필요하다면:${NC}"
    echo -e "  ${BLUE}./setup_korean.sh${NC}\n"
fi
