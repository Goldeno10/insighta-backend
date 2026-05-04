import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import Busboy from 'busboy';
import { parse } from 'csv-parse';
import {
  insertProfileBatch,
  mergeReasons,
  validateProfileCsvRow,
  type IngestReasonKey,
  type IngestReasons,
  type ValidatedProfileInsert,
} from '@/lib/profile-csv-ingest';
import { bumpProfileDataVersion } from '@/lib/profile-data-version';

export const runtime = 'nodejs';

/** Large CSV uploads: allow long-running handler on supported hosts (e.g. Vercel). */
export const maxDuration = 300;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Version',
};

const BATCH_SIZE = 800;

function bump(r: IngestReasons, key: IngestReasonKey) {
  r[key] = (r[key] ?? 0) + 1;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const userRole = request.headers.get('x-user-role');
  if (userRole !== 'admin') {
    return NextResponse.json(
      { status: 'error', message: 'Forbidden: Admin access required' },
      { status: 403, headers: corsHeaders }
    );
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return NextResponse.json(
      { status: 'error', message: 'Content-Type must be multipart/form-data with field file' },
      { status: 400, headers: corsHeaders }
    );
  }

  if (!request.body) {
    return NextResponse.json({ status: 'error', message: 'Empty body' }, { status: 400, headers: corsHeaders });
  }

  try {
    const summary = await runMultipartCsvImport(request);
    if (summary.inserted > 0) {
      await bumpProfileDataVersion();
    }

    const reasonsOut: Record<string, number> = {};
    for (const [k, v] of Object.entries(summary.reasons)) {
      if (v && v > 0) reasonsOut[k] = v;
    }

    return NextResponse.json(
      {
        status: 'success',
        total_rows: summary.total_rows,
        inserted: summary.inserted,
        skipped: summary.skipped,
        reasons: reasonsOut,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Import failed';
    return NextResponse.json({ status: 'error', message: msg }, { status: 400, headers: corsHeaders });
  }
}

type ImportSummary = {
  total_rows: number;
  inserted: number;
  skipped: number;
  reasons: IngestReasons;
};

async function runMultipartCsvImport(request: Request): Promise<ImportSummary> {
  const reasons: IngestReasons = {};
  let total_rows = 0;
  let inserted = 0;
  const namesSeenInUpload = new Set<string>();
  let batch: ValidatedProfileInsert[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const chunk = batch;
    batch = [];
    const chunkReasons: IngestReasons = {};
    const n = await insertProfileBatch(chunk, chunkReasons);
    inserted += n;
    mergeReasons(reasons, chunkReasons);
    await new Promise<void>((r) => setImmediate(r));
  };

  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  return await new Promise<ImportSummary>((resolve, reject) => {
    const bb = Busboy({ headers });
    let fileSeen = false;
    let processing: Promise<void> | null = null;

    bb.on('file', (_name, file, info) => {
      const mime = (info.mimeType || '').toLowerCase();
      const filename = (info.filename || '').toLowerCase();
      const looksCsv = mime.includes('csv') || filename.endsWith('.csv');
      if (!looksCsv) {
        file.resume();
        return;
      }
      if (fileSeen) {
        file.resume();
        return;
      }
      fileSeen = true;

      processing = (async () => {
        const parser = parse({
          columns: (header: string[]) => header.map((h) => String(h).trim().toLowerCase()),
          trim: true,
          skip_empty_lines: true,
          relax_column_count: false,
          skip_records_with_error: true,
          bom: true,
        });

        parser.on('skip', () => {
          total_rows += 1;
          bump(reasons, 'malformed_row');
        });

        file.pipe(parser);

        try {
          for await (const record of parser as AsyncIterable<Record<string, unknown>>) {
            total_rows += 1;
            const v = validateProfileCsvRow(record);
            if (!v.ok) {
              bump(reasons, v.reason);
              continue;
            }
            if (namesSeenInUpload.has(v.row.name)) {
              bump(reasons, 'duplicate_name');
              continue;
            }
            namesSeenInUpload.add(v.row.name);
            batch.push(v.row);
            if (batch.length >= BATCH_SIZE) {
              await flush();
            }
          }
          await flush();
          await finished(parser).catch(() => undefined);
        } catch (err) {
          reject(err);
        }
      })();
    });

    bb.on('error', (err) => reject(err));

    bb.on('finish', () => {
      void (async () => {
        try {
          if (processing) await processing;
          if (!fileSeen) {
            reject(new Error('No CSV file field found in multipart upload'));
            return;
          }
          const skipped = Math.max(0, total_rows - inserted);
          resolve({ total_rows, inserted, skipped, reasons });
        } catch (e) {
          reject(e);
        }
      })();
    });

    const body = request.body;
    if (!body) {
      reject(new Error('Missing body'));
      return;
    }
    const nodeReadable = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
    nodeReadable.pipe(bb);
  });
}
