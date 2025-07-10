module.exports = {
  apps: [
    {
      name: "backend", // 원하는 앱 이름
      script: "index.js", // 백엔드 진입 파일 경로
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        DATABASE_URL: "mysql://root:Cat18651@@localhost:3306/morningstock",
        JWT_SECRET: "daf4eb5603c636e76386ce5a2abb40865a08d2c578bd876c7e00da968cc26c86",
        NEWSDATA_API_KEY: "414f1ebf0efa2326c9556065cf86662b",
        NAVER_CLIENT_ID: "NlEQazrU8untNAINY6M6",
        NAVER_CLIENT_SECRET: "TBx9QCXAop",
        KIS_APP_KEY: "PS20KQZDsbM793sjjPc9q4Lq3C2fnruVowXx",
        KIS_APP_SECRET: "tcu+o9oI50ql2yrqkIxs3VLkmx29MzbGJ537YXC1tnPTi2zlpqcSaTGgLjUNgymZdH1FPZEcjbOynuf8zA7xTxkTQuvTUqJclrhSkNAzWxvwyiUpCnZzddB1yEyuwHgXj2HQIC34fajBclcf1yGtCqefEnkIwXcLxYIvRbj0r26O8nXhCEQ=",
        KAKAO_REST_API_KEY: "1e8f56a25b0fc290dc08054c58fcdbf9",
        REDIRECT_URI: "https://morning-stock-web.vercel.app/auth/kakao/callback",
        GMAIL_USER:"lwh961212@gmail.com",
        GMAIL_PASS:"tjxf kgeh gdrl zizf"
      }
    }
  ]
}
