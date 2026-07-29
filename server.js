const express = require('express');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// 기억해둔 개인정보 (신한라이프 사주 폼 입력값)
const PROFILE = {
  gender: 'F',       // M: 남자, F: 여자
  sl_cal: 'S',       // S: 양력, L: 음력(평달), Z: 음력(윤달)
  birth_year: '1988',
  birth_month: '02',
  birth_day: '04',
  birth_hour: '06',  // 묘시 (05:31~07:30)
};

const UNSE_CODE = 'A027'; // 오늘의 운세
const TARGET_URL = 'https://shinhanlife.sinbiun.com/unse/good_luck.php';
const REFERER = `https://shinhanlife.sinbiun.com/unse/saju/saju.php?unse_code=${UNSE_CODE}`;

function todayInSeoul() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = parts.split('-');
  return { year, month, day };
}

async function fetchFortune() {
  const { year, month, day } = todayInSeoul();

  const body = new URLSearchParams({
    unse_code: UNSE_CODE,
    specific_year: year,
    specific_month: month,
    specific_day: day,
    user_gender: '',
    user_birth_year: '',
    gender: PROFILE.gender,
    sl_cal: PROFILE.sl_cal,
    birth_year: PROFILE.birth_year,
    birth_month: PROFILE.birth_month,
    birth_day: PROFILE.birth_day,
    birth_hour: PROFILE.birth_hour,
    sp_num: `${year}-${month}-${day}`,
  });

  const res = await fetch(TARGET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: REFERER,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`대상 사이트 응답 오류: HTTP ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const sections = [];
  $('.result_cont').each((_, el) => {
    const title = $(el).find('.result_tit .tit_txt').first().text().trim();
    const content = $(el)
      .find('.view .content')
      .clone()
      .find('table, ul').remove()
      .end()
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    if (title && content) {
      sections.push({ title, content });
    }
  });

  const firstTitle = $('.result_cont').first().find('.result_tit .tit_txt').first().text().trim();
  const dateMatch = firstTitle.match(/\d+월\s*\d+일/);
  const weekday = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).format(new Date(`${year}-${month}-${day}T00:00:00+09:00`));

  const highlight = {
    date: `${dateMatch ? dateMatch[0] : `${Number(month)}월 ${Number(day)}일`} (${weekday})`,
    percentage: $('.result_cont').first().find('.u_point').first().text().trim(),
    color: '',
    colorNote: '',
  };

  $('.result_cont').last().find('.up_list li').each((_, li) => {
    const text = $(li).text().trim();
    if (text.includes('색상')) {
      highlight.color = text.split(':').slice(1).join(':').trim();
    }
  });

  const lastSection = sections[sections.length - 1];
  if (lastSection) {
    const note = lastSection.content
      .split(/(?<=[.!?])\s+/)
      .find((sentence) => sentence.includes('색상보다는'));
    if (note) {
      highlight.colorNote = note.trim();
    }
  }

  return { sections, highlight };
}

app.use(express.static('public'));

app.get('/api/fortune', async (req, res) => {
  try {
    const data = await fetchFortune();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
