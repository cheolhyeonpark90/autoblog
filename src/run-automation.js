// src/run-automation.js
import { chromium } from '@playwright/test';
import { GoogleGenAI } from '@google/genai';
import { promises as fs } from 'fs';
import path from 'path';
import 'dotenv/config';

// --- 경로 및 환경 변수 설정 ---
const CRAWLED_URLS_PATH = path.join(process.cwd(), 'data', 'crawled_urls.json');
const IMAGES_PATH = path.join(process.cwd(), 'data', 'images.json');
const TISTORY_BLOG_URL = 'https://reviewland.tistory.com'; // ⚠️ 본인의 티스토리 블로그 주소로 변경하세요.

// --- 헬퍼 함수 (이전과 동일) ---
async function getCrawledUrls() { try { const data = await fs.readFile(CRAWLED_URLS_PATH, 'utf8'); if (!data || data.trim() === '') { return []; } return JSON.parse(data); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
async function addCrawledUrl(url, list) { list.push(url); await fs.writeFile(CRAWLED_URLS_PATH, JSON.stringify(list, null, 2), 'utf8'); }
async function selectRandomImages() { console.log('--- 2. 이미지 선택 시작 ---'); const data = await fs.readFile(IMAGES_PATH, 'utf8'); const images = JSON.parse(data); if (images.length < 2) throw new Error('최소 2개의 이미지 URL이 필요합니다.'); const selectedImages = images.sort(() => 0.5 - Math.random()).slice(0, 2); console.log('✅ 선택된 이미지 URL:', selectedImages); return selectedImages; }
async function crawlHealthlineArticle(page, crawledUrls) { console.log('--- 1. 콘텐츠 수집 시작 ---'); await page.goto('https://www.healthline.com/health-news', { waitUntil: 'domcontentloaded' }); const articleLinks = await page.locator('a.css-a63gyd').all(); for (const link of articleLinks) { const href = await link.getAttribute('href'); const fullUrl = new URL(href, 'https://www.healthline.com').toString(); if (!crawledUrls.includes(fullUrl)) { console.log(`✅ 새로운 기사를 발견했습니다: ${fullUrl}`); await page.goto(fullUrl, { waitUntil: 'domcontentloaded' }); const articleTitle = await page.locator('h1.css-1q7njkh').textContent(); const articleBody = await page.locator('article.article-body').textContent(); if (articleBody && articleBody.length > 500) { console.log(`>> 기사 크롤링 성공`); return { url: fullUrl, title: articleTitle.trim(), text: articleBody.trim() }; } } } return null; }
async function generateArticleWithGemini(sourceTitle, sourceText, imageUrls) { console.log('--- 3. AI 콘텐츠 생성 시작 ---'); const genAI = new GoogleGenAI({}); const prompt = `...`; const response = await genAI.models.generateContent({ model: "gemini-2.5-flash", contents: [{ parts: [{ text: prompt }] }], config: { thinkingConfig: { thinkingBudget: 0 } } }); const responseText = response.text; const parts = responseText.split('|||TITLE-BODY-SEPARATOR|||'); if (parts.length < 2) { throw new Error('AI 응답 형식 오류'); } const title = parts[0].trim(); const body = parts.slice(1).join('|||TITLE-BODY-SEPARATOR|||').trim(); if (!title || !body) { throw new Error('AI 응답 내용 오류'); } const disclaimer = `\n---\n> **면책 조항 (Disclaimer):** 이 글은 정보 제공을 목적으로 하며, 전문적인 의학적 조언이나 진단을 대체할 수 없습니다. 건강 관련 문제에 대해서는 반드시 전문 의료인과 상담하시기 바랍니다.`; const finalBody = body + disclaimer; console.log('✅ AI 기사 생성 완료'); return { title, body: finalBody }; }

// 👇 수정됨: catch 블록에 페이지 내용(body) 출력 로직 추가
async function postToTistory(article) {
  console.log('--- 4. 티스토리 포스팅 시작 ---');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  page.on('dialog', dialog => dialog.accept());

  try {
    console.log(`>> 티스토리 관리 페이지로 이동합니다: ${TISTORY_BLOG_URL}/manage`);
    await page.goto(`${TISTORY_BLOG_URL}/manage`);
    
    console.log('>> 카카오계정으로 로그인 버튼 클릭');
    await page.locator('#cMain a.btn_login.link_kakao_id').click();
    
    console.log('>> 카카오 계정으로 로그인을 시작합니다.');
    await page.locator('input[name="loginId"]').fill(process.env.TISTORY_USERNAME);
    await page.locator('input[name="password"]').fill(process.env.TISTORY_PASSWORD);
    await page.locator('.btn_g.highlight.submit').click();

    await page.waitForURL('https://*.tistory.com/manage', { timeout: 60000 });
    console.log('✅ 로그인 성공!');
    // ... 이하 성공 로직 ...
    
  } catch (error) {
    console.error('!! 티스토리 포스팅 중 오류 발생:', error);
    
    console.log('📸 디버깅 정보 수집중...');
    await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
    
    // 👇 추가됨: 오류 발생 시점의 페이지 body 태그 내용을 가져와 일부 출력
    const bodyHTML = await page.locator('body').innerHTML();
    console.log('--- [Debug] 오류 발생 페이지 HTML Body (일부) ---');
    console.log(bodyHTML.substring(0, 1000));
    console.log('------------------------------------------------');

    console.log(`📸 오류 발생 당시 URL: ${page.url()}`);
    console.log('📸 디버깅을 위해 error_screenshot.png 파일을 저장했습니다. 깃헙 액션의 "Artifacts"에서도 확인 가능합니다.');
    
    return false;
  } finally {
    await browser.close();
  }
}


async function main() {
  if (!process.env.GEMINI_API_KEY || !process.env.TISTORY_USERNAME || !process.env.TISTORY_PASSWORD) {
    console.error('!! .env 또는 Secrets에 환경 변수가 올바르게 설정되었는지 확인하세요.');
    return;
  }
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  try {
    const crawledUrls = await getCrawledUrls();
    const sourceArticle = await crawlHealthlineArticle(page, crawledUrls);
    if (!sourceArticle) {
      console.log('>> 새로운 기사를 찾지 못해 작업을 종료합니다.');
      return;
    }
    const imageUrls = await selectRandomImages();
    const newArticle = await generateArticleWithGemini(sourceArticle.title, sourceArticle.text, imageUrls);
    const isSuccess = await postToTistory(newArticle);
    if (isSuccess) {
      await addCrawledUrl(sourceArticle.url, crawledUrls);
      console.log('✅ 성공! 크롤링 URL 목록을 업데이트했습니다.');
    }
    console.log('--- 자동화 파이프라인 정상 종료 ---');
  } catch (error) {
    console.error('!! 파이프라인 실행 중 심각한 오류 발생:', error);
  } finally {
    await browser.close();
  }
}

main();