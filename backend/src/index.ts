import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { processCortexQuery, getEmbedding } from './services/orchestrator';
import { supabase, isSupabaseMock } from './config/supabase';

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// ============================================================================
// Core Search Endpoint
// ============================================================================
app.post('/api/query', async (req: Request, res: Response) => {
  const { userPrompt } = req.body;

  if (!userPrompt || typeof userPrompt !== 'string') {
    return res.status(400).json({
      error: 'Invalid request payload. Please specify a non-empty string "userPrompt".',
    });
  }

  try {
    console.log(`[Cortex Server] Incoming search request: "${userPrompt}"`);
    const searchResult = await processCortexQuery(userPrompt);
    return res.json(searchResult);
  } catch (err: any) {
    console.error('[Cortex Server Error]:', err);
    return res.status(500).json({
      error: 'Internal search processing error.',
      details: err?.message || err,
    });
  }
});

// ============================================================================
// Health Check Endpoint
// ============================================================================
app.get('/health', async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json({
      status: 'healthy',
      database: 'connected (mock mode)',
      services: {
        supabase: 'mocked',
        nvidia_nim: 'mocked',
      },
    });
  }

  try {
    const { data, error } = await supabase.from('employees').select('count', { count: 'exact', head: true });
    if (error) throw error;

    return res.json({
      status: 'healthy',
      database: 'connected (supabase)',
      cortex_erp: 'online',
    });
  } catch (err: any) {
    console.error('[Cortex Server Health Check Failed]:', err);
    return res.status(500).json({
      status: 'degraded',
      database: 'disconnected',
      details: err?.message || err,
    });
  }
});

// ============================================================================
// Database Seed Endpoint
// ============================================================================
app.post('/api/seed', async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.status(400).json({
      error: 'Cannot seed database while running in mock mode. Please set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL in your .env file.',
    });
  }

  try {
    console.log('[Cortex Seeding] Beginning database seeding on Supabase...');

    // 1. Seed HR Employees
    const { error: empError } = await supabase.from('employees').upsert([
      { first_name: 'Alice', last_name: 'Vance', email: 'alice.vance@cortex-enterprise.io', phone: '555-0192', department: 'QA', role: 'Lead Test Engineer', is_active: true },
      { first_name: 'Bob', last_name: 'Miller', email: 'bob.miller@cortex-enterprise.io', phone: '555-0143', department: 'Production', role: 'Mechanical Designer', is_active: true },
      { first_name: 'Charlie', last_name: 'Smith', email: 'charlie.smith@cortex-enterprise.io', phone: '555-0188', department: 'Accounting', role: 'Senior Auditor', is_active: true },
    ], { onConflict: 'email' });

    if (empError) throw new Error(`HR seeding failed: ${empError.message}`);

    // 2. Seed Ledgers (Strict Numeric scale)
    const { error: ledgerError } = await supabase.from('ledgers').insert([
      { transaction_date: '2026-06-17', account_name: 'Office Supplies Depot', description: 'Ergonomic chairs for developers', amount: 750.00, type: 'DEBIT', category: 'Office Supplies' },
      { transaction_date: '2026-06-16', account_name: 'CloudHosting Corp', description: 'Production server hosting fee', amount: 2400.00, type: 'DEBIT', category: 'Infrastructure' },
      { transaction_date: '2026-06-15', account_name: 'Marketing Spark LLC', description: 'Campaign Retainer Fees', amount: 5000.00, type: 'DEBIT', category: 'Advertising' },
    ]);

    if (ledgerError) throw new Error(`Ledger seeding failed: ${ledgerError.message}`);

    // 3. Seed Unstructured Technical logs (calculates embeddings via NeMo Retriever)
    const rawLogs = [
      {
        component_id: 'TITAN-CHASSIS-009',
        testing_engineer: 'Alice Vance',
        content: 'Thermal stress chamber test started at 50C. Temperature ramped to 85C over 2 hours. Slight metal expansion observed but structural boundaries remained intact. Structural compliance passed.',
        test_result: 'PASS',
      },
      {
        component_id: 'PCB-BOARD-A4',
        testing_engineer: 'Alice Vance',
        content: 'Circuit continuity check failed on the secondary layer. High resistance noted on trace pin 14. Potential copper bridging causing short circuit under voltage load.',
        test_result: 'FAIL',
      },
      {
        component_id: 'TITAN-CHASSIS-010',
        testing_engineer: 'Alice Vance',
        content: 'Hydraulic pressure testing exceeded maximum safety tolerance. Chassis suffered deformation at 480MPa loading, breaching safety limits of 450MPa. Redesign required.',
        test_result: 'FAIL',
      },
    ];

    console.log('[Cortex Seeding] Generating vector embeddings for technical logs...');
    const vectorLogs = await Promise.all(
      rawLogs.map(async (log) => {
        const embedding = await getEmbedding(log.content);
        return {
          ...log,
          embedding,
        };
      })
    );

    const { error: logsError } = await supabase.from('technical_logs').insert(vectorLogs);
    if (logsError) throw new Error(`QA logs seeding failed: ${logsError.message}`);

    return res.json({
      status: 'success',
      message: 'Supabase database successfully seeded with HR directory, ledgers, and pgvector technical logs.',
    });
  } catch (err: any) {
    console.error('[Cortex Seeding Error]:', err);
    return res.status(500).json({
      error: 'Seeding failed.',
      details: err?.message || err,
    });
  }
});

// ============================================================================
// Server Init
// ============================================================================
app.listen(port, () => {
  console.log('================================================================');
  console.log(`[Cortex Server] Running on http://localhost:${port}`);
  console.log(`[Cortex Server] Environment: ${isSupabaseMock ? 'MOCKED / SANDBOX' : 'PRODUCTION'}`);
  console.log('================================================================');
});
