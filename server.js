import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase with service key
const SUPABASE_URL = 'https://gbvcxpjfncxnsutnpsfm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  global: {
    fetch
  }
});

// Admin routes
app.delete('/api/profiles/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`Attempting to delete profile with ID: ${id}`);

    const { data, error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      console.error('Delete error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('Delete successful:', data);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Admin server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});