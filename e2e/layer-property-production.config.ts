import { defineConfig, devices } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'editor-layer-property-production.spec.ts',outputDir:'../test-results/production',timeout:120000,expect:{timeout:15000},workers:1,retries:0,reporter:'list',use:{baseURL:'https://noacg.studio',trace:'retain-on-failure'},projects:[{name:'production',use:{...devices['Desktop Chrome']}}]});

