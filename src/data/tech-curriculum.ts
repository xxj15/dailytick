import type { Concept } from "@/data/curriculum";

/**
 * IT 개념 Curriculum.
 *
 * 경제 커리큘럼과 같은 규칙을 따른다. AI가 주제를 고르지 않고 이 배열 순서대로 나간다.
 * 비전공자가 IT 뉴스를 읽고 기술 면접 질문에 답할 수 있는 수준을 목표로
 * 컴퓨터가 동작하는 원리 → 네트워크·웹 → 데이터 → 서비스 운영 → AI 순서로 쌓는다.
 */

export type TechCurriculumCategory =
  | "computer-basics"
  | "data-structures"
  | "operating-systems"
  | "network"
  | "web"
  | "database"
  | "software-engineering"
  | "infra-cloud"
  | "security"
  | "ai-data";

export type TechCurriculumConcept = Concept & { category: TechCurriculumCategory };

export const TECH_CURRICULUM: TechCurriculumConcept[] = [
  // LEVEL 1 — 컴퓨터 기초
  { slug: "cpu-memory-storage", title: "CPU·메모리·저장장치", level: 1, category: "computer-basics" },
  { slug: "binary-bit-byte", title: "2진수와 비트·바이트", level: 1, category: "computer-basics" },
  { slug: "compiler-interpreter", title: "컴파일러와 인터프리터", level: 1, category: "computer-basics" },
  { slug: "semiconductor-memory", title: "D램과 낸드플래시", level: 1, category: "computer-basics", pairWith: "hbm" },
  { slug: "hbm", title: "HBM", level: 1, category: "computer-basics" },
  { slug: "gpu-vs-cpu", title: "GPU와 CPU의 차이", level: 1, category: "computer-basics" },

  // LEVEL 2 — 자료구조와 알고리즘
  { slug: "array-linked-list", title: "배열과 연결 리스트", level: 2, category: "data-structures" },
  { slug: "stack-queue", title: "스택과 큐", level: 2, category: "data-structures" },
  { slug: "hash-table", title: "해시 테이블", level: 2, category: "data-structures" },
  { slug: "tree-bst", title: "트리와 이진 탐색 트리", level: 2, category: "data-structures" },
  { slug: "graph", title: "그래프와 BFS·DFS", level: 2, category: "data-structures" },
  { slug: "time-complexity", title: "시간복잡도와 Big-O", level: 2, category: "data-structures" },
  { slug: "sorting", title: "정렬 알고리즘", level: 2, category: "data-structures" },

  // LEVEL 3 — 운영체제
  { slug: "process-thread", title: "프로세스와 스레드", level: 3, category: "operating-systems" },
  { slug: "context-switching", title: "컨텍스트 스위칭", level: 3, category: "operating-systems" },
  { slug: "deadlock", title: "교착상태(데드락)", level: 3, category: "operating-systems" },
  { slug: "mutex-semaphore", title: "뮤텍스와 세마포어", level: 3, category: "operating-systems" },
  { slug: "virtual-memory", title: "가상 메모리", level: 3, category: "operating-systems" },
  { slug: "sync-async", title: "동기와 비동기", level: 3, category: "operating-systems" },

  // LEVEL 4 — 네트워크
  { slug: "osi-tcp-ip", title: "OSI 7계층과 TCP/IP", level: 4, category: "network" },
  { slug: "tcp-udp", title: "TCP와 UDP", level: 4, category: "network" },
  { slug: "ip-dns", title: "IP 주소와 DNS", level: 4, category: "network" },
  { slug: "http-https", title: "HTTP와 HTTPS", level: 4, category: "network" },
  { slug: "load-balancer", title: "로드밸런서", level: 4, category: "network" },
  { slug: "cdn", title: "CDN", level: 4, category: "network" },

  // LEVEL 5 — 웹과 API
  { slug: "browser-request-flow", title: "브라우저에 URL을 입력하면 일어나는 일", level: 5, category: "web" },
  { slug: "client-server", title: "클라이언트와 서버", level: 5, category: "web" },
  { slug: "rest-api", title: "REST API", level: 5, category: "web" },
  { slug: "cookie-session-token", title: "쿠키·세션·토큰", level: 5, category: "web", pairWith: "oauth" },
  { slug: "oauth", title: "OAuth와 소셜 로그인", level: 5, category: "web" },
  { slug: "open-api-mydata", title: "오픈 API와 마이데이터", level: 5, category: "web" },

  // LEVEL 6 — 데이터베이스
  { slug: "rdbms-nosql", title: "관계형 DB와 NoSQL", level: 6, category: "database" },
  { slug: "sql-join", title: "SQL과 JOIN", level: 6, category: "database" },
  { slug: "index", title: "인덱스", level: 6, category: "database" },
  { slug: "transaction-acid", title: "트랜잭션과 ACID", level: 6, category: "database" },
  { slug: "normalization", title: "정규화", level: 6, category: "database" },
  { slug: "cache-redis", title: "캐시와 Redis", level: 6, category: "database" },

  // LEVEL 7 — 소프트웨어 개발
  { slug: "oop", title: "객체지향 프로그래밍", level: 7, category: "software-engineering" },
  { slug: "git", title: "Git과 버전 관리", level: 7, category: "software-engineering" },
  { slug: "testing", title: "단위 테스트와 통합 테스트", level: 7, category: "software-engineering" },
  { slug: "agile", title: "애자일과 스크럼", level: 7, category: "software-engineering" },
  { slug: "open-source", title: "오픈소스와 라이선스", level: 7, category: "software-engineering" },

  // LEVEL 8 — 인프라와 클라우드
  { slug: "cloud-iaas-paas-saas", title: "클라우드와 IaaS·PaaS·SaaS", level: 8, category: "infra-cloud" },
  { slug: "virtualization-container", title: "가상화와 컨테이너", level: 8, category: "infra-cloud" },
  { slug: "kubernetes", title: "쿠버네티스", level: 8, category: "infra-cloud" },
  { slug: "msa", title: "모놀리식과 마이크로서비스", level: 8, category: "infra-cloud" },
  { slug: "ci-cd", title: "CI/CD", level: 8, category: "infra-cloud" },
  { slug: "data-center", title: "데이터센터와 전력", level: 8, category: "infra-cloud" },

  // LEVEL 9 — 보안
  { slug: "encryption", title: "대칭키와 공개키 암호화", level: 9, category: "security" },
  { slug: "hashing-password", title: "해시와 비밀번호 저장", level: 9, category: "security" },
  { slug: "web-attacks", title: "SQL 인젝션과 XSS", level: 9, category: "security" },
  { slug: "ddos", title: "DDoS 공격", level: 9, category: "security" },
  { slug: "ransomware", title: "랜섬웨어와 해킹 사고 대응", level: 9, category: "security" },
  { slug: "zero-trust", title: "제로 트러스트", level: 9, category: "security" },

  // LEVEL 10 — AI와 데이터
  { slug: "ml-dl", title: "머신러닝과 딥러닝", level: 10, category: "ai-data" },
  { slug: "llm-transformer", title: "LLM과 트랜스포머", level: 10, category: "ai-data" },
  { slug: "training-inference", title: "학습과 추론", level: 10, category: "ai-data" },
  { slug: "rag", title: "RAG(검색 증강 생성)", level: 10, category: "ai-data" },
  { slug: "ai-agent", title: "AI 에이전트", level: 10, category: "ai-data" },
  { slug: "hallucination", title: "AI 환각", level: 10, category: "ai-data" },
  { slug: "big-data-pipeline", title: "빅데이터와 데이터 파이프라인", level: 10, category: "ai-data" },
  { slug: "on-device-ai", title: "온디바이스 AI", level: 10, category: "ai-data" },
];
