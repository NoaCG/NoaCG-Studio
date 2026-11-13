import base from '../playwright.config';
import { defineConfig } from '@playwright/test';
import path from 'node:path';
const root = process.cwd();
export default defineConfig({ ...base, testDir:path.join(root,'checker.local'), testMatch:'independent.spec.ts',testIgnore:[], globalSetup:path.join(root,'e2e/_offline-guard.ts'),outputDir:path.join(root,'checker.local/results'),reporter:[['list'],['json',{outputFile:path.join(root,'checker.local/report.json')}]],webServer:{...base.webServer,cwd:root},retries:0,timeout:60000 });
