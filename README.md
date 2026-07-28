# Body Bank — 칼로리/단백질 기록 앱

먹은 만큼 쓰고(칼로리 적자), 단백질은 차곡차곡 모으는(단백질 적금) 개인 기록 앱.

## 배포 순서 (Netlify)

### 1. GitHub에 올리기 (또는 폴더 통째로 드래그)
이 폴더를 GitHub 저장소에 올리거나, Netlify에 직접 드래그해도 됩니다.

### 2. Netlify에서 사이트 생성
- netlify.com 로그인 → Add new site → Import (또는 폴더 드래그)
- Build command: `npm run build`  (netlify.toml에 이미 설정됨)
- Publish directory: `dist`

### 3. 환경변수 등록 (중요!)
Netlify 사이트 → Site configuration → Environment variables → Add
- Key: `FOOD_API_KEY`
- Value: 공공데이터포털에서 발급받은 식약처 서비스키 (859dd... 그거)

이걸 넣어야 음식 검색이 됩니다. 서버(함수)에서만 쓰이므로 키가 외부에 노출되지 않습니다.

### 4. 재배포
환경변수 넣은 뒤 Deploys → Trigger deploy → Deploy site 한 번 눌러주세요.

## 첫 실행
배포된 주소를 열면 "계좌 개설" 화면이 나옵니다.
- Supabase URL, anon key, 기초대사량, 몸무게 입력 → 시작하기
- 이 정보는 브라우저에 저장되어 다음부턴 자동으로 열립니다.
- 폰 브라우저에서 "홈 화면에 추가"하면 앱처럼 쓸 수 있어요.

## Supabase 테이블 (이미 만들었다면 생략)
calorie_log: id(uuid), day(text), kind(text), label(text), kcal(int), prot/carb/fat(numeric)
food_fav: id(uuid), name(text), kcal(int), prot/carb/fat(numeric), base(numeric)
둘 다 RLS 정책 allow all 필요.
