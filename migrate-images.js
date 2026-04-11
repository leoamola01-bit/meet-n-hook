import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://gbvcxpjfncxnsutnpsfm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  fetch
});

function base64ToUint8Array(base64) {
  const [, mime, data] = base64.match(/^data:(.*?);base64,(.*)$/) || [];
  if (!data) throw new Error('Invalid base64 string');
  const binary = Buffer.from(data, 'base64');
  return { mime, buffer: binary };
}

async function uploadFile(bucket, path, buffer, contentType, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, {
          contentType,
          upsert: true
        });

      if (error) throw error;

      const { data, error: urlError } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);

      if (urlError) throw urlError;
      return data.publicUrl;
    } catch (error) {
      console.log(`Upload attempt ${attempt}/${retries} failed for ${path}:`, error.message);
      if (attempt === retries) throw error;
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function migrateProfiles() {
  const { data: rows, error } = await supabase
    .from('profiles')
    .select('id,image_url1,image_url2,image_url3,image_url4,image_url5')
    .or('image_url1.like.data:%,image_url2.like.data:%,image_url3.like.data:%,image_url4.like.data:%,image_url5.like.data:%')
    .limit(100);

  if (error) throw error;
  if (!rows.length) {
    console.log('No base64 image profiles found.');
    return;
  }

  console.log(`Found ${rows.length} profiles with base64 images to migrate.`);

  let successCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      const updates = {};
      const uploads = [];

      for (let i = 1; i <= 5; i++) {
        const field = `image_url${i}`;
        const value = row[field];
        if (typeof value === 'string' && value.startsWith('data:')) {
          const { mime, buffer } = base64ToUint8Array(value);
          const ext = mime.split('/')[1].split('+')[0] || 'jpg';
          const path = `profiles/${row.id}/${Date.now()}-${i}.${ext}`;
          uploads.push(
            uploadFile('images', path, buffer, mime)
              .then((publicUrl) => ({ field, publicUrl }))
          );
        }
      }

      const uploaded = await Promise.all(uploads);

      for (const item of uploaded) {
        updates[item.field] = item.publicUrl;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', row.id);

        if (updateError) throw updateError;
        console.log(`✅ Migrated profile ${row.id}: ${Object.keys(updates).length} images`);
        successCount++;
      }
    } catch (error) {
      console.error(`❌ Failed to migrate profile ${row.id}:`, error.message);
      errorCount++;
    }
  }

  console.log(`\nMigration summary:`);
  console.log(`✅ Successfully migrated: ${successCount} profiles`);
  console.log(`❌ Failed to migrate: ${errorCount} profiles`);
  console.log(`Migration finished.`);
}

migrateProfiles().catch((err) => {
  console.error('Migration initialization failed:', err);
  process.exit(1);
});