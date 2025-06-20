# 🌅 MorningStock 백엔드

AI 기반 개인 주식 섹터 분석 도우미, **모닝스탁(MorningStock)** 백엔드 프로젝트입니다.

## ⚙️ 기술 스택

- **Backend**: Express.js (Node.js)
- **ORM**: Prisma
- **Database**: MySQL (로컬 개발용) / AWS Lightsail 배포용
- **스케줄러**: node-cron (매일 종가 자동 수집/정리)
---
## 구조
1. 크론으로 dailyPrice에 내 TickerInfo에 있는 모든 회사의 종가를 매일 오후 5시에 수집한다
---

## 🛠️ 로컬 개발 세팅

### 1. MySQL 설정

- 이미 설치된 MySQL 사용
- 다른 프로젝트 DB와 충돌 피하려면 새 DB 생성:
## 개발방법 메모(추후 정리하기)
1. krx 에서 기업정보, 티커번호 등을 가져와서 TikcerInfo에 넣어놓는다. ->주기적으로 갱신하도록 수정
2. TickerInfo에 있는 기업을 보고 탐색해서 모든 데이터 가공
```sql
CREATE DATABASE morningstock;
CREATE USER 'wonhee'@'%' IDENTIFIED BY '비밀번호';
GRANT ALL PRIVILEGES ON morningstock.* TO 'wonhee'@'%';
FLUSH PRIVILEGES;
