import express from 'express';
import cors from 'cors';
import db, { initializeDB } from './db';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Initialize database
initializeDB();

// Save search results
app.post('/api/searches', (req, res) => {
  const { brand, audience, topicFocus, generations, sourcesType, results } = req.body;

  try {
    const stmt = db.prepare(`
      INSERT INTO searches (brand, audience, topicFocus, generations, sourcesType, results)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      brand || null,
      audience || null,
      topicFocus || null,
      JSON.stringify(generations || []),
      JSON.stringify(sourcesType || []),
      JSON.stringify(results)
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving search:', error);
    res.status(500).json({ error: 'Failed to save search' });
  }
});

// Get all searches
app.get('/api/searches', (req, res) => {
  try {
    const searches = db.prepare('SELECT * FROM searches ORDER BY createdAt DESC LIMIT 100').all();
    
    // Parse JSON fields
    const parsed = searches.map((s: any) => ({
      ...s,
      generations: JSON.parse(s.generations || '[]'),
      sourcesType: JSON.parse(s.sourcesType || '[]'),
      results: JSON.parse(s.results)
    }));

    res.json(parsed);
  } catch (error) {
    console.error('Error fetching searches:', error);
    res.status(500).json({ error: 'Failed to fetch searches' });
  }
});

// Get single search by ID
app.get('/api/searches/:id', (req, res) => {
  try {
    const search = db.prepare('SELECT * FROM searches WHERE id = ?').get(req.params.id);
    
    if (!search) {
      return res.status(404).json({ error: 'Search not found' });
    }

    const parsed = {
      ...search,
      generations: JSON.parse((search as any).generations || '[]'),
      sourcesType: JSON.parse((search as any).sourcesType || '[]'),
      results: JSON.parse((search as any).results)
    };

    res.json(parsed);
  } catch (error) {
    console.error('Error fetching search:', error);
    res.status(500).json({ error: 'Failed to fetch search' });
  }
});

// Delete search
app.delete('/api/searches/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM searches WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting search:', error);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});

app.listen(PORT, () => {
  console.log(`🗄️ Admin server running at http://localhost:${PORT}`);
  console.log(`📊 View searches at http://localhost:${PORT}/admin`);
});
