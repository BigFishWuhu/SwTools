export default {
  testDir: "./tests",
  timeout: 60000,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 }
  },
  reporter: "line",
  webServer: {
    command: "node server.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 10000
  }
};
