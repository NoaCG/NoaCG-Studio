import { defineConfig } from '@playwright/test';
import base from '../../../playwright.config';
import { resolve } from 'node:path';
// Playwright owns the dev server for the entire battery and tears it down afterwards.
export default defineConfig({ ...base, globalSetup: resolve('e2e/_offline-guard.ts'), webServer: { ...base.webServer, cwd: process.cwd() }, testDir: '.', testMatch: 'catalog-battery.spec.ts', workers: 1 });
