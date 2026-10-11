// covers: none - disposable independent checker; never land
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'independent-991-production.spec.ts',outputDir:'../test-results/production-991',timeout:150000,expect:{timeout:15000},workers:1,retries:0,reporter:'list',use:{baseURL:'https://noacg.studio',trace:'retain-on-failure'},projects:[{name:'production',use:{...devices['Desktop Chrome']}}]});
