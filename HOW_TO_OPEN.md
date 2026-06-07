# admin.html 파일 여는 방법

## 🌐 방법 1: 로컬 HTTP 서버 사용 (권장!)

### Python으로 간단히 실행

#### Windows PowerShell 또는 CMD
```bash
# 1. 프로젝트 폴더로 이동
cd "C:\Users\tyson\OneDrive\Documents\누누아누 고객 예약 스케줄\nununanu-app"

# 2. HTTP 서버 실행
python -m http.server 8080

# 3. 브라우저에서 열기
# http://localhost:8080/admin.html
```

#### Git Bash
```bash
# 1. 프로젝트 폴더로 이동
cd "/c/Users/tyson/OneDrive/Documents/누누아누 고객 예약 스케줄/nununanu-app"

# 2. HTTP 서버 실행
python -m http.server 8080

# 3. 브라우저에서 열기
# http://localhost:8080/admin.html
```

### 브라우저에서 접속
```
http://localhost:8080/admin.html
```

### 서버 종료
- 터미널에서 `Ctrl + C` 키 누르기

### 장점
- ✅ React CDN 리소스 정상 로드
- ✅ CORS 문제 없음
- ✅ 실제 서버 환경과 동일
- ✅ 모든 브라우저에서 정상 작동

---

## 📁 방법 2: 파일 직접 열기

### Windows 파일 탐색기
```
1. 파일 탐색기 열기
2. 주소창에 입력:
   C:\Users\tyson\OneDrive\Documents\누누아누 고객 예약 스케줄\nununanu-app
3. admin.html 파일 더블클릭
```

### 브라우저에서 직접 열기
```
1. Chrome/Edge 브라우저 실행
2. Ctrl + O (파일 열기)
3. admin.html 선택
```

### URL로 열기
```
file:///C:/Users/tyson/OneDrive/Documents/누누아누%20고객%20예약%20스케줄/nununanu-app/admin.html
```

### 주의사항
- ⚠️ CDN 리소스 로드가 느릴 수 있음
- ⚠️ 일부 브라우저에서 CORS 제한 발생 가능
- ⚠️ 로딩 시간이 길 수 있음

---

## 🔍 문제 해결

### 빈 페이지가 표시되는 경우

#### 1. 로딩 인디케이터 확인
- 스피너가 계속 돌아가면 → React 로드 중
- 잠시 기다려보기 (최대 30초)

#### 2. 브라우저 콘솔 확인
```
1. F12 키 누르기 (개발자 도구)
2. Console 탭 열기
3. 로그 확인:
   ✅ "🚀 누누아누 관리자 시작..."
   ✅ "✅ React 로드됨: true"
   ✅ "✅ ReactDOM 로드됨: true"
   ✅ "✅ 렌더링 완료!"
```

#### 3. 에러 메시지 확인
- **"React 로드됨: false"** → 인터넷 연결 확인
- **"렌더링 에러"** → 브라우저 호환성 문제
- **"CORS 에러"** → HTTP 서버 사용 (방법 1)

### React 라이브러리가 로드되지 않는 경우

#### 인터넷 연결 확인
```bash
# CMD 또는 PowerShell에서
ping unpkg.com
```
- 응답 없으면 → 인터넷 연결 확인
- 응답 있으면 → 방화벽 또는 보안 프로그램 확인

#### 브라우저 캐시 삭제
```
1. Ctrl + Shift + Delete
2. "캐시된 이미지 및 파일" 선택
3. 삭제
4. 페이지 새로고침 (F5)
```

#### 다른 브라우저 시도
- Chrome
- Edge
- Firefox

### 로딩이 너무 느린 경우

#### 1. HTTP 서버 사용 (방법 1 권장)
- 파일 직접 열기보다 빠름

#### 2. 브라우저 확장 프로그램 비활성화
```
1. 시크릿/InPrivate 모드로 열기
   - Chrome: Ctrl + Shift + N
   - Edge: Ctrl + Shift + P
2. admin.html 열기
```

#### 3. 안티바이러스 예외 추가
```
프로젝트 폴더를 안티바이러스 예외 목록에 추가:
C:\Users\tyson\OneDrive\Documents\누누아누 고객 예약 스케줄\nununanu-app
```

---

## ✅ 정상 작동 확인

### 로딩 성공 시 표시되는 것들

#### 1. 콘솔 로그 (F12)
```
🚀 누누아누 관리자 시작...
✅ React 로드됨: true
✅ ReactDOM 로드됨: true
📦 App 컴포넌트 준비 완료
🎨 React 18 방식으로 렌더링 시작...
✅ 렌더링 완료!
```

#### 2. 화면
- 로그인 화면 표시
- "누누아누 관리자" 제목
- 비밀번호 입력 필드
- "로그인" 버튼

#### 3. 로그인 후
- 스케줄 탭 (타임라인)
- 요청함 탭
- 스텝 탭
- 하단 네비게이션

---

## 🚀 빠른 실행 (추천)

### 한 번만 설정

#### 1. 바탕화면 바로가기 생성 (Windows)

**배치 파일 생성**
```batch
# start_nununanu.bat 파일 생성
@echo off
cd /d "C:\Users\tyson\OneDrive\Documents\누누아누 고객 예약 스케줄\nununanu-app"
start "" "http://localhost:8080/admin.html"
python -m http.server 8080
```

**사용 방법**
1. 위 내용을 `start_nununanu.bat`으로 저장
2. 더블클릭으로 실행
3. 브라우저가 자동으로 열림

#### 2. PowerShell 함수 등록

**프로필 설정**
```powershell
# PowerShell 프로필 열기
notepad $PROFILE

# 아래 함수 추가
function Start-Nununanu {
    cd "C:\Users\tyson\OneDrive\Documents\누누아누 고객 예약 스케줄\nununanu-app"
    Start-Process "http://localhost:8080/admin.html"
    python -m http.server 8080
}

# 저장 후 PowerShell 재시작
```

**사용 방법**
```powershell
Start-Nununanu
```

---

## 📱 모바일에서 열기

### 같은 Wi-Fi 네트워크일 때

#### 1. PC의 IP 주소 확인
```bash
# Windows CMD/PowerShell
ipconfig

# 예: 192.168.0.10
```

#### 2. PC에서 서버 실행
```bash
python -m http.server 8080
```

#### 3. 모바일 브라우저에서 접속
```
http://192.168.0.10:8080/admin.html
```

---

## 🔐 로그인 정보

- **비밀번호**: `nunu1122!`
- 변경 원하면 admin.html 파일에서 `ADMIN_PASSWORD` 수정

---

## 💡 팁

### 즐겨찾기 추가
```
1. http://localhost:8080/admin.html 접속
2. Ctrl + D (즐겨찾기 추가)
3. 이름: "누누아누 관리자"
```

### 자동 로그인 유지
- 로그인 후 localStorage에 저장됨
- 브라우저 닫아도 로그인 상태 유지
- 로그아웃하려면 "설정" → "로그아웃"

### 여러 탭에서 동시 사용
- 같은 브라우저에서 여러 탭 가능
- 실시간 동기화는 지원 안 됨
- 새로고침(F5)하면 최신 데이터 로드

---

**최종 업데이트**: 2026년 6월 7일  
**현재 서버 실행 중**: http://localhost:8080 ✅
