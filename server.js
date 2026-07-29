const express = require('express');
const { fetchAll, profileFromCookieHeader } = require('./lib/fortune');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/api/fortune', async (req, res) => {
  const profile = profileFromCookieHeader(req.headers.cookie);
  if (!profile) {
    res.status(400).json({ error: '프로필 정보가 없습니다.' });
    return;
  }

  try {
    const data = await fetchAll(profile);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
