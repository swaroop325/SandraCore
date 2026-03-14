module.exports = {
  apps: [
    {
      name: "sandra-api",
      script: "apps/api-server/dist/server.js",
      instances: 1,
      env: { CHANNEL: "dev", NODE_ENV: "development" },
    },
    {
      name: "sandra-worker",
      script: "apps/worker/dist/reminder-consumer.js",
      instances: 1,
      env: { CHANNEL: "dev", NODE_ENV: "development" },
    },
  ],
};
