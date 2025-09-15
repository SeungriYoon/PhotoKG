# 새로운 OpenAI 기반 시스템 설정 가이드

## 1. 환경 설정

### Python 환경 설정
```bash
# Python 가상환경 생성 (권장)
python -m venv venv

# 가상환경 활성화
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 패키지 설치
pip install -r requirements.txt
```

### Node.js 백엔드 설정
```bash
# 백엔드 디렉토리로 이동
cd backend

# 패키지 설치
npm install

# 추가 패키지 (필요시)
npm install express cors helmet morgan multer dotenv
```

## 2. 환경 변수 설정

### .env 파일 생성
```bash
# .env.example을 복사하여 .env 파일 생성
cp .env.example .env
```

### 필수 환경 변수 설정
`.env` 파일을 열고 다음 값들을 설정하세요:

```env
# OpenAI API 키 (필수)
OPENAI_API_KEY=sk-your-actual-openai-api-key

# 데이터베이스 설정
ARANGODB_URL=http://localhost:8529
ARANGODB_USERNAME=root
ARANGODB_PASSWORD=your_db_password
ARANGODB_DATABASE=knowledge_graph

# 서버 포트
PORT=3001
PYTHON_SERVICE_URL=http://localhost:8000
```

### OpenAI API 키 발급 방법
1. [OpenAI 웹사이트](https://platform.openai.com/)에 접속
2. 계정 로그인/생성
3. API Keys 섹션에서 새 키 생성
4. 생성된 키를 `.env` 파일에 저장

## 3. 데이터베이스 설정

### ArangoDB 설치 및 실행
```bash
# Windows (Chocolatey)
choco install arangodb

# Linux (Ubuntu)
curl -OL https://download.arangodb.com/arangodb310/DEBIAN/Release.key
sudo apt-key add - < Release.key
sudo apt-get update
sudo apt-get install arangodb3

# Docker 사용 (권장)
docker run -e ARANGO_ROOT_PASSWORD=mypassword -p 8529:8529 -d arangodb:latest
```

### 데이터베이스 초기화
```bash
# 백엔드 디렉토리에서 실행
cd backend
node scripts/init-database.js
```

## 4. 서비스 실행

### 1단계: ArangoDB 실행
```bash
# 로컬 설치된 경우
sudo systemctl start arangodb3

# Docker 사용 경우
docker start <container_id>

# ArangoDB 웹 인터페이스 접속 확인
# http://localhost:8529
```

### 2단계: Python 분석 서비스 실행
```bash
# 프로젝트 루트에서
python openai_analyzer.py

# 또는 uvicorn 직접 사용
uvicorn openai_analyzer:app --host 0.0.0.0 --port 8000 --reload

# 서비스 상태 확인
curl http://localhost:8000/health
```

### 3단계: Node.js 백엔드 실행
```bash
# 백엔드 디렉토리에서
cd backend
npm run dev

# 또는 프로덕션 모드
npm start

# 서비스 상태 확인
curl http://localhost:3001/api/health
```

### 4단계: 프론트엔드 실행
```bash
# 프로젝트 루트에서 Live Server 사용
# 또는 간단한 HTTP 서버
python -m http.server 3000

# 브라우저에서 접속
# http://localhost:3000
```

## 5. 시스템 확인

### 연결 테스트
1. **프론트엔드**: http://localhost:3000에서 "Test Connection" 버튼 클릭
2. **백엔드 API**: http://localhost:3001/api/health 접속
3. **Python 서비스**: http://localhost:8000/health 접속
4. **ArangoDB**: http://localhost:8529 웹 인터페이스 접속

### 분석 기능 테스트
1. 샘플 CSV 파일 업로드
2. "Upload CSV" 버튼 클릭
3. OpenAI 분석 결과 확인
4. 지식 그래프 시각화 확인

## 6. 문제 해결

### 일반적인 오류와 해결책

#### OpenAI API 오류
```
Error: OpenAI API key not found
```
**해결책**: `.env` 파일에 올바른 API 키 설정 확인

#### 연결 오류
```
Error: Connection refused to localhost:8000
```
**해결책**: Python 분석 서비스가 실행 중인지 확인

#### CORS 오류
```
Error: CORS policy blocked
```
**해결책**: 백엔드에서 프론트엔드 도메인을 허용 목록에 추가

#### 파일 업로드 오류
```
Error: File too large
```
**해결책**: `.env`에서 `MAX_FILE_SIZE` 설정 확인

### 로그 확인 방법
```bash
# Python 서비스 로그
tail -f logs/openai_analyzer.log

# Node.js 백엔드 로그
tail -f logs/backend.log

# 브라우저 개발자 도구에서 네트워크 탭 확인
```

## 7. 개발 모드 설정

### 자동 재시작 설정
```bash
# Python 서비스 (uvicorn reload)
uvicorn openai_analyzer:app --reload

# Node.js 백엔드 (nodemon)
npm run dev

# 프론트엔드 (Live Server)
# VS Code Live Server 확장 사용
```

### 디버깅 설정
```bash
# Python 디버그 모드
export LOG_LEVEL=debug
python openai_analyzer.py

# Node.js 디버그 모드
DEBUG=* npm run dev
```

## 8. 프로덕션 배포

### Docker Compose 사용 (권장)
```yaml
version: '3.8'
services:
  frontend:
    build: .
    ports:
      - "3000:80"
    depends_on:
      - backend
      
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
    depends_on:
      - python-service
      - arangodb
      
  python-service:
    build: .
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      
  arangodb:
    image: arangodb:latest
    ports:
      - "8529:8529"
    environment:
      - ARANGO_ROOT_PASSWORD=${DB_PASSWORD}
```

### 환경별 설정
```bash
# 개발 환경
cp .env.example .env.development

# 테스트 환경  
cp .env.example .env.test

# 프로덕션 환경
cp .env.example .env.production
```

## 9. 성능 최적화

### 캐싱 설정
```bash
# Redis 설치 (선택사항)
docker run -d -p 6379:6379 redis:alpine

# 캐싱 활성화
export ENABLE_CACHE=true
export REDIS_URL=redis://localhost:6379
```

### 모니터링 설정
```bash
# 프로메테우스 메트릭 활성화
export ENABLE_METRICS=true

# 로그 수준 조정
export LOG_LEVEL=info
```

이제 새로운 OpenAI 기반 시스템이 준비되었습니다! 🚀