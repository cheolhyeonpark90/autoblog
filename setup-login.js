// setup-login.js
import { chromium } from '@playwright/test';
import path from 'path';

const AUTH_FILE_PATH = path.join(process.cwd(), 'auth.json');

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('>> 티스토리 로그인 페이지로 이동합니다...');
  await page.goto('https://www.tistory.com/auth/login');

  console.log('>> 브라우저에서 카카오 로그인을 직접 완료해주세요.');
  console.log('>> 로그인이 성공하여 티스토리 관리 페이지로 이동될 때까지 기다립니다...');

  // 👇 수정됨: 로그인 성공 후 이동하는 '/manage' 페이지를 명확하게 기다리도록 변경
  await page.waitForURL('https://*.tistory.com/manage', { timeout: 300000 });

  console.log('>> 로그인이 감지되었습니다. 인증 상태를 저장합니다...');
  await context.storageState({ path: AUTH_FILE_PATH });

  console.log(`>> 인증 상태가 '${AUTH_FILE_PATH}' 파일에 성공적으로 저장되었습니다.`);
  console.log('>> 이제 이 스크립트를 종료하고, 저장된 auth.json 파일의 내용을 GitHub Secret에 등록해주세요.');

  await browser.close();
}

main().catch(console.error);