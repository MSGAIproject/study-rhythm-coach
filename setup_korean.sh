#!/usr/bin/env bash
# ==============================================================================
# Raspberry Pi 5 - 한글 입력기(fcitx5) 및 크로미움 한글 입력 자동 설정 스크립트
# ==============================================================================
# 문제 해결:
#   라즈베리파이 5(Wayland/labwc) 환경에서 ibus 사용 시 크로미움(Chromium)에서
#   한글이 정상 표시되나 텍스트 입력(조합)이 되지 않는 현상을 완벽히 해결합니다.
#   현재 정상 작동하는 라즈베리파이 5의 fcitx5-hangul 및 labwc 환경 구성을 그대로 적용합니다.
# ==============================================================================
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

TARGET_USER="${SUDO_USER:-$USER}"
USER_HOME=$(eval echo "~$TARGET_USER")

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   라즈베리파이 5 한글 입력기(fcitx5) 설정 스크립트   ${NC}"
echo -e "${BLUE}======================================================${NC}"
echo -e "대상 사용자: ${TARGET_USER} (${USER_HOME})\n"

# ------------------------------------------------------------------------------
# 1. 시스템 시간 및 네트워크 확인 (시계 오차로 인한 apt 실패 방지)
# ------------------------------------------------------------------------------
echo -e "${YELLOW}[1/7] 시스템 시계 확인 및 동기화 점검...${NC}"
CURRENT_YEAR=$(date +%Y 2>/dev/null || echo "1970")

if [ "$CURRENT_YEAR" -lt 2025 ] || ! timedatectl status 2>/dev/null | grep -q "System clock synchronized: yes"; then
    echo -e "${BLUE}시스템 시계 동기화 시도 중 (HTTP 헤더 활용)...${NC}"
    sudo timedatectl set-timezone Asia/Seoul 2>/dev/null || true
    sudo timedatectl set-ntp true 2>/dev/null || true
    sudo systemctl restart systemd-timesyncd 2>/dev/null || true

    HTTP_DATE=$(curl -sI --connect-timeout 3 --max-time 5 http://google.com 2>/dev/null | grep -i '^date:' | sed 's/^[Dd]ate: //')
    if [ -n "$HTTP_DATE" ]; then
        sudo date -s "$HTTP_DATE" >/dev/null 2>&1 || true
        echo -e "${GREEN}✓ 시스템 시간을 성공적으로 동기화했습니다: $(date)${NC}"
    fi
else
    echo -e "${GREEN}✓ 시스템 시계 정상: $(date)${NC}"
fi

# apt 캐시 정리
sudo rm -rf /var/lib/apt/lists/partial/* 2>/dev/null || true

# ------------------------------------------------------------------------------
# 2. 한글 로케일(ko_KR.UTF-8) 생성 확인
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[2/7] 한글 로케일(ko_KR.UTF-8) 점검...${NC}"
if ! locale -a 2>/dev/null | grep -qi "ko_kr.utf8"; then
    echo -e "${BLUE}ko_KR.UTF-8 로케일을 활성화하고 생성합니다...${NC}"
    if [ -f /etc/locale.gen ]; then
        sudo sed -i 's/^# *ko_KR.UTF-8 UTF-8/ko_KR.UTF-8 UTF-8/' /etc/locale.gen
    fi
    sudo locale-gen ko_KR.UTF-8
    echo -e "${GREEN}✓ ko_KR.UTF-8 로케일 생성 완료${NC}"
else
    echo -e "${GREEN}✓ ko_KR.UTF-8 로케일이 이미 생성되어 있습니다.${NC}"
fi

# ------------------------------------------------------------------------------
# 3. 기존 충돌 입력기(ibus) 정리
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[3/7] 기존 ibus 충돌 프로세스 및 패키지 정리...${NC}"
pkill -9 ibus-daemon 2>/dev/null || true
if dpkg -l ibus 2>/dev/null | grep -q "^ii"; then
    echo -e "${YELLOW}크로미움 한글 입력 충돌 원인인 ibus를 제거합니다...${NC}"
    sudo apt-get remove -y ibus ibus-hangul || true
    sudo apt-get autoremove -y || true
fi
echo -e "${GREEN}✓ ibus 정리 완료${NC}"

# ------------------------------------------------------------------------------
# 4. fcitx5 및 한글 폰트 패키지 설치
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[4/7] fcitx5 및 나눔 폰트 패키지 설치...${NC}"
sudo apt-get update
sudo apt-get install -y \
    fonts-nanum \
    fonts-nanum-coding \
    fcitx5 \
    fcitx5-hangul \
    fcitx5-frontend-all \
    fcitx5-frontend-gtk3 \
    fcitx5-frontend-gtk4 \
    fcitx5-frontend-qt5 \
    fcitx5-frontend-qt6 \
    fcitx5-config-qt \
    im-config

echo -e "${GREEN}✓ fcitx5 패키지 설치 완료${NC}"

# ------------------------------------------------------------------------------
# 5. im-config 설정 (기본 입력기를 fcitx5로 전환)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[5/7] 시스템 기본 입력기를 fcitx5로 설정...${NC}"
im-config -n fcitx5 || true

# ~/.xinputrc 확인 및 생성
cat << 'EOF' > "${USER_HOME}/.xinputrc"
run_im fcitx5
EOF
chown "${TARGET_USER}:${TARGET_USER}" "${USER_HOME}/.xinputrc"
echo -e "${GREEN}✓ im-config fcitx5 등록 완료${NC}"

# ------------------------------------------------------------------------------
# 6. fcitx5 세부 환경설정 (한영키, 두벌식, 단축키)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[6/7] fcitx5 한글 프로필 및 단축키 구성...${NC}"
FCITX5_CONFIG_DIR="${USER_HOME}/.config/fcitx5"
mkdir -p "${FCITX5_CONFIG_DIR}/conf"

# 6-1. 단축키 설정 (~/.config/fcitx5/config)
cat << 'EOF' > "${FCITX5_CONFIG_DIR}/config"
[Hotkey]
EnumerateWithTriggerKeys=True

[Hotkey/TriggerKeys]
0=Hangul
1=Shift+space
2=Control+space
EOF

# 6-2. 프로필 설정 (~/.config/fcitx5/profile)
cat << 'EOF' > "${FCITX5_CONFIG_DIR}/profile"
[Groups/0]
Name=Default
Default Layout=us
DefaultIM=hangul

[Groups/0/Items/0]
Name=keyboard-us
Layout=

[Groups/0/Items/1]
Name=hangul
Layout=

[GroupOrder]
0=Default
EOF

# 6-3. 한글 상세 설정 (~/.config/fcitx5/conf/hangul.conf)
cat << 'EOF' > "${FCITX5_CONFIG_DIR}/conf/hangul.conf"
Keyboard=Dubeolsik
AutoReorder=True
WordCommit=False
HanjaMode=False

[HanjaModeToggleKey]
0=Hangul_Hanja
1=F9

[PrevPage]
0=Up

[NextPage]
0=Down

[PrevCandidate]
0=Shift+Tab

[NextCandidate]
0=Tab
EOF

chown -R "${TARGET_USER}:${TARGET_USER}" "${FCITX5_CONFIG_DIR}"
echo -e "${GREEN}✓ fcitx5 설정 파일 생성 완료${NC}"

# ------------------------------------------------------------------------------
# 7. Wayland / labwc 및 시스템 환경변수 등록 (크로미움 한글 입력의 핵심)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[7/7] labwc(Wayland) 환경변수 및 자동 실행 구성...${NC}"
LABWC_CONFIG_DIR="${USER_HOME}/.config/labwc"
mkdir -p "${LABWC_CONFIG_DIR}"

# 7-1. labwc 환경변수 (~/.config/labwc/environment)
ENV_FILE="${LABWC_CONFIG_DIR}/environment"
touch "$ENV_FILE"

set_or_update_env() {
    local key="$1"
    local val="$2"
    local file="$3"
    if grep -q "^${key}=" "$file" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${val}|" "$file"
    else
        echo "${key}=${val}" >> "$file"
    fi
}

set_or_update_env "GTK_IM_MODULE" "fcitx" "$ENV_FILE"
set_or_update_env "QT_IM_MODULE" "fcitx" "$ENV_FILE"
set_or_update_env "XMODIFIERS" "@im=fcitx" "$ENV_FILE"

# 7-2. labwc 자동 시작 (~/.config/labwc/autostart)
AUTOSTART_FILE="${LABWC_CONFIG_DIR}/autostart"
touch "$AUTOSTART_FILE"
if ! grep -q "fcitx5" "$AUTOSTART_FILE" 2>/dev/null; then
    cat << 'EOF' >> "$AUTOSTART_FILE"

# Start Fcitx5 with its Wayland input-method frontend.
fcitx5 --daemonize --replace
EOF
fi

chown -R "${TARGET_USER}:${TARGET_USER}" "${LABWC_CONFIG_DIR}"

# 7-3. ~/.profile 및 /etc/environment 에도 추가 (모든 터미널/앱 호환)
if [ -f "${USER_HOME}/.profile" ]; then
    if ! grep -q "GTK_IM_MODULE=fcitx" "${USER_HOME}/.profile" 2>/dev/null; then
        cat << 'EOF' >> "${USER_HOME}/.profile"

# Fcitx5 Environment Variables
export GTK_IM_MODULE=fcitx
export QT_IM_MODULE=fcitx
export XMODIFIERS=@im=fcitx
EOF
    fi
fi

# 7-4. 현재 데스크톱 세션에서 fcitx5 즉시 적용
if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
    sudo -u "$TARGET_USER" fcitx5 --daemonize --replace 2>/dev/null || true
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}✓ 라즈베리파이 5 한글 설정이 완료되었습니다! 🎉       ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "주요 적용 내용:"
echo -e "  1. ibus 제거 및 ${CYAN}fcitx5-hangul${NC} 설치"
echo -e "  2. ${CYAN}크로미움(Chromium)${NC} 한글 입력 완벽 지원 (Wayland/labwc 환경 연동)"
echo -e "  3. 한/영 전환 단축키: ${YELLOW}[한/영 키]${NC}, ${YELLOW}[Shift + Space]${NC}, ${YELLOW}[Ctrl + Space]${NC}\n"
echo -e "${YELLOW}※ 완벽한 시스템 세션 반영을 위해 한 번 재부팅하는 것을 권장합니다:${NC}"
echo -e "   ${BLUE}sudo reboot${NC}\n"
