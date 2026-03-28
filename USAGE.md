# 전기요금 청구서 자동 분석기 — 사용 가이드

## 개발 명령어

| 명령어 | 설명 |
|--------|------|
| `npm install` | 의존성 패키지 설치 (최초 1회) |
| `npm run dev` | 개발 서버 시작 (로컬 미리보기) |
| `npm run build` | 프로덕션 빌드 생성 (`dist/` 폴더) |
| `npm run preview` | 빌드 결과물 로컬 미리보기 |

### 개발 서버 시작

```bash
npm run dev
```

실행 후 브라우저에서 `http://localhost:5173` 접속

---

## 앱 사용 방법

### 1단계 — Gemini API 키 설정

1. 우측 상단 ⚙️ **설정** 버튼 클릭
2. [Google AI Studio](https://aistudio.google.com/apikey)에서 발급받은 API 키 입력
3. **저장** 클릭 (브라우저 로컬에만 저장됨)

### 2단계 — 청구서 파일 업로드

- 업로드 영역 클릭 또는 파일 드래그 앤 드롭
- 지원 형식: **PDF, JPG, PNG, WEBP**
- 여러 파일 동시 업로드 가능
- 단일 파일에 여러 달 내역이 있어도 자동 분리

### 3단계 — 데이터 분석

- **데이터 분석 시작** 버튼 클릭
- AI(Gemini)가 청구서에서 아래 항목을 자동 추출:
  - 년월 / 사용기간 / 사용량(kWh) / 청구금액

### 4단계 — 결과 확인 및 수정

#### 직접 수정 (간단한 오류)
- 분석된 값 위에 마우스를 올리면 ✏️ 연필 아이콘 표시
- 클릭하면 입력 필드로 전환
- **Enter** → 저장 / **Escape** → 취소

#### 재분석 (누락·다수 오류)
1. 결과 하단 **"수정사항 입력 후 재분석"** 버튼 클릭
2. 잘못된 내용을 텍스트로 입력

   ```
   예시:
   - 2023-11 청구금액이 누락됨
   - 3개월치 데이터가 있는데 1개만 추출됨
   - 사용기간 날짜 형식이 잘못 추출됨
   ```

3. **수정사항 반영하여 재분석** 버튼 클릭 → 해당 파일만 재분석

### 5단계 — 엑셀 내보내기

- 업체명 입력란에 업체명 입력 (파일명에 포함됨)
- **엑셀로 내보내기** 클릭
- 저장 파일명: `업체명_전기요금_정리_통합본.xlsx`
- 엑셀 칼럼: `년월 / 사용기간 / 사용량(kWh) / 요금(월) / 비고`

---

## 배포

### GitHub

```bash
git add .
git commit -m "커밋 메시지"
git push origin main
```

저장소: https://github.com/dooly586/electric-bill-manager

### Vercel

- GitHub `main` 브랜치에 push하면 **자동 배포**
- 빌드 설정:
  - Framework: **Vite**
  - Build Command: `npm run build`
  - Output Directory: `dist`

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | React 19 + TypeScript |
| 빌드 도구 | Vite |
| 스타일 | Tailwind CSS v4 |
| AI 엔진 | Google Gemini 2.5 Flash |
| 엑셀 생성 | xlsx 라이브러리 |
| 아이콘 | lucide-react |
