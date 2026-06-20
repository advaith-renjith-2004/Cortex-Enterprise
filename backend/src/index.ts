import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { processCortexQuery, getEmbedding } from './services/orchestrator';
import { supabase, isSupabaseMock } from './config/supabase';
import { createClient } from '@supabase/supabase-js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        employee_id: number;
        first_name: string;
        last_name: string;
        email: string;
        phone: string;
        department: string;
        role: string;
        street_address?: string;
        city?: string;
        state?: string;
        zip_code?: string;
        country?: string;
        is_active: boolean;
        hire_date: string;
      };
    }
  }
}


dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ============================================================================
// Local Mock Data Stores for Sandbox Mode
// ============================================================================
let mockEmployees = [
  { employee_id: 1, first_name: 'Alice', last_name: 'Vance', email: 'alice.vance@cortex-enterprise.io', phone: '555-0192', department: 'QA', role: 'Lead Test Engineer', street_address: '100 Innovation Way', city: 'Boston', state: 'MA', zip_code: '02110', country: 'USA', is_active: true, hire_date: '2026-06-18' },
  { employee_id: 2, first_name: 'Bob', last_name: 'Miller', email: 'bob.miller@cortex-enterprise.io', phone: '555-0143', department: 'Production', role: 'Mechanical Designer', street_address: '250 Fabrication Rd', city: 'Detroit', state: 'MI', zip_code: '48201', country: 'USA', is_active: true, hire_date: '2026-06-18' },
  { employee_id: 3, first_name: 'Charlie', last_name: 'Smith', email: 'charlie.smith@cortex-enterprise.io', phone: '555-0188', department: 'Accounting', role: 'Senior Auditor', street_address: '50 Wall St', city: 'New York', state: 'NY', zip_code: '10005', country: 'USA', is_active: true, hire_date: '2026-06-18' },
  { employee_id: 4, first_name: 'Paul', last_name: 'Sanna', email: 'paul.sanna@cortex-enterprise.io', phone: '555-0707', department: 'Administration', role: 'Admin User', street_address: '777 Enterprise Drive', city: 'San Francisco', state: 'CA', zip_code: '94105', country: 'USA', is_active: true, hire_date: '2026-06-18' },
];

let mockLedgers = [
  { ledger_id: 101, transaction_date: '2026-06-17', account_name: 'Office Supplies Depot', description: 'Ergonomic chairs for developers', amount: 750.00, type: 'DEBIT', category: 'Office Supplies', status: 'RECONCILED' },
  { ledger_id: 102, transaction_date: '2026-06-16', account_name: 'CloudHosting Corp', description: 'Production server hosting fee', amount: 2400.00, type: 'DEBIT', category: 'Infrastructure', status: 'CLEARED' },
  { ledger_id: 103, transaction_date: '2026-06-15', account_name: 'Marketing Spark LLC', description: 'Campaign Retainer Fees', amount: 5000.00, type: 'DEBIT', category: 'Advertising', status: 'CLEARED' },
];

let mockAuditFines = [
  { fine_id: 1, entity_name: 'Bob Miller', amount: 500.00, reason: 'Safety goggles violation in Production lab', fine_date: '2026-06-18', status: 'PENDING' },
  { fine_id: 2, entity_name: 'QA Department', amount: 1500.00, reason: 'Late firmware release compliance delay', fine_date: '2026-06-15', status: 'PAID' },
];

let mockLogs = [
  { log_id: 1, component_id: 'TITAN-CHASSIS-009', testing_engineer: 'Alice Vance', content: 'Thermal stress chamber test started at 50C. Temperature ramped to 85C over 2 hours. Slight metal expansion observed but structural boundaries remained intact. Structural compliance passed.', test_result: 'PASS', logged_at: new Date().toISOString() },
  { log_id: 2, component_id: 'PCB-BOARD-A4', testing_engineer: 'Alice Vance', content: 'Circuit continuity check failed on the secondary layer. High resistance noted on trace pin 14. Potential copper bridging causing short circuit under voltage load.', test_result: 'FAIL', logged_at: new Date().toISOString() },
];

let mockTasks = [
  { task_id: 1, title: 'Verify QA Circuit Pinouts', description: 'Run full structural continuity checks on primary power trace layers.', department: 'QA', deadline: '2026-06-25', status: 'IN_PROGRESS', progress: 45, created_at: new Date().toISOString(), assignments: [{ employee_id: 1, first_name: 'Alice', last_name: 'Vance', progress: 45 }] },
  { task_id: 2, title: 'Assemble Titan Mechanical Joint', description: 'Connect rotary joints and load-test limits of hydraulic arm brackets.', department: 'Production', deadline: '2026-06-22', status: 'PENDING', progress: 0, created_at: new Date().toISOString(), assignments: [{ employee_id: 2, first_name: 'Bob', last_name: 'Miller', progress: 0 }] },
  { task_id: 3, title: 'Update Audit Ledger Report', description: 'Compile ledger categories and balance remaining debit offsets.', department: 'Accounting', deadline: '2026-06-20', status: 'COMPLETED', progress: 100, created_at: new Date().toISOString(), assignments: [{ employee_id: 3, first_name: 'Charlie', last_name: 'Smith', progress: 100 }] },
  { task_id: 4, title: 'Organize Q3 Executive Retreat', description: 'Schedule lodging and set strategy agenda for management team.', department: 'Administration', deadline: '2026-07-15', status: 'IN_PROGRESS', progress: 15, created_at: new Date().toISOString(), assignments: [{ employee_id: 4, first_name: 'Paul', last_name: 'Sanna', progress: 15 }] },
];

let mockAttendance = [
  { attendance_id: 1, employee_id: 1, first_name: 'Alice', last_name: 'Vance', department: 'QA', work_date: '2026-06-19', status: 'PRESENT', check_in_time: '08:52:00', check_out_time: '17:30:00' },
  { attendance_id: 2, employee_id: 2, first_name: 'Bob', last_name: 'Miller', department: 'Production', work_date: '2026-06-19', status: 'LATE', check_in_time: '09:05:00', check_out_time: '18:00:00' },
  { attendance_id: 3, employee_id: 3, first_name: 'Charlie', last_name: 'Smith', department: 'Accounting', work_date: '2026-06-19', status: 'PRESENT', check_in_time: '08:30:00', check_out_time: '16:45:00' },
  { attendance_id: 4, employee_id: 4, first_name: 'Paul', last_name: 'Sanna', department: 'Administration', work_date: '2026-06-19', status: 'LEAVE', check_in_time: null, check_out_time: null },
];

let mockProducts = [
  { product_id: 1, name: 'Titan Structural Frame Model-B', sku: 'TITAN-FRM-B', stock_quantity: 12, price: 4500.00, description: 'Reinforced high-load titanium skeleton.' },
  { product_id: 2, name: 'Primary Circuit PCB Rev-4', sku: 'PCB-REV4', stock_quantity: 85, price: 120.00, description: 'Multilayer circuit board with high-speed serial trace layout.' },
  { product_id: 3, name: 'Hydraulic Compression Valve', sku: 'HYD-VAL-90', stock_quantity: 4, price: 680.00, description: 'Pre-calibrated oil flow regulator.' },
  { product_id: 4, name: 'Development Ergonomic Chair', sku: 'CHAIR-DEV-0', stock_quantity: 0, price: 250.00, description: 'Mesh lumbar support office seat.' },
];

let mockStockLogs = [
  { log_id: 1, product_id: 1, product_name: 'Titan Structural Frame Model-B', change_qty: 4, reason: 'Restocked from assembly supplier', logged_by: 4, logged_at: new Date().toISOString() },
  { log_id: 2, product_id: 2, product_name: 'Primary Circuit PCB Rev-4', change_qty: -5, reason: 'Allocated for test rig installation', logged_by: 1, logged_at: new Date().toISOString() },
];

let mockSoftware = [
  { software_id: 1, title: 'NIM LLM Pipeline Orchestrator', description: 'Build rigid tool-calling pipelines using local Llama-3.3.', repository_url: 'https://github.com/cortex/nim-orchestrator', status: 'IN_DEVELOPMENT', assigned_engineer_id: 1, engineer_name: 'Alice Vance' },
  { software_id: 2, title: 'NeMo Retriever Vector Connector', description: 'Embed unstructured hardware reports via E5 embedding NIM.', repository_url: 'https://github.com/cortex/nemo-vector', status: 'CODE_REVIEW', assigned_engineer_id: 1, engineer_name: 'Alice Vance' },
  { software_id: 3, title: 'ERP Dashboard Core', description: 'Light-themed interactive management portal.', repository_url: 'https://github.com/cortex/erp-dashboard', status: 'DEPLOYED', assigned_engineer_id: 4, engineer_name: 'Paul Sanna' },
];

let mockAdmin = [
  { affair_id: 1, title: 'Q3 Strategy Review Meeting', description: 'Executive meeting on July 10 to discuss pipeline targets.', category: 'ANNOUNCEMENT', status: 'ACTIVE', created_at: new Date().toISOString() },
  { affair_id: 2, title: 'Revised Expense Claim Guidelines', description: 'Submit receipts via Accounting dashboard within 7 days.', category: 'POLICY', status: 'ACTIVE', created_at: new Date().toISOString() },
  { affair_id: 3, title: 'Server Room AC Maintenance', description: 'Technicians will service the primary server room cooler on Monday morning.', category: 'FACILITY_REQUEST', status: 'ACTIVE', created_at: new Date().toISOString() },
];

let mockCircuits = [
  { design_id: 1, name: 'Titan Main Controller Board', description: 'Microcontroller schematic supporting CAN interfaces.', version: '1.2.0', status: 'SCHEMATIC_PENDING', designer_id: 1, designer_name: 'Alice Vance' },
  { design_id: 2, name: 'Secondary Layer Sensor Grid', description: 'Capacitive thermal sensors layout.', version: '0.9.0', status: 'PROTOTYPING', designer_id: 1, designer_name: 'Alice Vance' },
];

let mockDocumentation = [
  { doc_id: 1, title: 'Titan Mechanical Assembly Guide', content: '### Titan Joint Assembly\n1. Ensure rotary joint brackets are torque aligned to 45Nm.\n2. Apply lubricants to hydraulic piston shaft pins.\n3. Verify range of motion does not exceed 120 degrees.', created_by: 2, creator_name: 'Bob Miller', created_at: new Date().toISOString() },
  { doc_id: 2, title: 'PCB Continuity Testing Procedure', content: '### Continuity Checklist\n- Use pre-calibrated multi-meter set to resistance/buzzer mode.\n- Check continuity from primary voltage input bus to bypass capacitors.\n- If pin 14 resistance exceeds 0.2 Ohms, log as FAIL.', created_by: 1, creator_name: 'Alice Vance', created_at: new Date().toISOString() },
];

// ============================================================================
// Authentication Client Provisioner
// ============================================================================
const getAuthClient = () => {
  const url = process.env.SUPABASE_URL || 'https://mock-supabase-url.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-key-for-development';
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

// ============================================================================
// Authentication Middleware & RBAC guards
// ============================================================================
const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const publicPaths = ['/api/auth/login', '/api/auth/signup', '/api/seed', '/health'];
  
  if (publicPaths.includes(req.path) || !req.path.startsWith('/api/')) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  try {
    let email = '';

    if (isSupabaseMock) {
      if (!token.startsWith('mock-jwt-')) {
        return res.status(401).json({ error: 'Invalid mock access token.' });
      }
      email = token.replace('mock-jwt-', '');
    } else {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid or expired session token.' });
      }
      email = user.email || '';
    }

    if (!email) {
      return res.status(401).json({ error: 'User email not found in session.' });
    }

    let employee;
    if (isSupabaseMock) {
      employee = mockEmployees.find(e => e.email.toLowerCase() === email.toLowerCase());
    } else {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      
      if (error) {
        console.error('[Auth Middleware] Error loading employee:', error);
      }
      employee = data;
    }

    if (!employee) {
      return res.status(403).json({ error: 'Access denied. Email is not registered as an employee.' });
    }

    req.user = employee;
    next();
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

const requireCEO = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || (req.user.role !== 'CEO' && req.user.department !== 'Administration')) {
    return res.status(403).json({ error: 'Access restricted to CEO or Administrators.' });
  }
  next();
};

const requireCEOOrSelf = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  const empId = parseInt(req.params.id);
  if (req.user.role === 'CEO' || req.user.department === 'Administration' || req.user.employee_id === empId) {
    return next();
  }
  return res.status(403).json({ error: 'Access restricted to CEO, Administrators, or the employee themselves.' });
};

const requireDepartment = (allowedDepts: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (req.user.role === 'CEO' || req.user.department === 'Administration') {
      return next();
    }
    if (!allowedDepts.includes(req.user.department)) {
      return res.status(403).json({ error: `Access restricted. Allowed departments: ${allowedDepts.join(', ')}` });
    }
    next();
  };
};

// Register token middleware globally for all API requests
app.use(authenticateToken);

// ============================================================================
// Authentication API Endpoints
// ============================================================================
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    if (isSupabaseMock) {
      const employee = mockEmployees.find(e => e.email.toLowerCase() === email.toLowerCase());
      if (!employee) {
        return res.status(401).json({ error: 'Invalid email or password (mock mode).' });
      }
      const token = `mock-jwt-${employee.email}`;
      return res.json({ token, user: employee });
    } else {
      const authClient = getAuthClient();
      let { data, error } = await authClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Query employee details to verify they are a registered employee
        const { data: dbEmp } = await supabase
          .from('employees')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (dbEmp) {
          console.log(`[Auth Login] Auto-provisioning/updating employee in Supabase Auth: ${email}`);
          
          // List users to check if user already exists
          const { data: { users }, error: listError } = await authClient.auth.admin.listUsers();
          const existingUser = (users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());

          if (existingUser) {
            // User exists, update password to match typed password
            const { error: resetError } = await authClient.auth.admin.updateUserById(existingUser.id, {
              password: password
            });
            if (resetError) {
              console.error('[Auth Login] Failed to reset user password:', resetError);
            }
          } else {
            // User doesn't exist, create them
            const { data: adminUser, error: adminError } = await authClient.auth.admin.createUser({
              email,
              password,
              email_confirm: true
            });
            if (adminError) {
              console.error('[Auth Login] Failed to auto-provision user:', adminError);
            }
          }

          // Retry login
          const retryAuth = await authClient.auth.signInWithPassword({
            email,
            password,
          });
          if (!retryAuth.error && retryAuth.data.session) {
            data = retryAuth.data;
            error = null;
          } else {
            console.error('[Auth Login] Failed to sign in after auto-provisioning/reset:', retryAuth.error);
          }
        }
      }

      if (error || !data.session) {
        return res.status(401).json({ error: error?.message || 'Authentication failed.' });
      }
      
      console.log(`[Auth Login] Querying employees table for email: "${email}"`);
      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('*')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();
      
      console.log(`[Auth Login] Employees table query output:`, employee, `Error:`, empError);

      if (empError || !employee) {
        return res.status(403).json({ error: `Logged in but employee record not found for email: ${email}` });
      }

      return res.json({ token: data.session.access_token, user: employee });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/signup', async (req: Request, res: Response) => {
  const { email, password, first_name, last_name, department, role } = req.body;
  if (!email || !password || !first_name || !last_name || !department || !role) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    if (isSupabaseMock) {
      if (mockEmployees.some(e => e.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ error: 'Email already registered.' });
      }
      const newEmp = {
        employee_id: mockEmployees.length + 1,
        first_name,
        last_name,
        email,
        phone: '',
        department,
        role,
        street_address: '',
        city: '',
        state: '',
        zip_code: '',
        country: 'USA',
        is_active: true,
        hire_date: new Date().toISOString().split('T')[0]
      };
      mockEmployees.push(newEmp);
      const token = `mock-jwt-${newEmp.email}`;
      return res.json({ token, user: newEmp });
    } else {
      const { data: existingEmp } = await supabase
        .from('employees')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      const authClient = getAuthClient();
      const { data: adminUser, error } = await authClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      // Log them in immediately to get a session
      const signInRes = await authClient.auth.signInWithPassword({
        email,
        password
      });

      if (signInRes.error || !signInRes.data.session) {
        return res.status(400).json({ error: `Registration succeeded, but auto-login failed: ${signInRes.error?.message}` });
      }

      const data = signInRes.data;
      let employee = existingEmp;

      if (!employee) {
        const { data: newEmp, error: insError } = await supabase
          .from('employees')
          .insert([{
            first_name,
            last_name,
            email,
            phone: '',
            department,
            role,
            street_address: '',
            city: '',
            state: '',
            zip_code: '',
            country: 'USA',
            is_active: true,
            hire_date: new Date().toISOString().split('T')[0]
          }])
          .select()
          .single();

        if (insError) {
          return res.status(400).json({ error: `Auth account created, but profile mapping failed: ${insError.message}` });
        }
        employee = newEmp;
      }

      return res.json({ token: data.session?.access_token || '', user: employee });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  return res.json(req.user);
});

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
    const { error } = await supabase.from('employees').select('count', { count: 'exact', head: true });
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
      error: 'Cannot seed database while running in mock mode.',
    });
  }

  try {
    console.log('[Cortex Seeding] Beginning database seeding on Supabase...');

    // 1. Seed HR Employees
    const { error: empError } = await supabase.from('employees').upsert([
      { first_name: 'Ananya', last_name: 'Krishnan', email: 'ananya.krishnan@cortex-enterprise.io', phone: '+91-98451-20034', department: 'QA', role: 'Lead Test Engineer', street_address: '14, Koramangala 3rd Block', city: 'Bengaluru', state: 'Karnataka', zip_code: '560034', country: 'India', is_active: true },
      { first_name: 'Rohan', last_name: 'Mehta', email: 'rohan.mehta@cortex-enterprise.io', phone: '+91-99870-45123', department: 'Production', role: 'Mechanical Designer', street_address: '7, MIDC Industrial Estate', city: 'Pune', state: 'Maharashtra', zip_code: '411019', country: 'India', is_active: true },
      { first_name: 'Priya', last_name: 'Nair', email: 'priya.nair@cortex-enterprise.io', phone: '+91-94470-88201', department: 'Accounting', role: 'Senior Auditor', street_address: '22, Anna Salai', city: 'Chennai', state: 'Tamil Nadu', zip_code: '600002', country: 'India', is_active: true },
      { first_name: 'Vikram', last_name: 'Sharma', email: 'vikram.sharma@cortex-enterprise.io', phone: '+91-98100-33456', department: 'Administration', role: 'Admin User', street_address: '5, Connaught Place', city: 'New Delhi', state: 'Delhi', zip_code: '110001', country: 'India', is_active: true },
    ], { onConflict: 'email' });

    if (empError) throw new Error(`HR seeding failed: ${empError.message}`);

    // Fetch employees back to map assignment links correctly
    const { data: dbEmps } = await supabase.from('employees').select('employee_id, first_name');
    const empMap = new Map((dbEmps || []).map(e => [e.first_name, e.employee_id]));

    // Delete existing records to prevent duplication on re-seed
    await supabase.from('ledgers').delete().gt('ledger_id', 0);
    await supabase.from('technical_logs').delete().gt('log_id', 0);
    await supabase.from('task_assignments').delete().gt('assignment_id', 0);
    await supabase.from('tasks').delete().gt('task_id', 0);
    await supabase.from('attendance').delete().gt('attendance_id', 0);
    await supabase.from('stock_logs').delete().gt('log_id', 0);
    await supabase.from('products').delete().gt('product_id', 0);
    await supabase.from('software_assignments').delete().gt('software_id', 0);
    await supabase.from('admin_affairs').delete().gt('affair_id', 0);
    await supabase.from('circuit_designs').delete().gt('design_id', 0);
    await supabase.from('documentation').delete().gt('doc_id', 0);
    await supabase.from('audit_fines').delete().gt('fine_id', 0);



    // 2. Seed Ledgers
    const { error: ledgerError } = await supabase.from('ledgers').insert([
      { transaction_date: '2026-06-17', account_name: 'Classik Office Solutions', description: 'Ergonomic chairs for development floor', amount: 62000.00, type: 'DEBIT', category: 'Office Supplies', status: 'RECONCILED' },
      { transaction_date: '2026-06-16', account_name: 'Tata Communications Ltd', description: 'Data centre co-location and bandwidth fee', amount: 195000.00, type: 'DEBIT', category: 'Infrastructure', status: 'CLEARED' },
      { transaction_date: '2026-06-15', account_name: 'Dentsu Webchutney India', description: 'Digital campaign retainer - Q2 FY27', amount: 420000.00, type: 'DEBIT', category: 'Advertising', status: 'CLEARED' },
    ]);
    if (ledgerError) throw new Error(`Ledger seeding failed: ${ledgerError.message}`);

    // 3. Seed Unstructured Technical logs
    const rawLogs = [
      { component_id: 'TITAN-CHASSIS-009', testing_engineer: 'Ananya Krishnan', content: 'Thermal stress chamber test started at 50C. Temperature ramped to 85C over 2 hours. Slight metal expansion observed but structural boundaries remained intact. Structural compliance passed.', test_result: 'PASS' },
      { component_id: 'PCB-BOARD-A4', testing_engineer: 'Ananya Krishnan', content: 'Circuit continuity check failed on the secondary layer. High resistance noted on trace pin 14. Potential copper bridging causing short circuit under voltage load.', test_result: 'FAIL' },
      { component_id: 'TITAN-CHASSIS-010', testing_engineer: 'Ananya Krishnan', content: 'Hydraulic pressure testing exceeded maximum safety tolerance. Chassis suffered deformation at 480MPa loading, breaching safety limits of 450MPa. Redesign required.', test_result: 'FAIL' },
    ];

    console.log('[Cortex Seeding] Generating vector embeddings for technical logs...');
    const vectorLogs = await Promise.all(
      rawLogs.map(async (log) => {
        const embedding = await getEmbedding(log.content, 'passage');
        return { ...log, embedding };
      })
    );
    const { error: logsError } = await supabase.from('technical_logs').insert(vectorLogs);
    if (logsError) throw new Error(`QA logs seeding failed: ${logsError.message}`);

    // 4. Seed Tasks
    const { data: taskData, error: taskError } = await supabase.from('tasks').insert([
      { title: 'Verify QA Circuit Pinouts', description: 'Run continuity checks on primary power trace layers.', department: 'QA', deadline: '2026-06-25', status: 'IN_PROGRESS', progress: 45 },
      { title: 'Assemble Titan Mechanical Joint', description: 'Connect rotary joints and load-test limits of hydraulic arm brackets.', department: 'Production', deadline: '2026-06-22', status: 'PENDING', progress: 0 },
      { title: 'Update GST Audit Ledger Report', description: 'Compile ledger categories and reconcile GSTIN debit offsets for FY27.', department: 'Accounting', deadline: '2026-06-20', status: 'COMPLETED', progress: 100 },
      { title: 'Organise Q3 All-Hands Town Hall', description: 'Schedule venue at head office and prepare agenda for senior management.', department: 'Administration', deadline: '2026-07-15', status: 'IN_PROGRESS', progress: 15 }
    ]).select();
    if (taskError) throw new Error(`Tasks seeding failed: ${taskError.message}`);

    // Seed Task Assignments
    if (taskData) {
      const assignments = [
        { task_id: taskData[0].task_id, employee_id: empMap.get('Ananya'), progress: 45 },
        { task_id: taskData[1].task_id, employee_id: empMap.get('Rohan'), progress: 0 },
        { task_id: taskData[2].task_id, employee_id: empMap.get('Priya'), progress: 100 },
        { task_id: taskData[3].task_id, employee_id: empMap.get('Vikram'), progress: 15 }
      ].filter(a => a.employee_id !== undefined);

      const { error: assignError } = await supabase.from('task_assignments').insert(assignments);
      if (assignError) throw new Error(`Task assignments seeding failed: ${assignError.message}`);
    }

    // 5. Seed Attendance
    const { error: attendError } = await supabase.from('attendance').insert([
      { employee_id: empMap.get('Ananya'), work_date: '2026-06-19', status: 'PRESENT', check_in_time: '08:52:00', check_out_time: '17:30:00' },
      { employee_id: empMap.get('Rohan'), work_date: '2026-06-19', status: 'LATE', check_in_time: '09:05:00', check_out_time: '18:00:00' },
      { employee_id: empMap.get('Priya'), work_date: '2026-06-19', status: 'PRESENT', check_in_time: '08:30:00', check_out_time: '16:45:00' },
      { employee_id: empMap.get('Vikram'), work_date: '2026-06-19', status: 'LEAVE', check_in_time: null, check_out_time: null }
    ].filter(a => a.employee_id !== undefined));
    if (attendError) throw new Error(`Attendance seeding failed: ${attendError.message}`);

    // 6. Seed Stock Management Products
    const { data: prodData, error: prodError } = await supabase.from('products').insert([
      { name: 'Titan Structural Frame Model-B', sku: 'TITAN-FRM-B', stock_quantity: 12, price: 375000.00, description: 'Reinforced high-load titanium skeleton.' },
      { name: 'Primary Circuit PCB Rev-4', sku: 'PCB-REV4', stock_quantity: 85, price: 9800.00, description: 'Multilayer circuit board with high-speed serial trace layout.' },
      { name: 'Hydraulic Compression Valve', sku: 'HYD-VAL-90', stock_quantity: 4, price: 56000.00, description: 'Pre-calibrated oil flow regulator.' },
      { name: 'Development Ergonomic Chair', sku: 'CHAIR-DEV-0', stock_quantity: 0, price: 18500.00, description: 'Mesh lumbar support office seat.' }
    ]).select();
    if (prodError) throw new Error(`Products seeding failed: ${prodError.message}`);

    // Seed Stock Logs
    if (prodData) {
      const { error: stockLogError } = await supabase.from('stock_logs').insert([
        { product_id: prodData[0].product_id, change_qty: 4, reason: 'Restocked from Bharat Forge assembly supplier', logged_by: empMap.get('Vikram') },
        { product_id: prodData[1].product_id, change_qty: -5, reason: 'Allocated for test rig installation at Pune facility', logged_by: empMap.get('Ananya') }
      ].filter(l => l.logged_by !== undefined));
      if (stockLogError) throw new Error(`Stock logs seeding failed: ${stockLogError.message}`);
    }

    // 7. Seed Software assignments
    const { error: swError } = await supabase.from('software_assignments').insert([
      { title: 'NIM LLM Pipeline Orchestrator', description: 'Build rigid tool-calling pipelines using local Llama-3.3.', repository_url: 'https://github.com/cortex/nim-orchestrator', status: 'IN_DEVELOPMENT', assigned_engineer_id: empMap.get('Ananya') },
      { title: 'NeMo Retriever Vector Connector', description: 'Embed unstructured hardware reports via E5 embedding NIM.', repository_url: 'https://github.com/cortex/nemo-vector', status: 'CODE_REVIEW', assigned_engineer_id: empMap.get('Ananya') },
      { title: 'ERP Dashboard Core', description: 'Light-themed interactive management portal.', repository_url: 'https://github.com/cortex/erp-dashboard', status: 'DEPLOYED', assigned_engineer_id: empMap.get('Vikram') }
    ].filter(s => s.assigned_engineer_id !== undefined));
    if (swError) throw new Error(`Software seeding failed: ${swError.message}`);

    // 8. Seed Administrative Affairs
    const { error: adminError } = await supabase.from('admin_affairs').insert([
      { title: 'Q3 Business Review Meeting', description: 'Senior leadership meeting on 10 July to review pipeline targets and OKRs for FY27.', category: 'ANNOUNCEMENT', status: 'ACTIVE' },
      { title: 'Revised Reimbursement & TA/DA Policy', description: 'All expense claims must be submitted via Accounting dashboard with GST-valid receipts within 7 working days.', category: 'POLICY', status: 'ACTIVE' },
      { title: 'Server Room AC Maintenance', description: 'HVAC technicians will service the primary server room cooling unit on Monday morning. Downtime expected 09:00–11:00 IST.', category: 'FACILITY_REQUEST', status: 'ACTIVE' }
    ]);
    if (adminError) throw new Error(`Admin affairs seeding failed: ${adminError.message}`);

    // 9. Seed Circuit Designs
    const { error: cktError } = await supabase.from('circuit_designs').insert([
      { name: 'Titan Main Controller Board', description: 'Microcontroller schematic supporting CAN interfaces.', version: '1.2.0', status: 'SCHEMATIC_PENDING', designer_id: empMap.get('Ananya') },
      { name: 'Secondary Layer Sensor Grid', description: 'Capacitive thermal sensors layout.', version: '0.9.0', status: 'PROTOTYPING', designer_id: empMap.get('Ananya') },
      { name: 'Power Supply Regulator Rev-A', description: 'Buck-boost regulator switching at 1.2MHz.', version: '2.0.0', status: 'APPROVED', designer_id: empMap.get('Rohan') }
    ].filter(c => c.designer_id !== undefined));
    if (cktError) throw new Error(`Circuit designs seeding failed: ${cktError.message}`);

    // 10. Seed Documentation
    const { error: docError } = await supabase.from('documentation').insert([
      { title: 'Titan Mechanical Assembly Guide', content: '### Titan Joint Assembly\n1. Ensure rotary joint brackets are torque aligned to 45Nm.\n2. Apply lubricants to hydraulic piston shaft pins.\n3. Verify range of motion does not exceed 120 degrees.', created_by: empMap.get('Rohan') },
      { title: 'PCB Continuity Testing Procedure', content: '### Continuity Checklist\n- Use pre-calibrated multi-meter set to resistance/buzzer mode.\n- Check continuity from primary voltage input bus to bypass capacitors.\n- If pin 14 resistance exceeds 0.2 Ohms, log as FAIL.', created_by: empMap.get('Ananya') }
    ].filter(d => d.created_by !== undefined));
    if (docError) throw new Error(`Documentation seeding failed: ${docError.message}`);

    // 11. Seed Audit Fines
    const { error: fineError } = await supabase.from('audit_fines').insert([
      { entity_name: 'Rohan Mehta', amount: 5000.00, reason: 'Safety goggles violation in Production lab — breach of IS 7524 safety norms', fine_date: '2026-06-18', status: 'PENDING' },
      { entity_name: 'QA Department', amount: 15000.00, reason: 'Late firmware release compliance delay — missed BIS certification deadline', fine_date: '2026-06-15', status: 'PAID' },
    ]);
    if (fineError) throw new Error(`Audit fines seeding failed: ${fineError.message}`);


    return res.json({
      status: 'success',
      message: 'Supabase database successfully seeded with all advanced operational hub datasets.',
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
// Data Management API Endpoints
// ============================================================================

app.get('/api/employees', async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json(mockEmployees);
  }
  try {
    const { data, error } = await supabase.from('employees').select('*').order('last_name', { ascending: true });
    if (error) throw error;
    return res.json(data || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/employees', requireCEO, async (req: Request, res: Response) => {
  const { first_name, last_name, email, phone, department, role, street_address, city, state, zip_code, country, is_active, hire_date } = req.body;

  if (!first_name || !last_name || !email || !department || !role || !hire_date) {
    return res.status(400).json({ error: 'Missing required employee fields.' });
  }

  if (isSupabaseMock) {
    const newEmp = {
      employee_id: mockEmployees.length + 1,
      first_name,
      last_name,
      email,
      phone: phone || '',
      department,
      role,
      street_address: street_address || '',
      city: city || '',
      state: state || '',
      zip_code: zip_code || '',
      country: country || 'USA',
      is_active: is_active !== undefined ? is_active : true,
      hire_date
    };
    mockEmployees.push(newEmp);
    return res.json(newEmp);
  }

  try {
    const { data, error } = await supabase
      .from('employees')
      .insert([{
        first_name,
        last_name,
        email,
        phone: phone || '',
        department,
        role,
        street_address: street_address || '',
        city: city || '',
        state: state || '',
        zip_code: zip_code || '',
        country: country || 'USA',
        is_active: is_active !== undefined ? is_active : true,
        hire_date
      }])
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    if (err.message && (err.message.includes('column') || err.message.includes('schema cache'))) {
      console.warn('[Cortex API] Warning: Address columns are missing in employees table. Falling back to core columns.');
      try {
        const { data, error } = await supabase
          .from('employees')
          .insert([{
            first_name,
            last_name,
            email,
            phone: phone || '',
            department,
            role,
            is_active: is_active !== undefined ? is_active : true,
            hire_date
          }])
          .select()
          .single();

        if (error) throw error;
        return res.json({ ...data, warning: 'Address fields were bypassed because database columns are missing. Please run migrations.' });
      } catch (err2: any) {
        console.error('[Cortex API] Fallback error registering employee:', err2);
        return res.status(500).json({ error: err2.message });
      }
    }
    console.error('[Cortex API] Error registering employee:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/employees/:id', requireCEOOrSelf, async (req: Request, res: Response) => {
  const empId = parseInt(req.params.id);
  const { first_name, last_name, email, phone, department, role, street_address, city, state, zip_code, country, is_active, hire_date } = req.body;

  if (isSupabaseMock) {
    const emp = mockEmployees.find(e => e.employee_id === empId);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    if (first_name !== undefined) emp.first_name = first_name;
    if (last_name !== undefined) emp.last_name = last_name;
    if (email !== undefined) emp.email = email;
    if (phone !== undefined) emp.phone = phone;
    if (department !== undefined) emp.department = department;
    if (role !== undefined) emp.role = role;
    if (street_address !== undefined) emp.street_address = street_address;
    if (city !== undefined) emp.city = city;
    if (state !== undefined) emp.state = state;
    if (zip_code !== undefined) emp.zip_code = zip_code;
    if (country !== undefined) emp.country = country;
    if (is_active !== undefined) emp.is_active = is_active;
    if (hire_date !== undefined) emp.hire_date = hire_date;

    return res.json(emp);
  }

  const updatePayload: any = {};
  if (first_name !== undefined) updatePayload.first_name = first_name;
  if (last_name !== undefined) updatePayload.last_name = last_name;
  if (email !== undefined) updatePayload.email = email;
  if (phone !== undefined) updatePayload.phone = phone;
  if (department !== undefined) updatePayload.department = department;
  if (role !== undefined) updatePayload.role = role;
  if (street_address !== undefined) updatePayload.street_address = street_address;
  if (city !== undefined) updatePayload.city = city;
  if (state !== undefined) updatePayload.state = state;
  if (zip_code !== undefined) updatePayload.zip_code = zip_code;
  if (country !== undefined) updatePayload.country = country;
  if (is_active !== undefined) updatePayload.is_active = is_active;
  if (hire_date !== undefined) updatePayload.hire_date = hire_date;

  if (Object.keys(updatePayload).length === 0) {
    const { data } = await supabase.from('employees').select('*').eq('employee_id', empId).single();
    return res.json(data);
  }

  try {
    const { data, error } = await supabase
      .from('employees')
      .update(updatePayload)
      .eq('employee_id', empId)
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    if (err.message && (err.message.includes('column') || err.message.includes('schema cache'))) {
      console.warn('[Cortex API] Warning: Address columns are missing in employees table. Falling back to core columns.');
      
      const fallbackPayload: any = {};
      if (first_name !== undefined) fallbackPayload.first_name = first_name;
      if (last_name !== undefined) fallbackPayload.last_name = last_name;
      if (email !== undefined) fallbackPayload.email = email;
      if (phone !== undefined) fallbackPayload.phone = phone;
      if (department !== undefined) fallbackPayload.department = department;
      if (role !== undefined) fallbackPayload.role = role;
      if (is_active !== undefined) fallbackPayload.is_active = is_active;
      if (hire_date !== undefined) fallbackPayload.hire_date = hire_date;

      try {
        if (Object.keys(fallbackPayload).length === 0) {
          const { data } = await supabase.from('employees').select('*').eq('employee_id', empId).single();
          return res.json({ ...data, warning: 'Address fields were bypassed because database columns are missing. Please run migrations.' });
        }

        const { data, error } = await supabase
          .from('employees')
          .update(fallbackPayload)
          .eq('employee_id', empId)
          .select()
          .single();

        if (error) throw error;
        return res.json({ ...data, warning: 'Address fields were bypassed because database columns are missing. Please run migrations.' });
      } catch (err2: any) {
        console.error('[Cortex API] Fallback error updating employee:', err2);
        return res.status(500).json({ error: err2.message });
      }
    }
    console.error('[Cortex API] Error updating employee:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/ledgers', requireDepartment(['Accounting']), async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json(mockLedgers);
  }
  try {
    const { data, error } = await supabase.from('ledgers').select('*').order('transaction_date', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/ledgers', requireDepartment(['Accounting']), async (req: Request, res: Response) => {
  const { account_name, description, amount, category, type, status, transaction_date } = req.body;
  if (!account_name || !description || amount === undefined || !category || !type) {
    return res.status(400).json({ error: 'Missing required ledger transaction parameters.' });
  }

  const txDate = transaction_date || new Date().toISOString().split('T')[0];
  const txStatus = status || 'CLEARED';

  if (isSupabaseMock) {
    const newTransaction = {
      ledger_id: mockLedgers.length + 101,
      transaction_date: txDate,
      account_name,
      description,
      amount: parseFloat(amount),
      type,
      category,
      status: txStatus
    };
    mockLedgers.unshift(newTransaction);
    return res.json(newTransaction);
  }

  try {
    const { data, error } = await supabase
      .from('ledgers')
      .insert([{ transaction_date: txDate, account_name, description, amount: parseFloat(amount), type, category, status: txStatus }])
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/ledgers/:id/reconcile', requireDepartment(['Accounting']), async (req: Request, res: Response) => {
  const ledgerId = parseInt(req.params.id);
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Missing status field.' });
  }

  if (isSupabaseMock) {
    const transaction = mockLedgers.find(l => l.ledger_id === ledgerId);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found.' });
    transaction.status = status;
    return res.json(transaction);
  }

  try {
    const { data, error } = await supabase
      .from('ledgers')
      .update({ status })
      .eq('ledger_id', ledgerId)
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ledgers/:id', requireCEO, async (req: Request, res: Response) => {
  const ledgerId = parseInt(req.params.id);

  if (isSupabaseMock) {
    const index = mockLedgers.findIndex(l => l.ledger_id === ledgerId);
    if (index === -1) return res.status(404).json({ error: 'Transaction not found.' });
    mockLedgers.splice(index, 1);
    return res.json({ success: true, message: 'Transaction voided.' });
  }

  try {
    const { error } = await supabase
      .from('ledgers')
      .delete()
      .eq('ledger_id', ledgerId);

    if (error) throw error;
    return res.json({ success: true, message: 'Transaction voided.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});


app.get('/api/logs', async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json(mockLogs);
  }
  try {
    const { data, error } = await supabase.from('technical_logs').select('log_id, component_id, testing_engineer, content, test_result, logged_at').order('logged_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/logs', async (req: Request, res: Response) => {
  const { component_id, testing_engineer, content, test_result } = req.body;

  if (!component_id || !testing_engineer || !content || !test_result) {
    return res.status(400).json({ error: 'Missing log ingestion parameters (component_id, testing_engineer, content, test_result).' });
  }

  if (isSupabaseMock) {
    const newLog = { log_id: mockLogs.length + 1, component_id, testing_engineer, content, test_result, logged_at: new Date().toISOString() };
    mockLogs.unshift(newLog);
    return res.json({ status: 'success', message: 'Log successfully ingested (mock mode).', log: newLog });
  }

  try {
    console.log(`[Cortex Server] Ingesting QA Log for component ${component_id}...`);
    const embedding = await getEmbedding(content, 'passage');
    const { data, error } = await supabase.from('technical_logs').insert([
      { component_id, testing_engineer, content, embedding, test_result }
    ]);
    if (error) throw error;
    return res.json({ status: 'success', message: 'Log successfully ingested and vectorized in Supabase.' });
  } catch (err: any) {
    console.error('[Cortex Server Log Ingestion Failed]:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 1. Project Management Endpoints
app.get('/api/tasks', async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json(mockTasks);
  }
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, task_assignments(employee_id, progress, employees(first_name, last_name))')
      .order('deadline', { ascending: true });
    if (error) throw error;

    // Format tasks to match clean structured payload with flat employee assignments
    const formatted = (data || []).map(t => {
      const assignments = (t.task_assignments || []).map((ta: any) => ({
        employee_id: ta.employee_id,
        first_name: ta.employees?.first_name,
        last_name: ta.employees?.last_name,
        progress: ta.progress || 0
      }));
      return { ...t, assignments };
    });

    return res.json(formatted);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', requireCEO, async (req: Request, res: Response) => {
  const { title, description, department, deadline, employee_ids } = req.body;
  if (!title || !description || !department || !deadline) {
    return res.status(400).json({ error: 'Missing required task parameters.' });
  }

  if (isSupabaseMock) {
    const assignedEmps = (employee_ids || []).map((id: number) => {
      const e = mockEmployees.find(emp => emp.employee_id === id);
      return e ? { employee_id: e.employee_id, first_name: e.first_name, last_name: e.last_name, progress: 0 } : null;
    }).filter(Boolean);

    const newTask = {
      task_id: mockTasks.length + 1,
      title,
      description,
      department,
      deadline,
      status: 'PENDING',
      progress: 0,
      created_at: new Date().toISOString(),
      assignments: assignedEmps
    };
    mockTasks.push(newTask);
    return res.json(newTask);
  }

  try {
    // Insert task
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert([{ title, description, department, deadline }])
      .select()
      .single();

    if (taskError) throw taskError;

    // Link assignments
    if (employee_ids && employee_ids.length > 0 && task) {
      const links = employee_ids.map((empId: number) => ({
        task_id: task.task_id,
        employee_id: empId
      }));
      const { error: linkError } = await supabase.from('task_assignments').insert(links);
      if (linkError) throw linkError;
    }

    return res.json(task);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:id/progress', async (req: Request, res: Response) => {
  const taskId = parseInt(req.params.id);
  const { progress, status } = req.body;

  if (progress === undefined || !status) {
    return res.status(400).json({ error: 'Missing progress or status parameters.' });
  }

  if (isSupabaseMock) {
    const task = mockTasks.find(t => t.task_id === taskId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    task.progress = parseInt(progress);
    task.status = status;
    return res.json(task);
  }

  try {
    const { data, error } = await supabase
      .from('tasks')
      .update({ progress: parseInt(progress), status })
      .eq('task_id', taskId)
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:taskId/assignments/:employeeId/progress', async (req: Request, res: Response) => {
  const taskId = parseInt(req.params.taskId);
  const employeeId = parseInt(req.params.employeeId);
  const { progress } = req.body;

  if (progress === undefined) {
    return res.status(400).json({ error: 'Missing progress parameter.' });
  }

  if (isSupabaseMock) {
    const task = mockTasks.find(t => t.task_id === taskId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    
    const assignment = (task.assignments || []).find(a => a.employee_id === employeeId);
    if (!assignment) return res.status(404).json({ error: 'Employee assignment not found.' });
    
    assignment.progress = parseInt(progress);

    // Recompute overall parent task progress as average of all assigned progresses
    if (task.assignments && task.assignments.length > 0) {
      const totalProgress = task.assignments.reduce((sum, a) => sum + (a.progress || 0), 0);
      task.progress = Math.round(totalProgress / task.assignments.length);
      task.status = task.progress === 100 ? 'COMPLETED' : (task.progress > 0 ? 'IN_PROGRESS' : 'PENDING');
    }

    return res.json(task);
  }

  try {
    const { data: assignment, error: assignError } = await supabase
      .from('task_assignments')
      .update({ progress: parseInt(progress) })
      .eq('task_id', taskId)
      .eq('employee_id', employeeId)
      .select()
      .single();

    if (assignError) throw assignError;

    // Recalculate parent task overall progress/status
    const { data: siblingAssigns } = await supabase
      .from('task_assignments')
      .select('progress')
      .eq('task_id', taskId);

    if (siblingAssigns && siblingAssigns.length > 0) {
      const avgProgress = Math.round(siblingAssigns.reduce((sum, a) => sum + (a.progress || 0), 0) / siblingAssigns.length);
      const status = avgProgress === 100 ? 'COMPLETED' : (avgProgress > 0 ? 'IN_PROGRESS' : 'PENDING');
      
      await supabase
        .from('tasks')
        .update({ progress: avgProgress, status })
        .eq('task_id', taskId);
    }

    return res.json(assignment);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Attendance Endpoints
app.get('/api/attendance', async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json(mockAttendance);
  }
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select('*, employees(first_name, last_name, department)')
      .order('work_date', { ascending: false });
    if (error) throw error;

    const formatted = (data || []).map(a => ({
      attendance_id: a.attendance_id,
      employee_id: a.employee_id,
      first_name: a.employees?.first_name,
      last_name: a.employees?.last_name,
      department: a.employees?.department,
      work_date: a.work_date,
      status: a.status,
      check_in_time: a.check_in_time,
      check_out_time: a.check_out_time,
    }));
    return res.json(formatted);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance', async (req: Request, res: Response) => {
  const { employee_id, status, check_in_time, check_out_time } = req.body;
  if (!employee_id || !status) {
    return res.status(400).json({ error: 'Missing employee_id or status.' });
  }

  const today = new Date().toISOString().split('T')[0];

  if (isSupabaseMock) {
    const emp = mockEmployees.find(e => e.employee_id === employee_id);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    // Check if record for today exists
    const idx = mockAttendance.findIndex(a => a.employee_id === employee_id && a.work_date === today);
    const record = {
      attendance_id: idx >= 0 ? mockAttendance[idx].attendance_id : mockAttendance.length + 1,
      employee_id,
      first_name: emp.first_name,
      last_name: emp.last_name,
      department: emp.department,
      work_date: today,
      status,
      check_in_time: check_in_time || null,
      check_out_time: check_out_time || null
    };

    if (idx >= 0) {
      mockAttendance[idx] = record;
    } else {
      mockAttendance.push(record);
    }
    return res.json(record);
  }

  try {
    const { data, error } = await supabase
      .from('attendance')
      .upsert({
        employee_id,
        work_date: today,
        status,
        check_in_time: check_in_time || null,
        check_out_time: check_out_time || null
      }, { onConflict: 'employee_id,work_date' })
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2.5 Payroll / Salary Endpoint (CEO Only)
app.get('/api/payroll', requireCEO, async (req: Request, res: Response) => {
  let employees: any[] = [];
  let attendance: any[] = [];
  
  if (isSupabaseMock) {
    employees = mockEmployees;
    attendance = mockAttendance;
  } else {
    try {
      const { data: empData, error: empErr } = await supabase.from('employees').select('*');
      if (empErr) throw empErr;
      employees = empData || [];
      
      const { data: attData, error: attErr } = await supabase.from('attendance').select('*');
      if (attErr) throw attErr;
      attendance = attData || [];
    } catch (err: any) {
      if (err.message && (err.message.includes('find the table') || err.message.includes('schema cache'))) {
        console.warn('[Cortex API] Warning: missing tables for payroll. Using mock data fallback.');
        employees = mockEmployees;
        attendance = mockAttendance;
      } else {
        return res.status(500).json({ error: err.message });
      }
    }
  }

  const HOURLY_RATE = 1000; // base rate ₹1000/hr
  const payroll = employees.map(emp => {
    const empLogs = attendance.filter(a => a.employee_id === emp.employee_id);
    let totalHours = 0;
    
    empLogs.forEach(log => {
      if (log.check_in_time && log.check_out_time) {
        const [inH, inM, inS] = log.check_in_time.split(':').map(Number);
        const [outH, outM, outS] = log.check_out_time.split(':').map(Number);
        
        const inDate = new Date();
        inDate.setHours(inH, inM, inS || 0);
        
        const outDate = new Date();
        outDate.setHours(outH, outM, outS || 0);
        
        const diffMs = outDate.getTime() - inDate.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours > 0) totalHours += diffHours;
      }
    });

    return {
      employee_id: emp.employee_id,
      first_name: emp.first_name,
      last_name: emp.last_name,
      department: emp.department,
      role: emp.role,
      total_hours: parseFloat(totalHours.toFixed(2)),
      hourly_rate: HOURLY_RATE,
      total_salary: Math.round(totalHours * HOURLY_RATE)
    };
  });

  return res.json(payroll);
});

// 3. Stock/Product Endpoints
app.get('/api/products', requireDepartment(['Production']), async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json(mockProducts);
  }
  try {
    const { data, error } = await supabase.from('products').select('*').order('name', { ascending: true });
    if (error) throw error;
    return res.json(data || []);
  } catch (err: any) {
    if (err.message && (err.message.includes('find the table') || err.message.includes('schema cache'))) {
      console.warn('[Cortex API] Warning: products table missing. Falling back to mock data.');
      return res.json(mockProducts);
    }
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/logs', requireDepartment(['Production']), async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json(mockStockLogs);
  }
  try {
    const { data, error } = await supabase
      .from('stock_logs')
      .select('*, products(name), employees(first_name, last_name)')
      .order('logged_at', { ascending: false });
    if (error) throw error;

    const formatted = (data || []).map(l => ({
      log_id: l.log_id,
      product_id: l.product_id,
      product_name: l.products?.name,
      change_qty: l.change_qty,
      reason: l.reason,
      logged_by: l.logged_by,
      logged_by_name: l.employees ? `${l.employees.first_name} ${l.employees.last_name}` : 'System',
      logged_at: l.logged_at
    }));
    return res.json(formatted);
  } catch (err: any) {
    if (err.message && (err.message.includes('find the table') || err.message.includes('schema cache'))) {
      console.warn('[Cortex API] Warning: stock_logs table missing. Falling back to mock data.');
      return res.json(mockStockLogs);
    }
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/products/adjust', requireDepartment(['Production']), async (req: Request, res: Response) => {
  const { product_id, change_qty, reason, logged_by } = req.body;
  if (!product_id || change_qty === undefined || !reason) {
    return res.status(400).json({ error: 'Missing stock adjustment details.' });
  }

  if (isSupabaseMock) {
    const prod = mockProducts.find(p => p.product_id === product_id);
    if (!prod) return res.status(404).json({ error: 'Product not found.' });

    const newQty = prod.stock_quantity + parseInt(change_qty);
    if (newQty < 0) return res.status(400).json({ error: 'Negative stock quantities not allowed.' });

    prod.stock_quantity = newQty;
    const log = {
      log_id: mockStockLogs.length + 1,
      product_id,
      product_name: prod.name,
      change_qty: parseInt(change_qty),
      reason,
      logged_by: logged_by || 4,
      logged_at: new Date().toISOString()
    };
    mockStockLogs.unshift(log);

    return res.json({ product: prod, log });
  }

  try {
    // Fetch product stock first
    const { data: prod, error: fetchErr } = await supabase.from('products').select('*').eq('product_id', product_id).single();
    if (fetchErr) throw fetchErr;

    const newQty = (prod.stock_quantity || 0) + parseInt(change_qty);
    if (newQty < 0) throw new Error('Negative stock levels not allowed.');

    // Update quantity
    const { data: updatedProd, error: updateErr } = await supabase
      .from('products')
      .update({ stock_quantity: newQty })
      .eq('product_id', product_id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    // Log event
    const { data: log, error: logErr } = await supabase
      .from('stock_logs')
      .insert([{ product_id, change_qty: parseInt(change_qty), reason, logged_by: logged_by || null }])
      .select()
      .single();
    if (logErr) throw logErr;

    return res.json({ product: updatedProd, log });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Software Assignment Endpoints
app.get('/api/software', requireDepartment(['QA']), async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json(mockSoftware);
  }
  try {
    const { data, error } = await supabase
      .from('software_assignments')
      .select('*, employees(first_name, last_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const formatted = (data || []).map(s => ({
      software_id: s.software_id,
      title: s.title,
      description: s.description,
      repository_url: s.repository_url,
      status: s.status,
      assigned_engineer_id: s.assigned_engineer_id,
      engineer_name: s.employees ? `${s.employees.first_name} ${s.employees.last_name}` : 'Unassigned'
    }));
    return res.json(formatted);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/software/:id/status', requireDepartment(['QA']), async (req: Request, res: Response) => {
  const swId = parseInt(req.params.id);
  const { status, assigned_engineer_id } = req.body;

  if (isSupabaseMock) {
    const sw = mockSoftware.find(s => s.software_id === swId);
    if (!sw) return res.status(404).json({ error: 'Software project not found.' });

    if (status) sw.status = status;
    if (assigned_engineer_id !== undefined) {
      sw.assigned_engineer_id = assigned_engineer_id;
      const emp = mockEmployees.find(e => e.employee_id === assigned_engineer_id);
      sw.engineer_name = emp ? `${emp.first_name} ${emp.last_name}` : 'Unassigned';
    }
    return res.json(sw);
  }

  try {
    const updatePayload: any = {};
    if (status) updatePayload.status = status;
    if (assigned_engineer_id !== undefined) updatePayload.assigned_engineer_id = assigned_engineer_id || null;

    const { data, error } = await supabase
      .from('software_assignments')
      .update(updatePayload)
      .eq('software_id', swId)
      .select()
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Fallback cache for admin affairs when DB table is missing
let runtimeAdminAffairs: any[] | null = null;

// 5. Admin Affairs Endpoints
app.get('/api/admin', async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json(mockAdmin);
  }
  
  if (runtimeAdminAffairs !== null) {
    return res.json(runtimeAdminAffairs);
  }

  try {
    const { data, error } = await supabase.from('admin_affairs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err: any) {
    if (err.message && (err.message.includes('find the table') || err.message.includes('schema cache'))) {
      console.warn('[Cortex API] Warning: admin_affairs table missing. Initializing runtime cache.');
      runtimeAdminAffairs = [];
      return res.json(runtimeAdminAffairs);
    }
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin', requireCEO, async (req: Request, res: Response) => {
  const { title, description, category } = req.body;
  if (!title || !description || !category) {
    return res.status(400).json({ error: 'Missing admin affair fields.' });
  }

  if (isSupabaseMock) {
    const newAffair = {
      affair_id: mockAdmin.length + 1,
      title,
      description,
      category,
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };
    mockAdmin.unshift(newAffair);
    return res.json(newAffair);
  }

  try {
    if (runtimeAdminAffairs !== null) {
      const newAffair = {
        affair_id: runtimeAdminAffairs.length + 1,
        title,
        description,
        category,
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      };
      runtimeAdminAffairs.unshift(newAffair);
      return res.json(newAffair);
    }

    const { data, error } = await supabase
      .from('admin_affairs')
      .insert([{ title, description, category }])
      .select()
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    if (err.message && (err.message.includes('find the table') || err.message.includes('schema cache'))) {
      console.warn('[Cortex API] Warning: admin_affairs table missing. Switching to runtime cache.');
      runtimeAdminAffairs = [];
      const newAffair = {
        affair_id: 1,
        title,
        description,
        category,
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      };
      runtimeAdminAffairs.unshift(newAffair);
      return res.json(newAffair);
    }
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/:id', requireCEO, async (req: Request, res: Response) => {
  const affairId = parseInt(req.params.id);

  if (isSupabaseMock) {
    const idx = mockAdmin.findIndex(a => a.affair_id === affairId);
    if (idx !== -1) mockAdmin.splice(idx, 1);
    return res.json({ success: true });
  }

  try {
    if (runtimeAdminAffairs !== null) {
      const idx = runtimeAdminAffairs.findIndex(a => a.affair_id === affairId);
      if (idx !== -1) runtimeAdminAffairs.splice(idx, 1);
      return res.json({ success: true });
    }

    const { error } = await supabase
      .from('admin_affairs')
      .delete()
      .eq('affair_id', affairId);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. Circuit Designs Endpoints
app.get('/api/circuits', requireDepartment(['QA', 'Production']), async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json(mockCircuits);
  }
  try {
    const { data, error } = await supabase
      .from('circuit_designs')
      .select('*, employees(first_name, last_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const formatted = (data || []).map(c => ({
      design_id: c.design_id,
      name: c.name,
      description: c.description,
      version: c.version,
      status: c.status,
      designer_id: c.designer_id,
      designer_name: c.employees ? `${c.employees.first_name} ${c.employees.last_name}` : 'Unassigned'
    }));
    return res.json(formatted);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/circuits', requireDepartment(['QA', 'Production']), async (req: Request, res: Response) => {
  const { name, description, version, designer_id } = req.body;
  if (!name || !description || !designer_id) {
    return res.status(400).json({ error: 'Missing circuit parameter fields.' });
  }

  if (isSupabaseMock) {
    const emp = mockEmployees.find(e => e.employee_id === designer_id);
    const newCircuit = {
      design_id: mockCircuits.length + 1,
      name,
      description,
      version: version || '1.0.0',
      status: 'CONCEPT',
      designer_id,
      designer_name: emp ? `${emp.first_name} ${emp.last_name}` : 'Unassigned',
      created_at: new Date().toISOString()
    };
    mockCircuits.unshift(newCircuit);
    return res.json(newCircuit);
  }

  try {
    const { data, error } = await supabase
      .from('circuit_designs')
      .insert([{ name, description, version: version || '1.0.0', designer_id }])
      .select()
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6.5 Audit Fines Endpoints
app.get('/api/audit-fines', requireDepartment(['Accounting']), async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json(mockAuditFines);
  }
  try {
    const { data, error } = await supabase
      .from('audit_fines')
      .select('*')
      .order('fine_date', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/audit-fines', requireDepartment(['Accounting']), async (req: Request, res: Response) => {
  const { entity_name, amount, reason, fine_date, status } = req.body;
  if (!entity_name || amount === undefined || !reason) {
    return res.status(400).json({ error: 'Missing required audit fine parameters.' });
  }

  const fDate = fine_date || new Date().toISOString().split('T')[0];
  const fStatus = status || 'PENDING';

  if (isSupabaseMock) {
    const newFine = {
      fine_id: mockAuditFines.length + 101,
      entity_name,
      amount: parseFloat(amount),
      reason,
      fine_date: fDate,
      status: fStatus
    };
    mockAuditFines.unshift(newFine);
    return res.json(newFine);
  }

  try {
    const { data, error } = await supabase
      .from('audit_fines')
      .insert([{ entity_name, amount: parseFloat(amount), reason, fine_date: fDate, status: fStatus }])
      .select()
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/audit-fines/:id/status', requireDepartment(['Accounting']), async (req: Request, res: Response) => {
  const fineId = parseInt(req.params.id);
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Missing status field.' });
  }

  if (isSupabaseMock) {
    const fine = mockAuditFines.find(f => f.fine_id === fineId);
    if (!fine) return res.status(404).json({ error: 'Audit fine not found.' });
    fine.status = status;
    return res.json(fine);
  }

  try {
    const { data, error } = await supabase
      .from('audit_fines')
      .update({ status })
      .eq('fine_id', fineId)
      .select()
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/audit-fines/:id', requireCEO, async (req: Request, res: Response) => {
  const fineId = parseInt(req.params.id);

  if (isSupabaseMock) {
    const index = mockAuditFines.findIndex(f => f.fine_id === fineId);
    if (index === -1) return res.status(404).json({ error: 'Audit fine not found.' });
    mockAuditFines.splice(index, 1);
    return res.json({ success: true, message: 'Audit fine deleted.' });
  }

  try {
    const { error } = await supabase
      .from('audit_fines')
      .delete()
      .eq('fine_id', fineId);
    if (error) throw error;
    return res.json({ success: true, message: 'Audit fine deleted.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. Documentation Endpoints
app.get('/api/docs', async (req: Request, res: Response) => {
  if (isSupabaseMock) {
    return res.json(mockDocumentation);
  }
  try {
    const { data, error } = await supabase
      .from('documentation')
      .select('*, employees(first_name, last_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const formatted = (data || []).map(d => ({
      doc_id: d.doc_id,
      title: d.title,
      content: d.content,
      created_by: d.created_by,
      creator_name: d.employees ? `${d.employees.first_name} ${d.employees.last_name}` : 'Unassigned',
      created_at: d.created_at
    }));
    return res.json(formatted);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/docs', async (req: Request, res: Response) => {
  const { title, content, created_by } = req.body;
  if (!title || !content || !created_by) {
    return res.status(400).json({ error: 'Missing title, content, or creator employee_id.' });
  }

  if (isSupabaseMock) {
    const emp = mockEmployees.find(e => e.employee_id === created_by);
    const newDoc = {
      doc_id: mockDocumentation.length + 1,
      title,
      content,
      created_by,
      creator_name: emp ? `${emp.first_name} ${emp.last_name}` : 'Unassigned',
      created_at: new Date().toISOString()
    };
    mockDocumentation.unshift(newDoc);
    return res.json(newDoc);
  }

  try {
    const { data, error } = await supabase
      .from('documentation')
      .insert([{ title, content, created_by }])
      .select()
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// Server Init
// ============================================================================
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log('================================================================');
    console.log(`[Cortex Server] Running on http://localhost:${port}`);
    console.log(`[Cortex Server] Environment: ${isSupabaseMock ? 'MOCKED / SANDBOX' : 'PRODUCTION'}`);
    console.log('================================================================');
  });
}

export default app;
