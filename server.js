const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const TEMP_DIR = path.join(__dirname, 'temp_chunks');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, TEMP_DIR);
  },
  filename: function (req, file, cb) {
    // name with fileId_index
    const fileId = req.body.fileId || req.query.fileId;
    const index = req.body.index || req.query.index;
    const filename = `${fileId}_chunk_${index}`;
    cb(null, filename);
  }
});
const upload = multer({ storage: storage });

app.post('/upload-chunk', upload.single('chunk'), (req, res) => {
  // expects fileId, index, total, filename
  if (!req.body.fileId) return res.status(400).send('missing fileId');
  res.json({ ok: true });
});

app.post('/upload-complete', async (req, res) => {
  const { fileId, filename } = req.body;
  if (!fileId || !filename) return res.status(400).send('missing');
  // find chunks
  const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId + '_chunk_'));
  if (files.length === 0) return res.status(400).send('no chunks');
  // sort by index
  files.sort((a,b)=>{
    const ai = parseInt(a.split('_chunk_')[1],10);
    const bi = parseInt(b.split('_chunk_')[1],10);
    return ai - bi;
  });
  const finalPath = path.join(UPLOAD_DIR, Date.now() + '_' + filename.replace(/[^a-z0-9.\-]/gi,'_'));
  const ws = fs.createWriteStream(finalPath);
  for (const f of files){
    const chunkPath = path.join(TEMP_DIR, f);
    const data = fs.readFileSync(chunkPath);
    ws.write(data);
    fs.unlinkSync(chunkPath);
  }
  ws.end();
  await new Promise(r => ws.on('close', r));
  // return a URL relative to server
  const url = '/uploads/' + path.basename(finalPath);
  return res.json({ url });
});

// serve uploads
app.use('/uploads', express.static(UPLOAD_DIR));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Upload server listening on', PORT));
