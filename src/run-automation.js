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

// --- 헬퍼 함수 ---

async function getCrawledUrls() {
  try {
    const data = await fs.readFile(CRAWLED_URLS_PATH, 'utf8');
    if (!data || data.trim() === '') {
      return [];
    }
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function addCrawledUrl(url, list) {
  list.push(url);
  await fs.writeFile(CRAWLED_URLS_PATH, JSON.stringify(list, null, 2), 'utf8');
}

async function selectRandomImages() {
  console.log('--- 2. 이미지 선택 시작 ---');
  const data = await fs.readFile(IMAGES_PATH, 'utf8');
  const images = JSON.parse(data);
  if (images.length < 2) throw new Error('최소 2개의 이미지 URL이 필요합니다.');
  const selectedImages = images.sort(() => 0.5 - Math.random()).slice(0, 2);
  console.log('✅ 선택된 이미지 URL:', selectedImages);
  return selectedImages;
}

async function crawlHealthlineArticle(page, crawledUrls) {
  console.log('--- 1. 콘텐츠 수집 시작 ---');
  console.log('>> Health News 페이지로 이동합니다:', 'https://www.healthline.com/health-news');
  await page.goto('https://www.healthline.com/health-news', { waitUntil: 'domcontentloaded' });

  console.log('>> 페이지에서 기사 링크를 수집합니다...');
  const articleLinks = await page.locator('a.css-a63gyd').all();
  console.log(`>> 발견된 기사 링크 ${articleLinks.length}개`);

  for (const link of articleLinks) {
    const href = await link.getAttribute('href');
    const fullUrl = new URL(href, 'https://www.healthline.com').toString();

    if (!crawledUrls.includes(fullUrl)) {
      console.log(`✅ 새로운 기사를 발견했습니다: ${fullUrl}`);
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });

      const articleTitle = await page.locator('h1.css-1q7njkh').textContent();
      const articleBody = await page.locator('article.article-body').textContent();

      if (articleBody && articleBody.length > 500) {
        console.log(`>> 기사 크롤링 성공 (제목 글자 수: ${articleTitle.length}, 본문 글자 수: ${articleBody.length})`);
        return { url: fullUrl, title: articleTitle.trim(), text: articleBody.trim() };
      }
    }
  }
  return null;
}

// 👇 사용자님의 환경에서 정상 작동하는 방식으로 최종 수정된 함수입니다.
async function generateArticleWithGemini(sourceTitle, sourceText, imageUrls) {
  console.log('--- 3. AI 콘텐츠 생성 시작 ---');
  console.log('>> Gemini API에 기사 생성을 요청합니다... (gemini-2.5-flash 모델 사용)');
  
  // .env 파일의 API 키를 명시적으로 전달하여 초기화합니다.
  const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

  const prompt = `
    당신은 건강 및 웰니스 전문 작가입니다.
    아래에 제공된 원본 기사의 제목과 본문을 참조하여, 독자들이 흥미롭게 읽을 수 있는 새로운 블로그 기사를 작성해주세요.
    
    **엄격한 규칙:**
    1. **언어:** 반드시 한국어로 작성해야 합니다.
    2. **독자 대상:** 전문 용어를 최대한 피하고, 한국인 일반 대중이 쉽게 이해할 수 있는 친근한 어조로 작성해야 합니다.
    3. **가독성:** 중요한 키워드나 문장은 **굵은 글씨**로 강조하여 독자의 눈에 잘 띄게 해주세요.
    4. **문단 나누기:** 내용을 논리적으로 구분하여 문단을 짧게 나누고, 문단 사이에 한 줄의 공백을 넣어주세요.
    5. **목록 활용:** 나열할 수 있는 정보는 순서가 있는 목록이나 순서 없는 목록(불릿 포인트)을 적극적으로 활용하여 명확하게 전달해주세요.
    6. **출력 형식:** 전체 응답은 반드시 마크다운(Markdown) 형식이어야 합니다.
    7. **구조:** 첫 줄에는 기사 제목만 있어야 합니다. 그 다음 줄에는 반드시 '|||TITLE-BODY-SEPARATOR|||' 구분자를 넣고, 그 아래에 본문을 작성해야 합니다.
    8. **분량:** 기사의 본문은 한글 기준 1000자에서 1500자 사이여야 합니다.
    9. **이미지 삽입:** 다음 두 이미지 URL을 본문 내용과 가장 잘 어울리는 위치에 마크다운 형식 '![이미지 설명](${imageUrls[0]})' 와 '![이미지 설명](${imageUrls[1]})' 으로 자연스럽게 삽입해주세요.
    ---
    [원본 제목]: ${sourceTitle}
    ---
    [원본 텍스트]:
    ${sourceText}
  `;

  // 사용자님 환경에 맞는 이전 버전 SDK 호출 방식입니다.
  const response = await genAI.models.generateContent({
    model: "gemini-2.5-flash", // 공식 지원 모델명으로 수정
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      thinkingConfig: {
        thinkingBudget: 0,
      }
    }
  });

  // 이전 버전에서는 response 객체에 text 속성이 바로 있습니다.
  const responseText = response.text;
  
  const parts = responseText.split('|||TITLE-BODY-SEPARATOR|||');
  if (parts.length < 2) {
    throw new Error('AI 응답이 제목과 본문 구분자 "|||TITLE-BODY-SEPARATOR|||"를 포함하지 않습니다.');
  }
  const title = parts[0].trim();
  const body = parts.slice(1).join('|||TITLE-BODY-SEPARATOR|||').trim();
  if (!title || !body) {
    throw new Error('AI 응답에서 제목 또는 본문을 추출할 수 없습니다.');
  }

  const disclaimer = `
---
> **면책 조항 (Disclaimer):** 이 글은 정보 제공을 목적으로 하며, 전문적인 의학적 조언이나 진단을 대체할 수 없습니다. 건강 관련 문제에 대해서는 반드시 전문 의료인과 상담하시기 바랍니다.`;
  const finalBody = body + disclaimer;

  console.log('✅ AI 기사 생성 완료');
  return { title, body: finalBody };
}

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

    await page.waitForURL('**/manage', { timeout: 60000 });
    console.log('✅ 로그인 성공!');
    
    console.log('>> 글쓰기 페이지로 이동합니다...');
    await page.goto(`${TISTORY_BLOG_URL}/manage/newpost/`);
    
    // 이하 글쓰기 및 발행 로직은 이전과 동일
    console.log('>> 카테고리 드롭다운 클릭');
    await page.locator('#editorContainer div.btn-category button').click();
    await page.waitForTimeout(1000);
    
    console.log('>> "건강" 카테고리 선택');
    await page.locator('#category-item-998705').click();
    await page.waitForTimeout(1000);
    
    console.log('>> 기본모드 버튼 클릭');
    await page.locator('#editor-mode-layer-btn-open').click();
    await page.waitForTimeout(1000);
    
    console.log('>> "마크다운" 모드 선택 (팝업은 자동으로 확인됩니다)');
    await page.locator('#editor-mode-markdown-text').click();

    console.log('>> 마크다운 에디터 로딩을 3초간 기다립니다...');
    await page.waitForTimeout(3000);
    
    console.log('>> 제목을 입력합니다:', article.title);
    await page.locator('#post-title-inp').fill(article.title);
    await page.waitForTimeout(1000);
    
    console.log('>> 본문을 입력합니다.');
    const editor = page.locator('.CodeMirror.cm-s-tistory-markdown .CodeMirror-code');
    await editor.click();
    
    const os = process.platform;
    if (os === 'darwin') { await page.keyboard.press('Meta+A'); } 
    else { await page.keyboard.press('Control+A'); }
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(article.body);
    await page.waitForTimeout(1000);
    
    console.log('>> "완료" 버튼 클릭');
    await page.locator('#publish-layer-btn').click();
    await page.waitForTimeout(1000);
    
    console.log('>> "공개" 라디오 버튼 클릭');
    await page.locator('#open20').check();
    await page.waitForTimeout(1000);
    
    console.log('>> 최종 "공개 발행" 버튼 클릭');
    await page.locator('#publish-btn').click();
    
    console.log('>> 발행 완료 후 5초 대기...');
    await page.waitForTimeout(5000);
    
    console.log('🎉 포스팅이 성공적으로 완료되었습니다!');
    return true;

  } catch (error) {
    console.error('!! 티스토리 포스팅 중 오류 발생:', error);
    await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
    console.log('📸 디버깅을 위해 error_screenshot.png 파일을 저장했습니다.');
    return false;
  } finally {
    await browser.close();
  }
}

// --- 메인 실행 함수 ---
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