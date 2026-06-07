# 🌐 배포 정보

## 배포 URL

### 메인 URL
```
https://nununanu-app.vercel.app/
```

### admin.html 접속 URL
```
https://nununanu-app.vercel.app/admin.html
https://nununanu-app.vercel.app/admin
https://nununanu-app.vercel.app/
```

---

## 🔐 로그인 정보

- **비밀번호**: `nunu1122!`

---

## 📋 배포 설정

### GitHub 저장소
```
https://github.com/nunuanu866-code/nunuanu
```

### Vercel 프로젝트
```
https://vercel.com/dashboard
→ nununanu-app
```

### 자동 배포
- `main` 브랜치에 푸시하면 자동 배포
- 약 1-2분 소요

---

## 🚀 재배포 방법

### 방법 1: Git Push (권장)
```bash
cd "C:\Users\tyson\OneDrive\Documents\누누아누 고객 예약 스케줄\nununanu-app"
git add .
git commit -m "변경 내용"
git push origin main
```

### 방법 2: Vercel 대시보드
```
1. https://vercel.com/dashboard
2. nununanu-app 클릭
3. Deployments → 최상단 배포
4. Redeploy 버튼 클릭
```

### 방법 3: 빈 커밋 (코드 변경 없이)
```bash
git commit --allow-empty -m "재배포"
git push origin main
```

---

## 🧪 배포 테스트 체크리스트

### 기본 기능
- [ ] 페이지 로드 (로딩 스피너)
- [ ] 로그인 화면 표시
- [ ] 로그인 성공 (nunu1122!)
- [ ] 스케줄 탭 정상 표시

### 미니 달력
- [ ] 날짜 클릭 → 미니 달력 열림
- [ ] 월 이동 버튼 (‹ ›) 작동
- [ ] 날짜 선택 작동
- [ ] 빈 페이지 문제 없음 ✅

### 자동완성 기능
- [ ] 검색창 표시
- [ ] 입력 시 자동완성 목록 표시
- [ ] 키보드 네비게이션 (↑↓)
- [ ] 고객 선택 → 예약 생성 시작

### Supabase 연동
- [ ] 고객 목록 로드
- [ ] 예약 데이터 로드
- [ ] 스텝 목록 로드

### 에러 확인
- [ ] F12 콘솔에 에러 없음
- [ ] Network 탭에서 모든 리소스 로드 성공
- [ ] React/ReactDOM CDN 로드 성공

---

## 🔧 문제 해결

### 캐시 문제
배포 후에도 이전 버전이 보이는 경우:

```
1. 강제 새로고침: Ctrl + Shift + R
2. 캐시 삭제: Ctrl + Shift + Delete
3. 시크릿 모드로 확인
```

### 배포 실패
Vercel 대시보드에서 빌드 로그 확인:
```
https://vercel.com/dashboard
→ nununanu-app → Deployments
→ 실패한 배포 클릭 → Build Logs
```

### React 로딩 실패
CDN 차단 여부 확인:
```
https://unpkg.com/react@17/umd/react.production.min.js
→ 브라우저에서 직접 열어보기
```

---

## 📊 최근 배포 이력

### 2026-06-07 (최신)
- ✅ supaCustomers props 에러 수정
- ✅ setShowCal 에러 수정
- ✅ 미니 달력 버튼 type="button" 추가
- ✅ 자동완성 기능 완성
- ✅ 빈 페이지 문제 해결

### 주요 변경사항
```
ef7bd9d - fix: setShowCal 불필요한 props 제거
5241fac - fix: Header 컴포넌트에 supaCustomers props 전달
93d6a01 - fix: 미니 달력 버튼에 type="button" 추가
a898765 - fix: React 17로 다운그레이드하여 안정성 개선
```

---

## 🎯 현재 배포 버전

**커밋**: ec40940  
**브랜치**: main  
**배포 시간**: 2026-06-07  
**상태**: 배포 진행 중 (1-2분 소요)

---

## 📱 모바일 접속

동일한 URL로 모바일에서도 접속 가능:
```
https://nununanu-app.vercel.app/admin.html
```

PWA 지원 (홈 화면에 추가 가능)

---

**최종 업데이트**: 2026년 6월 7일 19:50
