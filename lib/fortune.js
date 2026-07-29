const cheerio = require('cheerio');

const TARGET_URL = 'https://shinhanlife.sinbiun.com/unse/good_luck.php';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function refererFor(code) {
  return `https://shinhanlife.sinbiun.com/unse/saju/saju.php?unse_code=${code}`;
}

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

function addDays({ year, month, day }, delta) {
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + delta));
  return {
    year: String(d.getUTCFullYear()),
    month: String(d.getUTCMonth() + 1).padStart(2, '0'),
    day: String(d.getUTCDate()).padStart(2, '0'),
  };
}

function weekdayOf({ year, month, day }) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).format(new Date(`${year}-${month}-${day}T00:00:00+09:00`));
}

async function postForm(unseCode, profile, extra) {
  const body = new URLSearchParams({
    unse_code: unseCode,
    user_gender: '',
    user_birth_year: '',
    gender: profile.gender,
    sl_cal: profile.sl_cal,
    birth_year: profile.birth_year,
    birth_month: profile.birth_month,
    birth_day: profile.birth_day,
    birth_hour: profile.birth_hour,
    ...extra,
  });

  const res = await fetch(TARGET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      Referer: refererFor(unseCode),
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`대상 사이트 응답 오류: HTTP ${res.status}`);
  }

  return cheerio.load(await res.text());
}

async function fetchDailyHighlight(profile, date) {
  const $ = await postForm('A027', profile, {
    specific_year: date.year,
    specific_month: date.month,
    specific_day: date.day,
    sp_num: `${date.year}-${date.month}-${date.day}`,
  });

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
    if (title && content) sections.push({ title, content });
  });

  const firstTitle = $('.result_cont').first().find('.result_tit .tit_txt').first().text().trim();
  const dateMatch = firstTitle.match(/\d+월\s*\d+일/);

  const highlight = {
    date: `${dateMatch ? dateMatch[0] : `${Number(date.month)}월 ${Number(date.day)}일`} (${weekdayOf(date)})`,
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

  return highlight;
}

async function fetchMonthly(profile, year, month) {
  const $ = await postForm('A103', profile, {
    specific_year: year,
    specific_month: month,
    specific_day: '01',
    sp_num: `${year}-${month}`,
  });

  const firstCont = $('.result_cont').first();
  const title = firstCont.find('.result_tit .tit_txt').first().text().trim();
  const overview = firstCont.find('.view > .content').first().text().replace(/\s+/g, ' ').trim();

  const days = [];
  firstCont.find('.day_unse_table .li_01').each((_, li) => {
    const cells = $(li).find('.li_cont > li');
    const dayLabel = $(cells[0]).text().trim();
    const dayNum = (dayLabel.match(/^(\d+)일/) || [])[1];
    const content = $(cells[2]).text().replace(/\s+/g, ' ').trim();
    const score = $(cells[3]).find('.text').text().trim();
    if (dayNum) {
      days.push({ day: dayNum, content, score });
    }
  });

  return { title, overview, days, year, month };
}

async function fetchAll(profile) {
  const today = todayInSeoul();

  const monthCache = new Map();
  async function getMonth(year, month) {
    const key = `${year}-${month}`;
    if (!monthCache.has(key)) {
      monthCache.set(key, fetchMonthly(profile, year, month));
    }
    return monthCache.get(key);
  }

  const [todayHighlight, tomorrowHighlight, currentMonth] = await Promise.all([
    fetchDailyHighlight(profile, today),
    fetchDailyHighlight(profile, addDays(today, 1)),
    getMonth(today.year, today.month),
  ]);

  const next7Days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(today, i);
    const monthData =
      date.year === currentMonth.year && date.month === currentMonth.month
        ? currentMonth
        : await getMonth(date.year, date.month);
    const entry = monthData.days.find((d) => d.day === String(Number(date.day)));
    if (entry) {
      next7Days.push({
        date: `${Number(date.month)}월 ${Number(date.day)}일 (${weekdayOf(date)})`,
        score: entry.score,
        content: entry.content,
      });
    }
  }

  return {
    today: todayHighlight,
    tomorrow: tomorrowHighlight,
    monthly: { title: currentMonth.title, content: currentMonth.overview },
    next7Days,
  };
}

function profileFromEnv(env) {
  return {
    gender: env.PROFILE_GENDER,
    sl_cal: env.PROFILE_SL_CAL,
    birth_year: env.PROFILE_BIRTH_YEAR,
    birth_month: env.PROFILE_BIRTH_MONTH,
    birth_day: env.PROFILE_BIRTH_DAY,
    birth_hour: env.PROFILE_BIRTH_HOUR,
  };
}

module.exports = { fetchAll, profileFromEnv };
