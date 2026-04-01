# AI Cat Chat for Cafe Torcello

고양이와 채팅하는 AI 경험 for 카페 토르첼로.

## 구조

```
catChat/
├── server.js          # Bun HTTP 서버
├── public/
│   ├── index.html     # 채팅 UI
│   ├── style.css      # 스타일
│   └── app.js         # 프론트엔드 로직
├── data/
│   └── cats.json      # 고양이 성격 데이터
├── package.json
├── .env.example       # 환경변수 템플릿
└── .gitignore
```

## 실행 방법

1. Bun 설치 (없는 경우):
```bash
curl -fsSL https://bun.sh/install | bash
```

2. `.env` 파일에 z.ai API 키 설정:
```bash
ZAI_API_KEY=your_actual_api_key_here
```

3. 서버 실행:
```bash
cd catChat
bun run dev
```

4. 브라우저에서 http://localhost:3000 접속

## API

- `GET /api/cat` - 고양이 데이터 조회
- `POST /api/chat` - 채팅 메시지 전송

## 기능

- ✅ 단일 고양이 채팅 (몽글)
- ✅ 실시간 응답
- ✅ 타이핑 인디케이터
- ✅ 에러 처리
- ✅ Rate limiting
- ✅ 반응형 디자인

## 다음 단계 (MVP 이후)

- [ ] z.ai API 연동 테스트
- [ ] 실제 고양이 사진 추가
- [ ] 사용자 피드백 수집
- [ ] 여러 고양이 지원
- [ ] 대화 기록 저장
