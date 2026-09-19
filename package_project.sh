#!/usr/bin/env bash
# ==============================================================================
# 오름 - USB 이전용 압축 생성 스크립트
# ==============================================================================
set -e

# 색상 정의
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
CURRENT_DIR_NAME="$(basename "$SCRIPT_DIR")"
PROJECT_NAME="study-rhythm-coach"
ARCHIVE_NAME="${PROJECT_NAME}.tar.gz"
OUTPUT_PATH="${PARENT_DIR}/${ARCHIVE_NAME}"

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   새 라즈베리파이 이전용 압축 파일을 생성합니다      ${NC}"
echo -e "${BLUE}======================================================${NC}"
echo -e "불필요한 가상환경(.venv)과 node_modules를 제외하고 압축합니다...\n"

cd "$PARENT_DIR"

tar -czvf "$OUTPUT_PATH" \
  --transform "s|^${CURRENT_DIR_NAME}|${PROJECT_NAME}|" \
  --exclude="*/backend/.venv" \
  --exclude="*/frontend/node_modules" \
  --exclude="*/frontend/dist" \
  --exclude="*__pycache__*" \
  --exclude="*.pytest_cache*" \
  --exclude="*.tmp" \
  "$CURRENT_DIR_NAME"

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}✓ 압축이 완료되었습니다! 🎉${NC}"
echo -e "생성된 파일: ${YELLOW}${OUTPUT_PATH}${NC}"
echo -e "파일 크기:   $(du -h "$OUTPUT_PATH" | cut -f1)"
echo -e "${GREEN}======================================================${NC}"
echo -e "이제 위 '${ARCHIVE_NAME}' 파일을 USB에 복사하여 새 라즈베리파이로 옮기세요.\n"
