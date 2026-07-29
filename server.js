require('dotenv').config();
const express = require('express');
const { fetchFortune, profileFromEnv } = require('./lib/fortune');

const app = express();
const PORT = process.env.PORT || 3000;
const PROFILE = profileFromEnv(process.env);

app.use(express.static('public'));

app.get('/api/fortune', async (req, res) => {
  try {
    const data = await fetchFortune(PROFILE);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
