# 🚀 Vercel 완전 재배포 가이드

## 🚨 현재 문제

```
Last-Modified: 2026-06-05 20:27:22 (6월 5일 - 2일 전!)
Age: 139730초 (약 39시간 전)
```

**Vercel이 계속 오래된 버전을 캐시하고 있습니다.**

Git 푸시만으로는 해결 불가능 → **새 프로젝트로 배포 필요**

---

## ✅ 해결 방법: Vercel CLI로 강제 재배포

### 1단계: Vercel CLI 설치

```bash
npm install -g vercel
```

### 2단계: 로그인

```bash
vercel login
```

이메일 또는 GitHub 계정으로 로그인

### 3단계: 프로젝트 폴더로 이동

```bash
cd "C:\Users\tyson\OneDrive\Documents\누누아누 고객 예약 스케줄\nununanu-app"
```

### 4단계: 기존 프로젝트 연결 해제

```bash
rm -rf .vercel
```

### 5단계: 새로 배포

```bash
vercel --prod
```

**프롬프트 응답**:
```
? Set up and deploy? Yes
? Which scope? (본인 계정 선택)
? Link to existing project? No
? What's your project's name? nununanu-final
? In which directory is your code located? ./
? Want to override the settings? No
```

### 6단계: 새 URL 확인

배포 완료 후 표시되는 URL:
```
https://nununanu-final.vercel.app
```

---

## 🌐 대안: Vercel 대시보드에서 수동 배포

### 방법 1: 기존 프로젝트 삭제 후 재생성

1. https://vercel.com/dashboard 접속
2. nununanu-app 프로젝트 클릭
3. Settings → General → Delete Project
4. New Project 클릭
5. GitHub 저장소 선택: `nunuanu866-code/nunuanu`
6. Root Directory: `nununanu-app` 입력
7. Framework Preset: Other
8. Deploy 클릭

**새 URL 생성됨!**

### 방법 2: 환경 변수 추가로 재빌드 강제

1. https://vercel.com/dashboard
2. nununanu-app 프로젝트
3. Settings → Environment Variables
4. Add New:
   - Name: `FORCE_REBUILD`
   - Value: `20260607`
5. Deployments 탭
6. 최상단 배포 → Redeploy

---

## 📱 최종 해결책: Netlify로 배포

Vercel이 계속 문제라면 Netlify 사용:

### 1. Netlify 가입
```
https://www.netlify.com/
```

### 2. 드래그 앤 드롭 배포

1. 로컬 파일 준비:
   ```bash
   cd "C:\Users\tyson\OneDrive\Documents\누누아누 고객 예약 스케줄\nununanu-app"
   mkdir deploy-temp
   cp index.html deploy-temp/
   ```

2. https://app.netlify.com/drop 접속

3. `deploy-temp` 폴더를 드래그 앤 드롭

4. 즉시 배포됨:
   ```
   https://[랜덤이름].netlify.app
   ```

### 3. GitHub 연동 배포

1. https://app.netlify.com/start
2. GitHub 저장소 선택
3. Build settings:
   - Base directory: `nununanu-app`
   - Build command: (비워둠)
   - Publish directory: `.`
4. Deploy 클릭

**자동으로 최신 버전 배포됨!**

---

## 🎯 가장 빠른 방법 (권장)

### Vercel CLI 사용

```bash
# 1. CLI 설치
npm install -g vercel

# 2. 로그인  
vercel login

# 3. 폴더 이동
cd "C:\Users\tyson\OneDrive\Documents\누누아누 고객 예약 스케줄\nununanu-app"

# 4. 기존 연결 제거
rm -rf .vercel

# 5. 새로 배포
vercel --prod

# 결과: https://nununanu-final-xxx.vercel.app
```

**2-3분 안에 완료!**

---

## 🔍 배포 확인

새 URL 배포 후:

```bash
curl -I https://[새-URL]
```

**확인사항**:
```
Last-Modified: Sat, 07 Jun 2026 (오늘!)
X-Vercel-Cache: MISS
```

---

## 📊 왜 이런 문제가?

### Vercel의 공격적인 캐싱

1. **Edge Cache**: CDN 레벨 캐시 (전 세계)
2. **Build Cache**: 빌드 결과 캐시
3. **Static Asset Cache**: 정적 파일 영구 캐시

`index.html`이 정적 파일로 인식되면:
- Git 푸시 → 빌드 스킵 → 캐시 유지
- Redeploy → 빌드 스킵 → 캐시 유지
- **새 프로젝트만** → 완전 재빌드 ✅

---

## 💡 임시 해결: CloudFlare Workers

완전히 새로운 URL이 필요하다면:

```javascript
// CloudFlare Workers 코드
export default {
  async fetch(request) {
    const url = 'https://raw.githubusercontent.com/nunuanu866-code/nunuanu/main/nununanu-app/index.html';
    return fetch(url);
  }
}
```

CloudFlare Workers 배포 후:
```
https://nununanu.your-subdomain.workers.dev
```

---

## 🎯 최종 권장사항

1. **Vercel CLI 사용** (가장 확실)
2. Netlify 드래그 앤 드롭 (가장 빠름)
3. CloudFlare Workers (완전 새 URL)

위 방법 중 하나를 선택하여 진행하세요!

---

**작성 시간**: 2026년 6월 7일 20:25
**현재 문제**: Vercel 캐시 (6월 5일 버전 고정)
**해결책**: 새 프로젝트 배포
