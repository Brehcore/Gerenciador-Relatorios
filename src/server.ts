import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import multer from 'multer';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { join } from 'node:path';
import { promises as fsp } from 'node:fs';
import * as forge from 'node-forge';
// Prefer explicit environment override for the browser dist folder (allows flexibility)
let browserDistFolder = process.env['BROWSER_DIST'] || join(process.cwd(), 'dist', 'frontend', 'browser');
// Fallback: if that folder doesn't exist, try without the 'browser' subfolder
import { existsSync } from 'node:fs';
if (!existsSync(browserDistFolder)) {
  const alt = join(process.cwd(), 'dist', 'frontend');
  if (existsSync(alt)) browserDistFolder = alt;
}

const app = express();
const angularApp = new AngularNodeAppEngine();

// --- Certificate upload endpoint (basic implementation) ---
// POST /users/me/certificate
// Note: this example expects an authenticated user id in header `x-user-id`.
// Replace with real authentication middleware for production.

// configure multer storage to a temp location; we'll move file into secure folder
const upload = multer({ dest: join(process.cwd(), 'tmp', 'uploads') });

async function ensureDir(dir: string) {
  try { await fsp.mkdir(dir, { recursive: true }); } catch(_) {}
}

app.post('/users/me/certificate', upload.single('file'), async (req, res) => {
  try {
    const userId = (req.headers['x-user-id'] as string) || null;
    if (!userId) return res.status(401).json({ error: 'Missing x-user-id header (use real auth in production)' });

    const password = (req.body && (req.body.password || req.body.pass)) || null;
    if (!password) return res.status(400).json({ error: 'Missing password field' });

    if (!req.file) return res.status(400).json({ error: 'Missing file upload (field name: file)' });

    const allowedExt = ['.pfx', '.p12'];
    const uploadedPath = req.file.path;
    const originalName = req.file.originalname || 'cert.pfx';
    const ext = originalName.slice(originalName.lastIndexOf('.')).toLowerCase();
    if (!allowedExt.includes(ext)) {
      // cleanup
      try { await fsp.unlink(uploadedPath); } catch(_) {}
      return res.status(400).json({ error: 'Invalid file type. Expect .pfx or .p12' });
    }

    // validate environment encryption key (32 bytes base64 or hex)
    const keyEnv = process.env['CERT_AES_KEY'];
    if (!keyEnv || keyEnv.length < 32) {
      // still proceed but warn
      console.warn('[cert] CERT_AES_KEY not set or too short. Using ephemeral key (NOT RECOMMENDED).');
    }

    // destination folder
    const destDir = join(process.cwd(), 'app-data', 'reports', 'certificates');
    await ensureDir(destDir);

    // move file to secure folder with user prefix
    const timestamp = Date.now();
    const destName = `${userId}-${timestamp}${ext}`;
    const destPath = join(destDir, destName);
    await fsp.rename(uploadedPath, destPath);

    // encrypt password using AES-256-CBC
    // derive 32-byte key from env or random (developer should set CERT_AES_KEY)
    const keyRaw = process.env['CERT_AES_KEY'] || randomBytes(32).toString('hex').slice(0,32);
    const key = Buffer.from(keyRaw.padEnd(32, '0').slice(0,32));
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(String(password), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const encryptedPayload = `${iv.toString('base64')}:${encrypted}`;

    // persist metadata per user (simple JSON file). Replace with DB in production.
    const metaPath = join(destDir, `${userId}.json`);
    const metadata = { file: destPath, encryptedPassword: encryptedPayload, uploadedAt: new Date().toISOString() };
    await fsp.writeFile(metaPath, JSON.stringify(metadata, null, 2), { encoding: 'utf8' });

    // Respond success. Certificate validation (opening .pfx) is not implemented here.
    return res.status(200).json({ ok: true, stored: destPath });
  } catch (err) {
    console.error('[cert] upload error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- end certificate endpoint ---

// --- Digital Signature endpoint ---
// POST /technical-visits/{id}/sign
// Signs a technical visit PDF with digital signature
app.post('/technical-visits/:id/sign', async (req, res) => {
  try {
    const visitId = req.params.id;
    if (!visitId) return res.status(400).json({ error: 'Missing visit ID' });

    // Get user ID from request (would come from auth middleware in production)
    const userId = (req.headers['x-user-id'] as string) || (req.body?.userId) || null;
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing user ID' });

    // Path where PDFs are typically stored
    const pdfDir = join(process.cwd(), 'app-data', 'reports');
    await ensureDir(pdfDir);

    // Look for the PDF file (assuming naming convention: visitId.pdf or similar)
    const pdfPath = join(pdfDir, `${visitId}.pdf`);
    
    // Check if PDF exists
    const pdfExists = existsSync(pdfPath);
    if (!pdfExists) {
      return res.status(404).json({ error: 'PDF not found. Generate the PDF first.' });
    }

    // Retrieve user's certificate and password from encrypted storage
    const certDir = join(process.cwd(), 'app-data', 'reports', 'certificates');
    const metaPath = join(certDir, `${userId}.json`);
    
    let metadata: any = null;
    try {
      const metaContent = await fsp.readFile(metaPath, 'utf8');
      metadata = JSON.parse(metaContent);
    } catch (e) {
      return res.status(400).json({ error: 'User certificate not found. Upload certificate first.' });
    }

    if (!metadata || !metadata.file || !metadata.encryptedPassword) {
      return res.status(400).json({ error: 'Invalid certificate metadata' });
    }

    // Decrypt the password using AES-256-CBC
    const keyRaw = process.env['CERT_AES_KEY'] || randomBytes(32).toString('hex').slice(0,32);
    const key = Buffer.from(keyRaw.padEnd(32, '0').slice(0,32));
    const [ivBase64, encryptedBase64] = metadata.encryptedPassword.split(':');
    const iv = Buffer.from(ivBase64, 'base64');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    const certPassword = decrypted;

    // Read certificate file
    const certPath = metadata.file;
    const certBuffer = await fsp.readFile(certPath);

    // Read PDF to be signed
    const pdfBuffer = await fsp.readFile(pdfPath);

    // Extract certificate info from PKCS#12 and attempt to open it with password
    let p12: any = null;
    try {
      p12 = forge.pkcs12.containerFromAsn1(
        forge.asn1.fromDer(forge.util.encode64(certBuffer.toString('binary')), false),
        certPassword
      );
    } catch (e) {
      console.error('[sign] Certificate password invalid or corrupted:', e);
      return res.status(400).json({ error: 'Invalid certificate password or corrupted certificate' });
    }

    if (!p12 || !p12.bags) {
      return res.status(400).json({ error: 'Unable to parse certificate' });
    }

    // Get certificate and key from container
    let cert: any = null;
    let key: any = null;
    
    if (p12.bags.certificateBag && p12.bags.certificateBag.length > 0) {
      cert = p12.bags.certificateBag[0].cert;
    }
    if (p12.bags.keyBag && p12.bags.keyBag.length > 0) {
      key = p12.bags.keyBag[0].key;
    } else if (p12.bags.pkcs8ShroudedKeyBag && p12.bags.pkcs8ShroudedKeyBag.length > 0) {
      key = p12.bags.pkcs8ShroudedKeyBag[0].key;
    }

    if (!cert || !key) {
      return res.status(400).json({ error: 'Certificate or key not found in container' });
    }

    // Create a signature timestamp string for PDF
    const timestamp = new Date().toISOString();
    const signatureText = `Digitally signed by ${cert.subject.getField('CN')?.value || 'Unknown'}\nDate: ${timestamp}`;

    // For now: Add a text footer to PDF indicating it was signed (placeholder for full PDF signing)
    // In production, use a proper PDF signing library like pdf-sign or pdfkit
    // This is a simplified approach that adds metadata
    const signedPdfBuffer = Buffer.concat([pdfBuffer, Buffer.from(`\n/* Digital Signature: ${signatureText} */`)]);

    // Write signed PDF back to disk (overwrite original)
    await fsp.writeFile(pdfPath, signedPdfBuffer);

    // Update visit record to mark as signed
    // (In production, this would update a database)
    const signaturePath = join(pdfDir, `${visitId}.sig.json`);
    const signatureMetadata = {
      visitId,
      signedBy: userId,
      signedAt: timestamp,
      certificateSubject: cert.subject.toString(),
      status: 'signed'
    };
    await fsp.writeFile(signaturePath, JSON.stringify(signatureMetadata, null, 2), 'utf8');

    return res.status(200).json({
      ok: true,
      message: 'Document signed successfully',
      visitId,
      signedAt: timestamp,
      signedBy: userId
    });
  } catch (err) {
    console.error('[sign] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- end signature endpoint ---

// --- Risk Checklist Signature endpoint ---
// POST /risk-checklist/{id}/sign
// Signs a risk checklist PDF with digital signature (same as technical visit)
app.post('/risk-checklist/:id/sign', async (req, res) => {
  try {
    const checklistId = req.params.id;
    if (!checklistId) return res.status(400).json({ error: 'Missing checklist ID' });

    // Get user ID from request (would come from auth middleware in production)
    const userId = (req.headers['x-user-id'] as string) || (req.body?.userId) || null;
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing user ID' });

    // Path where PDFs are typically stored
    const pdfDir = join(process.cwd(), 'app-data', 'reports');
    await ensureDir(pdfDir);

    // Look for the PDF file (assuming naming convention: checklistId.pdf or similar)
    const pdfPath = join(pdfDir, `${checklistId}.pdf`);
    
    // Check if PDF exists
    const pdfExists = existsSync(pdfPath);
    if (!pdfExists) {
      return res.status(404).json({ error: 'PDF not found. Generate the PDF first.' });
    }

    // Retrieve user's certificate and password from encrypted storage
    const certDir = join(process.cwd(), 'app-data', 'reports', 'certificates');
    const metaPath = join(certDir, `${userId}.json`);
    
    let metadata: any = null;
    try {
      const metaContent = await fsp.readFile(metaPath, 'utf8');
      metadata = JSON.parse(metaContent);
    } catch (e) {
      return res.status(400).json({ error: 'User certificate not found. Upload certificate first.' });
    }

    if (!metadata || !metadata.file || !metadata.encryptedPassword) {
      return res.status(400).json({ error: 'Invalid certificate metadata' });
    }

    // Decrypt the password using AES-256-CBC
    const keyRaw = process.env['CERT_AES_KEY'] || randomBytes(32).toString('hex').slice(0,32);
    const key = Buffer.from(keyRaw.padEnd(32, '0').slice(0,32));
    const [ivBase64, encryptedBase64] = metadata.encryptedPassword.split(':');
    const iv = Buffer.from(ivBase64, 'base64');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    const certPassword = decrypted;

    // Read certificate file
    const certPath = metadata.file;
    const certBuffer = await fsp.readFile(certPath);

    // Read PDF to be signed
    const pdfBuffer = await fsp.readFile(pdfPath);

    // Extract certificate info from PKCS#12 and attempt to open it with password
    let p12: any = null;
    try {
      p12 = forge.pkcs12.containerFromAsn1(
        forge.asn1.fromDer(forge.util.encode64(certBuffer.toString('binary')), false),
        certPassword
      );
    } catch (e) {
      console.error('[sign-checklist] Certificate password invalid or corrupted:', e);
      return res.status(400).json({ error: 'Invalid certificate password or corrupted certificate' });
    }

    if (!p12 || !p12.bags) {
      return res.status(400).json({ error: 'Unable to parse certificate' });
    }

    // Get certificate and key from container
    let cert: any = null;
    let key: any = null;
    
    if (p12.bags.certificateBag && p12.bags.certificateBag.length > 0) {
      cert = p12.bags.certificateBag[0].cert;
    }
    if (p12.bags.keyBag && p12.bags.keyBag.length > 0) {
      key = p12.bags.keyBag[0].key;
    } else if (p12.bags.pkcs8ShroudedKeyBag && p12.bags.pkcs8ShroudedKeyBag.length > 0) {
      key = p12.bags.pkcs8ShroudedKeyBag[0].key;
    }

    if (!cert || !key) {
      return res.status(400).json({ error: 'Certificate or key not found in container' });
    }

    // Create a signature timestamp string for PDF
    const timestamp = new Date().toISOString();
    const signatureText = `Digitally signed by ${cert.subject.getField('CN')?.value || 'Unknown'}\nDate: ${timestamp}`;

    // For now: Add a text footer to PDF indicating it was signed (placeholder for full PDF signing)
    // In production, use a proper PDF signing library like pdf-sign or pdfkit
    // This is a simplified approach that adds metadata
    const signedPdfBuffer = Buffer.concat([pdfBuffer, Buffer.from(`\n/* Digital Signature: ${signatureText} */`)]);

    // Write signed PDF back to disk (overwrite original)
    await fsp.writeFile(pdfPath, signedPdfBuffer);

    // Update checklist record to mark as signed
    // (In production, this would update a database)
    const signaturePath = join(pdfDir, `${checklistId}.sig.json`);
    const signatureMetadata = {
      checklistId,
      signedBy: userId,
      signedAt: timestamp,
      certificateSubject: cert.subject.toString(),
      status: 'signed',
      documentType: 'risk-checklist'
    };
    await fsp.writeFile(signaturePath, JSON.stringify(signatureMetadata, null, 2), 'utf8');

    return res.status(200).json({
      ok: true,
      message: 'Risk checklist signed successfully',
      checklistId,
      signedAt: timestamp,
      signedBy: userId
    });
  } catch (err) {
    console.error('[sign-checklist] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- end risk checklist signature endpoint ---

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
// Decide whether to start the server: support PM2 (pm_id), explicit env START_SERVER,
// or a simple argv heuristic when launched directly (e.g., `node server.js`).
const shouldStart = !!(
  process.env['pm_id'] ||
  process.env['START_SERVER'] === 'true' ||
  (process.argv && process.argv[1] && /server(\.js|\.ts)?$/i.test(process.argv[1]))
);

if (shouldStart) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
