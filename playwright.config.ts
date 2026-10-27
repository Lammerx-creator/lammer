import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'e2e',fullyParallel:false,workers:1,timeout:90000,
 use:{baseURL:'http://127.0.0.1:4176/lammer/',trace:'retain-on-failure',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']}},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
 webServer:{command:'npm run build -- --base=/lammer/ && npm run preview -- --port 4176 --base=/lammer/',url:'http://127.0.0.1:4176/lammer/',reuseExistingServer:!process.env.CI},
});
