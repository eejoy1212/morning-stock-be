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

```sql
CREATE DATABASE morningstock;
CREATE USER 'wonhee'@'%' IDENTIFIED BY '비밀번호';
GRANT ALL PRIVILEGES ON morningstock.* TO 'wonhee'@'%';
FLUSH PRIVILEGES;
