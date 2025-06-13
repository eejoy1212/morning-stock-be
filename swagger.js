// swagger.js
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '모닝스탁 API',
      version: '1.0.0',
      description: '모닝스탁 백엔드 API 문서입니다',
    },
    // components: {
    //   securitySchemes: {
    //     bearerAuth: {
    //       type: 'http',
    //       scheme: 'bearer',
    //       bearerFormat: 'JWT',
    //     },
    //   },
    // },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./routes/*.js'], // 모든 라우터 파일에서 Swagger 주석을 읽습니다
};

const specs = swaggerJsdoc(options);

export { swaggerUi, specs };
