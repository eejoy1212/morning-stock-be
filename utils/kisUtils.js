// kis.js - KIS Open API 연동 및 Swagger 문서 주석 포함





/**
 * @swagger
 * tags:
 *   name: KIS
 *   description: KIS Open API 연동 함수
 */

/**
 * @swagger
 * /kis/token:
 *   get:
 *     summary: KIS OpenAPI Access Token 발급
 *     tags: [KIS]
 *     responses:
 *       200:
 *         description: Access token 문자열 반환
 */


/**
 * @swagger
 * /kis/price/{code}:
 *   get:
 *     summary: 단일 종목의 등락률 조회
 *     tags: [KIS]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: 종목 코드
 *     responses:
 *       200:
 *         description: 종목명, 코드, 등락률 반환
 */

