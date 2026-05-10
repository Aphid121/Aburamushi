const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
const JSZip = require('jszip');

// Initialize SQLite Database
const dbPath = path.join(app.getPath('userData'), 'aburamushi_profile.db');
const db = new Database(dbPath);

// Migration: Add temp_dir column if it doesn't exist
try {
  db.prepare('ALTER TABLE library_manga ADD COLUMN temp_dir TEXT').run();
} catch (err) {
  // Ignore error if column already exists
}

// Migration: Add llm_memory table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS llm_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    created_at INTEGER
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_words (
    term TEXT,
    reading TEXT,
    status TEXT, -- 'new', 'learning', 'known', 'banned', 'non_japanese'
    lookup_count INTEGER DEFAULT 0,
    last_lookup INTEGER,
    context_sentence TEXT,
    PRIMARY KEY (term, reading)
  );
  
  CREATE TABLE IF NOT EXISTS dict_terms (
    dictionary_id TEXT,
    term TEXT,
    reading TEXT,
    definition TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_dict_term ON dict_terms(term);
  CREATE INDEX IF NOT EXISTS idx_dict_reading ON dict_terms(reading);
  
  CREATE TABLE IF NOT EXISTS dictionaries (
    id TEXT PRIMARY KEY,
    title TEXT,
    term_count INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS library_manga (
    id TEXT PRIMARY KEY,
    title TEXT,
    path TEXT,
    temp_dir TEXT,
    cover_image TEXT,
    total_pages INTEGER,
    processed_pages INTEGER,
    status TEXT, -- 'processing', 'ready', 'error'
    last_read_page INTEGER DEFAULT 0
  );
  
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  
  CREATE TABLE IF NOT EXISTS llm_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    created_at INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS manga_chats (
    id TEXT PRIMARY KEY,
    manga_id TEXT,
    title TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY(manga_id) REFERENCES library_manga(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT,
    role TEXT,
    content TEXT,
    created_at INTEGER,
    FOREIGN KEY(chat_id) REFERENCES manga_chats(id) ON DELETE CASCADE
  );
  
      CREATE TABLE IF NOT EXISTS sticky_notes (
        id TEXT PRIMARY KEY,
        manga_id TEXT,
        page_idx INTEGER,
        local_x REAL,
        local_y REAL,
        width REAL,
        height REAL,
        color TEXT,
        content TEXT,
        updated_at INTEGER,
        FOREIGN KEY(manga_id) REFERENCES library_manga(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS strokes (
        id TEXT PRIMARY KEY,
        manga_id TEXT,
        page_idx INTEGER,
        note_id TEXT,
        brush_type TEXT,
        color TEXT,
        size REAL,
        opacity REAL,
        hardness REAL,
        points TEXT,
        FOREIGN KEY(manga_id) REFERENCES library_manga(id) ON DELETE CASCADE,
        FOREIGN KEY(note_id) REFERENCES sticky_notes(id) ON DELETE CASCADE
      );

  CREATE TABLE IF NOT EXISTS quiz_cache (
    term TEXT,
    reading TEXT,
    translation TEXT,
    mode TEXT,
    response_json TEXT,
    created_at INTEGER,
    PRIMARY KEY (term, reading, translation, mode)
  );

  CREATE TABLE IF NOT EXISTS quiz_stats (
    term TEXT,
    reading TEXT,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    last_tested INTEGER,
    PRIMARY KEY (term, reading)
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('llm_endpoint', 'http://localhost:5001/api/v1/generate');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('quiz_guess_mode', 'false');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('quiz_ai_sentences', 'false');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_needs_work', 'true');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('max_strikes', '5');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('strike_decay_minutes', '1440');
`);

// Add context_sentence column if it doesn't exist (for older databases)
try {
  db.exec('ALTER TABLE user_words ADD COLUMN context_sentence TEXT;');
} catch (e) {}

try {
  db.exec('ALTER TABLE user_words ADD COLUMN mastered_at INTEGER;');
} catch (e) {}

// --- IPC Handlers ---

ipcMain.handle('get-word-info', (event, term, reading) => {
  let userWord = db.prepare('SELECT * FROM user_words WHERE term = ?').get(term);
  if (!userWord) {
    userWord = { term, reading, status: 'seen', lookup_count: 0 };
  }

  // Retrieve definitions from all active dictionaries.
  // Search by term or reading to support kana-only lookups.
  // Prioritize exact matches for performance.
  const exactDefs = db.prepare(`
    SELECT d.title as dict_title, dt.definition 
    FROM dict_terms dt
    LEFT JOIN dictionaries d ON dt.dictionary_id = d.id
    WHERE dt.term = ? OR dt.reading = ?
  `).all(term, term);
  
  return { userWord, definitions: exactDefs };
});

ipcMain.handle('record-lookup', (event, term, reading, contextSentence) => {
  // Auto-detect non-Japanese/punctuation and prevent recording
  const isJapaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\u3005]/;
  if (!isJapaneseRegex.test(term)) {
    return { success: true, status: 'non_japanese', count: 0 };
  }

  const settingsRows = db.prepare("SELECT key, value FROM settings WHERE key IN ('auto_needs_work', 'max_strikes', 'strike_decay_minutes')").all();
  const settingsMap = {};
  for (const row of settingsRows) {
    settingsMap[row.key] = row.value;
  }
  
  const autoNeedsWork = settingsMap['auto_needs_work'] === 'true';
  const maxStrikes = parseInt(settingsMap['max_strikes'] || '5', 10);
  const decayMinutes = parseInt(settingsMap['strike_decay_minutes'] || '1440', 10);

  const now = Date.now();
  const decayMs = decayMinutes * 60 * 1000;

  let finalStatus = 'seen';
  let finalCount = 1;

  db.transaction(() => {
    let word = db.prepare('SELECT * FROM user_words WHERE term = ?').get(term);
    
    if (!word) {
      // First lookup
      db.prepare(`
        INSERT INTO user_words (term, reading, status, lookup_count, last_lookup, context_sentence)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run(term, reading, 'seen', now, contextSentence || null);
      finalStatus = 'seen';
      finalCount = 1;
    } else {
      // Existing word
      let newCount = word.lookup_count || 0;
      let newStatus = word.status;
      
      // Apply strike decay based on the configured decay rate
      if (word.last_lookup && decayMs > 0) {
        const periodsPassed = Math.floor((now - word.last_lookup) / decayMs);
        if (periodsPassed > 0) {
          newCount = Math.max(0, newCount - periodsPassed);
        }
      }
      
      // Increment the lookup strike count.
      newCount += 1;
      
      // Automatically promote the word to 'learning' status if the strike threshold is met.
      if (autoNeedsWork && newCount >= maxStrikes) {
        newStatus = 'learning';
      }
      
      db.prepare(`
        UPDATE user_words 
        SET lookup_count = ?, last_lookup = ?, status = ?, context_sentence = COALESCE(?, context_sentence)
        WHERE term = ?
      `).run(newCount, now, newStatus, contextSentence || null, term);
      
      finalStatus = newStatus;
      finalCount = newCount;
    }
  })();
  
  return { success: true, status: finalStatus, count: finalCount };
});

ipcMain.handle('update-word-status', (event, term, reading, status, contextSentence) => {
  // Prevent updating status for non-Japanese words
  const isJapaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\u3005]/;
  if (!isJapaneseRegex.test(term) && status !== 'non_japanese') {
    return false;
  }

  // If marking as known, clear strikes (lookup_count = 0) and set mastered_at
  const lookupCount = status === 'known' ? 0 : 1;
  const masteredAt = status === 'known' ? Date.now() : null;
  
  db.prepare(`
    INSERT INTO user_words (term, reading, status, lookup_count, last_lookup, context_sentence, mastered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(term, reading) DO UPDATE SET
      status = excluded.status,
      lookup_count = excluded.lookup_count,
      last_lookup = excluded.last_lookup,
      context_sentence = COALESCE(excluded.context_sentence, context_sentence),
      mastered_at = COALESCE(excluded.mastered_at, mastered_at)
  `).run(term, reading, status, lookupCount, Date.now(), contextSentence || null, masteredAt);
  return true;
});

ipcMain.handle('search-dictionary', (event, query) => {
  if (!query || query.trim() === '') return [];
  
  const searchTerm = query.trim();
  
  // Perform a search for exact or partial matches in terms and readings.
  // Limit results to 50 to maintain UI responsiveness.
  const results = db.prepare(`
    SELECT dt.term, dt.reading, dt.definition, d.title as dict_title
    FROM dict_terms dt
    LEFT JOIN dictionaries d ON dt.dictionary_id = d.id
    WHERE dt.term LIKE ? OR dt.reading LIKE ?
    LIMIT 50
  `).all(`%${searchTerm}%`, `%${searchTerm}%`);
  
  // Group by term and reading
  const grouped = {};
  for (const r of results) {
    const key = `${r.term}|${r.reading}`;
    if (!grouped[key]) {
      grouped[key] = {
        term: r.term,
        reading: r.reading,
        definitions: []
      };
    }
    grouped[key].definitions.push({
      dict_title: r.dict_title,
      definition: r.definition
    });
  }
  
  return Object.values(grouped);
});

ipcMain.handle('get-word-statuses', (event, terms) => {
  if (!terms || terms.length === 0) return {};

  const placeholders = terms.map(() => '?').join(',');
  const query = `SELECT term, status, last_lookup FROM user_words WHERE term IN (${placeholders})`;
  const results = db.prepare(query).all(...terms);
  
  const statusMap = {};
  for (const r of results) {
    statusMap[r.term] = r.status;
  }
  return statusMap;
});

ipcMain.handle('import-dictionary', async (event) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import Yomitan Dictionary',
    properties: ['openFile'],
    filters: [{ name: 'Yomitan Dictionary (ZIP)', extensions: ['zip'] }]
  });
  
  if (canceled || filePaths.length === 0) return { success: false };

  try {
    const zipPath = filePaths[0];
    const data = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(data);

    let title = path.basename(zipPath, '.zip');
    
    // Attempt to extract the dictionary title from index.json.
    if (zip.files['index.json']) {
      const indexContent = await zip.files['index.json'].async('string');
      const indexData = JSON.parse(indexContent);
      if (indexData.title) title = indexData.title;
    }

    const dictId = crypto.randomUUID();
    const termBanks = [];
    const kanjiBanks = [];
    
    for (const filename of Object.keys(zip.files)) {
      if (filename.startsWith('term_bank_') && filename.endsWith('.json')) {
        const content = await zip.files[filename].async('string');
        termBanks.push(JSON.parse(content));
      } else if (filename.startsWith('kanji_bank_') && filename.endsWith('.json')) {
        const content = await zip.files[filename].async('string');
        kanjiBanks.push(JSON.parse(content));
      }
    }

    const insert = db.prepare('INSERT INTO dict_terms (dictionary_id, term, reading, definition) VALUES (?, ?, ?, ?)');
    
    const insertMany = db.transaction((tBanks, kBanks) => {
      // Process term banks
      for (const bank of tBanks) {
        for (const entry of bank) {
          // Yomitan term format: [term, reading, tags, rules, score, dictionary_entries, ...]
          const term = entry[0];
          const reading = entry[1];
          const definition = JSON.stringify(entry[5]);
          insert.run(dictId, term, reading, definition);
        }
      }
      
      // Process kanji banks
      for (const bank of kBanks) {
        for (const entry of bank) {
          // Yomitan kanji format: [character, onyomi, kunyomi, tags, meanings, ...]
          const term = entry[0];
          const reading = entry[1] || entry[2] || ""; // Use onyomi or kunyomi as reading
          
          // Format the kanji definition for structured display.
          const meanings = entry[4] || [];
          const defObj = [
            {
              type: "structured-content",
              content: [
                { tag: "div", content: `Onyomi: ${entry[1] || "None"}` },
                { tag: "div", content: `Kunyomi: ${entry[2] || "None"}` },
                { tag: "div", content: `Meanings: ${typeof meanings === 'string' ? meanings : meanings.join(', ')}` }
              ]
            }
          ];
          
          // Insert the term as both term and reading to facilitate easier lookup.
          insert.run(dictId, term, term, JSON.stringify(defObj));
        }
      }
    });

    insertMany(termBanks, kanjiBanks);
    const totalImported = termBanks.reduce((acc, b) => acc + b.length, 0) + kanjiBanks.reduce((acc, b) => acc + b.length, 0);
    
    db.prepare('INSERT INTO dictionaries (id, title, term_count) VALUES (?, ?, ?)').run(dictId, title, totalImported);
    
    return { success: true, count: totalImported, dictionary: { id: dictId, title, term_count: totalImported } };
  } catch (err) {
    console.error("Dictionary import failed:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-dictionaries', () => {
  return db.prepare('SELECT * FROM dictionaries ORDER BY title ASC').all();
});

ipcMain.handle('remove-dictionary', (event, id) => {
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM dict_terms WHERE dictionary_id = ?').run(id);
      db.prepare('DELETE FROM dictionaries WHERE id = ?').run(id);
    })();
    return { success: true };
  } catch (err) {
    console.error("Failed to remove dictionary:", err);
    return { success: false, error: err.message };
  }
});

const { spawn } = require('child_process');
const crypto = require('crypto');

ipcMain.handle('get-library', () => {
  return db.prepare('SELECT * FROM library_manga ORDER BY title ASC').all();
});

// Keep track of active CLI processes so we can kill them if the user removes the manga
const activeProcesses = new Map();

ipcMain.handle('add-manga', async (event) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Add Manga',
    properties: process.platform === 'linux' || process.platform === 'win32' ? ['openFile'] : ['openFile', 'openDirectory'],
    filters: [
      { name: 'Manga Archives', extensions: ['zip', 'cbz', 'abms'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || filePaths.length === 0) return { success: false };

  const inputPath = filePaths[0];
  const title = path.basename(inputPath, path.extname(inputPath));
  const id = crypto.randomUUID();
  
  // Create a dedicated library folder if it doesn't exist
  const libraryDir = path.join(app.getPath('userData'), 'manga_library');
  if (!fs.existsSync(libraryDir)) {
    fs.mkdirSync(libraryDir, { recursive: true });
  }
  
  const outputPath = path.join(libraryDir, `${id}.abms`);

  // If the user selected an already processed .abms file, just copy it and mark as ready
  if (inputPath.toLowerCase().endsWith('.abms')) {
    fs.copyFileSync(inputPath, outputPath);
    
    // We need to read the json to get the total pages
    let totalPages = 0;
    try {
      const data = fs.readFileSync(outputPath);
      const zip = await JSZip.loadAsync(data);
      const jsonText = await zip.files['aburamushi.json'].async('string');
      const mangaData = JSON.parse(jsonText);
      totalPages = mangaData.pages ? mangaData.pages.length : 0;
    } catch (e) {
      console.error("Failed to read imported .abms file:", e);
    }

    db.prepare(`
      INSERT INTO library_manga (id, title, path, temp_dir, total_pages, processed_pages, status)
      VALUES (?, ?, ?, NULL, ?, ?, 'ready')
    `).run(id, title, outputPath, totalPages, totalPages);
    
    // Auto-extract cover
    try {
      const data = fs.readFileSync(outputPath);
      const zip = await JSZip.loadAsync(data);
      const jsonText = await zip.files['aburamushi.json'].async('string');
      const mangaData = JSON.parse(jsonText);
      
      if (mangaData.pages && mangaData.pages.length > 0) {
        let coverPage = null;
        let cropMode = 'none';
        
        for (const page of mangaData.pages) {
          const imgFile = zip.files[page.image];
          if (!imgFile) continue;
          
          const buffer = await imgFile.async('nodebuffer');
          const tempImgPath = path.join(app.getPath('temp'), `temp_dim_check_${id}.jpg`);
          fs.writeFileSync(tempImgPath, buffer);
          
          const dimScriptPath = path.join(app.getPath('temp'), 'get_dims.py');
          fs.writeFileSync(dimScriptPath, `
import sys
import cv2
img = cv2.imread(sys.argv[1])
if img is not None:
    print(f"{img.shape[1]},{img.shape[0]}")
          `);
          
          const pythonBin = path.join(__dirname, '../cli/venv/bin/python');
          let w = 0, h = 0;
          try {
            const dimsOutput = require('child_process').execSync(`"${pythonBin}" "${dimScriptPath}" "${tempImgPath}"`).toString().trim();
            if (dimsOutput) {
              const parts = dimsOutput.split(',');
              w = parseInt(parts[0], 10);
              h = parseInt(parts[1], 10);
            }
          } catch (e) {
            console.error("Failed to get dimensions:", e);
          }
          
          try { fs.unlinkSync(tempImgPath); } catch(e) {}
          
          if (w > h) {
            coverPage = page;
            cropMode = 'cover_right';
            break;
          } else if (!coverPage) {
            coverPage = page;
          }
        }
        
        if (coverPage) {
          const imgFile = zip.files[coverPage.image];
          if (imgFile) {
            const buffer = await imgFile.async('nodebuffer');
            const tempPath = path.join(app.getPath('temp'), `temp_cover_${id}.jpg`);
            fs.writeFileSync(tempPath, buffer);
            
            const cropScriptPath = path.join(app.getPath('temp'), 'crop_cover.py');
            fs.writeFileSync(cropScriptPath, `
import sys
import cv2
img = cv2.imread(sys.argv[1])
if img is not None:
    if sys.argv[3] == 'cover_right':
        h, w = img.shape[:2]
        img = img[:, w//2:]
    cv2.imwrite(sys.argv[2], img)
`);
            
            const finalCoverPath = path.join(libraryDir, `${id}_cover.jpg`);
            const pythonBin = path.join(__dirname, '../cli/venv/bin/python');
            require('child_process').execSync(`"${pythonBin}" "${cropScriptPath}" "${tempPath}" "${finalCoverPath}" "${cropMode}"`);
            
            db.prepare('UPDATE library_manga SET cover_image = ? WHERE id = ?').run(finalCoverPath, id);
          }
        }
      }
    } catch (err) {
      console.error("Failed to auto-extract cover:", err);
    }
    
    // Send a final progress event to tell the UI it's ready
    const current = db.prepare('SELECT total_pages, processed_pages FROM library_manga WHERE id = ?').get(id);
    if (event.sender) {
      event.sender.send('manga-progress', { id, total_pages: current.total_pages, processed_pages: current.processed_pages, status: 'ready' });
    }
    
    return { success: true };
  }

  // Insert initial 'processing' state into DB
  db.prepare(`
    INSERT INTO library_manga (id, title, path, temp_dir, total_pages, processed_pages, status)
    VALUES (?, ?, ?, NULL, 0, 0, 'processing')
  `).run(id, title, outputPath);

  // Start the Python CLI process
  const cliScript = path.join(__dirname, '../cli/aburamushi_prep.py');
  
  // We need to run it in the venv
  const pythonBin = path.join(__dirname, '../cli/venv/bin/python');
  
  // Check if pythonBin exists
  if (!fs.existsSync(pythonBin)) {
    console.error(`[CLI Error]: Python binary not found at ${pythonBin}`);
    db.prepare('UPDATE library_manga SET status = ? WHERE id = ?').run('error', id);
    event.sender.send('manga-progress', { id, status: 'error' });
    return;
  }
  
  const cliProcess = spawn(pythonBin, [cliScript, inputPath, '-o', outputPath]);
  activeProcesses.set(id, cliProcess);

  // Parse stdout to update progress
  cliProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[CLI]: ${output}`);
    
    const tempDirMatch = output.match(/\[\*\] TEMP_DIR: (.*)/);
    if (tempDirMatch) {
      const tempDir = tempDirMatch[1].trim();
      db.prepare('UPDATE library_manga SET temp_dir = ? WHERE id = ?').run(tempDir, id);
    }
    
    // The CLI currently outputs: "[*] Found X images to process."
    const foundMatch = output.match(/Found (\d+) images to process/);
    if (foundMatch) {
      const total = parseInt(foundMatch[1], 10);
      db.prepare('UPDATE library_manga SET total_pages = ? WHERE id = ?').run(total, id);
      event.sender.send('manga-progress', { id, total_pages: total, processed_pages: 0 });
    }

    // The CLI currently outputs: "[*] Processing filename.jpg..."
    // We can count these to track progress
    if (output.includes('[*] Processing ') && !output.includes('Processing complete')) {
      db.prepare('UPDATE library_manga SET processed_pages = processed_pages + 1 WHERE id = ?').run(id);
      const current = db.prepare('SELECT total_pages, processed_pages FROM library_manga WHERE id = ?').get(id);
      event.sender.send('manga-progress', { id, total_pages: current.total_pages, processed_pages: current.processed_pages });
    }
  });

  cliProcess.stderr.on('data', (data) => {
    console.error(`[CLI Error]: ${data}`);
  });

  cliProcess.on('close', async (code, signal) => {
    activeProcesses.delete(id);
    console.log(`CLI process exited with code ${code} and signal ${signal}`);
    
    // If the process was killed (e.g. by the user closing the app or cancelling), mark it as error
    if (signal === 'SIGINT' || signal === 'SIGTERM' || code !== 0) {
      db.prepare('UPDATE library_manga SET status = ? WHERE id = ?').run('error', id);
      event.sender.send('manga-progress', { id, status: 'error' });
      return;
    }
    
    if (code === 0 && !signal) {
      db.prepare('UPDATE library_manga SET status = ? WHERE id = ?').run('ready', id);
      event.sender.send('manga-progress', { id, status: 'ready' });
      
      // Auto-extract cover
      try {
        const data = fs.readFileSync(outputPath);
        const zip = await JSZip.loadAsync(data);
        const jsonText = await zip.files['aburamushi.json'].async('string');
        const mangaData = JSON.parse(jsonText);
        
        if (mangaData.pages && mangaData.pages.length > 0) {
          // Hierarchy: Full Cover > Single Page
          let coverPage = null;
          let cropMode = 'none'; // 'none', 'cover_right'
          
          for (const page of mangaData.pages) {
            // The page object in aburamushi.json doesn't have w and h!
            // We need to get the dimensions from the image file itself
            const imgFile = zip.files[page.image];
            if (!imgFile) continue;
            
            // We can't easily get dimensions without reading the whole buffer and parsing it
            // But wait, we can just read the first few pages and check their dimensions
            const buffer = await imgFile.async('nodebuffer');
            const tempImgPath = path.join(app.getPath('temp'), `temp_dim_check_${id}.jpg`);
            fs.writeFileSync(tempImgPath, buffer);
            
            const dimScriptPath = path.join(app.getPath('temp'), 'get_dims.py');
            fs.writeFileSync(dimScriptPath, `
import sys
import cv2
img = cv2.imread(sys.argv[1])
if img is not None:
    print(f"{img.shape[1]},{img.shape[0]}")
else:
    print("0,0")
`);
            
            const { execSync } = require('child_process');
            const pythonBin = path.join(__dirname, '../cli/venv/bin/python');
            let w = 0, h = 0;
            try {
              const output = execSync(`"${pythonBin}" "${dimScriptPath}" "${tempImgPath}"`).toString().trim();
              const parts = output.split(',');
              w = parseInt(parts[0], 10);
              h = parseInt(parts[1], 10);
            } catch (e) {
              console.error("Failed to get dimensions:", e);
            }
            
            try { fs.unlinkSync(tempImgPath); } catch(e) {}
            
            if (w === 0 || h === 0) continue;
            
            const ratio = w / h;
            
            // Full cover with spine (e.g. 2423x1600 -> ~1.51)
            if (ratio >= 1.45 && ratio <= 1.6) {
              coverPage = page;
              cropMode = 'cover_left';
              break; // Best match, stop looking
            }
            
            // Standard single page (e.g. 1066x1600 -> ~0.66)
            if (ratio >= 0.6 && ratio <= 0.8 && !coverPage) {
              coverPage = page;
              cropMode = 'none';
              // Continue searching for a potential full-page cover.
            }
            
          // Limit cover search to the first five pages to optimize performance.
          if (mangaData.pages.indexOf(page) >= 4 && coverPage) {
              break;
            }
          }
          
          // Fallback to the very first page if nothing matched
          if (!coverPage) {
            coverPage = mangaData.pages[0];
            cropMode = 'none';
          }
          
          const imgFile = zip.files[coverPage.image];
          if (imgFile) {
            const buffer = await imgFile.async('nodebuffer');
            
            const coverDir = path.join(app.getPath('userData'), 'manga_covers');
            if (!fs.existsSync(coverDir)) {
              fs.mkdirSync(coverDir, { recursive: true });
            }
            
            const newCoverPath = path.join(coverDir, `${id}.jpg`);
            
            const tempImgPath = path.join(app.getPath('temp'), `temp_cover_${id}.jpg`);
            fs.writeFileSync(tempImgPath, buffer);
            
            const cropScriptPath = path.join(app.getPath('temp'), 'auto_crop.py');
            fs.writeFileSync(cropScriptPath, `
import sys
import cv2

img_path = sys.argv[1]
out_path = sys.argv[2]
crop_mode = sys.argv[3]

img = cv2.imread(img_path)
if img is not None:
    h, w = img.shape[:2]
    
    if (crop_mode == 'cover_left'):
        # Extract the leftmost portion of the image for the front cover, following standard manga cover layouts.
        target_w = int(h * 0.666)
        img = img[:, :target_w]
    
    # Resize the cropped image to 600x900, applying an initial crop to maintain the target aspect ratio.
    target_ratio = 600 / 900
    current_ratio = img.shape[1] / img.shape[0]
    
    if current_ratio > target_ratio:
        # Image is too wide, crop the sides
        new_w = int(img.shape[0] * target_ratio)
        offset = (img.shape[1] - new_w) // 2
        img = img[:, offset:offset+new_w]
    elif current_ratio < target_ratio:
        # Image is too tall, crop the top/bottom
        new_h = int(img.shape[1] / target_ratio)
        offset = (img.shape[0] - new_h) // 2
        img = img[offset:offset+new_h, :]
        
    # Perform final resize to target dimensions.
    img = cv2.resize(img, (600, 900))
    cv2.imwrite(out_path, img)
    print("SUCCESS")
else:
    print("FAILED")
    sys.exit(1)
`);
            
            const { exec } = require('child_process');
            const pythonBin = path.join(__dirname, '../cli/venv/bin/python');
            exec(`"${pythonBin}" "${cropScriptPath}" "${tempImgPath}" "${newCoverPath}" ${cropMode}`, (error) => {
              try { fs.unlinkSync(tempImgPath); } catch(e) {}
              if (!error) {
                db.prepare('UPDATE library_manga SET cover_image = ? WHERE id = ?').run(newCoverPath, id);
                // Tell the frontend to refresh the library
                event.sender.send('manga-progress', { id, cover_image: newCoverPath });
              }
            });
          }
        }
      } catch (err) {
        console.error("Auto-cover extraction failed:", err);
      }
      
    } else {
      db.prepare('UPDATE library_manga SET status = ? WHERE id = ?').run('error', id);
      event.sender.send('manga-progress', { id, status: 'error' });
    }
  });

  return { success: true, id };
});

ipcMain.handle('remove-manga', async (event, id) => {
  try {
    // Terminate the active CLI process if it is currently running.
    if (activeProcesses.has(id)) {
      const proc = activeProcesses.get(id);
      proc.kill('SIGINT');
      activeProcesses.delete(id);
    }
    
    const manga = db.prepare('SELECT path, temp_dir FROM library_manga WHERE id = ?').get(id);
    if (manga) {
      if (manga.path && fs.existsSync(manga.path)) {
        fs.unlinkSync(manga.path);
      }
      if (manga.temp_dir && fs.existsSync(manga.temp_dir)) {
        fs.rmSync(manga.temp_dir, { recursive: true, force: true });
      }
    }
    db.prepare('DELETE FROM library_manga WHERE id = ?').run(id);
    return { success: true };
  } catch (err) {
    console.error("Failed to remove manga:", err);
    return { success: false, error: err.message };
  }
});

let activeZip = null;
let activeZipId = null;

ipcMain.handle('load-manga', async (event, id) => {
  try {
    const manga = db.prepare('SELECT path, temp_dir, status, last_read_page FROM library_manga WHERE id = ?').get(id);
    if (!manga) throw new Error("Manga not found in database");
    
    let mangaData;
    
    if (manga.status === 'processing' && manga.temp_dir) {
      // Read from temp directory
      const jsonPath = path.join(manga.temp_dir, 'aburamushi.json');
      if (!fs.existsSync(jsonPath)) throw new Error("Manga data not ready yet");
      
      const jsonText = fs.readFileSync(jsonPath, 'utf-8');
      mangaData = JSON.parse(jsonText);
      
      // Images will be read directly from the filesystem; activeZip is not required.
      activeZip = null;
      activeZipId = id;
    } else {
      // Read from zip
      if (!fs.existsSync(manga.path)) throw new Error("Manga file not found");
      
      const data = fs.readFileSync(manga.path);
      activeZip = await JSZip.loadAsync(data);
      activeZipId = id;
      
      const jsonText = await activeZip.files['aburamushi.json'].async('string');
      mangaData = JSON.parse(jsonText);
    }
    
    return { success: true, data: mangaData, lastReadPage: manga.last_read_page || 0 };
  } catch (err) {
    console.error("Failed to load manga:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-manga-data', async (event, id, mangaData) => {
  try {
    const manga = db.prepare('SELECT path, temp_dir, status FROM library_manga WHERE id = ?').get(id);
    if (!manga) throw new Error("Manga not found");

    const jsonString = JSON.stringify(mangaData, null, 2);

    if (manga.status === 'processing' && manga.temp_dir) {
      const jsonPath = path.join(manga.temp_dir, 'aburamushi.json');
      fs.writeFileSync(jsonPath, jsonString);
    } else {
      // Update zip
      const data = fs.readFileSync(manga.path);
      const zip = await JSZip.loadAsync(data);
      zip.file('aburamushi.json', jsonString);
      
      const newZipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      fs.writeFileSync(manga.path, newZipBuffer);
    }
    return { success: true };
  } catch (err) {
    console.error("Failed to save manga data:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-manga-image', async (event, imageName) => {
  try {
    if (!activeZipId) throw new Error("No active manga loaded");
    
    if (activeZip) {
      // Read from zip
      const imgFile = activeZip.files[imageName];
      if (!imgFile) throw new Error(`Image ${imageName} not found in archive`);
      
      const buffer = await imgFile.async('nodebuffer');
      return { success: true, buffer };
    } else {
      // Read from temp dir
      const manga = db.prepare('SELECT temp_dir FROM library_manga WHERE id = ?').get(activeZipId);
      if (!manga || !manga.temp_dir) throw new Error("Temp dir not found");
      
      const imgPath = path.join(manga.temp_dir, imageName);
      if (!fs.existsSync(imgPath)) throw new Error(`Image ${imageName} not found in temp dir`);
      
      const buffer = fs.readFileSync(imgPath);
      return { success: true, buffer };
    }
  } catch (err) {
    console.error("Failed to get image:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('update-last-read', (event, id, pageIndex) => {
  db.prepare('UPDATE library_manga SET last_read_page = ? WHERE id = ?').run(pageIndex, id);
  return true;
});

ipcMain.handle('get-settings', () => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
});

ipcMain.handle('update-setting', (event, key, value) => {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  return true;
});

ipcMain.handle('ban-user-word', (event, term, reading) => {
  try {
    db.prepare(`
      INSERT INTO user_words (term, reading, status, lookup_count, last_lookup)
      VALUES (?, ?, 'banned', 0, ?)
      ON CONFLICT(term, reading) DO UPDATE SET
        status = 'banned',
        lookup_count = 0,
        last_lookup = ?
    `).run(term, reading, Date.now(), Date.now());
    return { success: true };
  } catch (error) {
    console.error('Error banning user word:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mark-non-japanese', (event, term, reading) => {
  try {
    db.prepare(`
      INSERT INTO user_words (term, reading, status, lookup_count, last_lookup)
      VALUES (?, ?, 'non_japanese', 0, ?)
      ON CONFLICT(term, reading) DO UPDATE SET
        status = 'non_japanese',
        lookup_count = 0,
        last_lookup = ?
    `).run(term, reading, Date.now(), Date.now());
    return { success: true };
  } catch (error) {
    console.error('Error marking non-japanese word:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-all-user-words', (event) => {
  try {
    const stmt = db.prepare('SELECT * FROM user_words ORDER BY last_lookup DESC');
    return stmt.all();
  } catch (error) {
    console.error('Error getting all user words:', error);
    return [];
  }
});

ipcMain.handle('delete-user-word', (event, term, reading) => {
  try {
    const stmt = db.prepare('DELETE FROM user_words WHERE term = ? AND reading = ?');
    stmt.run(term, reading);
    return { success: true };
  } catch (error) {
    console.error('Error deleting user word:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-words-by-status', (event, status) => {
  return db.prepare('SELECT * FROM user_words WHERE status = ?').all(status);
});

ipcMain.handle('get-random-dictionary-word', (event) => {
  // Get a random word that isn't already in user_words (or is 'new')
  return db.prepare(`
    SELECT dt.term, dt.reading, dt.definition, d.title as dict_title
    FROM dict_terms dt
    LEFT JOIN dictionaries d ON dt.dictionary_id = d.id
    WHERE dt.term NOT IN (SELECT term FROM user_words WHERE status IN ('learning', 'known'))
    ORDER BY RANDOM()
    LIMIT 1
  `).get();
});

ipcMain.handle('get-quiz-stats', (event, term, reading) => {
  return db.prepare('SELECT * FROM quiz_stats WHERE term = ? AND reading = ?').get(term, reading);
});

ipcMain.handle('get-mastery-progress', (event, days = 30) => {
  const timeAgo = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  // Get counts of words mastered per day for the specified time range
  const results = db.prepare(`
    SELECT 
      strftime('%Y-%m-%d', mastered_at / 1000, 'unixepoch') as day,
      COUNT(*) as count
    FROM user_words
    WHERE status = 'known' AND mastered_at > ?
    GROUP BY day
    ORDER BY day ASC
  `).all(timeAgo);
  
  // Also get total counts for each status
  const totals = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM user_words
    GROUP BY status
  `).all();
  
  return { daily: results, totals };
});

ipcMain.handle('analyze-image-region', async (event, imageBuffer, x, y, width, height) => {
  try {
    // Save the specified image region to a temporary file for processing.
    const tempDir = path.join(app.getPath('temp'), 'aburamushi_crops');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const tempFile = path.join(tempDir, `crop_${Date.now()}.jpg`);
    
    // Crop the image buffer using a Python/OpenCV script.
    const cropScriptPath = path.join(tempDir, 'crop.py');
    fs.writeFileSync(cropScriptPath, `
import sys
import cv2
import numpy as np

img_path = sys.argv[1]
out_path = sys.argv[2]
x, y, w, h = map(int, sys.argv[3:7])

img = cv2.imread(img_path)
if img is not None:
    crop = img[y:y+h, x:x+w]
    cv2.imwrite(out_path, crop)
    print("SUCCESS")
else:
    print("FAILED")
    sys.exit(1)
`);

    const fullImgPath = path.join(tempDir, `full_${Date.now()}.jpg`);
    fs.writeFileSync(fullImgPath, imageBuffer);

    await new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      const pythonBin = path.join(__dirname, '../cli/venv/bin/python');
      exec(`"${pythonBin}" "${cropScriptPath}" "${fullImgPath}" "${tempFile}" ${Math.round(x)} ${Math.round(y)} ${Math.round(width)} ${Math.round(height)}`, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });

    // Execute MangaOCR on the cropped image region.
    const ocrText = await new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      const ocrScriptPath = path.join(tempDir, 'run_ocr.py');
      fs.writeFileSync(ocrScriptPath, `
import sys
from manga_ocr import MangaOcr

mocr = MangaOcr()
text = mocr(sys.argv[1])
print(text)
`);
      
      const pythonBin = path.join(__dirname, '../cli/venv/bin/python');
      exec(`"${pythonBin}" "${ocrScriptPath}" "${tempFile}"`, (error, stdout) => {
        if (error) {
          console.error("MangaOCR Error:", error);
          resolve(""); // Fallback to empty string on error
        } else {
          resolve(stdout.trim());
        }
      });
    });

    // Clean up temp files
    try {
      fs.unlinkSync(fullImgPath);
      fs.unlinkSync(tempFile);
    } catch (e) {}

    if (!ocrText) {
      return { success: false, error: "Could not extract text from that region." };
    }

    // Return the extracted text; LLM interaction is handled in a separate process.
    return { 
      success: true, 
      extractedText: ocrText
    };

  } catch (err) {
    console.error("Analysis failed:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('chat-with-llm', async (event, messages, context) => {
  try {
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    const endpoint = settings['llm_endpoint'] || 'http://localhost:5000/v1/chat/completions';
    const modelName = settings['llm_model'] || 'gemini-2.5-pro';

    // Prepend user memory/preferences to the LLM system prompt.
    const memories = db.prepare('SELECT content FROM llm_memory ORDER BY created_at ASC').all();
    if (memories.length > 0) {
      const memoryText = "USER PREFERENCES AND MEMORY:\n" + memories.map(m => `- ${m.content}`).join('\n');
      
      if (messages.length > 0 && messages[0].role === 'system') {
        messages[0].content += '\n\n' + memoryText;
      } else {
        messages.unshift({ role: 'system', content: memoryText });
      }
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "lookup_dictionary",
          description: "Look up a Japanese word in the local dictionaries to get its reading and definition.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The Japanese word to look up (e.g., '食べる', '猫')" }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_vocabulary",
          description: "Get a list of words the user has encountered, filtered by their learning status.",
          parameters: {
            type: "object",
            properties: {
              status: { 
                type: "string", 
                enum: ["new", "learning", "known"],
                description: "The status to filter by. 'new' = seen but not studied, 'learning' = currently studying, 'known' = mastered." 
              }
            },
            required: ["status"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_page_context",
          description: "Get all the text from the current manga page to understand the context of the user's question.",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "manage_memory",
          description: "Add or remove permanent memories about the user's preferences, difficulties, or learning goals. This memory is injected into every future conversation.",
          parameters: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["add", "remove"], description: "Whether to add a new memory or remove an existing one." },
              content: { type: "string", description: "The fact to remember or forget (e.g., 'User struggles with transitive vs intransitive verbs', 'User prefers romaji over kana')." }
            },
            required: ["action", "content"]
          }
        }
      }
    ];

    // Execute an iterative loop to process potential LLM tool calls.
    let currentMessages = [...messages];
    let finalReply = "";
    let maxIterations = 5;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      
      const payload = {
        model: modelName,
        messages: currentMessages,
        max_tokens: parseInt(settings['llm_max_tokens'] || '1000', 10),
        temperature: parseFloat(settings['llm_temperature'] || '0.7'),
        top_p: parseFloat(settings['llm_top_p'] || '1.0'),
        stream: false,
        tools: tools
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`LLM API returned ${response.status}`);
      const data = await response.json();
      
      const message = data.choices?.[0]?.message;
      
      if (!message) {
        throw new Error("Could not parse LLM response.");
      }

      // Process tool execution requests from the model.
      if (message.tool_calls && message.tool_calls.length > 0) {
        currentMessages.push(message); // Add the assistant's tool call message to history
        
        for (const toolCall of message.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          let toolResult = "";
          
          try {
            if (toolCall.function.name === 'lookup_dictionary') {
              const results = db.prepare(`
                SELECT dt.term, dt.reading, dt.definition, d.title as dict_title
                FROM dict_terms dt
                LEFT JOIN dictionaries d ON dt.dictionary_id = d.id
                WHERE dt.term LIKE ? OR dt.reading LIKE ?
                LIMIT 10
              `).all(`%${args.query}%`, `%${args.query}%`);
              
              toolResult = results.length > 0 ? JSON.stringify(results) : "No results found.";
            } 
            else if (toolCall.function.name === 'get_vocabulary') {
              const results = db.prepare('SELECT term, reading, lookup_count FROM user_words WHERE status = ? LIMIT 50').all(args.status);
              toolResult = results.length > 0 ? JSON.stringify(results) : `No words found with status '${args.status}'.`;
            }
            else if (toolCall.function.name === 'get_page_context') {
              if (context && context.mangaId && context.pageIdx !== undefined) {
                try {
                  const manga = db.prepare('SELECT path, temp_dir, status FROM library_manga WHERE id = ?').get(context.mangaId);
                  if (!manga) throw new Error("Manga not found");
                  
                  let mangaData;
                  if (manga.status === 'processing' && manga.temp_dir) {
                    const jsonPath = path.join(manga.temp_dir, 'aburamushi.json');
                    mangaData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                  } else {
                    const data = fs.readFileSync(manga.path);
                    const zip = await JSZip.loadAsync(data);
                    const jsonText = await zip.files['aburamushi.json'].async('string');
                    mangaData = JSON.parse(jsonText);
                  }
                  
                  const page = mangaData.pages[context.pageIdx];
                  if (!page) throw new Error("Page not found");
                  
                  let pageText = "";
                  if (page.bubbles) {
                    for (const bubble of page.bubbles) {
                      if (bubble.raw_text) {
                        pageText += bubble.raw_text + "\n";
                      }
                    }
                  }
                  
                  toolResult = pageText ? `Text on current page:\n${pageText}` : "No text found on the current page.";
                } catch (e) {
                  toolResult = `Error getting page context: ${e.message}`;
                }
              } else {
                toolResult = "Error: No page context provided by the frontend.";
              }
            }
            else if (toolCall.function.name === 'manage_memory') {
              if (args.action === 'add') {
                db.prepare('INSERT INTO llm_memory (content, created_at) VALUES (?, ?)').run(args.content, Date.now());
                toolResult = "Memory added successfully.";
              } else if (args.action === 'remove') {
                const res = db.prepare('DELETE FROM llm_memory WHERE content LIKE ?').run(`%${args.content}%`);
                toolResult = res.changes > 0 ? "Memory removed successfully." : "Memory not found.";
              }
            }
            else {
              toolResult = `Unknown tool: ${toolCall.function.name}`;
            }
          } catch (e) {
            toolResult = `Error executing tool: ${e.message}`;
          }
          
          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: toolResult
          });
        }
        // Append tool results to the message history for the next model iteration.
      } else {
        // Terminate loop and return the final model response.
        finalReply = message.content || "";
        break;
      }
    }

    return { success: true, reply: finalReply };
  } catch (err) {
    console.error("Chat failed:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('evaluate-translation', async (event, term, reading, translation, mode, contextSentence) => {
  // Check the quiz cache for an existing evaluation.
  const cached = db.prepare('SELECT response_json FROM quiz_cache WHERE term = ? AND reading = ? AND translation = ? AND mode = ?').get(term, reading, translation, mode);
  if (cached) {
    try {
      return { success: true, ...JSON.parse(cached.response_json), fromCache: true };
    } catch (e) {
      console.error("Failed to parse cached JSON:", e);
    }
  }

  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  const endpoint = settings['llm_endpoint'] || 'http://localhost:5000/v1/chat/completions';
  const modelName = settings['llm_model'] || 'gemini-2.5-pro';

  const prompt = `You are a helpful Japanese teacher evaluating a student's translation.
Word: ${term} (${reading})
Mode: ${mode}
Context Sentence: ${contextSentence || "None provided"}
Student's Translation: ${translation}
${mode === 'guess' ? "This is a 'Guess Mode' challenge where the student is trying to guess a word they haven't learned yet." : ""}

Please evaluate if the student's translation is correct or close enough in meaning.
Respond with a JSON object containing:
{
  "isCorrect": boolean,
  "score": number (0-100),
  "feedback": "A brief, friendly explanation in English. ${mode === 'guess' ? "Include interesting facts about the word's history, etymology, or usage since this is a Guess Mode challenge!" : ""}",
  "corrections": "The correct translation if the student was wrong, otherwise null"
}
Respond with ONLY the JSON object.`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: "You are a helpful Japanese teacher. You always respond with valid JSON." },
          { role: "user", content: prompt }
        ],
        max_tokens: parseInt(settings['llm_max_tokens'] || '300', 10),
        temperature: 0.1, // Low temperature for consistency
        top_p: 1.0,
        stream: false
      })
    });

    if (!response.ok) throw new Error(`LLM API returned ${response.status}`);
    const data = await response.json();
    
    let llmText = "";
    if (data.choices && data.choices[0] && data.choices[0].message) {
      llmText = data.choices[0].message.content || "";
    } else if (data.results && data.results[0] && data.results[0].text) {
      llmText = data.results[0].text.trim();
    } else if (data.response) {
      llmText = data.response.trim();
    }

    // Clean up potential markdown code blocks
    const jsonMatch = llmText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("LLM did not return valid JSON");
    
    const result = JSON.parse(jsonMatch[0]);
    
    // Store the evaluation result in the quiz cache.
    db.prepare('INSERT OR REPLACE INTO quiz_cache (term, reading, translation, mode, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(term, reading, translation, mode, JSON.stringify(result), Date.now());

    return { success: true, ...result };
  } catch (err) {
    console.error("Evaluation failed:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('update-quiz-stats', (event, term, reading, isCorrect) => {
  const now = Date.now();
  db.transaction(() => {
    let stats = db.prepare('SELECT * FROM quiz_stats WHERE term = ? AND reading = ?').get(term, reading);
    
    if (!stats) {
      db.prepare(`
        INSERT INTO quiz_stats (term, reading, success_count, fail_count, current_streak, best_streak, last_tested)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(term, reading, isCorrect ? 1 : 0, isCorrect ? 0 : 1, isCorrect ? 1 : 0, isCorrect ? 1 : 0, now);
    } else {
      const newSuccess = stats.success_count + (isCorrect ? 1 : 0);
      const newFail = stats.fail_count + (isCorrect ? 0 : 1);
      const newStreak = isCorrect ? stats.current_streak + 1 : 0;
      const newBest = Math.max(stats.best_streak, newStreak);
      
      db.prepare(`
        UPDATE quiz_stats 
        SET success_count = ?, fail_count = ?, current_streak = ?, best_streak = ?, last_tested = ?
        WHERE term = ? AND reading = ?
      `).run(newSuccess, newFail, newStreak, newBest, now, term, reading);
    }
  })();
  return true;
});



ipcMain.handle('get-manga-chats', (event, mangaId) => {
  return db.prepare('SELECT * FROM manga_chats WHERE manga_id = ? ORDER BY updated_at DESC').all(mangaId);
});

ipcMain.handle('create-manga-chat', (event, mangaId, title) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO manga_chats (id, manga_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, mangaId, title || 'New Chat', now, now);
  return { id, manga_id: mangaId, title: title || 'New Chat', created_at: now, updated_at: now };
});

ipcMain.handle('update-manga-chat', (event, chatId, title) => {
  db.prepare('UPDATE manga_chats SET title = ?, updated_at = ? WHERE id = ?')
    .run(title, Date.now(), chatId);
  return true;
});

ipcMain.handle('delete-manga-chat', (event, chatId) => {
  db.transaction(() => {
    db.prepare('DELETE FROM chat_messages WHERE chat_id = ?').run(chatId);
    db.prepare('DELETE FROM manga_chats WHERE id = ?').run(chatId);
  })();
  return true;
});

ipcMain.handle('get-chat-messages', (event, chatId) => {
  return db.prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC').all(chatId);
});

ipcMain.handle('add-chat-message', (event, chatId, role, content) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.transaction(() => {
    db.prepare('INSERT INTO chat_messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, chatId, role, content, now);
    db.prepare('UPDATE manga_chats SET updated_at = ? WHERE id = ?')
      .run(now, chatId);
  })();
  return { id, chat_id: chatId, role, content, created_at: now };
});

ipcMain.handle('get-sticky-notes', (event, mangaId) => {
  return db.prepare('SELECT * FROM sticky_notes WHERE manga_id = ?').all(mangaId);
});

ipcMain.handle('save-sticky-note', (event, note) => {
  const now = Date.now();
  db.prepare(`
    INSERT INTO sticky_notes (id, manga_id, page_idx, local_x, local_y, width, height, color, content, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      local_x = excluded.local_x,
      local_y = excluded.local_y,
      width = excluded.width,
      height = excluded.height,
      color = excluded.color,
      content = excluded.content,
      updated_at = excluded.updated_at
  `).run(note.id, note.manga_id, note.page_idx, note.local_x, note.local_y, note.width, note.height, note.color, note.content, now);
  return { success: true, updated_at: now };
});

ipcMain.handle('delete-sticky-note', (event, id) => {
  db.prepare('DELETE FROM sticky_notes WHERE id = ?').run(id);
  return { success: true };
});

// --- Strokes IPC Handlers ---

ipcMain.handle('save-stroke', (event, strokeData) => {
  try {
    db.prepare(`
      INSERT INTO strokes (id, manga_id, page_idx, note_id, brush_type, color, size, opacity, hardness, points)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        brush_type = excluded.brush_type,
        color = excluded.color,
        size = excluded.size,
        opacity = excluded.opacity,
        hardness = excluded.hardness,
        points = excluded.points
    `).run(
      strokeData.id,
      strokeData.manga_id,
      strokeData.page_idx,
      strokeData.note_id,
      strokeData.brush_type,
      strokeData.color,
      strokeData.size,
      strokeData.opacity,
      strokeData.hardness,
      strokeData.points
    );
    return { success: true };
  } catch (error) {
    console.error('Error saving stroke:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-strokes', (event, mangaId) => {
  try {
    const stmt = db.prepare('SELECT * FROM strokes WHERE manga_id = ?');
    return stmt.all(mangaId);
  } catch (error) {
    console.error('Error getting strokes:', error);
    return [];
  }
});

ipcMain.handle('delete-stroke', (event, id) => {
  try {
    db.prepare('DELETE FROM strokes WHERE id = ?').run(id);
    return { success: true };
  } catch (error) {
    console.error('Error deleting stroke:', error);
    return { success: false, error: error.message };
  }
});

// --- Data Management IPC Handlers ---

ipcMain.handle('clear-all-data', (event, type) => {
  try {
    db.transaction(() => {
      switch (type) {
        case 'words':
          db.prepare('DELETE FROM user_words WHERE status != "banned"').run();
          break;
        case 'banned_words':
          db.prepare('DELETE FROM user_words WHERE status = "banned"').run();
          break;
        case 'progress':
          db.prepare('DELETE FROM quiz_stats').run();
          db.prepare('DELETE FROM quiz_cache').run();
          break;
        case 'drawings':
          db.prepare('DELETE FROM strokes').run();
          break;
        case 'sticky_notes':
          db.prepare('DELETE FROM sticky_notes').run();
          break;
        case 'manga':
          // Delete files first
          const mangas = db.prepare('SELECT path, temp_dir FROM library_manga').all();
          for (const manga of mangas) {
            if (manga.path && fs.existsSync(manga.path)) fs.unlinkSync(manga.path);
            if (manga.temp_dir && fs.existsSync(manga.temp_dir)) fs.rmSync(manga.temp_dir, { recursive: true, force: true });
          }
          db.prepare('DELETE FROM library_manga').run();
          db.prepare('DELETE FROM manga_chats').run();
          db.prepare('DELETE FROM chat_messages').run();
          break;
        case 'full_reset':
          // Delete manga files
          const allMangas = db.prepare('SELECT path, temp_dir FROM library_manga').all();
          for (const manga of allMangas) {
            if (manga.path && fs.existsSync(manga.path)) fs.unlinkSync(manga.path);
            if (manga.temp_dir && fs.existsSync(manga.temp_dir)) fs.rmSync(manga.temp_dir, { recursive: true, force: true });
          }
          // Clear all tables except settings
          db.prepare('DELETE FROM user_words').run();
          db.prepare('DELETE FROM quiz_stats').run();
          db.prepare('DELETE FROM quiz_cache').run();
          db.prepare('DELETE FROM strokes').run();
          db.prepare('DELETE FROM sticky_notes').run();
          db.prepare('DELETE FROM library_manga').run();
          db.prepare('DELETE FROM manga_chats').run();
          db.prepare('DELETE FROM chat_messages').run();
          db.prepare('DELETE FROM llm_memory').run();
          break;
      }
    })();
    return { success: true };
  } catch (error) {
    console.error(`Error clearing data (${type}):`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-data', async (event, type) => {
  try {
    let dataToExport = null;
    let defaultFilename = 'export.json';

    switch (type) {
      case 'words':
        dataToExport = db.prepare('SELECT * FROM user_words WHERE status != "banned"').all();
        defaultFilename = 'aburamushi_words.json';
        break;
      case 'banned_words':
        dataToExport = db.prepare('SELECT * FROM user_words WHERE status = "banned"').all();
        defaultFilename = 'aburamushi_banned_words.json';
        break;
      case 'progress':
        dataToExport = {
          stats: db.prepare('SELECT * FROM quiz_stats').all(),
          cache: db.prepare('SELECT * FROM quiz_cache').all()
        };
        defaultFilename = 'aburamushi_progress.json';
        break;
      case 'drawings':
        dataToExport = db.prepare('SELECT * FROM strokes').all();
        defaultFilename = 'aburamushi_drawings.json';
        break;
      case 'sticky_notes':
        dataToExport = db.prepare('SELECT * FROM sticky_notes').all();
        defaultFilename = 'aburamushi_sticky_notes.json';
        break;
      case 'manga':
        dataToExport = {
          library: db.prepare('SELECT * FROM library_manga').all(),
          chats: db.prepare('SELECT * FROM manga_chats').all(),
          messages: db.prepare('SELECT * FROM chat_messages').all()
        };
        defaultFilename = 'aburamushi_manga_metadata.json';
        break;
      case 'full_reset':
        dataToExport = {
          words: db.prepare('SELECT * FROM user_words').all(),
          quiz_stats: db.prepare('SELECT * FROM quiz_stats').all(),
          quiz_cache: db.prepare('SELECT * FROM quiz_cache').all(),
          strokes: db.prepare('SELECT * FROM strokes').all(),
          sticky_notes: db.prepare('SELECT * FROM sticky_notes').all(),
          library: db.prepare('SELECT * FROM library_manga').all(),
          chats: db.prepare('SELECT * FROM manga_chats').all(),
          messages: db.prepare('SELECT * FROM chat_messages').all(),
          settings: db.prepare('SELECT * FROM settings').all(),
          memory: db.prepare('SELECT * FROM llm_memory').all()
        };
        defaultFilename = 'aburamushi_full_backup.json';
        break;
    }

    if (!dataToExport) return { success: false, error: "Invalid export type" };

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Data',
      defaultPath: defaultFilename,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (canceled || !filePath) return { success: false, canceled: true };

    fs.writeFileSync(filePath, JSON.stringify(dataToExport, null, 2));
    return { success: true, filePath };
  } catch (error) {
    console.error(`Error exporting data (${type}):`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-manga-cover', async (event) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select Cover Image',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }
    ]
  });

  if (canceled || filePaths.length === 0) return { success: false };
  return { success: true, imagePath: filePaths[0] };
});

ipcMain.handle('save-cropped-cover', async (event, id, base64Data) => {
  try {
    const coverDir = path.join(app.getPath('userData'), 'manga_covers');
    if (!fs.existsSync(coverDir)) {
      fs.mkdirSync(coverDir, { recursive: true });
    }

    const newCoverPath = path.join(coverDir, `${id}.jpg`);
    
    // Remove the data:image/jpeg;base64, prefix
    const base64Image = base64Data.split(';base64,').pop();
    fs.writeFileSync(newCoverPath, base64Image, { encoding: 'base64' });

    // Update the database
    db.prepare('UPDATE library_manga SET cover_image = ? WHERE id = ?').run(newCoverPath, id);
    
    return { success: true, cover_image: newCoverPath };
  } catch (err) {
    console.error("Failed to save cropped cover:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-manga-cover-url', async (event, coverPath) => {
  if (!coverPath || !fs.existsSync(coverPath)) return null;
  const buffer = fs.readFileSync(coverPath);
  const ext = path.extname(coverPath).toLowerCase().replace('.', '');
  const mimeType = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mimeType};base64,${buffer.toString('base64')}`;
});

// --- Window Setup ---

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
};

app.on('ready', createWindow);

app.on('before-quit', () => {
  // Kill all active CLI processes
  for (const [id, proc] of activeProcesses.entries()) {
    try {
      proc.kill('SIGINT');
    } catch (e) {}
  }
  activeProcesses.clear();
});

app.on('window-all-closed', () => {
  // Kill all active CLI processes
  for (const [id, proc] of activeProcesses.entries()) {
    try {
      proc.kill('SIGINT');
    } catch (e) {}
  }
  activeProcesses.clear();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
