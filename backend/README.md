# Knowledge Graph Backend API

ArangoDB 기반 고급 지식그래프 백엔드 API 서버

## 🚀 Quick Start

### 1. 사전 요구사항

- **Node.js 16.0 이상**
- **ArangoDB 3.8 이상**

### 2. ArangoDB 설치 및 실행

#### Windows (Docker 사용 권장)
```bash
# Docker로 ArangoDB 실행
docker run -p 8529:8529 -e ARANGO_ROOT_PASSWORD= arangodb/arangodb:latest
```

#### 직접 설치
[ArangoDB 공식 다운로드](https://www.arangodb.com/download-major/)

### 3. 프로젝트 설정

```bash
# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일을 편집하여 ArangoDB 연결 정보 입력

# 데이터베이스 연결 테스트
npm run test-connection

# 데이터베이스 초기화
npm run init-db

# 개발 서버 시작
npm run dev
```

### 4. 통합 설정 (한 번에 실행)
```bash
npm run setup
```

## 📋 환경변수 설정

`.env` 파일 예시:
```env
# 서버 설정
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# ArangoDB 설정
ARANGODB_URL=http://localhost:8529
ARANGODB_DATABASE=knowledge_graph
ARANGODB_USERNAME=root
ARANGODB_PASSWORD=

# 파일 업로드 설정
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=50MB

# API 보안
API_SECRET=your-secret-key-here
JWT_SECRET=your-jwt-secret-here
```

## 📊 API 엔드포인트

### 그래프 관리 (`/api/graph`)

#### 전체 그래프 조회
```http
GET /api/graph?limit=50&offset=0&filter={"nodeType":"concept"}
```

#### 서브그래프 조회
```http
GET /api/graph/subgraph/:nodeId?depth=2
```

#### 노드 검색
```http
GET /api/graph/search?query=photosynthesis&type=process&limit=20
```

#### 그래프 생성
```http
POST /api/graph
Content-Type: application/json

{
  "nodes": [
    {
      "id": "node1",
      "label": "Photosynthesis",
      "type": "process",
      "size": 30
    }
  ],
  "edges": [
    {
      "source": "node1",
      "target": "node2",
      "weight": 5,
      "relationship_type": "RELATED_TO"
    }
  ],
  "metadata": {
    "title": "My Knowledge Graph",
    "description": "Sample graph"
  }
}
```

### 파일 업로드 (`/api/upload`)

#### 단일 파일 업로드
```http
POST /api/upload/file
Content-Type: multipart/form-data

file: [CSV/JSON/PDF 파일]
options: {"maxKeywords": 10, "minFrequency": 2}
```

#### 다중 파일 업로드
```http
POST /api/upload/files
Content-Type: multipart/form-data

files: [여러 파일들]
```

#### URL에서 파일 처리
```http
POST /api/upload/url
Content-Type: application/json

{
  "url": "https://example.com/data.csv",
  "options": {
    "maxKeywords": 15
  }
}
```

### 분석 기능 (`/api/analysis`)

#### 구조 분석
```http
POST /api/analysis/structure
Content-Type: application/json

{
  "graphId": "graph_id",
  "analysisOptions": {
    "includeCentrality": true,
    "includeModularity": true
  }
}
```

#### 커뮤니티 탐지
```http
POST /api/analysis/communities
Content-Type: application/json

{
  "graphId": "graph_id",
  "algorithm": "modularity"
}
```

#### 유사도 계산
```http
POST /api/analysis/similarity
Content-Type: application/json

{
  "nodeId1": "node1",
  "nodeId2": "node2",
  "method": "semantic"
}
```

## 🗂️ 데이터 구조

### 노드 스키마
```javascript
{
  "_key": "unique_id",
  "label": "Node Label",
  "size": 30,
  "type": "concept|process|material|measurement",
  "attributes": {
    "total_citations": 150,
    "importance_score": 4.5,
    "bert_confidence": 0.95
  },
  "created_at": "2025-01-13T..."
}
```

### 엣지 스키마
```javascript
{
  "_from": "nodes/node1",
  "_to": "nodes/node2",
  "weight": 5,
  "relationship_type": "INFLUENCES|CAUSES|PART_OF",
  "confidence": 0.8,
  "evidence": "Supporting text...",
  "created_at": "2025-01-13T..."
}
```

## 🔧 개발 명령어

```bash
# 개발 서버 (자동 재시작)
npm run dev

# 프로덕션 서버
npm start

# 연결 테스트
npm run test-connection

# 데이터베이스 초기화
npm run init-db

# 테스트 실행
npm test
```

## 📈 성능 최적화

### 1. 인덱스 활용
- 노드: `label`, `type`, `size` 필드 인덱싱
- 엣지: `relationship_type`, `weight` 필드 인덱싱
- 복합 인덱스: `type + graph_id`

### 2. 쿼리 최적화
- 페이징 처리로 대용량 데이터 처리
- 서브그래프 조회로 네트워크 트래픽 최소화
- 필터링으로 불필요한 데이터 제외

### 3. 메모리 관리
- 파일 업로드 크기 제한 (50MB)
- 스트리밍 처리로 메모리 사용량 최적화

## 🚨 문제 해결

### ArangoDB 연결 실패
```bash
# 1. ArangoDB 상태 확인
docker ps  # Docker 사용 시
# 또는 서비스 상태 확인

# 2. 연결 테스트
npm run test-connection

# 3. 로그 확인
tail -f logs/app.log  # 로그 파일이 있는 경우
```

### 파일 업로드 실패
- 파일 크기가 50MB를 초과하는지 확인
- 지원되는 형식(CSV, JSON, PDF)인지 확인
- 업로드 디렉토리 권한 확인

### 메모리 부족
- Node.js 힙 메모리 증가: `node --max-old-space-size=4096 server.js`
- 배치 처리 크기 조정
- 불필요한 데이터 정리

## 📚 추가 리소스

- [ArangoDB 문서](https://www.arangodb.com/docs/)
- [Graph Theory 기초](https://en.wikipedia.org/wiki/Graph_theory)
- [Knowledge Graphs 소개](https://ai.googleblog.com/2012/05/introducing-knowledge-graph-things-not.html)

## 🤝 기여하기

1. 이슈 생성 또는 기능 제안
2. 포크 후 브랜치 생성
3. 변경사항 커밋
4. 풀 리퀘스트 생성

## 📄 라이센스

MIT License